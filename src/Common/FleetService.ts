import { EventEmitter } from "events";
import { Connection, PublicKey, AccountInfo, KeyedAccountInfo } from "@solana/web3.js";
import * as anchor from "@project-serum/anchor";
import { Idl } from "@project-serum/anchor";
import bs58 from "bs58";
import crypto from "crypto";
import { SectorMap, Coordinates as SectorCoordinates, MapObject as SectorMapObject } from "../Common/SectorMap";

/**
 * FleetService - program-wide watcher using IDL discriminator memcmp filter,
 * keeps a SectorMap (discrete integer sectors), supports querying fleets by sector,
 * rounding world coords -> nearest sector center and simple moving-fleet interpolation.
 */
export type FleetDecoded = any;

export interface FleetServiceOptions {
  connection: Connection;
  programId: PublicKey;
  idl: Idl;
  fleetAccountName?: string; // default 'fleet'
  anchorProvider?: anchor.AnchorProvider;
  dataSize?: number; // optional expected account data size to add to filters
}

export class FleetService extends EventEmitter {
  connection: Connection;
  programId: PublicKey;
  idl: Idl;
  anchorProgram: anchor.Program;
  fleetAccountName: string;
  sectorMap: SectorMap;
  private programSubId?: number;
  private provider: anchor.AnchorProvider;
  private opts: FleetServiceOptions;

  constructor(opts: FleetServiceOptions) {
    super();
    this.opts = opts;
    this.connection = opts.connection;
    this.programId = opts.programId;
    this.idl = opts.idl;
    this.fleetAccountName = (opts.fleetAccountName || "fleet").toLowerCase();
    this.provider =
      opts.anchorProvider ?? new anchor.AnchorProvider(this.connection, anchor.Wallet.local(), anchor.AnchorProvider.defaultOptions());
    this.anchorProgram = new anchor.Program(this.idl, this.programId, this.provider);

    this.sectorMap = new SectorMap([]); // start empty
  }

  // compute Anchor account discriminator (first 8 bytes of sha256("account:"+name))
  private accountDiscriminator(name: string): Buffer {
    return crypto
      .createHash("sha256")
      .update("account:" + name)
      .digest()
      .slice(0, 8);
  }

  // build onProgramAccountChange filters using discriminator (and optional dataSize)
  private buildFilters(): any[] {
    const disc = this.accountDiscriminator(this.fleetAccountName);
    const memcmp = { memcmp: { offset: 0, bytes: bs58.encode(Uint8Array.from(disc)) } };
    const filters: any[] = [memcmp];
    if (this.opts.dataSize && Number.isInteger(this.opts.dataSize)) {
      filters.push({ dataSize: this.opts.dataSize });
    }
    return filters;
  }

  // Start program-wide subscription using memcmp filters to reduce callbacks
  start() {
    if (this.programSubId) return;
    const filters = this.buildFilters();
    this.programSubId = this.connection.onProgramAccountChange(
      this.programId,
      async (keyedAcc, ctx) => {
        try {
          const pubkey = (keyedAcc as any).pubkey ? new PublicKey((keyedAcc as any).pubkey) : new PublicKey((keyedAcc as any).accountId);
          const account: AccountInfo<Buffer> = (keyedAcc as any).account ?? (keyedAcc as any).accountInfo;
          if (!account) return;
          const raw = account.data as Buffer;

          // try decode using IDL account name variations
          let decoded: any = null;
          const candidates = [this.fleetAccountName, this.fleetAccountName[0].toUpperCase() + this.fleetAccountName.slice(1)];
          for (const name of candidates) {
            try {
              decoded = this.anchorProgram?.coder.accounts.decode(name, raw);
              if (decoded) break;
            } catch (e) {
              // ignore decode error for this candidate
            }
          }

          // compute sector position (rounding to nearest integer sector)
          const pos = this.extractPositionFromDecoded(decoded);
          const mapObj: SectorMapObject = {
            id: pubkey.toBase58(),
            type: "fleet",
            faction: decoded?.faction?.toString?.() || "neutral",
            position: pos,
            state: decoded?.state?.toString?.() || "idle",
            raw: raw,
            decoded,
          };

          // upsert into sector map and emit events
          this.upsertMapObject(mapObj, ctx.slot);
        } catch (err) {
          this.emit("error", err);
        }
      },
      "confirmed",
      filters,
    );
  }

