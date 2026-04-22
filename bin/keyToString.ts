import { bs58 } from "@project-serum/anchor/dist/cjs/utils/bytes";
import { prompt } from "../src/Common/prompt";
import Dispatcher from "../src/Model/Dispatcher";
import { DispatcherHolosim } from "../src/holoHandlers/HolosimMintsImporter";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { log } from "../src/Common/PatchConsoleLog";
import * as bip39 from "bip39";
import { derivePath } from "ed25519-hd-key";

console.log("Starting Key Conversion... please select the conversion type:");
log(" 1 - Secret Words to Base58 and Private Key Array -> Base58 String + Public Key");
log(" 2 - Converting Private Key Array to Base58 and Public Key... [ 1, 2, 3, ... ] -> Base58 String + Public Key");
log(" 3 - Converting Base58 String back to Private Key Array... Base58 String -> [ 1, 2, 3, ... ]");

let conversionType = await prompt("Enter the conversion type (1, 2, or 3): ").then((d) => {
  return d.trim();
});
let inputWords: string,
  inputArray: string = "",
  inputBase58: string = "",
  publicKey: string = "",
  keyArray: string = "";

// const keyArray = await prompt("Enter private key array (comma separated): ");
keyArray = "";

switch (conversionType) {
  case "1":
    inputWords = await prompt("Enter your secret words (space separated): ");
    let res = await fromMnemonic(inputWords);
    publicKey = res.publicKeyBase58;
    keyArray = JSON.stringify(res.secretKeyBytes);
    inputBase58 = res.secretKeyBase58;
    inputArray = keyArray;
    break;
  case "2":
    if (!keyArray) {
      keyArray = await prompt("Enter private key array (comma separated): ");
    }
    // parse numeric array from input (handles "[1, 2, ...]" or "1,2,...")
    const nums = keyArray
      .replaceAll(/[\[\]\s]/g, "")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => !Number.isNaN(n));
    const secretBytes = Uint8Array.from(nums);

    let kp: Keypair;
    if (secretBytes.length === 64) {
      // full secretKey (64 bytes)
      kp = Keypair.fromSecretKey(secretBytes);
    } else if (secretBytes.length === 32) {
      // 32-byte seed
      kp = Keypair.fromSeed(secretBytes);
    } else {
      throw new Error(`Invalid key array length ${secretBytes.length}, expected 64 (secretKey) or 32 (seed)`);
    }

    publicKey = kp.publicKey.toBase58();
    inputBase58 = bs58.encode(kp.secretKey);
    inputArray = JSON.stringify(Array.from(secretBytes));
    break;

  case "3":
    if (!inputBase58) {
      inputBase58 = await prompt("Enter Base58 encoded private key: ");
    }
    const decodedBytes = bs58.decode(inputBase58);

    // support: 64-byte secretKey, 32-byte seed, or 32-byte public key
    if (decodedBytes.length === 64) {
      // full secretKey -> derive Keypair
      const kp64 = Keypair.fromSecretKey(Uint8Array.from(decodedBytes));
      keyArray = JSON.stringify(Array.from(decodedBytes));
      publicKey = kp64.publicKey.toBase58();
      inputArray = keyArray;
      inputBase58 = bs58.encode(kp64.secretKey);
    } else if (decodedBytes.length === 32) {
      // could be seed or public key; try deriving Keypair from seed first
      try {
        const kpSeed = Keypair.fromSeed(Uint8Array.from(decodedBytes));
        keyArray = JSON.stringify(Array.from(decodedBytes));
        publicKey = kpSeed.publicKey.toBase58();
        inputArray = keyArray;
        inputBase58 = bs58.encode(kpSeed.secretKey);
      } catch {
        // fallback: treat as public key bytes
        const pk = new PublicKey(Uint8Array.from(decodedBytes));
        publicKey = pk.toBase58();
        keyArray = JSON.stringify(Array.from(decodedBytes));
        inputArray = keyArray;
      }
    } else {
      // try if inputBase58 is a public key string (base58 of pubkey)
      try {
        const pk = new PublicKey(inputBase58);
        publicKey = pk.toBase58();
        keyArray = JSON.stringify(Array.from(decodedBytes));
        inputArray = keyArray;
      } catch (e) {
        throw new Error(
          `Unsupported decoded length ${decodedBytes.length}. Expected 64 (secretKey), 32 (seed/pubkey) or a valid pubkey string.`,
        );
      }
    }
    break;
  default:
    throw new Error("Invalid conversion type selected. Please enter 1, 2, or 3.");
    break;
}

