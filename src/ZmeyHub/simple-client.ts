type SubscribeCommand = {
  type: "subscribe";
  rooms: string[];
};

type UnsubscribeCommand = {
  type: "unsubscribe";
  rooms: string[];
};

type PingCommand = {
  type: "ping";
};

type ClientCommand = SubscribeCommand | UnsubscribeCommand | PingCommand;

/**
 * Minimal WS client for SimpleZmeyHub.
 *
 * Env:
 * - ZMEY_WS_URL (default: ws://127.0.0.1:8091)
 * - ZMEY_ROOMS (comma-separated, default: fleet:all)
 *
 * Example:
 * ZMEY_ROOMS="fleet:all,event:all" bun run src/ZmeyHub/simple-client.ts
 */
async function main() {
  const wsUrl = process.env["ZMEY_WS_URL"] || "ws://127.0.0.1:8091";
  const rooms = parseRooms(process.env["ZMEY_ROOMS"] || "fleet:all");

  const socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    console.log(`[SimpleZmeyClient] connected -> ${wsUrl}`);
    send(socket, { type: "subscribe", rooms });
    console.log(`[SimpleZmeyClient] subscribed rooms: ${rooms.join(", ")}`);

    // Keep connection alive
    setInterval(() => {
      send(socket, { type: "ping" });
    }, 15_000);
  };

  socket.onmessage = (event) => {
    const text = toText(event.data);
    if (!text) return;

    try {
      const json = JSON.parse(text) as Record<string, unknown>;
      if (json["type"] === "account") {
        console.log(`[ACCOUNT] ${String(json["accountName"])} pubkey=${String(json["pubkey"])} slot=${String(json["slot"])}`);
        return;
      }

      if (json["type"] === "event") {
        console.log(`[EVENT] ${String(json["eventName"])} sig=${String(json["signature"])} slot=${String(json["slot"])}`);
        return;
      }

      if (json["type"] === "service") {
        console.log(`[SERVICE] ${String(json["message"] || "")}`);
        return;
      }

      if (json["type"] === "error") {
        console.error(`[ERROR] ${String(json["message"] || "unknown")}`);
        return;
      }

      console.log(`[MSG] ${text}`);
    } catch {
      console.log(`[RAW] ${text}`);
    }
  };

  socket.onerror = () => {
    console.error("[SimpleZmeyClient] websocket error");
  };

  socket.onclose = (evt) => {
    console.log(`[SimpleZmeyClient] disconnected code=${evt.code} reason=${evt.reason || "-"}`);
    process.exit(0);
  };

  process.on("SIGINT", () => {
    if (socket.readyState === WebSocket.OPEN) {
      send(socket, { type: "unsubscribe", rooms });
      socket.close(1000, "SIGINT");
    } else {
      process.exit(0);
    }
  });
}

function parseRooms(input: string): string[] {
  return input
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

function send(socket: WebSocket, command: ClientCommand): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(command));
}

function toText(value: string | Blob | ArrayBuffer | ArrayBufferView): string {
  if (typeof value === "string") return value;
  if (value instanceof ArrayBuffer) return Buffer.from(value).toString("utf8");
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString("utf8");

  // Blob branch (browser-like runtime). Bun generally gives string/ArrayBuffer.
  // Keep this silent fallback for compatibility.
  return "";
}

void main();
