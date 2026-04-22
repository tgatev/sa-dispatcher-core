import { PublicKey } from "@solana/web3.js";
import { BN } from "@project-serum/anchor";
import { isUint8ArrayData, u8aToString } from "../utils";
// Helper to recursively convert PublicKey and BN to strings
function serializeForLog(obj: any): any {
  if (obj instanceof PublicKey) {
    return `PublicKey( ${obj.toBase58()} )`;
  }
  if (obj instanceof BN) {
    return `BN( ${obj.toString()} )`;
  }
  if (Array.isArray(obj)) {
    if (isUint8ArrayData(obj)) {
      return `Uint8Array( ${u8aToString(obj as unknown as Uint8Array).replace(/\0/g, "")} )`;
    }
    return obj.map(serializeForLog);
  }
  if (obj && typeof obj === "object") {
    const out: any = {};
    for (const key of Object.keys(obj)) {
      out[key] = serializeForLog(obj[key]);
    }
    return out;
  }
  return obj;
}

// Patch console.log
export const origLog = console.log;

// Apply to all next code
// console.log = (...args: any[]) => {
//   origLog(...args.map(serializeForLog));
// };

// Local log function for this file/namespace
export const log = (...args: any[]) => {
  console.log(...args.map(serializeForLog));
};
