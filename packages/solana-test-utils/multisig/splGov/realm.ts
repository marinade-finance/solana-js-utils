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
  withCreateTokenOwnerRecord,
  withDepositGoverningTokens,
} from '@solana/spl-governance';
import { Provider, TransactionEnvelope } from '@saberhq/solana-contrib';
import BN from 'bn.js';
import { SPL_GOVERNANCE_ID } from './id';
import {
  createAssociatedTokenAccount,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
} from 'solana-spl-token-modern';
import { MintHelper } from '../../mint';
import { SignerHelper, WalletSignerHelper } from '../../signer';

export class RealmHelper {
  private constructor(
    public readonly provider: Provider,
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
    name = Math.random().toString(),
    communityMint,
    communityWeightAddin,
    councilMint,
    admin = new WalletSignerHelper(provider.wallet),
  }: {
    provider: Provider;
    name?: string;
    communityMint: MintHelper;
    communityWeightAddin?: PublicKey;
    councilMint: MintHelper;
    admin?: SignerHelper;
  }) {
    await councilMint.mintTo({ amount: new BN(1) });

    const tx = new TransactionEnvelope(provider, []);
    const realm = await withCreateRealm(
      tx.instructions,
      SPL_GOVERNANCE_ID,
      PROGRAM_VERSION_V2,
      name,
      admin.authority,
      communityMint.address,
      provider.wallet.publicKey,
      councilMint.address,
      new MintMaxVoteWeightSource({ value: new BN(1), type: MintMaxVoteWeightSourceType.SupplyFraction }),
      new BN(0),
      new GoverningTokenConfigAccountArgs({
        voterWeightAddin: communityWeightAddin,
        maxVoterWeightAddin: undefined,
        tokenType: GoverningTokenType.Liquid,
      }),
      undefined
    );

    await tx.confirm();

    return new RealmHelper(
      provider,
      communityMint,
      communityWeightAddin,
      councilMint,
      admin,
      await getRealm(provider.connection, realm)
    );
  }
}
