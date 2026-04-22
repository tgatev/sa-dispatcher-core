import { EventEmitter } from "events";
import type { FleetAccountListener } from "./FleetAccountListener";
import { SectorMap, type Coordinates, type Faction } from "./SectorMap";

export type FleetMovementKind = "MoveSubwarp" | "MoveWarp";

export interface FleetMovementState {
  kind: FleetMovementKind;
  from: Coordinates;
  to: Coordinates;
  departureTimeSec: number;
  arrivalTimeSec: number;
}

export interface FleetSnapshot {
  pubkey: string;
  position: Coordinates;
  faction: Faction | string;
  state: string;
  movement?: FleetMovementState;
  fleetName?: string;
  raw?: unknown;
  source?: "ws" | "rpc" | "bootstrap";
  updatedAtMs?: number;
  /** Set by tickInterpolation when a moving fleet reaches its destination (t>=1). Used to expire stale finalized entries. */
  finalizedAtMs?: number;
}

export interface GameMapOptions {
  interpolationTickMs?: number;
}

export interface GameMapFleetUpdateEvent {
  current: FleetSnapshot;
  previous?: FleetSnapshot;
}

/**
 * In-memory game map with a sector index and periodic interpolation for moving fleets.
 */
export class GameMapStore extends EventEmitter {
  readonly sectorMap: SectorMap;
  readonly fleets: Map<string, FleetSnapshot> = new Map();

  private readonly interpolationTickMs: number;
  private interpolationInterval: Timer | undefined;

  constructor(options: GameMapOptions = {}) {
    super();
    this.sectorMap = new SectorMap([]);
    this.interpolationTickMs = Math.max(1000, Number(options.interpolationTickMs ?? 1000));
  }

  startInterpolation(): void {
    if (this.interpolationInterval) return;
    this.interpolationInterval = setInterval(() => {
      this.tickInterpolation(Date.now());
    }, this.interpolationTickMs);
  }

  stopInterpolation(): void {
    if (!this.interpolationInterval) return;
    clearInterval(this.interpolationInterval);
    this.interpolationInterval = undefined;
  }

  clear(): void {
    this.fleets.clear();
    this.sectorMap.sectors.clear();
  }

  upsertFleet(snapshot: FleetSnapshot): FleetSnapshot {
    const now = Date.now();
    const previous = this.fleets.get(snapshot.pubkey);
    const merged: FleetSnapshot = {
      pubkey: snapshot.pubkey,
      position: {
        x: Math.round(snapshot.position.x),
        y: Math.round(snapshot.position.y),
      },
      faction: snapshot.faction,
      state: snapshot.state,
      updatedAtMs: now,
    };

    if (snapshot.movement !== undefined) merged.movement = snapshot.movement;
    if (snapshot.fleetName !== undefined) merged.fleetName = snapshot.fleetName;
    if (snapshot.raw !== undefined) merged.raw = snapshot.raw;
    if (snapshot.source !== undefined) merged.source = snapshot.source;
    if (snapshot.finalizedAtMs !== undefined) merged.finalizedAtMs = snapshot.finalizedAtMs;

    this.fleets.set(merged.pubkey, merged);
    this.sectorMap.upsertObject({
      id: merged.pubkey,
      type: "fleet",
      faction: merged.faction,
      position: merged.position,
      state: merged.state,
      decoded: merged.raw,
    });

    this.emit("fleet:update", {
      current: merged,
      previous,
    } as GameMapFleetUpdateEvent);

    this.emit(`fleet:${merged.pubkey}`, merged);
    this.emit(`sector:${merged.position.x}:${merged.position.y}`, merged);

    return merged;
  }

  getFleet(pubkey: string): FleetSnapshot | undefined {
    return this.fleets.get(pubkey);
  }

