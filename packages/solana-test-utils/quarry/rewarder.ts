import { MintHelper } from '../mint';
import {
  findRewarderAddress,
  QuarrySDK,
  QuarryWrapper,
  RewarderWrapper,
} from '@quarryprotocol/quarry-sdk';
import { TransactionEnvelope } from '@saberhq/solana-contrib';
import { Token, u64 } from '@saberhq/token-utils';
import { Keypair, PublicKey } from '@solana/web3.js';
import assert from 'assert';
import BN from 'bn.js';
import { MultisigHelper } from '../multisig';
import {
  OperatorHelper,
  OperatorHelperFactory,
  PendingOperatorHelper,
} from './operator';
import { SignerHelper, WalletSignerHelper } from '../signer';

export class QuarryHelper {
  constructor(
    public wrapper: QuarryWrapper,
    public readonly mint: MintHelper
  ) {}
}

export class RewarderHelper {
  private constructor(
    public wrapper: RewarderWrapper,
    public readonly admin: OperatorHelper | SignerHelper,
    public readonly quarries: QuarryHelper[]
  ) {}

  get sdk() {
    return this.wrapper.sdk;
  }

  get address() {
    return this.wrapper.rewarderKey;
  }

  static async create({
    sdk,
    admin = new WalletSignerHelper(sdk.provider.wallet),
    rate = 0,
    quarryShares = [],
  }: {
    sdk: QuarrySDK;
    admin?: OperatorHelperFactory | SignerHelper;
    rate?: number;
    quarryShares?: number[];
  }) {
    const { mintWrapper, tx: newWrapperAndMintTx } =
      await sdk.mintWrapper.newWrapperAndMint({
        mintKP: new Keypair(),
        decimals: 9,
        hardcap: new BN('18446744073709551615'),
      });
    await newWrapperAndMintTx.confirm();

    const baseKP = new Keypair();
    let pendingOperatorHelper: PendingOperatorHelper | undefined;
    let adminAuthority: PublicKey;
    if (typeof admin === 'function') {
      const [rewarderAddress] = await findRewarderAddress(baseKP.publicKey);
      pendingOperatorHelper = await admin(rewarderAddress);
      adminAuthority = pendingOperatorHelper.key;
    } else {
      adminAuthority = admin.authority;
    }
    // eslint-disable-next-line prefer-const
    let { tx, key: rewarderKey } = await sdk.mine.createRewarder({
      mintWrapper,
      baseKP,
    });
    if (!sdk.provider.walletKey.equals(adminAuthority)) {
      tx.append(
        await sdk.programs.Mine.methods
          .transferAuthority(adminAuthority)
          .accounts({
            authority: sdk.provider.walletKey,
            rewarder: rewarderKey,
          })
          .instruction()
      );
    }
    await tx.confirm();

    let rewarderWrapper = await sdk.mine.loadRewarderWrapper(rewarderKey);

    // Creating quarries
    tx = new TransactionEnvelope(sdk.provider, []);
    const mints: MintHelper[] = [];
    for (let i = 0; i < quarryShares.length; i++) {
      const mint = await MintHelper.create({ provider: sdk.provider });
      const { tx: createQuarryTx } = await rewarderWrapper.createQuarry({
        token: Token.fromMint(mint.address, 9),
      });
      tx = tx.combine(createQuarryTx);
      mints.push(mint);
    }

    // console.log(tx.debugStr);
    await Promise.all(tx.partition().map(tx => tx.confirm()));

    const quarries = [];
    for (const mint of mints) {
      quarries.push({
        mint,
        quarry: await rewarderWrapper.getQuarry(
          Token.fromMint(mint.address, 9)
        ),
      });
    }

    tx = rewarderWrapper.setAnnualRewards({
      newAnnualRate: new u64(rate),
    });
    for (let i = 0; i < quarries.length; i++) {
      tx = tx.combine(
        quarries[i].quarry.setRewardsShare(new u64(quarryShares[i]))
      );
    }
    await Promise.all(tx.partition().map(tx => tx.confirm()));

    if (quarries.length > 0) {
      tx = await rewarderWrapper.syncQuarryRewards(
        quarries.map(quarry => quarry.mint.address)
      );
      await Promise.all(tx.partition().map(tx => tx.confirm()));
    }

    // Finalizing admin
    if (pendingOperatorHelper) {
      await pendingOperatorHelper.tx.confirm();
    } else if (
      typeof admin !== 'function' &&
      !admin.authority.equals(sdk.provider.walletKey)
    ) {
      await admin.runTx(
        new TransactionEnvelope(sdk.provider, [
          await sdk.programs.Mine.methods
            .acceptAuthority()
            .accounts({
              authority: adminAuthority,
              rewarder: rewarderKey,
            })
            .instruction(),
        ])
      );
    }
    rewarderWrapper = await sdk.mine.loadRewarderWrapper(rewarderKey);
    assert(rewarderWrapper.rewarderData.authority.equals(adminAuthority));
    // assert(rewarderWrapper.rewarderData.annualRewardsRate.eqn(rate));

    return new RewarderHelper(
      rewarderWrapper,
      pendingOperatorHelper
        ? await pendingOperatorHelper.factory()
        : (admin as SignerHelper),
      await Promise.all(
        quarries.map(
          async ({ mint }) =>
            new QuarryHelper(
              await rewarderWrapper.getQuarry(Token.fromMint(mint.address, 9)),
              mint
            )
        )
      )
    );
  }

  async syncQuarries() {
    if (this.quarries.length > 0) {
      const tx = await this.wrapper.syncQuarryRewards(
        this.quarries.map(quarry => quarry.mint.address)
      );
      await Promise.all(tx.partition().map(tx => tx.confirm()));
    }
  }

  async reload() {
    this.wrapper = await this.sdk.mine.loadRewarderWrapper(this.address);
    for (const quarry of this.quarries) {
      quarry.wrapper = await this.wrapper.getQuarry(
        Token.fromMint(quarry.mint.address, 9)
      );
    }
  }
}
