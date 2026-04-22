komandi s sector filter:

WS mode (sus ZmeyHub)
dotenv -e .h.kop2 -- GMAP_SECTOR_X=13 GMAP_SECTOR_Y=37 bun run holo-scripts/test/testGameMapWs.holo.ts
RPC-only mode (bez ZmeyHub)
dotenv -e .h.kop2 -- GMAP_SECTOR_X=13 GMAP_SECTOR_Y=37 bun run holo-scripts/test/testGameMapRpcOnly.holo.ts
Hub start (otdelen terminal)
dotenv -e .h.kop2 -- bun run holo-scripts/test/startZmeyHub.holo.ts
