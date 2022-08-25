import { TransactionEnvelope } from '@saberhq/solana-contrib';
import { PublicKey } from '@solana/web3.js';
import { Middleware } from '..';

export abstract class MultisigMiddlewareBase implements Middleware {
  abstract signingBy: PublicKey;
  abstract programId: PublicKey;

  // TODO: detect independent instructions from packing tail and put it back to normal flow
  async apply(tx: TransactionEnvelope): Promise<TransactionEnvelope> {
    const start = tx.instructions.findIndex(ix =>
      ix.keys.find(acc => acc.pubkey.equals(this.signingBy) && acc.isSigner)
    );
    if (start < 0) {
      return tx;
    }

    const inner = tx.instructions.splice(start);
    while (inner.length > 0) {
      for (let count = inner.length; count > 0; count--) {
        const used = inner.slice(0, count);
        const wrapped = await this.createTransaction(
          new TransactionEnvelope(tx.provider, used, tx.signers)
        );
        try {
          wrapped.partition();
          // save wrapper into original tx
          tx = tx.combine(wrapped);
          // Remove all instrctions already wrapped
          inner.splice(0, count);
          break; // for
        } catch (e) {
          if (count === 1) {
            throw e; // can not wrap even single instruction
          }
          // retry with less instruction count
        }
      }
    }
    return tx;
  }

  abstract createTransaction(
    inner: TransactionEnvelope
  ): Promise<TransactionEnvelope>;
}
