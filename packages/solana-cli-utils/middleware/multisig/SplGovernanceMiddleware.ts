import { Provider, TransactionEnvelope } from '@saberhq/solana-contrib';
import { PublicKey, Signer } from '@solana/web3.js';
import { MultisigMiddlewareBase } from './MultisigMiddlewareBase';
import {
  createInstructionData,
  getGovernance,
  getRealm,
  getTokenOwnerRecord,
  getTokenOwnerRecordAddress,
  Governance,
  ProgramAccount,
  PROGRAM_VERSION,
  Realm,
  serializeInstructionToBase64,
  VoteType,
  withCreateProposal,
  withInsertTransaction,
  withSignOffProposal,
} from '@solana/spl-governance';

export class SplGovernanceMiddleware extends MultisigMiddlewareBase {
  private constructor(
    public readonly provider: Provider,
    public readonly goverance: ProgramAccount<Governance>,
    public readonly realm: ProgramAccount<Realm>,
    public readonly proposer: Signer | PublicKey,
    public readonly rentPayer: Signer | PublicKey,
    public readonly approvers: (Signer | PublicKey)[],
    public readonly logOnly: boolean,
    public readonly community: boolean,
    public readonly signingBy: PublicKey
  ) {
    super();
  }

  static readonly PROG_ID = new PublicKey(
    'MGov1hBkLYJJJMJccS1yPps1M71FopcFxxNupuWeq3R'
  );

  static async create({
    provider,
    account,
    proposer = provider.wallet.publicKey,
    rentPayer = provider.wallet.publicKey,
    approvers = [],
    logOnly = false,
    community = false,
    signingBy = account,
  }: {
    provider: Provider;
    account: PublicKey;
    proposer?: Signer | PublicKey;
    rentPayer?: Signer | PublicKey;
    approvers?: (Signer | PublicKey)[];
    logOnly?: boolean;
    community?: boolean;
    signingBy?: PublicKey;
  }) {
    const goverance = await getGovernance(provider.connection, account);
    const realm = await getRealm(provider.connection, goverance.account.realm);
    return new SplGovernanceMiddleware(
      provider,
      goverance,
      realm,
      proposer,
      rentPayer,
      approvers,
      logOnly,
      community,
      signingBy
    );
  }

  async createTransaction(
    inner: TransactionEnvelope
  ): Promise<TransactionEnvelope> {
    if (this.logOnly) {
      console.log('Instructions:');
      for (const ix of inner.instructions) {
        console.log('  ' + serializeInstructionToBase64(ix));
      }
      return Promise.resolve(new TransactionEnvelope(inner.provider, []));
    }

    const proposerKey =
      this.proposer instanceof PublicKey
        ? this.proposer
        : this.proposer.publicKey;
    const rentPayerKey =
      this.rentPayer instanceof PublicKey
        ? this.rentPayer
        : this.rentPayer.publicKey;
    const mint = this.community
      ? this.realm.account.communityMint
      : this.realm.account.config.councilMint!;
    const tokenOwnerRecord = await getTokenOwnerRecordAddress(
      SplGovernanceMiddleware.PROG_ID,
      this.goverance.account.realm,
      mint,
      proposerKey
    );
    if (!(await this.provider.getAccountInfo(tokenOwnerRecord))) {
      throw new Error(
        `No token owner record for proposer ${proposerKey.toBase58()} and mint ${mint.toBase58()}`
      );
    }
    const tx = new TransactionEnvelope(inner.provider, []);
    const proposal = await withCreateProposal(
      tx.instructions,
      SplGovernanceMiddleware.PROG_ID,
      PROGRAM_VERSION,
      this.goverance.account.realm,
      this.goverance.pubkey,
      tokenOwnerRecord,
      Math.random().toString(), // TODO
      '',
      mint,
      proposerKey,
      this.goverance.account.proposalCount,
      VoteType.SINGLE_CHOICE,
      ['approve'],
      true,
      rentPayerKey,
      undefined
    );
    const proposalTransaction = await withInsertTransaction(
      tx.instructions,
      SplGovernanceMiddleware.PROG_ID,
      PROGRAM_VERSION,
      this.goverance.pubkey,
      proposal,
      tokenOwnerRecord,
      proposerKey,
      0,
      0,
      0,
      inner.instructions.map(createInstructionData),
      rentPayerKey
    );

    withSignOffProposal(
      tx.instructions,
      SplGovernanceMiddleware.PROG_ID,
      PROGRAM_VERSION,
      this.goverance.account.realm,
      this.goverance.pubkey,
      proposal,
      proposerKey,
      undefined,
      tokenOwnerRecord
    );

    if (!(this.proposer instanceof PublicKey)) {
      tx.addSigners(this.proposer);
    }
    return tx;
  }

  get programId() {
    return SplGovernanceMiddleware.PROG_ID;
  }
}
