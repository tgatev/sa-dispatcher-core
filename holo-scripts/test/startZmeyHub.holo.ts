import { SAGE_IDL } from "../../src/holoHandlers/IDL/constants";
import { SimpleZmeyHub } from "../../src/ZmeyHub/SimpleZmeyHub";

async function run() {
  const rpcUrl = process.env["ATLASNET_RPC_URL"] || process.env["RPC_URL"];
  const programId = process.env["SAGE_PROGRAM_ID"];
  const wsPort = Number(process.env["ZMEY_WS_PORT"] || 8091);

  if (!rpcUrl) {
    throw new Error("Missing ATLASNET_RPC_URL or RPC_URL");
  }
  if (!programId) {
    throw new Error("Missing SAGE_PROGRAM_ID");
  }

  const hub = new SimpleZmeyHub({
    rpcUrl,
    wsPort,
    programId,
    idl: SAGE_IDL as unknown as import("@project-serum/anchor").Idl,
    commitment: "confirmed",
  });

  await hub.start();
  console.log(`[ZmeyHub][HOLO] started on ws://127.0.0.1:${wsPort}`);

  process.on("SIGINT", async () => {
    console.log("[ZmeyHub][HOLO] stopping...");
    await hub.stop();
    process.exit(0);
  });
}

run().catch((err) => {
  console.error("[ZmeyHub][HOLO] failed", err);
  process.exit(1);
});
