import { log } from "../../src/Common/PatchConsoleLog";
import { argv } from "../../src/gameHandlers/GameHandler";
import { ProcessHolosim as Process, SageGameHandler } from "../../src/holoHandlers/HolosimMintsImporter";
import { TransferCargoAction } from "../../src/Model/TransferCargoAction";
import { UnDockAction } from "../../src/Model/UndockAction";
import { RepairIdleFLeetAction } from "../../src/Model/RepairIdleFLeetAction";
import { Resource } from "../../src/holoHandlers/lib";
let pro = await Process.build();
const dispatcher = pro.dispatcher;
// const dispatcher = await Dispatcher.build();

console.log(argv);

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

async function run() {
  console.time("init_dispatcher");
  console.timeEnd("init_dispatcher");
  console.time("Full execution tme");
  // dispatcher.sageFleetHandler.getFleetAccount()

  // let all = await dispatcher.sageGameHandler.program.account["fleet"].all();
  // const Unit8toString = (data: Uint8Array) => {
  //   return Buffer.from(data).toString().replace(/\0/g, "");
  // };
  // let npc = all.filter((f: any) => {
  //   //@ts-ignore
  //   let name = Unit8toString(f.account.fleetLabel);
  //   return name.includes("GUARDIAN OF THE GALAXY");
  // });

  // log("NPC Fleet", npc[0]?.account);
  // @ts-ignore

  // let fleetAccount = await dispatcher.sageFleetHandler.getFleetAccount(npc[0]?.publicKey);
  // await dispatcher.sageFleetHandler.getFleetFreeCargoSpaces(fleetAccount).then((v) => log("Free cargo space:", v));
  // let canAttack = await dispatcher.sageFleetHandler.canAttack(fleetAccount);
  // log("Can Attack:", canAttack);

  while (true) {
    console.time("Fetch RAW loot details");
    let fa = await pro.fetchFleetAccount();
    let location = await pro.getCurrentSector(fa);

    // await prompt(`Prepare for loot on sector [${location.x},${location.y}] with ${loots.length} loot items. Press enter to continue...`);
    // console.log("Loots in sector : ... LOADING ... ");

    let Loots = await (dispatcher.sageGameHandler as unknown as SageGameHandler).listRetrievableLoot(location.x, location.y, 200);
    log("Loots in sector [limit=200]", location.toSectorKey(), Loots.retrievableByAnyone.length, Loots.retrievableByOwner.length);
    pro.addAction(
      new TransferCargoAction(pro, [
        { isImportToFleet: true, resourceName: Resource.toolkit, amount: "max" },
        // { isImportToFleet: true, resourceName: Resource.repair_kit, amount: "max" },
      ]),
    );
    pro.addAction(new UnDockAction(pro));
    pro.addAction(new RepairIdleFLeetAction(pro, 0));
    await pro.repeat(1);

    // await prompt("Repeat retrieve loot action?");
  }
  throw "DONE";
}
