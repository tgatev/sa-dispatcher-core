import { log } from "../../src/Common/PatchConsoleLog";
import { argv } from "../../src/gameHandlers/GameHandler";
import { DispatcherHolosim as Dispatcher } from "../../src/holoHandlers/HolosimMintsImporter";
let sector = { x: argv.x || 40, y: argv.y || 30 };

console.log(argv);

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

async function run() {
  console.time("init_dispatcher");
  const dispatcher = await Dispatcher.build();
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
  let travelingFrom = await dispatcher.sageGameHandler.getFleetsTravelingFrom(sector.x, sector.y);
  await prompt(`Fleets traveling From [ ${sector.x}, ${sector.y} ] : Display: ${travelingFrom.length}`);
  log(travelingFrom);

  let travelingTo = await dispatcher.sageGameHandler.getFleetsTravelingTo(22, -2);
  await prompt(`Fleets traveling to [ ${sector.x}, ${sector.y} ] : Display: ${travelingFrom.length}`);
  log(travelingTo);

  let miningOn = await dispatcher.sageGameHandler.getFleetsMiningOn(sector.x, sector.y);
  await prompt(`Fleets traveling to [ ${sector.x}, ${sector.y} ] : Display: ${travelingFrom.length}`);
  log(miningOn);

  let Idle = await dispatcher.sageGameHandler.getFleetsIdle(sector.x, sector.y);
  await prompt(`Idle fleets in [ ${sector.x}, ${sector.y} ] : Display: ${travelingFrom.length}`);
  log(Idle);

  throw "DONE";
}