  getFleetsInSector(coord: Coordinates, _options?: { freshnessTtlMs?: number }): FleetSnapshot[] {
    const now = Date.now();
    const nowSec = now / 1000;
    const targetX = Math.round(coord.x);
    const targetY = Math.round(coord.y);

    // Pass 1: sectorMap fast-path (already-indexed rounded positions)
    const result = new Map<string, FleetSnapshot>();
    for (const obj of this.sectorMap.getObjectsInSector(coord)) {
      if (obj.type !== "fleet") continue;
      const fleet = this.fleets.get(obj.id);
      if (!fleet) continue;
      result.set(fleet.pubkey, fleet);
    }

    // Pass 2: real-time interpolation for moving fleets not yet in result
    // Catches SubWarp pass-through fleets between interpolation ticks
    for (const fleet of this.fleets.values()) {
      if (result.has(fleet.pubkey)) continue;
      const movement = fleet.movement;
      if (!movement) continue;

      const travelTotalSec = Math.max(1e-6, movement.arrivalTimeSec - movement.departureTimeSec);
      const elapsedSec = nowSec - movement.departureTimeSec;
      const t = Math.max(0, Math.min(1, elapsedSec / travelTotalSec));

      const x = Math.round(movement.from.x + (movement.to.x - movement.from.x) * t);
      const y = Math.round(movement.from.y + (movement.to.y - movement.from.y) * t);

      if (x !== targetX || y !== targetY) continue;

      result.set(fleet.pubkey, { ...fleet, position: { x, y } });
    }

    return Array.from(result.values());
  }

  getFleetSnapshot(pubkey: string, options?: { freshnessTtlMs?: number }): FleetSnapshot | undefined {
    const snapshot = this.fleets.get(pubkey);
    if (!snapshot || !options?.freshnessTtlMs) return snapshot;

    const now = Date.now();
    if (snapshot.source === "ws") return snapshot; // WS trusted always
    const age = now - (snapshot.updatedAtMs || 0);
    return age <= options.freshnessTtlMs ? snapshot : undefined;
  }

  getStaleFleetSnapshots(coord: Coordinates, freshnessTtlMs: number = 30000): FleetSnapshot[] {
    const now = Date.now();
    return this.sectorMap
      .getObjectsInSector(coord)
      .filter((obj) => obj.type === "fleet")
      .map((obj) => this.fleets.get(obj.id))
      .filter((v): v is FleetSnapshot => {
        if (!v || v.source === "ws") return false;
        const age = now - (v.updatedAtMs || 0);
        return age > freshnessTtlMs;
      });
  }

  private tickInterpolation(nowMs: number): void {
    const nowSec = nowMs / 1000;

    for (const fleet of this.fleets.values()) {
      const movement = fleet.movement;
      if (!movement) continue;

      const travelTotalSec = Math.max(1e-6, movement.arrivalTimeSec - movement.departureTimeSec);
      const elapsedSec = nowSec - movement.departureTimeSec;
      const t = Math.max(0, Math.min(1, elapsedSec / travelTotalSec));

      const x = movement.from.x + (movement.to.x - movement.from.x) * t;
      const y = movement.from.y + (movement.to.y - movement.from.y) * t;

      const shouldFinalize = t >= 1;
      const nextPosition = shouldFinalize
        ? {
            x: Math.round(movement.to.x),
            y: Math.round(movement.to.y),
          }
        : {
            x: Math.round(x),
            y: Math.round(y),
          };

      const prevX = Math.round(fleet.position.x);
      const prevY = Math.round(fleet.position.y);
      const positionChanged = nextPosition.x !== prevX || nextPosition.y !== prevY;

      // Skip noisy interpolation updates when rounded position did not change.
      // If movement has completed in-place, finalize silently without emitting events.
      if (!positionChanged) {
        if (shouldFinalize) {
          const finalized: FleetSnapshot = {
            ...fleet,
            position: nextPosition,
            movement: undefined,
            state: "NONE",
            finalizedAtMs: Date.now(),
            updatedAtMs: Date.now(),
          };
          this.fleets.set(finalized.pubkey, finalized);
        }
        continue;
      }

      this.upsertFleet({
        ...fleet,
        position: nextPosition,
        movement: shouldFinalize ? undefined : movement,
        state: shouldFinalize ? "NONE" : fleet.state,
        finalizedAtMs: shouldFinalize ? Date.now() : undefined,
      });
    }
  }
}

export interface FleetUpdateSource {
  readonly type: "ws" | "rpc";
  start(): Promise<void>;
  stop(): Promise<void>;
  onFleetUpdate(cb: (u: { pubkey: string; fleet: unknown; source: "ws" | "rpc" }) => void): () => void;
  onError(cb: (err: unknown) => void): () => void;
}

export interface ZmeyHubFleetWsSourceOptions {
  wsUrl: string;
  rooms?: string[];
  connectTimeoutMs?: number;
}

/**
 * Consumes fleet updates from SimpleZmeyHub websocket rooms.
 */
export class ZmeyHubFleetWsSource extends EventEmitter implements FleetUpdateSource {
  readonly type = "ws" as const;

  private readonly wsUrl: string;
  private readonly rooms: string[];
  private readonly connectTimeoutMs: number;

  private socket: WebSocket | undefined;