console.log("\nConversion Result:");
console.log("Public Key (Base58):", publicKey || "N/A");
console.log("Private Key (Base58):", inputBase58);
console.log("Private Key Array:", inputArray);

await prompt("\nPress Enter to fetch Profiles Data...");
let profiles = { sage: await fetchProfile("SAGE").catch(() => {}), holo: await fetchProfile("HOLO").catch(() => {}) };

log("\nAssociated Player Profiles:");
log("SAGE Player Profile:", profiles.sage?.profileKey, " | ", profiles.sage?.profileAcc.profileKeys.length);
log("HOLO Player Profile:", profiles.holo?.profileKey, " | ", profiles.holo?.profileAcc.profileKeys.length);

displayProfile(profiles.holo);
// ! Helper Methods ...
async function fromMnemonic(mnemonic: string, account = 0) {
  const seed = await bip39.mnemonicToSeed(mnemonic); // Buffer (64 bytes)
  const path = `m/44'/501'/${account}'/0'`; // standard Solana path
  const derived = derivePath(path, seed.toString("hex")).key; // Buffer(32)
  const derivedUint8 = Uint8Array.from(derived);
  const keypair = Keypair.fromSeed(derivedUint8); // from 32-bite seed -> Keypair
  const secretKey = keypair.secretKey; // Uint8Array(64)
  return {
    publicKeyBase58: keypair.publicKey.toBase58(),
    secretKeyBytes: Array.from(secretKey),
    secretKeyBase58: bs58.encode(secretKey),
    seed32Bytes: Array.from(derivedUint8), // 32 bite
    bip39SeedHex: seed.toString("hex"), // 64 bite hex
  };
}

function displayProfile(profile: any) {
  console.log("Profile Public Key:", profile.profileKey);
  console.log("Profile Account Data:", profile.profileAcc);
  console.log("Permitted Wallets:");
  console.table(
    profile.profileAcc.profileKeys.map((k: any, idx: number) => ({
      idx,
      account: k.key.toBase58(),
      scope: k.scope.toBase58(),
      expireTime: k.expireTime,
    })),
  );
}

// * Fleet END to End Test
//   ** - Fetch Player Profile data,

/**
 *  Data Example:

 // private key example !!! DO NOT USE THIS KEY IN PRODUCTION OR WITH REAL FUNDS
const keyArray = [
  213, 144, 24, 247, 223, 39, 107, 135, 151, 12, 235, 6, 187, 141, 213, 59, 51, 154, 30, 218, 245, 232, 74, 227, 14, 158, 81, 164, 210, 119,
  226, 180, 253, 152, 8, 111, 117, 246, 30, 224, 40, 159, 230, 233, 42, 58, 210, 177, 181, 61, 144, 82, 88, 174, 35, 107, 24, 137, 199, 55,
  27, 96, 105, 175,
];
const base58 = bs58.encode(Uint8Array.from(keyArray));

*/

async function fetchProfile(mode: "SAGE" | "HOLO" = "SAGE") {
  let profiles = { SAGE_PROFILE: "", HOLOSIM_PROFILE: "" };
  let dispatcher;
  switch (mode) {
    case "SAGE":
      dispatcher = await Dispatcher.build({
        useLookupTables: false,
        owner_public_key: publicKey,
        wallet_secret_key: inputBase58,
        player_profile: "",
      });
      break;
    case "HOLO":
      dispatcher = await DispatcherHolosim.build({
        useLookupTables: false,
        owner_public_key: publicKey, // string
        wallet_secret_key: inputBase58,
        player_profile: "",
      });
      break;
    default:
      throw new Error("Invalid mode selected. Please enter 'SAGE' or 'HOLO'.");
  }

  await dispatcher.sageGameHandler.ready;
  console.log("[" + mode + "] Dispatcher initialized. ");

  let profile = await dispatcher.sageGameHandler
    .getPlayerProfileAddress(new PublicKey(publicKey))
    .then((profilePublicKey: PublicKey) => {
      //   console.log("[" + mode + "] Player Profile: ", profilePublicKey.toBase58());
      profiles.SAGE_PROFILE = profilePublicKey.toBase58() || "";
      return profilePublicKey;
    })
    .catch((err) => {
      console.error("<SAGE_Error> - profile not found.");
    });

  if (!profile) {
    throw new Error("Profile not found for public key: " + publicKey);
  }

  let profileAccount = await dispatcher.sageGameHandler.sagePlayerProfileHandler.getPlayerProfile(profile);

  return { profileKey: profile.toBase58(), profileAcc: profileAccount, dispatcher: dispatcher };
}
