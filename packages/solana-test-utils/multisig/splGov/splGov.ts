import { KedgereeSDK } from '@marinade.finance/kedgeree-sdk';
import {
  Provider,
  sleep,
  TransactionEnvelope,
  TransactionReceipt,
} from '@saberhq/solana-contrib';
import {
  getProposalsByGovernance,
  Governance,
  ProposalState,
} from '@marinade.finance/spl-governance';
import { Keypair, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { MintHelper } from '../../mint';
import {
  KeypairSignerHelper,
  SignerHelper,
  WalletSignerHelper,
} from '../../signer';
import { MultisigHelper } from '../multisig';
import { GovernanceHelper } from './governance';
import { ProposalHelper } from './proposal';
import { RealmHelper } from './realm';
import {
  TokenOwnerRecordHelper,
  TokenOwnerRecordSide,
} from './tokenOwnerRecord';

export * from './realm';
export * from './governance';
export * from './proposal';
export * from './tokenOwnerRecord';

export class SplGovHelper implements MultisigHelper {
  private constructor(
    public readonly governance: GovernanceHelper,
    public readonly tokenOwnerRecords: TokenOwnerRecordHelper[],
    public readonly side: TokenOwnerRecordSide
  ) {}

  get members() {
    return this.tokenOwnerRecords.map(t => t.owner);
  }

  get threshold() {
    return 1; // TODO
  }

  get rentPayer() {
    return this.authority;
  }

  signTx(tx: TransactionEnvelope): boolean {
    throw new Error('Can not sign');
  }

  get canSign() {
    return false;
  }

  async runTx(tx: TransactionEnvelope): Promise<TransactionReceipt[]> {
    const proposal = await ProposalHelper.create({
      ownerRecord: this.tokenOwnerRecords[0],
      governance: this.governance,
      name: Math.random().toString(),
      descriptionLink: '',
      executable: tx,
      side: this.side,
    });
    return await this.executeProposal(proposal);
  }

  async executeAllPending(): Promise<TransactionReceipt[]> {
    const proposals = await getProposalsByGovernance(
      this.governance.provider.connection,
      this.governance.splGovId,
      this.governance.address
    );

    const result: TransactionReceipt[] = [];

    for (const proposal of proposals) {
      if (
        proposal.account.state === ProposalState.Voting ||
        proposal.account.state === ProposalState.Succeeded
      ) {
        result.push(
          ...(await this.executeProposal(
            await ProposalHelper.load({
              address: proposal.pubkey,
              governance: this.governance,
            })
          ))
        );
      }
    }
    return result;
  }

  async executeProposal(
    proposal: ProposalHelper
  ): Promise<TransactionReceipt[]> {
    // Cast votes
    for (const tokenOwnerRecord of this.tokenOwnerRecords) {
      if (proposal.data.account.state === ProposalState.Succeeded) {
        break;
      }
      await proposal.castVote({
        tokenOwnerRecord,
      });
      await proposal.reload();
    }
    if (proposal.data.account.state !== ProposalState.Succeeded) {
      throw new Error(
        `Yes votes ${proposal.data.account.getYesVoteCount().toNumber()} / ${
          (
            await proposal.provider.connection.getTokenSupply(
              proposal.data.account.governingTokenMint
            )
          ).value.amount
        }`
      );
    }

    // It is not possible to execute proposal created same second
    await sleep(2000);

    return await proposal.execute();
  }

  get authority(): PublicKey {
    return this.governance.authority;
  }

  static async create({
    kedgeree,
    members = [new WalletSignerHelper(kedgeree.provider.wallet)],
    // TODO: threshold = 1,
    governance,
    side,
    govProgId,
  }: {
    kedgeree: KedgereeSDK;
    members?: SignerHelper[];
    threshold?: number;
    governance?: GovernanceHelper;
    side: TokenOwnerRecordSide;
    govProgId?: PublicKey;
  }) {
    if (!governance) {
      const realm = await RealmHelper.create({
        provider: kedgeree.provider,
        communityMint: await MintHelper.create({ provider: kedgeree.provider }),
        councilMint: await MintHelper.create({ provider: kedgeree.provider }),
        splGovId: govProgId,
      });
      const tmpUser = new Keypair();
      const tmpTokenOwnerRecord = await TokenOwnerRecordHelper.create({
        realm,
        side: 'council',
        owner: new KeypairSignerHelper(tmpUser),
      });
      governance = await GovernanceHelper.create({
        kedgeree,
        tokenOwnerRecord: tmpTokenOwnerRecord,
      });
    }

    const tokenOwnerRecords: TokenOwnerRecordHelper[] = [];
    for (const member of members) {
      const tokenOwnerRecord = await TokenOwnerRecordHelper.create({
        realm: governance!.realm,
        owner: member,
        side,
      });
      await tokenOwnerRecord.deposit(new BN(1000));
      tokenOwnerRecords.push(tokenOwnerRecord);
    }

    return new SplGovHelper(governance!, tokenOwnerRecords, side);
  }
}
