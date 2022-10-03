import { SignerWallet, sleep, SolanaProvider } from '@saberhq/solana-contrib';
import { Connection, PublicKey } from '@solana/web3.js';
import { spawn } from 'child_process';
import { parseKeypair } from '@marinade.finance/solana-cli-utils';
import { fs } from 'mz';

export async function run(bpfPrograms: { address: PublicKey; path: string }[]) {
  let args: string[] = [];
  bpfPrograms.forEach(({ path, address }) => {
    args = args.concat(['--bpf-program', address.toBase58(), path]);
  });
  console.log('Starting test validator');
  const testValidator = spawn('solana-test-validator', args);

  testValidator.stderr.on('data', data => console.log(data.toString('latin1')));
  await fs.rmdir(process.cwd() + '/test-ledger', { recursive: true });
  try {
    // testValidator.on('close', code => console.log(`Close ${code}`));
    const provider = SolanaProvider.init({
      connection: new Connection('http://localhost:8899'),
      wallet: new SignerWallet(await parseKeypair('~/.config/solana/id.json')),
    });

    let wait = 40000;
    const step = 100;
    while (wait > 0) {
      try {
        await provider.connection.getLatestBlockhash();
        break;
      } catch (e) {
        await sleep(step);
        wait -= step;
      }
    }
    if (wait <= 0) {
      testValidator.kill();
      throw new Error(
        'Unable to get latest blockhash. Test validator does not look started'
      );
    }
    console.log('Test validator online');

    const test = spawn('pnpm', ['_test'], { stdio: 'inherit' });
    await new Promise((resolve, reject) =>
      test.on('close', code => {
        if (code) {
          reject(code);
        } else {
          resolve(null);
        }
      })
    );
  } finally {
    testValidator.kill();
  }
}
