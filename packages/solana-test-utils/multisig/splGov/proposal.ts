import { TransactionEnvelope } from '@saberhq/solana-contrib';
import {
  createInstructionData,
  getGovernanceAccount,
  getProposal,
  getProposalTransactionAddress,
  ProgramAccount,
  PROGRAM_VERSION_V2,
  Proposal,
  ProposalTransaction,
  Vote,
  VoteChoice,
  VoteKind,
  VoteType,
  withCastVote,
  withCreateProposal,
  withExecuteTransaction,
  withInsertTransaction,
  withSignOffProposal,
} from '@solana/spl-governance';
import { Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';
import { GovernanceHelper } from './governance';
import { SPL_GOVERNANCE_ID } from './id';
import { TokenOwnerRecordHelper } from './tokenOwnerRecord';

export class ProposalHelper {
  private constructor(
    public readonly governance: GovernanceHelper,
    public readonly ownerRecord: TokenOwnerRecordHelper,
    public readonly executable: TransactionEnvelope | undefined,
    public readonly transactionAddress: PublicKey | undefined,
    public data: ProgramAccount<Proposal>
  ) {}

  get address() {
    return this.data.pubkey;
  }

  get provider() {
    return this.governance.provider;
  }

  static async create({
    ownerRecord,
    governance,
    name,
    descriptionLink,
    executable,
  }: {
    ownerRecord: TokenOwnerRecordHelper;
    governance: GovernanceHelper;
    name: string;
    descriptionLink: string;
    executable?: TransactionEnvelope;
  }) {
    const tx = new TransactionEnvelope(ownerRecord.provider, []);
    const proposal = await withCreateProposal(
      tx.instructions,
      SPL_GOVERNANCE_ID,
      PROGRAM_VERSION_V2,
      ownerRecord.realm.address,
      governance.address,
      ownerRecord.address,
      name,
      descriptionLink,
      // ownerRecord.mint.address,
      governance.realm.communityMint.address,
      ownerRecord.owner.authority,
      0,
      VoteType.SINGLE_CHOICE,
      ['test'],
      true,
      ownerRecord.provider.wallet.publicKey,
      undefined
    );
    let transactionAddress: PublicKey | undefined;
    if (executable) {
      transactionAddress = await withInsertTransaction(
        tx.instructions,
        SPL_GOVERNANCE_ID,
        PROGRAM_VERSION_V2,
        governance.address,
        proposal,
        ownerRecord.address,
        ownerRecord.owner.authority,
        0,
        0,
        0,
        executable.instructions.map(ix => createInstructionData(ix)),
        ownerRecord.provider.wallet.publicKey
      );
    }
    withSignOffProposal(
      tx.instructions,
      SPL_GOVERNANCE_ID,
      PROGRAM_VERSION_V2,
      governance.realm.address,
      governance.address,
      proposal,
      ownerRecord.owner.authority,
      undefined,
      ownerRecord.address
    );
    await ownerRecord.owner.runTx(tx);
    return new ProposalHelper(
      governance,
      ownerRecord,
      executable,
      transactionAddress,
      await getProposal(ownerRecord.provider.connection, proposal)
    );
  }

  static async load({
    address,
    governance,
  }: {
    address: PublicKey;
    governance: GovernanceHelper;
  }) {
    const data = await getProposal(governance.provider.connection, address);
    const proposalTransaction = await getProposalTransactionAddress(
      SPL_GOVERNANCE_ID,
      PROGRAM_VERSION_V2,
      address,
      0,
      0
    );
    const proposalTransactionData = await getGovernanceAccount(
      governance.provider.connection,
      proposalTransaction,
      ProposalTransaction
    );
    return new ProposalHelper(
      governance,
      await TokenOwnerRecordHelper.load({
        connection: governance.provider.connection,
        address: data.account.tokenOwnerRecord,
        realm: governance.realm,
      }),
      new TransactionEnvelope(
        governance.provider,
        proposalTransactionData.account.instructions.map(
          i =>
            new TransactionInstruction({
              keys: i.accounts,
              programId: i.programId,
              data: Buffer.from(i.data.buffer),
            })
        )
      ),
      proposalTransaction,
      data
    );
  }

  async castVote({
    tokenOwnerRecord,
    voterWeightRecord,
  }: {
    tokenOwnerRecord: TokenOwnerRecordHelper;
    voterWeightRecord?: PublicKey;
  }) {
    const tx = new TransactionEnvelope(tokenOwnerRecord.provider, []);
    await withCastVote(
      tx.instructions,
      SPL_GOVERNANCE_ID,
      PROGRAM_VERSION_V2,
      this.governance.realm.address,
      this.governance.address,
      this.address,
      this.ownerRecord.address,
      tokenOwnerRecord.address,
      tokenOwnerRecord.owner.authority,
      tokenOwnerRecord.mint.address,
      new Vote({
        voteType: VoteKind.Approve,
        approveChoices: [
          new VoteChoice({
            rank: 0,
            weightPercentage: 100,
          }),
        ],
        deny: undefined,
        veto: undefined,
      }),
      this.provider.wallet.publicKey,
      voterWeightRecord
    );

    await tokenOwnerRecord.owner.runTx(tx);
  }

  async execute() {
    const tx = new TransactionEnvelope(this.governance.provider, []);
    await withExecuteTransaction(
      tx.instructions,
      SPL_GOVERNANCE_ID,
      PROGRAM_VERSION_V2,
      this.governance.address,
      this.address,
      this.transactionAddress!,
      this.executable!.instructions.map(ix => createInstructionData(ix))
    );
    const r = await tx.confirm();
    return r.response.meta?.logMessages;
  }
}
