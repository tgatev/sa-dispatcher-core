# Common GameHandler Documentation

## Overview

`GameHandler` in `src/Common/GameHandler.ts` is the shared abstract base for both runtimes:

- `src/gameHandlers/GameHandler.ts` (main)
- `src/holoHandlers/GameHandler.ts` (holo)

It centralizes:

- Shared game-domain helpers (resources, starbases, token/cargo helpers)
- Fleet account parsing helper: `parseFleetAccountsShared`
- Real-time fleet map pipeline (`gameMap`) with websocket-first strategy and RPC fallback

This keeps runtime-specific handlers focused only on IDL/program differences.

## Main Responsibilities

- Provide abstract contract for chain access (`program`, `connection`, `getFleetAccount`, `getStarbaseAddress`, etc.)
- Maintain `gameMap` (`GameMapStore`) with sector-indexed fleet snapshots
- Start realtime update sources in this order:

1. Bootstrap from all fleet accounts (`listAllFleetAccountsForGameMap`)
2. Try ZmeyHub websocket source
3. Fallback to RPC listener (`fleetAccountListener`) when websocket is unavailable

- Emit dispatcher-facing map events:
- `gameMap:fleet:update`
- `gameMap:sector:x:y`

## Related Components

- `src/Common/GameMapService.ts`
- `GameMapStore`: in-memory map + interpolation
- `ZmeyHubFleetWsSource`: websocket source for fleet updates
- `RpcFleetSource`: `onProgramAccountChange` source
- `src/ZmeyHub/SimpleZmeyHub.ts`
- Publisher that exposes rooms like `fleet:all`

## ZmeyHub Relationship

`GameHandler.initializeGameMap()` uses `ZMEY_WS_URL` (default `ws://127.0.0.1:8091`) and subscribes to `fleet:all`.

Expected flow:

1. Connect to ZmeyHub websocket
2. Receive fleet updates as account messages
3. Normalize and upsert snapshots in `gameMap`
4. If websocket disconnects, switch to RPC source automatically

This gives low-latency shared updates when hub is available, while preserving reliability via fallback.

## Fleet Update Lifecycle

1. `initializeGameMap()` waits for `ready`
2. `bootstrapGameMapFromAllFleets()` fills initial map state
3. `tryStartWsMapSource()` starts websocket source
4. On WS failure/close, `startRpcMapSource()` takes over
5. Updates pass through `upsertFleetIntoGameMap()`:

- Resolve fleet pubkey
- Derive state/faction/movement
- Resolve current sector when needed
- Upsert snapshot into `gameMap`

## Interpolation Model

`GameMapStore` periodically interpolates moving fleets using movement fields:

- `from`
- `to`
- `departureTimeSec`
- `arrivalTimeSec`

Runtime progression uses clamped linear factor:

`$t = clamp((now - departure)/(arrival - departure), 0, 1)$`

and current position:

`$x = x_0 + (x_1 - x_0) * t$`

`$y = y_0 + (y_1 - y_0) * t$`

When `t = 1`, movement is finalized and state transitions to idle snapshot mode.

## Required Runtime-Specific Hook

Concrete handlers must implement:

```ts
protected abstract listAllFleetAccountsForGameMap(): Promise<TFleet[]>;
```

This is the only runtime-specific part required for initial map bootstrap.

## Shared Fleet Parsing Helper

`parseFleetAccountsShared<TFleet, TProgram>()` in `src/Common/GameHandler.ts`:

- Accepts raw account lists (`GetProgramAccountsResponse | KeyedAccountInfo[]`)
- Uses provided decoder function
- Returns keyed map: `{ [fleetPubkey]: fleet }`

Both main and holo handlers can reuse the same parsing flow.

## Environment Variables

- `ZMEY_WS_URL`
- Websocket endpoint for ZmeyHub source
- Default: `ws://127.0.0.1:8091`
- `GAME_MAP_INTERPOLATION_TICK_MS`
- Interpolation tick interval in milliseconds
- Default: `1000`

## Usage Examples

### 1) Build Dispatcher and Use Shared Game Map

