const ProgressBar = require("progress");

import { iAbortSignal } from "./Common/Interfaces";
import { log } from "./Common/PatchConsoleLog";
import { BN } from "@project-serum/anchor";
import bs58 from "bs58";
import { Coordinates } from "./Model/Coordinates";

export type iLoggerParams = Parameters<typeof console.log>;

export abstract class Logger {
  setVerbosity(level: number) {
    if (level >= -1 && level < 5) this.verbose = level as -1 | 0 | 1 | 2 | 3 | 4;
  }
  public verbose: -1 | 0 | 1 | 2 | 3 | 4 = 4;
  log(...args: iLoggerParams) {
    if (this.verbose >= 4 || this.verbose == -1) log(new Date(), ["LOG"], ...args);
  }
  info(...args: iLoggerParams) {
    if (this.verbose >= 3 || this.verbose == -1) log(new Date(), ["INFO"], ...args);
  }
  warn(...args: iLoggerParams) {
    if (this.verbose >= 2 || this.verbose == -1) {
      console.warn(new Date(), ["[WARN]"]);
      log(...args);
    }
  }
  error(...args: iLoggerParams) {
    if (this.verbose >= 1 || this.verbose == -1) {
      console.error(new Date(), ["[ERROR]"]);
      log(...args);
    }
  }
  err(...args: iLoggerParams) {
    this.error(...args);
  }
  crit(...args: iLoggerParams) {
    console.error(new Date(), ["[CRITICAL]"]);
    log(...args);
  }
  dbg(...args: iLoggerParams) {
    if (this.verbose == -1) log(new Date(), ["[DBG]"], ...args);
  }
}

export class BaseLogger extends Logger {
  constructor() {
    super();
    this.setVerbosity(Number(process.env["VERBOSE"] || 4));
  }
}

export const logger = new BaseLogger();

/**
 * Convert BN or Number to timestamp (milliseconds)
 * Length check is used to determine if BN is in seconds (10 digits) or milliseconds (13 digits)
 * @param time
 * @returns
 */
export function toTimestamp(time: BN | Number): number {
  let len = time.toString().length;
  if (len > 12) {
    return time.toNumber();
  } else {
    return time.toNumber() * 1000;
  }
}

/**
 * Shifting time(stamp) to Seconds
 * @param time
 * @returns
 */
export function fromTimestamp(time: BN | Number): Number {
  let len = time.toString().length;
  if (len > 12) {
    return Number(Math.round(time / 1000));
  } else {
    return time;
  }
}

/**
 * Compare time with current time and return difference in milliseconds
 * Positive value means time is in the future, negative value means time is in the past
 * Zero means time is now
 * length check is used to determine if BN is in seconds (10 digits) or milliseconds (13 digits)
 * @param time
 * @param now
 * @returns
 */
export function cmpTime(time: BN | Number, now: BN | Number = Date.now()) {
  return toTimestamp(time) - toTimestamp(now);
}

/**
 * Wait time process with progress bar
 *    process.env["DISABLE_PROGRESS_BAR"]=<someting> - disable progress bare in waiting time
 * @param milliseconds
 * @param message
 * @param tick
 */
export const waitTimeProgress = async (milliseconds: number, message: string = "", tick: number = 1000, options?: { abortSignal?: iAbortSignal }) => {
  let now = new Date();
  let timeEnd = new Date(now.getTime() + milliseconds);
  const bar = new ProgressBar(message + " [:bar] :rate :percent :etas", { total: Math.ceil(milliseconds / tick), width: 50 });

  if (process.env["DISABLE_PROGRESS_BAR"]) {
    tick = 0;
  }
  // console.trace("<<<<<<<waitTimeProgress>>>>>>>");
  while (new Date().getTime() < timeEnd.getTime()) {
    if (tick > 0) {
      await new Promise((resolve) => setTimeout(resolve, tick));
      if (logger.verbose > 2 || logger.verbose == -1) bar.tick();
    } else {
      let waitSeconds = Math.round((timeEnd.getTime() - new Date().getTime()) / 2_000) || 1;
      await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
    }
    if (options && options.abortSignal) {
      let state = false;
      if ("boolean" == typeof options.abortSignal.state) {
        state = options.abortSignal.state;
      } else {
        state = await options.abortSignal.state({});
      }
      if (state == true) {
        await options.abortSignal.beforeAbort({});
        await options.abortSignal.thrower({ type: "Action", reason: "[Action::waitingTimeCost] Abort Signal Received" });
      }
    }
  }
  logger.log("\n");
};

/**
 * Format time to string
 * @param seconds
 * @returns
 */
export const formatTimePeriod = (seconds: number, format = "y[y], w[w], d[d], h[h], m[m], s[s]") => {
  let tmp = Math.abs(Math.ceil(seconds));

  const y = Math.floor(tmp / (365 * 24 * 60 * 60));
  tmp -= y * 365 * 24 * 60 * 60;
  const w = Math.floor(tmp / (7 * 24 * 60 * 60));
  tmp %= 7 * 24 * 60 * 60;
  const d = Math.floor(tmp / (24 * 60 * 60));
  tmp %= 24 * 60 * 60;
  const h = Math.floor(tmp / (60 * 60));
  tmp %= 60 * 60;
  const m = Math.floor(tmp / 60);
  const s = tmp % 60;
  let sign = seconds < 0 ? "-" : "";
  const parts = [];
  if (y) parts.push(`${sign}${y}y`);
  if (w) parts.push(`${sign}${w}w`);
  if (d) parts.push(`${sign}${d}d`);
  if (h) parts.push(`${sign}${h}h`);
  if (m) parts.push(`${sign}${m}m`);
  if (s || parts.length === 0) parts.push(`${sign}${s}s`);

  return parts.join(", ");
};

