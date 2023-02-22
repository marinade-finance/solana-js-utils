import { run } from '../packages/solana-test-utils/runner'
import { PublicKey } from '@solana/web3.js';

run([
  {
    address: new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw'),
    path: 'fixtures/spl_governance.so',
  },
  {
    address: new PublicKey('kedgrkbZ5TcjRz2fSpZMcasWzyxd8SuEaXoGfbkPddc'),
    path: 'fixtures/kedgeree.so',
  },
])