```ts
import Dispatcher from "../src/Model/Dispatcher";

async function run() {
  const dispatcher = await Dispatcher.build({ mode: "main", useLookupTables: false });

  const sourceMode = dispatcher.sageGameHandler.getGameMapSourceMode();
  console.log("GameMap source:", sourceMode);

  const fleets = dispatcher.sageGameHandler.gameMap.getFleetsInSector({ x: 13, y: 37 });
  console.log("Fleets in sector:", fleets.length);
}

run().catch(console.error);
```

### 2) Subscribe to Map Events Through Dispatcher

```ts
const onFleetUpdate = (snapshot: any) => {
  console.log("Fleet update:", snapshot.pubkey, snapshot.position, snapshot.state);
};

dispatcher.eventEmitter.on("gameMap:fleet:update", onFleetUpdate);

// optional helper for explicit cleanup
const stopFleetUpdates = () => {
  dispatcher.eventEmitter.off("gameMap:fleet:update", onFleetUpdate);
};

// Example: stop after 30 seconds
setTimeout(() => {
  stopFleetUpdates();
  console.log("Stopped listening to gameMap:fleet:update");
}, 30_000);
```

### 3) Listen for Sector Changes (`gameMap:sector:x:y`)

```ts
const targetSector = { x: 13, y: 37 };
const sectorEvent = `gameMap:sector:${targetSector.x}:${targetSector.y}`;

const onSectorUpdate = (snapshot: any) => {
  console.log("Sector event:", targetSector, "fleet=", snapshot.pubkey, "state=", snapshot.state);
};

dispatcher.eventEmitter.on(sectorEvent, onSectorUpdate);

// cleanup
const stopSectorUpdates = () => {
  dispatcher.eventEmitter.off(sectorEvent, onSectorUpdate);
};
```

### 4) Reinitialize Map with Explicit WS URL

```ts
await dispatcher.sageGameHandler.initializeGameMap({
  wsUrl: "ws://127.0.0.1:8091",
  force: true,
});
```

### 4) Use Shared Fleet Parsing in a Concrete Handler

```ts
static async parseFleetAccounts(accounts, program) {
  return parseFleetAccountsShared(accounts, program, (account, p) => Fleet.decodeData(account, p));
}
```

## Extension Guidelines

- Keep websocket/rpc failover in base `GameHandler`, not in concrete handlers
- Keep concrete handlers focused on decoding and runtime IDL specifics
- If new update sources are needed (for example Kafka/NATS), add them in `GameMapService` and wire once in base `GameHandler`

## Current Integration Points

- `src/Common/GameHandler.ts`
- `src/Common/GameMapService.ts`
- `src/ZmeyHub/SimpleZmeyHub.ts`
- `src/gameHandlers/GameHandler.ts`
- `src/holoHandlers/GameHandler.ts`
- `src/Model/Dispatcher.ts`

## Holosim Test Scripts

To make verification easier, use these scripts under `holo-scripts/test`:

- `holo-scripts/test/startZmeyHub.holo.ts`
- Starts local ZmeyHub publisher for holosim data
- `holo-scripts/test/testGameMapWs.holo.ts`
- Verifies GameMap initialization with websocket source
- `holo-scripts/test/testGameMapRpcOnly.holo.ts`
- Forces websocket failure and verifies RPC fallback

## Run Scenarios (With and Without ZmeyHub)

### A) Without ZmeyHub (expected source = rpc)

Run RPC-only validation (no hub required):

```bash
dotenv -e .h.kop2 -- bun run holo-scripts/test/testGameMapRpcOnly.holo.ts
```

Expected output includes:

- websocket forced unavailable
- `source mode: rpc`
- sector event logs for selected sector (if activity exists)

### B) With ZmeyHub (expected source = ws)

1. Start ZmeyHub in terminal #1:

```bash
dotenv -e .h.kop2 -- bun run holo-scripts/test/startZmeyHub.holo.ts
```

2. Run websocket validation in terminal #2:

```bash
dotenv -e .h.kop2 -- bun run holo-scripts/test/testGameMapWs.holo.ts
```

Expected output includes:

- `source mode: ws`
- fleet update events count growth
- sector event logs for selected sector (if activity exists)

## Minimal Operational Checklist

- Ensure `ATLASNET_RPC_URL` is set in your env file
- For websocket mode, ensure `SAGE_PROGRAM_ID` is set and hub is running
- Use `force: true` when reinitializing map to switch source mode intentionally
