import { Fleet } from "@staratlas/sage-main";
import { byteArrayToString } from "../../src/Common/GameHandler";
import { log } from "../../src/Common/PatchConsoleLog";
import { DispatcherHolosim, SageFleetHandler, SageGameHandler } from "../../src/holoHandlers/HolosimMintsImporter";
import { PublicKey } from "@solana/web3.js";
const fk = new PublicKey("CXqiBxPPd7r2RaPUrJmmqGG369B1ZpVzLi1Yc9L3vnPi");
async function run() {
  const watchMs = Number(process.env["GMAP_WATCH_MS"] || 200000);
  const forcedInvalidWs = process.env["ZMEY_WS_URL_INVALID"] || "ws://127.0.0.1:65535";
  const sectorX = Number(process.env["GMAP_SECTOR_X"] || 25);
  const sectorY = Number(process.env["GMAP_SECTOR_Y"] || 4);
  const sectorEvent = `gameMap:sector:${sectorX}:${sectorY}`;

  const dispatcher = await DispatcherHolosim.build({ useLookupTables: false });
  const sourceMode = dispatcher.sageGameHandler.getGameMapSourceMode();
  console.log("[GameMap][RPC-Test] source mode:", sourceMode);

  log("[GameMap][RPC-Test] Starting test with forced invalid WS URL:", forcedInvalidWs);
  console.time("initializeGameMap");
  await (dispatcher.sageGameHandler as SageGameHandler).initializeGameMap({
    wsUrl: forcedInvalidWs,
    force: true,
  });
  console.timeEnd("initializeGameMap");
  let gh = dispatcher.sageGameHandler as SageGameHandler;
  let fh = dispatcher.sageFleetHandler as SageFleetHandler;
  // const listener = (gh.asStatic().fleetAccountListener as any) || null;
  // const activeConn = (gh as any).connection;
  // const activeWsEndpoint = activeConn?._rpcWebSocket?._url || activeConn?._rpcWebSocket?.url;
  // const listenerWsEndpoint = listener?.connection?._rpcWebSocket?._url || listener?.connection?._rpcWebSocket?.url;
  // console.log("[GameMap][RPC-Test] game handler RPC endpoint:", activeConn?.rpcEndpoint, "WS:", activeWsEndpoint);
  // console.log("[GameMap][RPC-Test] listener RPC endpoint:", listener?.connection?.rpcEndpoint, "WS:", listenerWsEndpoint);

  let updates = 0;
  let sectorUpdates = 0;
  const onFleetUpdate = (snapshot: any) => {
    updates += 1;
    if (snapshot.pubkey == fk.toBase58()) {
      log("[!!!!!!][RPC-Test][TEST-FLEET]", snapshot.state, snapshot.position, snapshot.movement, "source:", snapshot.source);
      // if (snapshot.source != "bootstrap") throw "FLEET UPDATE SIGNAL";
    }

    if (updates % 10000 === 0) console.log("[GameMap][RPC-Test][Fleet]", updates, snapshot.pubkey, snapshot.state, snapshot.position, snapshot.movement);
  };

  const onSectorUpdate = (snapshot: any) => {
    sectorUpdates += 1;
    if (sectorUpdates % 10000 === 0) console.log("[GameMap][RPC-Test][Sector]", sectorEvent, sectorUpdates, snapshot.pubkey, snapshot.state, snapshot.position);
    // log(snapshot);
  };

  dispatcher.eventEmitter.on("gameMap:fleet:update", onFleetUpdate);
  dispatcher.eventEmitter.on(sectorEvent, onSectorUpdate);
  let tmpUpdates = { sector: sectorUpdates, fleets: updates };

  while (true) {
    console.log("[GameMap][RPC-Test] initial fleet cache size:", dispatcher.sageGameHandler.gameMap.fleets.size);
    console.log(`[GameMap][RPC-Test] Listen for fleets in sector - test fleet interpolation and RPC fallback...`);
    const fleets = (await gh.gameMap.getFleetsInSector({ x: sectorX, y: sectorY })) || [];
    let testFleetAccount = await fh.getFleetAccount(fk);
    log("[GameMap][RPC-Test] testFleetAccount", testFleetAccount.state, (await fh.getCurrentSector(testFleetAccount)).toSectorKey());
    let res = await Promise.all([
      ...fleets.map(async (f: any) => {
        let fa = f.raw as Fleet;
        const rawLabel = f?.raw?.data?.fleetLabel;
        let location = await fh.getCurrentSector(fa as any);
        return {
          pubkey: f?.pubkey,
          state: String(f?.state || "unknown"),
          pos: `${Number(f?.position?.x)},${Number(f?.position?.y)}`,
          loc: location ? location.toSectorKey() : "unknown",
          source: f?.source,
          name: rawLabel ? byteArrayToString(rawLabel) : "",
        };
      }),
    ]);

    console.table(res);
    console.log(`[GameMap][RPC-Test] Fleets in sector ${sectorX}:${sectorY}:`, fleets.length);
    console.log("5 Sec .... ", "updates since last check:", updates - tmpUpdates.fleets, "sector updates since last check:", sectorUpdates - tmpUpdates.sector);
    tmpUpdates = { sector: sectorUpdates, fleets: updates };

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  console.log(`[GameMap][RPC-Test] listening for ${watchMs} ms ...`);
  await new Promise((resolve) => setTimeout(resolve, watchMs));

  dispatcher.eventEmitter.off("gameMap:fleet:update", onFleetUpdate);
  dispatcher.eventEmitter.off(sectorEvent, onSectorUpdate);

  console.log("[GameMap][RPC-Test] done");
  console.log("[GameMap][RPC-Test] final source mode:", dispatcher.sageGameHandler.getGameMapSourceMode());
  console.log("[GameMap][RPC-Test] total updates:", updates);
  console.log("[GameMap][RPC-Test] total sector updates:", sectorUpdates, "for", sectorEvent);
}

run().catch((err) => {
  console.error("[GameMap][RPC-Test] failed", err);
  process.exit(1);
});
