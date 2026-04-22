import { Connection, PublicKey } from "@solana/web3.js";

export class TransactionProcessor {
  // sectorDataLimit: number = 30;
  // data: Map<string, iSectorData[]> = new Map<string, iSectorData[]>();
  // calculated: Map<string, iSectorCalculations> = new Map<string, iSectorCalculations>();
  walletPub: PublicKey = new PublicKey("DV6mRBZJnQcV5GT9A5gcREu17zJM8g27915gL1pWqsSU");

  connection: Connection = new Connection(process.env["SOLANA_RPC_URL"] || "", {
    wsEndpoint: "wss://api.mainnet-beta.solana.com",
    commitment: "confirmed",
  });

  constructor() {}
  async startLogsListener() {
    this.connection.onLogs(this.walletPub, (logs, context) => {
      console.log(context);
      console.log(logs.signature);

      ("confirmed");
    });
  }
}
