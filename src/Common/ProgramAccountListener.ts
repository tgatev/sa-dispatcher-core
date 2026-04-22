import { Connection, PublicKey, AccountInfo } from "@solana/web3.js";

export abstract class ProgramAccountListener<TCallback extends (...args: any[]) => Promise<void>> {
  callbacks: Array<TCallback | null> = [];
  subscriptionId: number | null = null;

  constructor(public connection: Connection) {}

  listen(pubkey: PublicKey) {
    if (!this.subscriptionId) {
      this.subscriptionId = this.connection.onAccountChange(pubkey, (info, ctx) => {
        for (const cb of this.callbacks) cb && cb([info], ctx);
      });
    }
  }

  subscribe(cb: TCallback): number {
    this.callbacks.push(cb);
    return this.callbacks.length - 1;
  }

  unsubscribe(id: number) {
    this.callbacks[id] = null;
  }

  async close() {
    if (this.subscriptionId && this.connection) {
      await this.connection.removeAccountChangeListener(this.subscriptionId);
      this.subscriptionId = null;
      this.callbacks = [];
    }
  }
}

// Usage:
// const connection = new Connection("https://api.devnet.solana.com");
// const pubkey = new PublicKey("<PROGRAM_ACCOUNT>");

// programAccountListener.
// programAccountListener.listen(connection, pubkey);
// programAccountListener.addCallback((info, ctx) => {
//   console.log("Account changed!", info);
// });
