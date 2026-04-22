import fs from "fs";
import { Connection, PublicKey, Keypair, Transaction } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, createTransferInstruction, TOKEN_PROGRAM_ID, getMint } from "@solana/spl-token";
import { log } from "console";
import bs58 from "bs58";

const ZATLAS_MINT = new PublicKey("6PhneWhbN4R3nFutrRUVnE3sNgRsFS6yPrjRC29mMWnv");

function loadKeypairFromPathOrJson(input: string): Keypair {
  // If it's a path to a file with JSON array secret key
  try {
    if (fs.existsSync(input)) {
      const raw = fs.readFileSync(input, "utf8").trim();
      const arr = JSON.parse(raw);
      return Keypair.fromSecretKey(Uint8Array.from(arr));
    }
  } catch (e) {}

  // Maybe it's a JSON array provided inline
  try {
    const arr = JSON.parse(input);
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  } catch (e) {
    throw new Error("Unable to load keypair. Provide a path to a JSON secret key file or a JSON array string.");
  }
}

function loadKeypairFromEnv(key: string): Keypair {
  if (!key) {
    throw new Error(`Environment variable ${key} is not set.`);
  }
  const walletKeypair = Keypair.fromSecretKey(bs58.decode(key));

  return walletKeypair;
}

async function getZAtlasBalance(connection: Connection, owner: PublicKey): Promise<string> {
  const resp = await connection.getParsedTokenAccountsByOwner(owner, { mint: ZATLAS_MINT });
  if (!resp || resp.value.length === 0) return "0";
  // Sum UI amounts (there should normally be one ATA)
  let total = 0;
  for (const acc of resp.value) {
    log("Found zAtlas account:", acc.pubkey.toBase58(), "with balance", acc.account.data.parsed.info.tokenAmount.uiAmount);
    const info = acc.account.data.parsed.info;
    const ta = info.tokenAmount;
    const ui = Number(ta.uiAmount || 0);
    total += ui;
  }
  return String(total);
}

async function doTransfer(connection: Connection, sender: Keypair, toPubkey: PublicKey, amountUi: number): Promise<string> {
  const mintInfo = await getMint(connection, ZATLAS_MINT);
  const decimals = mintInfo.decimals;

  const senderATA = await getOrCreateAssociatedTokenAccount(connection, sender, ZATLAS_MINT, sender.publicKey);
  const receiverATA = await getOrCreateAssociatedTokenAccount(connection, sender, ZATLAS_MINT, toPubkey);

  const amountRaw = BigInt(Math.round(amountUi * Math.pow(10, decimals)));

  // Check balance
  if (BigInt(senderATA.amount) < amountRaw) {
    throw new Error(`Insufficient zAtlas balance. Have ${senderATA.amount}, need ${amountRaw}`);
  }

  const ix = createTransferInstruction(senderATA.address, receiverATA.address, sender.publicKey, amountRaw, [], TOKEN_PROGRAM_ID);
  const tx = new Transaction().add(ix);

  const sig = await connection.sendTransaction(tx, [sender]);
  // Wait for confirmation (simple)
  await connection.confirmTransaction(sig);
  return sig;
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const rpcUrl = process.env["ATLASNET_RPC_URL"] || "https://api.mainnet-beta.solana.com";
  const conn = new Connection(rpcUrl, "confirmed");

  if (cmd === "balance") {
    const owner = argv[1];
    if (!owner) {
      console.error("Usage: balance <walletPubkey>");
      process.exit(1);
    }
    const pk = new PublicKey(owner);
    const bal = await getZAtlasBalance(conn, pk);
    console.log(`zAtlas balance for ${pk.toBase58()}:`, bal);
    process.exit(0);
  } else if (cmd === "transfer") {
    // transfer <senderKeyPathOrJson> <toPubkey> <amount>
    const toArg = argv[1];
    const amountArg = argv[2];
    const senderArg = argv[3];

    if (!toArg || !amountArg) {
      console.error("Usage: transfer <toPubkey> <amount (ui)> <senderKeyPathOrJson>");
      console.error(
        "Sender could be env variable SOLANA_WALLET_SECRET_KEY or a path to a JSON file with secret key array or a JSON array string.",
      );
      process.exit(1);
    }
    // || process.env["SOLANA_WALLET_SECRET_KEY"]

    let sender: Keypair;
    if (senderArg) {
      try {
        sender = loadKeypairFromPathOrJson(senderArg);
      } catch (e: any) {
        console.error(e.message || e);
        process.exit(1);
      }
    } else if (process.env["SOLANA_WALLET_SECRET_KEY"]) {
      sender = loadKeypairFromEnv(process.env["SOLANA_WALLET_SECRET_KEY"]);
    } else {
      throw new Error(
        "Sender key not provided. Set SOLANA_WALLET_SECRET_KEY env var or provide a path to a JSON secret key file or a JSON array string as the third argument.",
      );
    }

    const toPk = new PublicKey(toArg);
    const amountUi = Number(amountArg);
    if (isNaN(amountUi) || amountUi <= 0) {
      console.error("Amount must be a positive number (UI amount). Use mint decimals to adjust if needed.");
      process.exit(1);
    }

    try {
      console.log("Checking sender zAtlas balance...");
      const before = await getZAtlasBalance(conn, sender.publicKey);
      console.log("Before:", before);
      const sig = await doTransfer(conn, sender, toPk, amountUi);
      console.log("Transfer signature:", sig);
      const after = await getZAtlasBalance(conn, sender.publicKey);
      console.log("After:", after);
    } catch (e: any) {
      console.error("Transfer failed:", e.message || e);
      process.exit(1);
    }
  } else {
    console.log(
      "zAtlas helper\n\nCommands:\n  balance <walletPubkey>\n  transfer <senderKeyPathOrJson> <toPubkey> <amount>\n\nNotes:\n - The script reads RPC from env var SOLANA_RPC_URL (defaults to mainnet).\n - The sender key must be a JSON secret key array file (like keypair file) or a JSON array string.",
    );
    process.exit(0);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 *
 * $ npx ts-node bin/zatlas.ts transfer <SENDER_KEYPATH_OR_JSON> <TO_PUBKEY> <AMOUNT_UI>
 *
 *
 */
