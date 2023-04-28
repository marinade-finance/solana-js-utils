import { TransactionEnvelope } from '@saberhq/solana-contrib';
import {
  getTokenOwnerRecord,
  ProgramAccount,
  TokenOwnerRecord,
  withCreateTokenOwnerRecord,
  withDepositGoverningTokens,
  withSetGovernanceDelegate,
  withWithdrawGoverningTokens,
} from '@marinade.finance/spl-governance';
import { Connection, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { getAssociatedTokenAddress } from 'solana-spl-token-modern';
import { PDASigner, SignerHelper, WalletSignerHelper } from '../../signer';
import { RealmHelper } from './realm';

export type TokenOwnerRecordSide = 'council' | 'community';

export class TokenOwnerRecordHelper {
  private constructor(
    public readonly realm: RealmHelper,
    public readonly owner: SignerHelper,
    public readonly delegate: SignerHelper | undefined,
    public readonly side: TokenOwnerRecordSide,
    public data: ProgramAccount<TokenOwnerRecord>
  ) {}

  get address() {
    return this.data.pubkey;
  }

  get provider() {
    return this.realm.provider;
  }

  get splGovId() {
    return this.realm.splGovId;
  }

  get splGovVersion() {
    return this.realm.splGovVersion;
  }

  get mint() {
    return this.side === 'council'
      ? this.realm.councilMint
      : this.realm.communityMint;
  }

  static async create({
    realm,
    owner = new WalletSignerHelper(realm.provider.wallet),
    delegate,
    side,
  }: {
    realm: RealmHelper;
    owner?: SignerHelper;
    delegate?: SignerHelper;
    side: TokenOwnerRecordSide;
  }) {
    const mint = side === 'council' ? realm.councilMint : realm.communityMint;
    const tx = new TransactionEnvelope(realm.provider, []);
    const tokenOwnerRecord = await withCreateTokenOwnerRecord(
      tx.instructions,
      realm.splGovId,
      realm.splGovVersion,
      realm.address,
      owner.authority,
      mint.address,
      realm.provider.wallet.publicKey
    );
    if (delegate) {
      await withSetGovernanceDelegate(
        tx.instructions,
        realm.splGovId,
        realm.splGovVersion,
        realm.address,
        mint.address,
        owner.authority,
        owner.authority,
        delegate.authority
      );
      await owner.runTx(tx);
    } else {
      await tx.confirm();
    }

    return new TokenOwnerRecordHelper(
      realm,
      owner,
      delegate,
      side,
      await getTokenOwnerRecord(realm.provider.connection, tokenOwnerRecord)
    );
  }

  async deposit(amount: BN) {
    const tx = new TransactionEnvelope(this.provider, []);
    await this.mint.mintTo({
      amount,
    });
    await withDepositGoverningTokens(
      tx.instructions,
      this.splGovId,
      this.splGovVersion,
      this.realm.address,
      await getAssociatedTokenAddress(
        this.mint.address,
        this.provider.wallet.publicKey
      ),
      this.mint.address,
      this.owner.authority,
      this.provider.wallet.publicKey,
      this.provider.wallet.publicKey,
      amount
    );
    await this.owner.runTx(tx);
  }

  async withdraw() {
    const tx = new TransactionEnvelope(this.provider, []);
    await withWithdrawGoverningTokens(
      tx.instructions,
      this.splGovId,
      this.splGovVersion,
      this.realm.address,
      await getAssociatedTokenAddress(
        this.mint.address,
        this.provider.wallet.publicKey
      ),
      this.mint.address,
      this.owner.authority,
    );
    await this.owner.runTx(tx);
  }

  static async load({
    connection,
    address,
    realm,
    delegate,
  }: {
    connection: Connection;
    address: PublicKey;
    realm: RealmHelper;
    delegate?: SignerHelper;
  }) {
    const data = await getTokenOwnerRecord(connection, address);
    if (delegate) {
      if (
        !data.account.governanceDelegate ||
        !data.account.governanceDelegate.equals(delegate.authority)
      ) {
        throw new Error('Wrong delegate');
      }
    } else if (data.account.governanceDelegate) {
      delegate = new PDASigner(data.account.governanceDelegate);
    }
    return new TokenOwnerRecordHelper(
      realm,
      new PDASigner(data.account.governingTokenOwner),
      delegate,
      data.account.governingTokenMint.equals(realm.communityMint.address)
        ? 'community'
        : 'council',
      data
    );
  }
}
