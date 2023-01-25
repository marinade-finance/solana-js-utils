import { TransactionEnvelope } from '@saberhq/solana-contrib';
import {
  GovernanceConfig,
  withCreateGovernance,
  VoteThreshold,
  VoteThresholdType,
  VoteTipping,
  getGovernance,
  Governance,
  ProgramAccount,
  PROGRAM_VERSION_V3,
  getNativeTreasuryAddress,
} from '@marinade.finance/spl-governance';
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram } from '@solana/web3.js';
import BN from 'bn.js';
import { RealmHelper } from './realm';
import { TokenOwnerRecordHelper } from './tokenOwnerRecord';
import { KedgereeSDK } from '@marinade.finance/kedgeree-sdk';
import { encode } from '@project-serum/anchor/dist/cjs/utils/bytes/utf8';
import { SignerHelper, WalletSignerHelper } from '../../signer';

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
    public authority: PublicKey
  ) {}

  get provider() {
    return this.realm.provider;
  }

  get governanceAccount() {
    return this.data.pubkey;
  }

  get splGovId() {
    return this.realm.splGovId;
  }

  get splGovVersion() {
    return this.realm.splGovVersion;
  }

  static async create({
    tokenOwnerRecord,
    kedgeree,
    communityVoteTipping = VoteTipping.Early,
    maxVotingTime = 3600,
    communityYesVotePercentage = 40,
  }: {
    tokenOwnerRecord: TokenOwnerRecordHelper;
    kedgeree: KedgereeSDK;
    communityVoteTipping?: VoteTipping;
    maxVotingTime?: number;
    communityYesVotePercentage?: number;
  }) {
    let createAuthority: SignerHelper = new WalletSignerHelper(
      tokenOwnerRecord.provider.wallet
    );
    if (tokenOwnerRecord.owner.canSign) {
      createAuthority = tokenOwnerRecord.owner;
    } else if (tokenOwnerRecord.delegate && tokenOwnerRecord.delegate.canSign) {
      createAuthority = tokenOwnerRecord.delegate;
    } else {
      throw new Error('TOR can not sign');
    }

    let tx = new TransactionEnvelope(tokenOwnerRecord.provider, []);
    const governance = await withCreateGovernance(
      tx.instructions,
      tokenOwnerRecord.splGovId,
      tokenOwnerRecord.splGovVersion,
      tokenOwnerRecord.realm.address,
      undefined,
      new GovernanceConfig({
        ...createGovernanceThresholds(
          tokenOwnerRecord.splGovVersion,
          communityYesVotePercentage
        ),
        councilVoteTipping: VoteTipping.Early,
        minCommunityTokensToCreateProposal: new BN(1),
        minInstructionHoldUpTime: 0,
        maxVotingTime,
        minCouncilTokensToCreateProposal: new BN(1),
        communityVoteTipping,
        votingCoolOffTime: 0,
        depositExemptProposalCount: 0,
      }),
      tokenOwnerRecord.address,
      tokenOwnerRecord.provider.wallet.publicKey,
      createAuthority.authority
    );

    const { tx: createPDAInfoTx, key: governanceWallet } =
      await kedgeree.createPDAInfo({
        owner: tokenOwnerRecord.splGovId,
        seeds: [encode('native-treasury'), governance.toBytes()],
      });
    tx = tx.combine(createPDAInfoTx);
    if (
      !governanceWallet.equals(
        await getNativeTreasuryAddress(tokenOwnerRecord.splGovId, governance)
      )
    ) {
      throw new Error(
        'Can not compute governance wallet. Check spl-gov sdk version'
      );
    }

    tx.append(
      SystemProgram.transfer({
        fromPubkey: tokenOwnerRecord.provider.wallet.publicKey,
        toPubkey: governanceWallet,
        lamports: 100 * LAMPORTS_PER_SOL,
      })
    );

    await createAuthority.runTx(tx);
    return new GovernanceHelper(
      tokenOwnerRecord.realm,
      await getGovernance(tokenOwnerRecord.provider.connection, governance),
      governanceWallet
    );
  }

  async reload() {
    this.data = await getGovernance(
      this.provider.connection,
      this.governanceAccount
    );
  }
}
