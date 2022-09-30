import { TransactionEnvelope } from '@saberhq/solana-contrib';
import {
  GovernanceConfig,
  PROGRAM_VERSION_V2,
  withCreateGovernance,
  VoteThreshold,
  VoteThresholdType,
  VoteTipping,
  getGovernance,
  Governance,
  ProgramAccount,
  PROGRAM_VERSION_V3,
  getNativeTreasuryAddress,
} from '@solana/spl-governance';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { SPL_GOVERNANCE_ID } from './id';
import { RealmHelper } from './realm';
import { TokenOwnerRecordHelper } from './tokenOwnerRecord';
import { KedgereeSDK } from '@marinade.finance/kedgeree-sdk';
import { encode } from '@project-serum/anchor/dist/cjs/utils/bytes/utf8';

function createGovernanceThresholds(
  programVersion: number,
  communityYesVotePercentage: number
) {
  const communityVoteThreshold = new VoteThreshold({
    value: communityYesVotePercentage,
    type: VoteThresholdType.YesVotePercentage,
  });

  // For backward compatybility with spl-gov versions <= 2
  // for Council vote and Veto vote thresholds we have to pass YesVotePerentage(0)
  const undefinedThreshold = new VoteThreshold({
    type: VoteThresholdType.YesVotePercentage,
    value: 0,
  });

  // TODO: For spl-gov v3 add suport for seperate council vote threshold in the UI
  // Until it's supported we default it to community vote threshold
  const councilVoteThreshold =
    programVersion >= PROGRAM_VERSION_V3
      ? communityVoteThreshold
      : undefinedThreshold;

  // TODO: For spl-gov v3 add suport for seperate council Veto vote threshold in the UI
  // Until it's supported we default it to community vote threshold
  const councilVetoVoteThreshold =
    programVersion >= PROGRAM_VERSION_V3
      ? communityVoteThreshold
      : undefinedThreshold;

  // TODO: For spl-gov v3 add suport for seperate Community Veto vote threshold in the UI
  // Until it's supported we default it to disabled Community vote threshold
  const communityVetoVoteThreshold =
    programVersion >= PROGRAM_VERSION_V3
      ? new VoteThreshold({ type: VoteThresholdType.Disabled })
      : undefinedThreshold;

  return {
    communityVoteThreshold,
    councilVoteThreshold,
    councilVetoVoteThreshold,
    communityVetoVoteThreshold,
  };
}

export class GovernanceHelper {
  private constructor(
    public readonly realm: RealmHelper,
    public data: ProgramAccount<Governance>,
    public address: PublicKey
  ) {}

  get provider() {
    return this.realm.provider;
  }

  static async create({
    tokenOwnerRecord,
    kedgeree,
  }: {
    tokenOwnerRecord: TokenOwnerRecordHelper;
    kedgeree: KedgereeSDK;
  }) {
    let tx = new TransactionEnvelope(tokenOwnerRecord.provider, []);
    const governance = await withCreateGovernance(
      tx.instructions,
      SPL_GOVERNANCE_ID,
      PROGRAM_VERSION_V2,
      tokenOwnerRecord.realm.address,
      undefined,
      new GovernanceConfig({
        ...createGovernanceThresholds(PROGRAM_VERSION_V2, 40),
        councilVoteTipping: VoteTipping.Early,
        minCommunityTokensToCreateProposal: new BN(1),
        minInstructionHoldUpTime: 0,
        maxVotingTime: 3600,
        minCouncilTokensToCreateProposal: new BN(1),
      }),
      tokenOwnerRecord.address,
      tokenOwnerRecord.provider.wallet.publicKey,
      tokenOwnerRecord.provider.wallet.publicKey
    );

    const { tx: createPDAInfoTx, key: governanceWallet } =
      await kedgeree.createPDAInfo({
        owner: SPL_GOVERNANCE_ID,
        seeds: [encode('native-treasury'), governance.toBytes()],
      });
    tx = tx.combine(createPDAInfoTx);
    if (
      !governanceWallet.equals(
        await getNativeTreasuryAddress(SPL_GOVERNANCE_ID, governance)
      )
    ) {
      throw new Error(
        'Can not compute governance wallet. Check spl-gov sdk version'
      );
    }

    await tx.confirm();
    return new GovernanceHelper(
      tokenOwnerRecord.realm,
      await getGovernance(tokenOwnerRecord.provider.connection, governance),
      governanceWallet
    );
  }

  async reload() {
    this.data = await getGovernance(this.provider.connection, this.data.pubkey);
  }
}
