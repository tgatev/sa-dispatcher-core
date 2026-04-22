const { Connection, PublicKey } = require("@solana/web3.js");

function acctKeyToString(entry: any) {
  if (!entry) return null;
  if (typeof entry === "string") return entry;
  if (entry.pubkey) {
    // parsed form: { pubkey: PublicKey | string, signer: bool, writable: bool }
    return entry.pubkey.toString ? entry.pubkey.toString() : String(entry.pubkey);
  }
  // fallback
  return String(entry);
}

async function inspect(sig: string, rpc = "https://rpc.ironforge.network/devnet?apiKey=01JEB7YQ0YPK31WQTC0VQ5Y9YP") {
  const conn = new Connection(rpc, "confirmed");
  const tx = await conn.getParsedTransaction(sig, { maxSupportedTransactionVersion: 0 });
  if (!tx) {
    console.error("No tx");
    return;
  }

  const msg = tx.transaction.message;
  const keysArray = msg?.accountKeys ?? msg?.staticAccountKeys ?? [];

  console.log("signature:", sig);
  console.log("status err:", tx.meta?.err);
  console.log("\n-- accountKeys --");
  keysArray.forEach((k, i) => {
    const s = acctKeyToString(k);
    const signer = k?.signer ? "S" : "";
    const writable = k?.writable ? "W" : "";
    console.log(i, s, signer, writable);
  });

  console.log("\n-- instructions --");
  (msg.instructions || []).forEach((ix, i) => {
    console.log("instr", i, "programIdIndex:", ix.programIdIndex ?? ix.programId, "accounts idx:", ix.accounts ?? ix.accountKeys ?? []);
    // best-effort resolve programId string
    let programIdStr = null;
    if (typeof ix.programId === "string") programIdStr = ix.programId;
    else if (typeof ix.programIdIndex === "number") {
      programIdStr = acctKeyToString(keysArray[ix.programIdIndex]) || `<missing index ${ix.programIdIndex}>`;
    } else {
      programIdStr = "<unknown>";
    }
    console.log(" programId:", programIdStr);
    console.log(" raw:", ix.data?.slice?.(0, 20) ?? ix.data);
  });

  console.log("\n-- innerInstructions --");
  (tx.meta?.innerInstructions || []).forEach((grp, gi) => {
    console.log(" inner group index:", grp.index);
    grp.instructions.forEach((ix, ii) => {
      // guard when programIdIndex out of range
      const pIndex = ix.programIdIndex;
      const pStr =
        typeof pIndex === "number" && keysArray[pIndex] ? acctKeyToString(keysArray[pIndex]) : `<missing programIdIndex ${pIndex}>`;
      console.log("  inner instr", ii, "programIdIndex:", pIndex, "->", pStr, "acctIdxs:", ix.accounts);
      if (Array.isArray(ix.accounts)) {
        ix.accounts.forEach((ai) => {
          const aStr = keysArray[ai] ? acctKeyToString(keysArray[ai]) : `<missing acctIdx ${ai}>`;
          console.log("    acct idx", ai, "->", aStr);
        });
      }
    });
  });

  console.log("\n-- logs --");
  (tx.meta?.logMessages || []).forEach((l) => console.log(l));
}

if (require.main === module) {
  const sig = process.argv[2];
  if (!sig) {
    console.error("Usage: node inspect-tx.js <signature>");
    process.exit(1);
  }
  inspect(sig).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