/** Decorate string to shortify view */
export function shortify(str: string, length: number = 3, stars = "..."): string {
  return `${str.substring(0, length)}${stars}${str.substring(str.length - length)}`;
}

export function isUint8ArrayData(arr: any): boolean {
  return Array.isArray(arr) && arr.every((v) => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 255);
}

export function u8aToString(arr: Uint8Array, clear = false): string {
  let str = Array.from(arr)
    .map((byte) => String.fromCharCode(byte))
    .join("");
  return clear ? str.replace(/\0/g, "") : str;
}

export function strToU8a(str: string) {
  return new TextEncoder().encode(str);
}

export function strToBN(str: string): BN {
  return new BN(str);
}

/**
 * Converts a string or number to a Uint8Array for memcmp filter.
 * - Strings are UTF-8 encoded and padded/truncated to the given length.
 * - Numbers are encoded as big-endian, with the given byte length (default 1).
 * Returns the base58 string for use in the filter.
 */
export function toFilterBytes(value: string | number, byteLength: number = 1): string {
  if (typeof value === "string") {
    // Encode string as UTF-8, pad/truncate to byteLength
    const encoder = new TextEncoder();
    let arr = encoder.encode(value);
    if (arr.length > byteLength) arr = arr.slice(0, byteLength);
    else if (arr.length < byteLength) {
      const padded = new Uint8Array(byteLength);
      padded.set(arr);
      arr = padded;
    }
    return bs58.encode(arr);
  } else if (typeof value === "number") {
    // Encode number as big-endian
    const arr = new Uint8Array(byteLength);
    for (let i = 0; i < byteLength; i++) {
      arr[byteLength - 1 - i] = (value >> (8 * i)) & 0xff;
    }
    return bs58.encode(arr);
  }
  throw new Error("Unsupported type for filter bytes");
}

/**
 * Calc CURRENT SECTOR of fleet based on start, end coordinates and time
 * @param start
 * @param end
 * @param startTime
 * @param endTime
 * @param currentTime
 * @returns Coordinates
 * 
 * @example
   const sector = getFleetSector(
    { x: -10, y: 5 }, // start
    { x: 20, y: 15 }, // end
    1000,             // startTime (timestamp)
    2000,             // endTime (timestamp)
    Date.now()        // currentTime
  );

  Example result:
    ** (-50, -50) to (50, 50)
    getFleetSector({ x: -50, y: -50 }, { x: 50, y: 50 }, 0, 100, 0);    // { x: -50, y: -50 }
    getFleetSector({ x: -50, y: -50 }, { x: 50, y: 50 }, 0, 100, 50);   // { x: 0, y: 0 }
    getFleetSector({ x: -50, y: -50 }, { x: 50, y: 50 }, 0, 100, 100);  // { x: 50, y: 50 }

    ** (-100, 100) to (100, -100)
    getFleetSector({ x: -100, y: 100 }, { x: 100, y: -100 }, 0, 200, 0);    // { x: -100, y: 100 }
    getFleetSector({ x: -100, y: 100 }, { x: 100, y: -100 }, 0, 200, 100);  // { x: 0, y: 0 }
    getFleetSector({ x: -100, y: 100 }, { x: 100, y: -100 }, 0, 200, 200);  // { x: 100, y: -100 }

    ** (0, 0) to (-80, 80)
    getFleetSector({ x: 0, y: 0 }, { x: -80, y: 80 }, 0, 80, 0);    // { x: 0, y: 0 }
    getFleetSector({ x: 0, y: 0 }, { x: -80, y: 80 }, 0, 80, 40);   // { x: -40, y: 40 }
    getFleetSector({ x: 0, y: 0 }, { x: -80, y: 80 }, 0, 80, 80);   // { x: -80, y: 80 }
 */
export function getFleetSector(start: Coordinates, end: Coordinates, startTime: number, endTime: number, currentTime: number): Coordinates {
  if (currentTime <= startTime) return new Coordinates(Math.round(start.x), Math.round(start.y));
  if (currentTime >= endTime) return new Coordinates(Math.round(end.x), Math.round(end.y));
  if (startTime === endTime) return new Coordinates(Math.round(start.x), Math.round(start.y));

  const t = (currentTime - startTime) / (endTime - startTime);
  const x = start.x + (end.x - start.x) * t;
  const y = start.y + (end.y - start.y) * t;

  return new Coordinates(Math.round(x), Math.round(y));
}

export const cliIcons = {
  trading: "💰",
  cargo: "📦",

  health: "❤️",
  fuel: "⛽",
  ammo: "🔫",
  shield: "🛡️",
  brokenShield: "🛡",
  dead: "☠️",
  // Stats
  hp: "❤️",
  sp: "🛡️",
  ap: "⚡",
  // spRegen: "🔋",
  recharge: "🔋",
  repair: "🔧",
  // States
  combat: "⚔️",
  mining: "⛏️",
  docked: "🏛️",
  moving: "🚀",
  star: "⭐",
  star2: "🌟",
  crown: "👑",
  win: "🏆",
  lose: "💀",
  enemy: "👾",
  alien: "👽",
  friend: "🤝",
  neutral: "😐",
  //log Statuses
  success: "✅",
  error: "❌",
  warning: "⚠️",
  info: "ℹ️",
  debug: "🐞",
  critical: "🔥",
  green: "🟢",
};
