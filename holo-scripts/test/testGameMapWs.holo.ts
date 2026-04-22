import { DispatcherHolosim } from "../../src/holoHandlers/HolosimMintsImporter";

async function run() {
  const wsUrl = process.env["ZMEY_WS_URL"] || "ws://127.0.0.1:8091";
  const watchMs = Number(process.env["GMAP_WATCH_MS"] || 30000);
  const sectorX = Number(process.env["GMAP_SECTOR_X"] || 13);
  const sectorY = Number(process.env["GMAP_SECTOR_Y"] || 37);
  const sectorEvent = `gameMap:sector:${sectorX}:${sectorY}`;

  const dispatcher = await DispatcherHolosim.build({ useLookupTables: false });

  await dispatcher.sageGameHandler.initializeGameMap({ wsUrl, force: true });
  const sourceMode = dispatcher.sageGameHandler.getGameMapSourceMode();

  console.log("[GameMap][WS-Test] source mode:", sourceMode);
  console.log("[GameMap][WS-Test] initial fleet cache size:", dispatcher.sageGameHandler.gameMap.fleets.size);
  // For Test May not need too much logs, but for debugging can be useful to see some updates
  let updates = 0;
  let sectorUpdates = 0;
  const onFleetUpdate = (snapshot: any) => {
    updates += 1;
    if (updates <= 5 || updates % 25 === 0) {
      console.log("[GameMap][WS-Test] update", updates, snapshot.pubkey, snapshot.state, snapshot.position);
    }
  };

  const onSectorUpdate = (snapshot: any) => {
    sectorUpdates += 1;
    if (sectorUpdates <= 5 || sectorUpdates % 20 === 0) {
      console.log("[GameMap][WS-Test][Sector]", sectorEvent, sectorUpdates, snapshot.pubkey, snapshot.state, snapshot.position);
    }
  };

  dispatcher.eventEmitter.on("gameMap:fleet:update", onFleetUpdate);
  dispatcher.eventEmitter.on(sectorEvent, onSectorUpdate);

  console.log(`[GameMap][WS-Test] listening for ${watchMs} ms ...`);
  await new Promise((resolve) => setTimeout(resolve, watchMs));

  dispatcher.eventEmitter.off("gameMap:fleet:update", onFleetUpdate);
  dispatcher.eventEmitter.off(sectorEvent, onSectorUpdate);

  console.log("[GameMap][WS-Test] done");
  console.log("[GameMap][WS-Test] final source mode:", dispatcher.sageGameHandler.getGameMapSourceMode());
  console.log("[GameMap][WS-Test] total updates:", updates);
  console.log("[GameMap][WS-Test] total sector updates:", sectorUpdates, "for", sectorEvent);
}

run().catch((err) => {
  console.error("[GameMap][WS-Test] failed", err);
  process.exit(1);
});
