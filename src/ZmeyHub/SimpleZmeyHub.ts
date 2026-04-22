import crypto from "crypto";
import bs58 from "bs58";
import * as anchor from "@project-serum/anchor";
import { Connection, PublicKey } from "@solana/web3.js";

export interface SimpleZmeyHubConfig {
  rpcUrl: string;
  wsPort: number;
  programId: string;
  idl: anchor.Idl;
  commitment?: "processed" | "confirmed" | "finalized";
}

interface WsClientState {
  rooms: Set<string>;
}

interface SimpleWsConnection {
  data: WsClientState;
  send: (payload: string) => void;
  subscribe: (room: string) => void;
  unsubscribe: (room: string) => void;
}

/**
 * Minimal ZmeyHub example:
 * - listens to program account changes
 * - decodes by account discriminator from IDL
 * - listens to program logs and decodes IDL events
 * - emits messages to websocket rooms
 */
export class SimpleZmeyHub {
  private readonly cfg: SimpleZmeyHubConfig;
  private readonly connection: Connection;
  private readonly programId: PublicKey;
  private readonly coder: anchor.BorshCoder;

  private wsServer: ReturnType<typeof Bun.serve<WsClientState>> | null = null;
  private accountSubIds: number[] = [];
  private logsSubId: number | null = null;

  private readonly knownRooms = new Map<string, number>();

  constructor(cfg: SimpleZmeyHubConfig) {
    this.cfg = cfg;
    this.programId = new PublicKey(cfg.programId);
    this.connection = new Connection(cfg.rpcUrl, cfg.commitment ?? "confirmed");
    this.coder = new anchor.BorshCoder(cfg.idl);
  }

  async start(): Promise<void> {
    this.startWebSocket();
    await this.startAccountListeners();
    await this.startEventListener();

    console.log(`[SimpleZmeyHub] ws://127.0.0.1:${this.cfg.wsPort}`);
    console.log(`[SimpleZmeyHub] listening program ${this.programId.toBase58()}`);
  }

  async stop(): Promise<void> {
    for (const id of this.accountSubIds) {
      await this.connection.removeProgramAccountChangeListener(id);
    }
    this.accountSubIds = [];

    if (this.logsSubId !== null) {
      await this.connection.removeOnLogsListener(this.logsSubId);
      this.logsSubId = null;
    }

    if (this.wsServer) {
      this.wsServer.stop(true);
      this.wsServer = null;
    }
  }

  private startWebSocket(): void {
    this.wsServer = Bun.serve<WsClientState>({
      port: this.cfg.wsPort,
      fetch: (req, server) => {
        const upgraded = server.upgrade(req, { data: { rooms: new Set<string>() } });
        if (upgraded) return undefined;
        return new Response("Use WebSocket", { status: 426 });
      },
      websocket: {
        open: (ws) => {
          this.send(ws, { type: "service", message: "connected" });
        },
        message: (ws, raw) => {
          const text = typeof raw === "string" ? raw : raw.toString();
          this.handleWsCommand(ws, text);
        },
        close: (ws) => {
          for (const room of ws.data.rooms) this.bumpRoom(room, -1);
          ws.data.rooms.clear();
        },
      },
    });
  }

  private handleWsCommand(ws: SimpleWsConnection, raw: string): void {
    let cmd: { type: string; rooms?: string[] };
    try {
      cmd = JSON.parse(raw) as { type: string; rooms?: string[] };
    } catch {
      this.send(ws, { type: "error", message: "bad json" });
      return;
    }

    if (cmd.type === "subscribe" && Array.isArray(cmd.rooms)) {
      for (const room of cmd.rooms) {
        ws.subscribe(room);
        if (!ws.data.rooms.has(room)) {
          ws.data.rooms.add(room);
          this.bumpRoom(room, +1);
        }
      }
      return;
    }

    if (cmd.type === "unsubscribe" && Array.isArray(cmd.rooms)) {
      for (const room of cmd.rooms) {
        ws.unsubscribe(room);
        if (ws.data.rooms.has(room)) {
          ws.data.rooms.delete(room);
          this.bumpRoom(room, -1);
        }
      }
      return;
    }

    if (cmd.type === "ping") {
      this.send(ws, { type: "pong", at: Date.now() });
      return;
    }

    this.send(ws, { type: "error", message: "unknown command" });
  }

  private async startAccountListeners(): Promise<void> {
    const accounts = this.cfg.idl.accounts ?? [];

    for (const acc of accounts) {
      const disc = accountDiscriminator(acc.name);
      const filter = [{ memcmp: { offset: 0, bytes: bs58.encode(Uint8Array.from(disc)) } }];

      const subId = this.connection.onProgramAccountChange(
        this.programId,
        (keyed, ctx) => {
          const decoded = safeDecodeAccount(this.coder, acc.name, keyed.accountInfo.data);
          if (!decoded) return;

          const pubkey = keyed.accountId.toBase58();
          const payload = {
            type: "account",
            accountName: acc.name,
            pubkey,
            slot: ctx.slot,
            data: decoded,
          };

          const entity = acc.name.toLowerCase();

          // Specific account room
          this.publish(`account:${entity}:${pubkey}`, payload);
          // All accounts of same type
          this.publish(`account:${entity}:all`, payload);
          // Fleet shortcuts
          if (entity === "fleet") {
            this.publish(`fleet:${pubkey}`, payload);
            this.publish("fleet:all", payload);
          }
          // Global stream
          this.publish("all", payload);
        },
        {
          commitment: this.cfg.commitment ?? "confirmed",
          filters: filter,
        },
      );

      this.accountSubIds.push(subId);
    }
  }

  private async startEventListener(): Promise<void> {
    this.logsSubId = this.connection.onLogs(
      this.programId,
      (logs, ctx) => {
        for (const line of logs.logs) {
          const decoded = safeDecodeEvent(this.coder, line);
          if (!decoded) continue;

          const payload = {
            type: "event",
            eventName: decoded.name,
            signature: logs.signature,
            slot: ctx.slot,
            data: decoded.data,
          };

          this.publish(`event:${decoded.name.toLowerCase()}`, payload);
          this.publish("event:all", payload);
          this.publish("all", payload);
        }
      },
      this.cfg.commitment ?? "confirmed",
    );
  }

  private publish(room: string, payload: unknown): void {
    if (!this.wsServer) return;
    this.wsServer.publish(room, JSON.stringify(payload));
  }

  private send(ws: SimpleWsConnection, payload: unknown): void {
    ws.send(JSON.stringify(payload));
  }

  private bumpRoom(room: string, delta: number): void {
    const current = this.knownRooms.get(room) || 0;
    const next = current + delta;
    if (next <= 0) {
      this.knownRooms.delete(room);
      return;
    }
    this.knownRooms.set(room, next);
  }
}

function accountDiscriminator(accountName: string): Buffer {
  return crypto.createHash("sha256").update(`account:${accountName}`).digest().subarray(0, 8);
}

function safeDecodeAccount(coder: anchor.BorshCoder, accountName: string, data: Buffer): unknown | null {
  try {
    return coder.accounts.decode(accountName, data);
  } catch {
    return null;
  }
}

function safeDecodeEvent(coder: anchor.BorshCoder, logLine: string): { name: string; data: unknown } | null {
  try {
    const evt = coder.events.decode(logLine);
    if (!evt) return null;
    return { name: evt.name, data: evt.data };
  } catch {
    return null;
  }
}
