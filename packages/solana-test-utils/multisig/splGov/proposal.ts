import { TransactionEnvelope } from '@saberhq/solana-contrib';
import {
  createInstructionData,
  getProposal,
  ProgramAccount,
  PROGRAM_VERSION_V2,
  Proposal,
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
import { PublicKey } from '@solana/web3.js';
import { GovernanceHelper } from './governance';
import { SPL_GOVERNANCE_ID } from './id';
import { TokenOwnerRecordHelper } from './tokenOwnerRecord';

export class ProposalHelper {
  private constructor(
    public readonly governance: GovernanceHelper,
    public readonly ownerRecord: TokenOwnerRecordHelper,
    public readonly address: PublicKey,
    public readonly executable: TransactionEnvelope | undefined,
    public readonly transactionAddress: PublicKey | undefined,
    public data: ProgramAccount<Proposal>
  ) {}

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
      proposal,
      executable,
      transactionAddress,
      await getProposal(ownerRecord.provider.connection, proposal)
    );
  }

  async castVote({
    tokenOwnerRecord,
    voterWeightRecord,
  }: {
    tokenOwnerRecord: TokenOwnerRecordHelper;
    voterWeightRecord: PublicKey;
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
