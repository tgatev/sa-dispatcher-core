import { Fleet, GLOBAL_SCALE_DECIMALS_4 } from "@staratlas/sage-main";
import { StartMiningAction } from "../src/Model/StartMiningAction";
import { Coordinates } from "../src/Model/MoveAction";
import { argv } from "../src/gameHandlers/GameHandler";
import { DispatcherHolosim as Dispatcher, ProcessHolosim as Process } from "../src/holoHandlers/HolosimMintsImporter";

/**
 * --resourceName=hydrogen --hardness=1 --richness=1
 * --resourceName=hydrogen --hardness=1 --richness=1.5
 * --resourceName=hydrogen --hardness=1 --richness=1.5
 */
if (!argv.resourceName) argv.resourceName = "hydrogen";
if (!argv.hardness) argv.hardness = 1;
if (!argv.richness) argv.richness = 2;
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

  let maxPro = new Process(dispatcher, "pernik", new Coordinates(40, 30), "");
  let fleetAccount = await maxPro.fetchFleetAccount();

  let cargo_free = await dispatcher.sageFleetHandler.getFleetFreeCargoSpaces(fleetAccount);
  console.log("Cargo free space:", cargo_free);

  let startMining = new StartMiningAction(maxPro, argv.resourceName, argv.hardness, argv.richness);
  let o = {
    getCost: await startMining.getResourceCost(),
    calcCost: await startMining.calcMiningTimesCosts(),
    getTime: await startMining.getTimeCost(),
    miningRate: Fleet.calculateAsteroidMiningEmissionRateBareBones(fleetAccount.data.stats, startMining.onHardness, startMining.onRichness),
    //@ts-ignore
    foodCons: fleetAccount.data.stats.cargoStats.foodConsumptionRate / GLOBAL_SCALE_DECIMALS_4,
    //@ts-ignore
    ammoCons: fleetAccount.data.stats.cargoStats.ammoConsumptionRate / GLOBAL_SCALE_DECIMALS_4,
  };
  console.log(o);

  // try  StartMinin without resources ammo / food
  // maxPro.add(startMining);
  // await maxPro.start();
  throw "DDDD";
}
