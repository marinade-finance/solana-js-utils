import { TransactionEnvelope } from '@saberhq/solana-contrib';
import {
  getTokenOwnerRecord,
  ProgramAccount,
  PROGRAM_VERSION_V2,
  TokenOwnerRecord,
  withCreateTokenOwnerRecord,
  withDepositGoverningTokens,
} from '@solana/spl-governance';
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

  get mint() {
    return this.side === 'council'
      ? this.realm.councilMint
      : this.realm.communityMint;
  }

  static async create({
    realm,
    owner = new WalletSignerHelper(realm.provider.wallet),
    side,
  }: {
    realm: RealmHelper;
    owner?: SignerHelper;
    side: TokenOwnerRecordSide;
  }) {
    const mint = side === 'council' ? realm.councilMint : realm.communityMint;
    const tx = new TransactionEnvelope(realm.provider, []);
    const tokenOwnerRecord = await withCreateTokenOwnerRecord(
      tx.instructions,
      realm.splGovId,
      PROGRAM_VERSION_V2,
      realm.address,
      owner.authority,
      mint.address,
      realm.provider.wallet.publicKey
    );
    await tx.confirm();

    return new TokenOwnerRecordHelper(
      realm,
      owner,
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
      PROGRAM_VERSION_V2,
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

  static async load({
    connection,
    address,
    realm,
  }: {
    connection: Connection;
    address: PublicKey;
    realm: RealmHelper;
  }) {
    const data = await getTokenOwnerRecord(connection, address);
    return new TokenOwnerRecordHelper(
      realm,
      new PDASigner(data.account.governingTokenOwner),
      data.account.governingTokenMint.equals(realm.communityMint.address)
        ? 'community'
        : 'council',
      data
    );
  }
}
