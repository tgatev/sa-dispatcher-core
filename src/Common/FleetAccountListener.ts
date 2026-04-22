import { Connection, PublicKey, AccountInfo, GetProgramAccountsResponse, KeyedAccountInfo } from "@solana/web3.js";
import { ProgramAccountListener } from "./ProgramAccountListener";
import { AnchorProvider, Program } from "@project-serum/anchor";

/**
 * Fleets: any fleet account
 */
export type FleetAccountListenerCallback<T> = (fleets: T[], ctx: any) => Promise<void>;

export class FleetAccountListener<T, K> extends ProgramAccountListener<FleetAccountListenerCallback<T>> {
  callbacks: (FleetAccountListenerCallback<T> | null)[] = [];
  subscriptionId: number | null = null;

  constructor(
    connection: Connection,
    private program: K,
    private sageProgramId: PublicKey,

    private parseFleetAccounts: (
      accountRawData: GetProgramAccountsResponse | KeyedAccountInfo[],
      program: K
    ) => Promise<{
      [key: string]: T;
    }>
  ) {
    super(connection);
  }
  listen() {
    if (!this.subscriptionId && this.connection) {
      this.subscriptionId = this.connection.onProgramAccountChange(this.sageProgramId, async (info, ctx) => {
        const accountsObj = await this.parseFleetAccounts(
          [
            {
              account: info.accountInfo,
              pubkey: info.accountId,
            },
          ],
          this.program
        );
        const fleets = Object.values(accountsObj);
        for (const cb of this.callbacks) {
          if (cb) await cb(fleets, ctx);
        }
      });
    }
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

// ProgramAccountListener.listen(connection, pubkey);
// ProgramAccountListener.addCallback((info, ctx) => {
//   console.log("Account changed!", info);
// });