  stop() {
    if (!this.programSubId) return;
    this.connection.removeProgramAccountChangeListener(this.programSubId);
    this.programSubId = undefined;
  }

  // extract position rounding to nearest integer sector center
  private extractPositionFromDecoded(decoded: any): SectorCoordinates {
    let sx = 0,
      sy = 0;
    try {
      if (!decoded) return { x: 0, y: 0 };
      if (decoded.sector && Array.isArray(decoded.sector)) {
        sx = Number(decoded.sector[0]);
        sy = Number(decoded.sector[1]);
      } else if (decoded.location && decoded.location.x !== undefined) {
        sx = Number(decoded.location.x);
        sy = Number(decoded.location.y);
      } else if (decoded.position && Array.isArray(decoded.position)) {
        sx = Number(decoded.position[0]);
        sy = Number(decoded.position[1]);
      } else if (decoded.worldPosition && Array.isArray(decoded.worldPosition)) {
        // convert world coords to discrete sectors by rounding to nearest integer
        sx = Math.round(Number(decoded.worldPosition[0]));
        sy = Math.round(Number(decoded.worldPosition[1]));
      }
    } catch (e) {
      sx = 0;
      sy = 0;
    }
    // rounding ensures nearest sector center
    return { x: Math.round(sx), y: Math.round(sy) };
  }

  // insert/update map object
  private upsertMapObject(obj: SectorMapObject, slot?: number) {
    this.sectorMap.upsertObject(obj);
    this.emit("fleetUpdate", obj);
    this.emit(`fleet:${obj.id}`, obj);
  }

  // public: query fleets in a sector (by coordinates)
  getFleetsInSector(coord: SectorCoordinates | [number, number]) {
    const c = Array.isArray(coord)
      ? { x: Math.round(coord[0]), y: Math.round(coord[1]) }
      : { x: Math.round(coord.x), y: Math.round(coord.y) };
    return this.sectorMap.getObjectsInSector(c).filter((o) => o.type === "fleet");
  }

  // helper: compute moving fleet current position by linear interpolation
  // totalMs = total travel time in milliseconds, elapsedMs = elapsed time
  static movingFleetPosition(start: [number, number], end: [number, number], totalMs: number, elapsedMs: number) {
    const t = Math.max(0, Math.min(1, elapsedMs / totalMs));
    const x = start[0] + (end[0] - start[0]) * t;
    const y = start[1] + (end[1] - start[1]) * t;
    return { x, y, sector: { x: Math.round(x), y: Math.round(y) }, progress: t };
  }

  // Example generator for given real data (returns current interpolated position)
  static exampleMovingFleet() {
    const start: [number, number] = [-15, -30];
    const end: [number, number] = [40, 30];
    const totalMs = 90 * 60 * 1000; // 1h30m
    const elapsedMs = 53 * 60 * 1000; // 53m
    return FleetService.movingFleetPosition(start, end, totalMs, elapsedMs);
  }
}
/**
 *      Example usage:
 *  
import { Connection, PublicKey } from "@solana/web3.js";
import { FleetService } from "../src/holoHandlers/FleetService";
import { idl as HOLO_IDL } from "../src/holoHandlers/IDL/sage-holo";

const RPC = "https://rpc.ironforge.network/devnet?apiKey=01JEB7YQ0YPK31WQTC0VQ5Y9YP";
const conn = new Connection(RPC, "confirmed");
const PROGRAM_ID = new PublicKey("SAgEeT8u14TE69JXtanGSgNkEdoPUcLabeyZD2uw8x9"); // SAGE / HOLOSIM Program ID
const FLEET_PK = new PublicKey("BEymPEQEUUYeQUbriJStfaeWMKeu56Bii3s6sgyHzVoa"); // example fleet public key to subscribe (replace with actual from your scenario or use getFleet method)

(async () => {
  const svc = new FleetService({ connection: conn, programId: PROGRAM_ID, idl: HOLO_IDL });
  svc.onFleetUpdate((m) => console.log("fleetUpdate:", m.id, m.position.x, m.position.y, m.state));
  svc.onFleet(FLEET_PK, (m) => console.log("specific fleet", m.id, m));
  svc.listen();
})();
*/
