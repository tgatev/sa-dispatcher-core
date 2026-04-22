const fs = require("fs");
import { prompt } from "../src/Common/prompt";
// const anchor = require("@staratlas/anchor");
import * as anchor from "@project-serum/anchor";
import { Keypair } from "@solana/web3.js";

const { PublicKey, Connection } = require("@solana/web3.js");

const RPC = process.env["ATLASNET_RPC_URL"]; //|| process.env["RPC_URL"];
const PROGRAM_ID = new PublicKey(process.argv[2]) || (await prompt("Enter the program ID: ").then((d) => new PublicKey(d.trim())));
// Need ANCHOR_WALLET env variable pointing to a valid keypair file for fetchIdl to work (it needs a wallet, even if it's not used for signing)

(async () => {
  const conn = new Connection(RPC, "confirmed");
  /// new Wallet(Keypair.generate()) as any
  // Need ANCHOR_WALLET env variable pointing to a valid keypair file for fetchIdl to work (it needs a wallet, even if it's not used for signing)
  // const provider = new anchor.AnchorProvider(conn, anchor.Wallet.local(), anchor.AnchorProvider.defaultOptions());
  const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(Keypair.generate()) as any, anchor.AnchorProvider.defaultOptions());
  try {
    const idl = await anchor.Program.fetchIdl(PROGRAM_ID, provider);
    let fileName = "./idl-" + PROGRAM_ID + ".json";
    if (!idl) throw new Error("No on-chain IDL found (not published)");
    fs.writeFileSync(fileName, JSON.stringify(idl, null, 2));
    console.log("Saved:", fileName);
  } catch (e: any) {
    console.error("fetchIdl failed:", e.message);
    process.exit(1);
  }
})();

/**
 * Example of using
 * node fetch-idl.js <PROGRAM_ID>
 */
