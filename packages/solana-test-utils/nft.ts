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
import {
  AuthorityType,
  createFreezeAccountInstruction,
  createSetAuthorityInstruction,
  getAssociatedTokenAddressSync,
} from 'solana-spl-token-modern';

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
    frozen = false,
  }: {
    provider: Provider;
    params: NftParams;
    // updateAuthority?: PublicKey;
    tokenOwner?: PublicKey;
    freezeAuthority?: SignerHelper;
    frozen?: boolean;
  }): Promise<NftHelper> {
    const mint = await MintHelper.create({
      provider,
      digits: 0,
      freezeAuthority:
        (!frozen && freezeAuthority) || new WalletSignerHelper(provider.wallet),
    });
    await mint.mintTo({
      amount: new BN(1),
      owner: tokenOwner,
    });
    const tx = new TransactionEnvelope(provider, []);
    if (frozen) {
      const tokenAccount = getAssociatedTokenAddressSync(
        mint.address,
        tokenOwner,
        true
      );
      tx.append(
        createFreezeAccountInstruction(
          tokenAccount,
          mint.address,
          provider.wallet.publicKey
        )
      );
    }
    const metadata = await metadataAddress(mint.address);
    tx.append(
      createCreateMetadataAccountV3Instruction(
        {
          metadata,
          mint: mint.address,
          mintAuthority: provider.wallet.publicKey,
          payer: provider.wallet.publicKey,
          updateAuthority: creators[0]?.authority || provider.wallet.publicKey,
        },
        {
          createMetadataAccountArgsV3: {
            data: {
              name,
              symbol,
              uri,
              sellerFeeBasisPoints,
              creators:
                creators.length > 0
                  ? creators.map((creator, index) => ({
                      address: creator.authority,
                      verified: index === 0,
                      share: index === 0 ? 100 : 0,
                    }))
                  : null,
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
            updateAuthority:
              creators[0]?.authority || provider.wallet.publicKey,
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
    } else if (!freezeAuthority.authority.equals(provider.wallet.publicKey)) {
      tx.append(
        createSetAuthorityInstruction(
          mint.address,
          provider.wallet.publicKey,
          AuthorityType.FreezeAccount,
          freezeAuthority.authority
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
    if (creators.length > 0) {
      await creators[0].runTx(tx);
    } else {
      await tx.confirm();
    }

    return new NftHelper(mint, creators);
  }

  async setUpdateAuthority(updateAuthority: PublicKey) {
    const metadata = await metadataAddress(this.mint.address);
    const tx = new TransactionEnvelope(this.mint.provider, [
      createUpdateMetadataAccountV2Instruction(
        {
          metadata,
          updateAuthority:
            this.creators[0]?.authority || this.mint.provider.wallet.publicKey,
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
    if (this.creators[0]) {
      await this.creators[0].runTx(tx);
    } else {
      await tx.confirm();
    }
  }
}
