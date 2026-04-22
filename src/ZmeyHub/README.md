# Simple ZmeyHub (minimal)

Minimal websocket-only hub that:

- listens to Program Account Changes
- decodes accounts by IDL discriminator
- listens to on-chain logs and decodes IDL events
- routes messages to chat rooms

## Run

Set env:

- `RPC_URL`
- `SAGE_PROGRAM_ID`

Then run:

```bash
bun run src/ZmeyHub/simple-example.ts
```

Run simple client (fleet only by default):

```bash
bun run src/ZmeyHub/simple-client.ts
```

Run client with custom rooms:

```bash
ZMEY_ROOMS="fleet:all,event:all,account:starbaseplayer:all" bun run src/ZmeyHub/simple-client.ts
```

## WebSocket rooms

### Fleet only

- `fleet:all`
- `fleet:<fleetPubkey>`

### Any account type from IDL

- `account:<accountNameLower>:all`
- `account:<accountNameLower>:<pubkey>`

Examples:

- `account:starbaseplayer:all`
- `account:surveydatatracker:all`

### Events (from IDL logs)

- `event:all`
- `event:<eventNameLower>`

### Global

- `all`

## WS client commands

Subscribe:

```json
{ "type": "subscribe", "rooms": ["fleet:all"] }
```

Unsubscribe:

```json
{ "type": "unsubscribe", "rooms": ["fleet:all"] }
```

Ping:

```json
{ "type": "ping" }
```
