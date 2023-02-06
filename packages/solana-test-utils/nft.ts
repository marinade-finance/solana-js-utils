import { Provider, TransactionEnvelope } from '@saberhq/solana-contrib';
import { PublicKey } from '@solana/web3.js';
import {
  Collection,
  createCreateMasterEditionV3Instruction,
  createCreateMetadataAccountV3Instruction,
  createUpdateMetadataAccountV2Instruction,
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
  creators?: SignerHelper[];
  collection: Collection | null;
  uses: Uses | null;
}

export class NftHelper {
  constructor(
    public readonly mint: MintHelper,
    public readonly creators: SignerHelper[]
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
      creators = [new WalletSignerHelper(provider.wallet)],
      collection,
      uses,
    },
    // updateAuthority = provider.wallet.publicKey,
    tokenOwner = provider.wallet.publicKey,
    freezeAuthority,
  }: {
    provider: Provider;
    params: NftParams;
    // updateAuthority?: PublicKey;
    tokenOwner?: PublicKey;
    freezeAuthority?: SignerHelper;
  }): Promise<NftHelper> {
    const mint = await MintHelper.create({
      provider,
      digits: 0,
      freezeAuthority:
        freezeAuthority || new WalletSignerHelper(provider.wallet),
    });
    await mint.mintTo({
      amount: new BN(1),
      owner: tokenOwner,
    });
    const metadata = await metadataAddress(mint.address);
    const tx = new TransactionEnvelope(provider, []);
    tx.append(
      createCreateMetadataAccountV3Instruction(
        {
          metadata,
          mint: mint.address,
          mintAuthority: provider.wallet.publicKey,
          payer: provider.wallet.publicKey,
          updateAuthority: creators[0].authority,
        },
        {
          createMetadataAccountArgsV3: {
            data: {
              name,
              symbol,
              uri,
              sellerFeeBasisPoints,
              creators: creators.map((creator, index) => ({
                address: creator.authority,
                verified: index === 0,
                share: index === 0 ? 100 : 0,
              })),
              collection,
              uses,
            },
            isMutable: true,
            collectionDetails: null,
          },
        }
      )
    );
    if (!freezeAuthority) {
      tx.append(
        createCreateMasterEditionV3Instruction(
          {
            edition: await masterEditionAddress(mint.address),
            mint: mint.address,
            updateAuthority: creators[0].authority,
            mintAuthority: provider.wallet.publicKey,
            payer: provider.wallet.publicKey,
            metadata,
          },
          {
            createMasterEditionArgs: {
              maxSupply: new BN(0),
            },
          }
        )
      );
    }

    /*
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
          : []),*/
    await creators[0].runTx(tx);

    return new NftHelper(mint, creators);
  }

  async setUpdateAuthority(updateAuthority: PublicKey) {
    const metadata = await metadataAddress(this.mint.address);
    const tx = new TransactionEnvelope(this.mint.provider, [
      createUpdateMetadataAccountV2Instruction(
        {
          metadata,
          updateAuthority: this.creators[0].authority,
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
    await this.creators[0].runTx(tx);
  }
}
