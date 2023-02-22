import { PublicKey } from '@solana/web3.js';
import {
  getRealm,
  GoverningTokenConfigAccountArgs,
  GoverningTokenType,
  MintMaxVoteWeightSource,
  MintMaxVoteWeightSourceType,
  ProgramAccount,
  PROGRAM_VERSION_V2,
  Realm,
  withCreateRealm,
} from '@marinade.finance/spl-governance';
import { Provider, TransactionEnvelope } from '@saberhq/solana-contrib';
import BN from 'bn.js';
import { MintHelper } from '../../mint';
import { SignerHelper, WalletSignerHelper } from '../../signer';

export class RealmHelper {
  private constructor(
    public readonly provider: Provider,
    public readonly splGovId: PublicKey,
    public readonly splGovVersion: number,
    public readonly communityMint: MintHelper,
    public readonly communityWeightAddin: PublicKey | undefined,
    public readonly councilMint: MintHelper,
    public readonly admin: SignerHelper,
    public data: ProgramAccount<Realm>
  ) {}

  get address() {
    return this.data.pubkey;
  }

  static async create({
    provider,
    splGovId = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw'),
    splGovVersion = PROGRAM_VERSION_V2,
    name = Math.random().toString(),
    communityMint,
    communityWeightAddin,
    maxCommunityWeightAddin,
    councilMint,
    admin = new WalletSignerHelper(provider.wallet),
  }: {
    provider: Provider;
    splGovId?: PublicKey;
    splGovVersion?: number;
    name?: string;
    communityMint: MintHelper;
    communityWeightAddin?: PublicKey;
    maxCommunityWeightAddin?: PublicKey;
    councilMint: MintHelper;
    admin?: SignerHelper;
  }) {
    await councilMint.mintTo({ amount: new BN(1) });

    const tx = new TransactionEnvelope(provider, []);
    const realm = await withCreateRealm(
      tx.instructions,
      splGovId,
      splGovVersion,
      name,
      admin.authority,
      communityMint.address,
      provider.wallet.publicKey,
      councilMint.address,
      new MintMaxVoteWeightSource({
        value: new BN(1),
        type: MintMaxVoteWeightSourceType.SupplyFraction,
      }),
      new BN(0),
      new GoverningTokenConfigAccountArgs({
        voterWeightAddin: communityWeightAddin,
        maxVoterWeightAddin: maxCommunityWeightAddin,
        tokenType: GoverningTokenType.Liquid,
      }),
      undefined
    );

    await tx.confirm();

    return new RealmHelper(
      provider,
      splGovId,
      splGovVersion,
      communityMint,
      communityWeightAddin,
      councilMint,
      admin,
      await getRealm(provider.connection, realm)
    );
  }
}
