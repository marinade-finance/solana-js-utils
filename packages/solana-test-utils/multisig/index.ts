import { GokiSDK } from '@gokiprotocol/client';
import { Provider } from '@saberhq/solana-contrib';
import BN from 'bn.js';
import { SignerHelper } from '../signer';
import { GokiHelper } from './goki';
import { MultisigHelper } from './multisig';
import { SplGovHelper, TokenOwnerRecordSide } from './splGov';

export { MultisigHelper } from './multisig';
export { GokiHelper } from './goki';

export interface MultisigFacotry {
  name: string;
  side: TokenOwnerRecordSide;
  create: (config: {
    provider: Provider;
    members?: SignerHelper[];
    threshold?: BN;
  }) => Promise<MultisigHelper>;
}

export const MULTISIG_FACTORIES: MultisigFacotry[] = [
  {
    name: 'Goki',
    side: 'council',
    create: ({ provider, members, threshold }) =>
      GokiHelper.create({
        members,
        threshold,
        goki: GokiSDK.load({ provider }),
      }),
  },
  {
    name: 'Spl-gov-council',
    side: 'council',
    create: ({ provider, members, threshold }) =>
      SplGovHelper.create({
        provider,
        members,
        threshold,
        side: 'council',
      }),
  },
  {
    name: 'Spl-gov-community',
    side: 'community',
    create: ({ provider, members, threshold }) =>
      SplGovHelper.create({
        provider,
        members,
        threshold,
        side: 'community',
      }),
  },
];
