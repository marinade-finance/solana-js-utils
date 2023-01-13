import {
  SignerWallet,
  SolanaProvider,
  TransactionEnvelope,
} from '@saberhq/solana-contrib';
import {
  createInstructionData,
  getGovernanceAccount,
  getProposal,
  getProposalTransactionAddress,
  ProgramAccount,
  Proposal,
  ProposalTransaction,
  Vote,
  VoteChoice,
  VoteKind,
  VoteType,
  withCastVote,
  withCreateProposal,
  withExecuteTransaction,
  withFinalizeVote,
  withInsertTransaction,
  withSignOffProposal,
} from '@marinade.finance/spl-governance';
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemInstruction,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';
import { GovernanceHelper } from './governance';
import {
  TokenOwnerRecordHelper,
  TokenOwnerRecordSide,
} from './tokenOwnerRecord';

export class ProposalHelper {
  private constructor(
    public readonly governance: GovernanceHelper,
    public readonly ownerRecord: TokenOwnerRecordHelper,
    public readonly executable: TransactionEnvelope,
    public data: ProgramAccount<Proposal>
  ) {}

  get address() {
    return this.data.pubkey;
  }

  get provider() {
    return this.governance.provider;
  }

  get splGovId() {
    return this.governance.splGovId;
  }

  get splGovVersion() {
    return this.governance.splGovVersion;
  }

  static async create({
    ownerRecord,
    governance,
    name,
    descriptionLink,
    executable = new TransactionEnvelope(governance.provider, []),
    side,
  }: {
    ownerRecord: TokenOwnerRecordHelper;
    governance: GovernanceHelper;
    name: string;
    descriptionLink: string;
    executable?: TransactionEnvelope;
    side: TokenOwnerRecordSide;
  }) {
    const tx = new TransactionEnvelope(ownerRecord.provider, []);
    const proposal = await withCreateProposal(
      tx.instructions,
      governance.splGovId,
      governance.splGovVersion,
      ownerRecord.realm.address,
      governance.governanceAccount,
      ownerRecord.address,
      name,
      descriptionLink,
      // ownerRecord.mint.address,
      side === 'community'
        ? governance.realm.communityMint.address
        : governance.realm.councilMint.address,
      ownerRecord.owner.authority,
      governance.data.account.proposalCount,
      VoteType.SINGLE_CHOICE,
      ['test'],
      true,
      ownerRecord.provider.wallet.publicKey,
      undefined
    );
    let index = 0;
    for (const instruction of executable.instructions) {
      await withInsertTransaction(
        tx.instructions,
        governance.splGovId,
        governance.splGovVersion,
        governance.governanceAccount,
        proposal,
        ownerRecord.address,
        ownerRecord.owner.authority,
        index,
        0,
        0,
        [createInstructionData(instruction)],
        ownerRecord.provider.wallet.publicKey
      );
      index++;
    }
    withSignOffProposal(
      tx.instructions,
      governance.splGovId,
      governance.splGovVersion,
      governance.realm.address,
      governance.governanceAccount,
      proposal,
      ownerRecord.owner.authority,
      undefined,
      ownerRecord.address
    );
    await ownerRecord.owner.runTx(tx);
    await governance.reload();
    return new ProposalHelper(
      governance,
      ownerRecord,
      executable,
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
    const tx = new TransactionEnvelope(governance.provider, []);
    for (
      let index = 0;
      index < data.account.options[0]?.instructionsCount || 0;
      index++
    ) {
      const proposalTransaction = await getProposalTransactionAddress(
        governance.splGovId,
        governance.splGovVersion,
        address,
        0,
        index
      );
      const proposalTransactionData = await getGovernanceAccount(
        governance.provider.connection,
        proposalTransaction,
        ProposalTransaction
      );
      if (proposalTransactionData.account.instructions.length > 1) {
        throw new Error('Multiix txses are not supported');
      }
      const instruction = proposalTransactionData.account.instructions[0];
      tx.append(
        new TransactionInstruction({
          keys: instruction.accounts,
          programId: instruction.programId,
          data: Buffer.from(instruction.data),
        })
      );
    }
    return new ProposalHelper(
      governance,
      await TokenOwnerRecordHelper.load({
        connection: governance.provider.connection,
        address: data.account.tokenOwnerRecord,
        realm: governance.realm,
      }),
      tx,
      data
    );
  }

  async castVote({
    tokenOwnerRecord,
    voterWeightRecord,
    maxVoterWeightRecord,
    vote = [100],
  }: {
    tokenOwnerRecord: TokenOwnerRecordHelper;
    voterWeightRecord?: PublicKey;
    maxVoterWeightRecord?: PublicKey;
    vote?: number[];
  }) {
    const signer = tokenOwnerRecord.owner.canSign
      ? tokenOwnerRecord.owner
      : tokenOwnerRecord.delegate!;
    const tx = new TransactionEnvelope(tokenOwnerRecord.provider, []);
    await withCastVote(
      tx.instructions,
      this.splGovId,
      this.splGovVersion,
      this.governance.realm.address,
      this.governance.governanceAccount,
      this.address,
      this.ownerRecord.address,
      tokenOwnerRecord.address,
      signer.authority,
      tokenOwnerRecord.mint.address,
      new Vote({
        voteType: VoteKind.Approve,
        approveChoices: vote.map(
          weightPercentage =>
            new VoteChoice({
              rank: 0,
              weightPercentage,
            })
        ),
        deny: undefined,
        veto: undefined,
      }),
      this.provider.wallet.publicKey,
      voterWeightRecord,
      maxVoterWeightRecord
    );

    await signer.runTx(tx);
  }

  async execute() {
    const wallet = new SignerWallet(new Keypair());
    const fillTx = new TransactionEnvelope(this.governance.provider, [
      SystemProgram.transfer({
        fromPubkey: this.governance.provider.wallet.publicKey,
        toPubkey: wallet.publicKey,
        lamports: 10 * LAMPORTS_PER_SOL,
      }),
    ]);
    await fillTx.confirm();
    const provider = SolanaProvider.init({
      connection: this.governance.provider.connection,
      wallet,
      opts: this.governance.provider.opts,
    });
    const tx = new TransactionEnvelope(provider, []);
    if (this.data.account.options[0].instructionsCount === 0) {
      throw new Error('No instructions to execute');
    }
    for (
      let index = 0;
      index < this.data.account.options[0].instructionsCount;
      index++
    ) {
      await withExecuteTransaction(
        tx.instructions,
        this.splGovId,
        this.splGovVersion,
        this.governance.governanceAccount,
        this.address,
        await getProposalTransactionAddress(
          this.splGovId,
          this.splGovVersion,
          this.address,
          0,
          index
        ),
        [createInstructionData(this.executable.instructions[index])]
      );
    }
    const result = [];
    for (const part of tx.partition()) {
      result.push(await part.confirm());
    }
    return result;
  }

  async finalize() {
    const tx = new TransactionEnvelope(this.ownerRecord.provider, []);
    await withFinalizeVote(
      tx.instructions,
      this.splGovId,
      this.splGovVersion,
      this.governance.realm.address,
      this.governance.data.pubkey,
      this.address,
      this.ownerRecord.address,
      this.ownerRecord.mint.address
    );
    await tx.confirm();
    await this.reload();
  }

  async reload() {
    this.data = await getProposal(this.provider.connection, this.address);
  }
}
