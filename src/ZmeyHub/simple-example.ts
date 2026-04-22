import { SAGE_IDL } from "../holoHandlers/IDL/constants";
import { SimpleZmeyHub } from "./SimpleZmeyHub";

/**
 * Minimal run example.
 * Set env:
 * - RPC_URL
 * - SAGE_PROGRAM_ID
 */
async function main() {
  const rpcUrl = process.env["ATLASNET_RPC_URL"] || process.env["RPC_URL"];
  const programId = process.env["SAGE_PROGRAM_ID"];

  if (!rpcUrl || !programId) {
    throw new Error("Missing RPC_URL or SAGE_PROGRAM_ID");
  }

  const hub = new SimpleZmeyHub({
    rpcUrl,
    wsPort: 8091,
    programId,
    idl: SAGE_IDL as unknown as import("@project-serum/anchor").Idl,
    commitment: "confirmed",
  });

  await hub.start();

  process.on("SIGINT", async () => {
    await hub.stop();
    process.exit(0);
  });
}

void main();
