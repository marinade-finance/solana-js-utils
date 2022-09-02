import { Provider, TransactionEnvelope } from '@saberhq/solana-contrib';
import {
  createAssociatedTokenAccountInstruction,
  createInitializeMintInstruction,
  createMintToInstruction,
  getAssociatedTokenAddress,
  getMinimumBalanceForRentExemptMint,
  MintLayout,
  TOKEN_PROGRAM_ID,
} from 'solana-spl-token-modern';
import { Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import BN from 'bn.js';
import { SignerHelper, WalletSignerHelper } from './signer';

export class MintHelper {
  private constructor(
    readonly provider: Provider,
    readonly address: PublicKey,
    readonly digits: number,
    readonly mintAuthority: SignerHelper,
    readonly freezeAuthority: null | SignerHelper
  ) {}

  get mintAuthorityAddress(): PublicKey {
    return this.mintAuthority.authority;
  }

  get freezeAuthorityAddress(): PublicKey | null {
    return this.freezeAuthority?.authority || null;
  }

  static async create({
    provider,
    address = new Keypair(),
    digits = 9,
    mintAuthority = new WalletSignerHelper(provider.wallet),
    freezeAuthority = null,
  }: {
    provider: Provider;
    address?: Keypair;
    digits?: number;
    mintAuthority?: SignerHelper;
    freezeAuthority?: null | SignerHelper;
  }): Promise<MintHelper> {
    const tx = new TransactionEnvelope(
      provider,
      [
        SystemProgram.createAccount({
          fromPubkey: provider.wallet.publicKey,
          newAccountPubkey: address.publicKey,
          lamports: await getMinimumBalanceForRentExemptMint(
            provider.connection
          ),
          space: MintLayout.span,
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMintInstruction(
          address.publicKey,
          digits,
          mintAuthority.authority,
          freezeAuthority?.authority || null
        ),
      ],
      [address]
    );
    await tx.confirm();
    return new MintHelper(
      provider,
      address.publicKey,
      digits,
      mintAuthority,
      freezeAuthority
    );
  }

  async mintTo({
    amount,
    target,
    owner,
  }: {
    amount: BN;
    target?: PublicKey;
    owner?: PublicKey;
  }) {
    let tx = new TransactionEnvelope(this.provider, []);
    if (!target) {
      if (!owner) {
        owner = this.provider.wallet.publicKey;
      }
      target = await getAssociatedTokenAddress(this.address, owner, true);
      if (!(await this.provider.getAccountInfo(target))) {
        tx = tx.combine(
          new TransactionEnvelope(this.provider, [
            createAssociatedTokenAccountInstruction(
              this.provider.wallet.publicKey,
              target,
              owner,
              this.address
            ),
          ])
        );
      }
    }

    tx = tx.combine(
      new TransactionEnvelope(this.provider, [
        createMintToInstruction(
          this.address,
          target,
          this.mintAuthorityAddress,
          BigInt(amount.toString())
        ),
      ])
    );
    await this.mintAuthority.runTx(tx);
  }
}
