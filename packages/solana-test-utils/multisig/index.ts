import { GokiSDK } from '@gokiprotocol/client';
import { KedgereeSDK } from '@marinade.finance/kedgeree-sdk';
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
    kedgeree: KedgereeSDK;
    members?: SignerHelper[];
    threshold?: BN;
  }) => Promise<MultisigHelper>;
}

export const MULTISIG_FACTORIES: MultisigFacotry[] = [
  {
    name: 'Goki',
    side: 'council',
    create: ({ kedgeree, members, threshold }) =>
      GokiHelper.create({
        members,
        threshold,
        goki: GokiSDK.load({ provider: kedgeree.provider }),
      }),
  },
  {
    name: 'Spl-gov-council',
    side: 'council',
    create: ({ kedgeree, members, threshold }) =>
      SplGovHelper.create({
        kedgeree,
        members,
        threshold,
        side: 'council',
      }),
  },
  {
    name: 'Spl-gov-community',
    side: 'community',
    create: ({ kedgeree, members, threshold }) =>
      SplGovHelper.create({
        kedgeree,
        members,
        threshold,
        side: 'community',
      }),
  },
];
