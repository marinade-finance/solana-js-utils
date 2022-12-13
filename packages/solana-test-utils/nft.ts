import { Provider, TransactionEnvelope } from '@saberhq/solana-contrib';
import { PublicKey, Signer } from '@solana/web3.js';
import {
  Collection,
  createCreateMasterEditionV3Instruction,
  createCreateMetadataAccountV3Instruction,
  createUpdateMetadataAccountV2Instruction,
  Creator,
  Uses,
  PROGRAM_ID as MPL_ID,
} from '@metaplex-foundation/mpl-token-metadata';
import { BN } from '@project-serum/anchor';
import { encode } from '@project-serum/anchor/dist/cjs/utils/bytes/utf8';
import { SignerHelper, WalletSignerHelper } from './signer';
import { MintHelper } from './mint';

export async function metadataAddress(mint: PublicKey) {
  const [metadataAddress] = await PublicKey.findProgramAddress(
    [encode('metadata'), MPL_ID.toBytes(), mint.toBytes()],
    MPL_ID
  );
  return metadataAddress;
}

export async function masterEditionAddress(mint: PublicKey) {
  const [masterEditionAddress] = await PublicKey.findProgramAddress(
    [encode('metadata'), MPL_ID.toBytes(), mint.toBytes(), encode('edition')],
    MPL_ID
  );
  return masterEditionAddress;
}

export interface NftParams {
  name: string;
  symbol: string;
  uri: string;
  sellerFeeBasisPoints: number;
  creator?: SignerHelper;
  collection: Collection | null;
  uses: Uses | null;
}

export class NftHelper {
  constructor(
    public readonly mint: MintHelper,
    public readonly creator: SignerHelper
  ) {}

  get address() {
    return this.mint.address;
  }

  static async create({
    provider,
    params: {
      name,
      symbol,
      uri,
      sellerFeeBasisPoints,
      creator = new WalletSignerHelper(provider.wallet),
      collection,
      uses,
    },
    // updateAuthority = provider.wallet.publicKey,
    tokenOwner = provider.wallet.publicKey,
  }: {
    provider: Provider;
    params: NftParams;
    // updateAuthority?: PublicKey;
    tokenOwner?: PublicKey;
  }): Promise<NftHelper> {
    const mint = await MintHelper.create({
      provider,
      digits: 0,
      freezeAuthority: new WalletSignerHelper(provider.wallet),
    });
    await mint.mintTo({
      amount: new BN(1),
      owner: tokenOwner,
    });
    const metadata = await metadataAddress(mint.address);
    const tx = new TransactionEnvelope(provider, [
      createCreateMetadataAccountV3Instruction(
        {
          metadata,
          mint: mint.address,
          mintAuthority: provider.wallet.publicKey,
          payer: provider.wallet.publicKey,
          updateAuthority: creator.authority,
        },
        {
          createMetadataAccountArgsV3: {
            data: {
              name,
              symbol,
              uri,
              sellerFeeBasisPoints,
              creators: [
                {
                  address: creator.authority,
                  verified: true,
                  share: 100,
                },
              ],
              collection,
              uses,
            },
            isMutable: true,
            collectionDetails: null,
          },
        }
      ),
      createCreateMasterEditionV3Instruction(
        {
          edition: await masterEditionAddress(mint.address),
          mint: mint.address,
          updateAuthority: creator.authority,
          mintAuthority: provider.wallet.publicKey,
          payer: provider.wallet.publicKey,
          metadata,
        },
        {
          createMasterEditionArgs: {
            maxSupply: new BN(0),
          },
        }
      ) /*
        ...(!updateAuthority.equals(creator?.publicKey || provider.wallet.publicKey)
          ? [
              createUpdateMetadataAccountV2Instruction(
                {
                  metadata,
                  updateAuthority: creator?.publicKey || provider.wallet.publicKey,
                },
                {
                  updateMetadataAccountArgsV2: {
                    data: null,
                    updateAuthority,
                    primarySaleHappened: null,
                    isMutable: null,
                  },
                }
              ),
            ]
          : []),*/,
    ]);
    await creator.runTx(tx);

    return new NftHelper(mint, creator);
  }

  async setUpdateAuthority(updateAuthority: PublicKey) {
    const metadata = await metadataAddress(this.mint.address);
    const tx = new TransactionEnvelope(this.mint.provider, [
      createUpdateMetadataAccountV2Instruction(
        {
          metadata,
          updateAuthority: this.creator.authority,
        },
        {
          updateMetadataAccountArgsV2: {
            data: null,
            updateAuthority,
            primarySaleHappened: null,
            isMutable: null,
          },
        }
      ),
    ]);
    await this.creator.runTx(tx);
  }
}
