import { Provider, sleep, TransactionEnvelope } from '@saberhq/solana-contrib';
import { getProposalsByGovernance, Governance } from '@solana/spl-governance';
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
import { SPL_GOVERNANCE_ID } from './id';
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

export class SplGovHelper extends MultisigHelper {
  public proposals: ProposalHelper[] = [];

  private constructor(
    threshold: BN,
    public readonly governance: GovernanceHelper,
    public readonly tokenOwnerRecords: TokenOwnerRecordHelper[]
  ) {
    super(
      tokenOwnerRecords.map(r => r.owner),
      threshold
    );
  }

  async createTransaction(tx: TransactionEnvelope): Promise<PublicKey> {
    const proposal = await ProposalHelper.create({
      ownerRecord: this.tokenOwnerRecords[0],
      governance: this.governance,
      name: Math.random().toString(),
      descriptionLink: '',
      executable: tx,
    });
    this.proposals.push(proposal);
    return proposal.address;
  }

  async executeTransaction(address: PublicKey): Promise<void> {
    const proposal = this.proposals.find(p => p.address.equals(address));
    if (!proposal) {
      throw new Error(`Unknown proposal ${address.toBase58()}`);
    }
    // Cast all votes
    for (const tokenOwnerRecord of this.tokenOwnerRecords) {
      await proposal.castVote({
        tokenOwnerRecord,
      });
    }

    await sleep(1000);
    await proposal.execute();
  }

  get authority(): PublicKey {
    return this.governance.address;
  }

  get numTransactions(): BN {
    return new BN(this.governance.data.account.proposalCount);
  }

  async reload(): Promise<void> {
    await this.governance.reload();
    if (this.numTransactions.toNumber() > this.proposals.length) {
      const proposals = await getProposalsByGovernance(
        this.governance.provider.connection,
        SPL_GOVERNANCE_ID,
        this.governance.address
      );
      for (const proposal of proposals) {
        if (!this.proposals.find(p => p.address.equals(proposal.pubkey))) {
          this.proposals.push(
            await ProposalHelper.load({
              address: proposal.pubkey,
              governance: this.governance,
            })
          );
        }
      }
    }
  }

  transactionByIndex(index: BN): Promise<PublicKey> {
    return Promise.resolve(this.proposals[index.toNumber()].address);
  }

  static async create({
    provider,
    members = [new WalletSignerHelper(provider.wallet)],
    threshold = new BN(1),
    governance,
    side,
  }: {
    provider: Provider;
    members?: SignerHelper[];
    threshold?: BN;
    governance?: GovernanceHelper;
    side: TokenOwnerRecordSide;
  }) {
    if (!governance) {
      const realm = await RealmHelper.create({
        provider,
        communityMint: await MintHelper.create({ provider }),
        councilMint: await MintHelper.create({ provider }),
      });
      const tmpUser = new Keypair();
      const tmpTokenOwnerRecord = await TokenOwnerRecordHelper.create({
        realm,
        side: 'council',
        owner: new KeypairSignerHelper(tmpUser),
      });
      await tmpTokenOwnerRecord.deposit(new BN(1));
      governance = await GovernanceHelper.create({
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
      await tokenOwnerRecord.deposit(new BN(1));
      tokenOwnerRecords.push(tokenOwnerRecord);
    }

    return new SplGovHelper(threshold, governance!, tokenOwnerRecords);
  }
}