  constructor(options: ZmeyHubFleetWsSourceOptions) {
    super();
    this.wsUrl = options.wsUrl;
    this.rooms = options.rooms?.length ? options.rooms : ["fleet:all"];
    this.connectTimeoutMs = Math.max(500, Number(options.connectTimeoutMs ?? 2500));
  }

  async start(): Promise<void> {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      let done = false;
      const socket = new WebSocket(this.wsUrl);
      this.socket = socket;

      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        try {
          socket.close();
        } catch {
          // ignore close errors while timing out a connect attempt
        }
        reject(new Error(`ZmeyHub websocket connect timeout (${this.connectTimeoutMs} ms)`));
      }, this.connectTimeoutMs);

      socket.onopen = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.send({ type: "subscribe", rooms: this.rooms });
        resolve();
      };

      socket.onerror = (err) => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          reject(err);
          return;
        }
        this.emit("error", err);
      };

      socket.onclose = () => {
        this.emit("close");
      };

      socket.onmessage = (evt) => {
        const text = toText(evt.data);
        if (!text) return;

        let json: any;
        try {
          json = JSON.parse(text);
        } catch {
          return;
        }

        if (json?.type !== "account") return;
        if (String(json.accountName || "").toLowerCase() !== "fleet") return;
        if (!json.pubkey) return;

        this.emit("fleet", {
          pubkey: String(json.pubkey),
          fleet: json.data,
          source: "ws",
        });
      };
    });
  }

  async stop(): Promise<void> {
    if (!this.socket) return;
    try {
      if (this.socket.readyState === WebSocket.OPEN) {
        this.send({ type: "unsubscribe", rooms: this.rooms });
      }
      this.socket.close();
    } finally {
      this.socket = undefined;
    }
  }

  onFleetUpdate(cb: (u: { pubkey: string; fleet: unknown; source: "ws" | "rpc" }) => void): () => void {
    const handler = (u: { pubkey: string; fleet: unknown; source: "ws" | "rpc" }) => cb(u);
    this.on("fleet", handler);
    return () => this.off("fleet", handler);
  }

  onError(cb: (err: unknown) => void): () => void {
    const handler = (err: unknown) => cb(err);
    this.on("error", handler);
    return () => this.off("error", handler);
  }

  private send(payload: unknown): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(payload));
  }
}

export interface RpcFleetSourceOptions<TFleet, TProgram> {
  listener: FleetAccountListener<TFleet, TProgram>;
}

/**
 * Consumes fleet updates via onProgramAccountChange callback flow.
 */
export class RpcFleetSource<TFleet, TProgram> extends EventEmitter implements FleetUpdateSource {
  readonly type = "rpc" as const;
  private readonly listener: FleetAccountListener<TFleet, TProgram>;
  private callbackId: number | undefined;

  constructor(options: RpcFleetSourceOptions<TFleet, TProgram>) {
    super();
    this.listener = options.listener;
  }

  async start(): Promise<void> {
    if (this.callbackId !== undefined) return;
    this.callbackId = this.listener.subscribe(async (fleets: TFleet[]) => {
      for (const fleet of fleets) {
        const pubkey = resolveFleetPubkey(fleet);
        if (!pubkey) continue;
        this.emit("fleet", {
          pubkey,
          fleet,
          source: "rpc",
        });
      }
    });
    this.listener.listen();
  }

  async stop(): Promise<void> {
    if (this.callbackId === undefined) return;
    this.listener.unsubscribe(this.callbackId);
    this.callbackId = undefined;
  }

  onFleetUpdate(cb: (u: { pubkey: string; fleet: unknown; source: "ws" | "rpc" }) => void): () => void {
    const handler = (u: { pubkey: string; fleet: unknown; source: "ws" | "rpc" }) => cb(u);
    this.on("fleet", handler);
    return () => this.off("fleet", handler);
  }

  onError(cb: (err: unknown) => void): () => void {
    const handler = (err: unknown) => cb(err);
    this.on("error", handler);
    return () => this.off("error", handler);
  }
}

export function resolveFleetPubkey(fleet: any): string | undefined {
  const key = fleet?.key;
  if (typeof key === "string") return key;
  if (key && typeof key.toBase58 === "function") return key.toBase58();
  return undefined;
}

function toText(value: string | Blob | ArrayBuffer | ArrayBufferView): string {
  if (typeof value === "string") return value;
  if (value instanceof ArrayBuffer) return Buffer.from(value).toString("utf8");
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString("utf8");
  return "";
}
