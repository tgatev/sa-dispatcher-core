import { log } from "../../src/Common/PatchConsoleLog";
import { argv } from "../../src/gameHandlers/GameHandler";
import { prompt } from "../../src/Common/prompt";
import { ProcessHolosim as Process, SageGameHandler, ShipStats, Fleet } from "../../src/holoHandlers/HolosimMintsImporter";
import { RespawnToLoadingBayAction } from "../../src/Model/RespawnToLoadingBayAction";

let pro = await Process.build();
const dispatcher = pro.dispatcher;

console.log(argv);

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

async function run() {
  console.time("init_dispatcher");
  console.timeEnd("init_dispatcher");
  console.time("Full execution tme");

  while (true) {
    console.time("Fetch RAW loot details");
    let fa = (await pro.fetchFleetAccount()) as unknown as Fleet;
    let location = await pro.getCurrentSector(fa as any);

    // await prompt(`Prepare for loot on sector [${location.x},${location.y}] with ${loots.length} loot items. Press enter to continue...`);
    // console.log("Loots in sector : ... LOADING ... ");

    let Loots = await (dispatcher.sageGameHandler as unknown as SageGameHandler).listRetrievableLoot(location.x, location.y, 200);
    log("Loots in sector [limit=200]", location.toSectorKey(), Loots.retrievableByAnyone.length, Loots.retrievableByOwner.length);
    // pro = await buildLootRetrieveHealerActions(pro, 0 );
    // await pro.repeat(1);
    let cds = await dispatcher.sageFleetHandler.getCooldown(fa as any);
    log("Fleet State", { state: fa.state, cds });
    if (fa.state.Respawn) {
      let now = Date.now() / 1000;
      let before = fa.state.Respawn.start - now;
      let respawnTime = (fa.data.stats as ShipStats).miscStats.placeholder / 1000 || (fa.data.stats as ShipStats).miscStats.respawnTime / 100;
      log("Stats:", fa.data.stats);
      log("Cooldowns", cds);
      log({ respawnTime, before, sum: respawnTime + before });
      await prompt("Handle Respawn to loading bay action? Press enter to continue...");
      await new RespawnToLoadingBayAction(pro)
        .run()
        .catch((err) => {
          log("Error during respawn to loading bay action", err);
        })
        .finally(() => {
          log(" ====== Respawn to loading bay action CALLED.  ======= ");
        });
    }
    await prompt("Press enter to continue...");
  }
  throw "DONE";
}
