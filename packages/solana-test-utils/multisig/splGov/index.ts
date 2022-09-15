import { Provider, TransactionEnvelope } from '@saberhq/solana-contrib';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { MintHelper } from '../../mint';
import { SignerHelper, WalletSignerHelper } from '../../signer';
import { MultisigHelper } from '../multisig';
import { GovernanceHelper } from './governance';
import { ProposalHelper } from './proposal';
import { RealmHelper } from './realm';
import { TokenOwnerRecordHelper } from './tokenOwnerRecord';

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
    await proposal.execute();
  }

  get authority(): PublicKey {
    return this.governance.address;
  }

  get numTransactions(): BN {
    return new BN(this.proposals.length);
  }

  async reload(): Promise<void> {
    // TODO
  }

  transactionByIndex(index: BN): Promise<PublicKey> {
    return Promise.resolve(this.proposals[index.toNumber()].address);
  }

  static async create({
    provider,
    members = [new WalletSignerHelper(provider.wallet)],
    threshold = new BN(1),
    governance,
  }: {
    provider: Provider;
    members?: SignerHelper[];
    threshold?: BN;
    governance?: GovernanceHelper;
  }) {
    if (!governance) {
      const realm = await RealmHelper.create({
        provider,
        communityMint: await MintHelper.create({ provider }),
        councilMint: await MintHelper.create({ provider }),
      });
      const councilTokenOwnerRecord = await TokenOwnerRecordHelper.create({
        realm,
        side: 'council',
      });
      await councilTokenOwnerRecord.deposit(new BN(1));
      governance = await GovernanceHelper.create({
        tokenOwnerRecord: councilTokenOwnerRecord,
      });
    }

    const tokenOwnerRecords = await Promise.all(
      members.map(member =>
        TokenOwnerRecordHelper.create({
          realm: governance!.realm,
          owner: member,
          side: 'community',
        })
      )
    );
    return new SplGovHelper(threshold, governance!, tokenOwnerRecords);
  }
}
