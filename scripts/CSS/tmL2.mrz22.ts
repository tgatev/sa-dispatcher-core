import { ShipStats } from "@staratlas/sage-main";
import { FleetProcess as Process } from "../../src/Model/FleetProcess";
import { TransferCargoAction } from "../../src/Model/TransferCargoAction";
import { argv } from "../../src/gameHandlers/GameHandler";
import { Coordinates } from "../../src/Model/MoveAction";

/**
 *  Provide Transfer resources between CSS and UST-22 with mining on UST-22 before go back
 *    mining times 2: 1st is unloaded on UST-22
 *    and return to CSS and unload 2nd cargo on CSS
 *    - Layer2 - using process generator
 */
const saveStarbaseName = argv.saveStarbaseName || "ust1";

async function run() {
  /** Provide pointer reference to handlers */
  let proc = await Process.build(undefined, saveStarbaseName);
  // await proc.validateEmptyCargo();

  await Process.buildAndAppendActions(proc, "carbon", "mrz22", {
    miningTimes: 0,
    movementMode: "Hybrid",
    // subwarpDistance: 1,
    // ammoBankToMiningBase: true,
    pathToMiningStarbase: [new Coordinates(37, 21), new Coordinates(37, 20), new Coordinates(36, 17), new Coordinates(35, 16)],
    pathToSafeStarbase: [new Coordinates(38, 25), new Coordinates(38, 26), new Coordinates(39, 29), new Coordinates(40, 30)],
    transportToMiningBase: [
      { resourceName: "food", percent: 1 },
      // { resourceName: "food", percent: 0.2 },
    ],
    transportToSafeStarbase: [
      { resourceName: "graphene", percent: 1 },
      // { resourceName: "food", percent: 0.2 },
    ],
    loadTravelingFuelOnMiningBase: true,
  });

  // if the fleet is only miner no need to load resurces in thes scenario cause
  //   1 there is no added transportation of them
  //   2 there is no consumption rate
  let fleetAccount = await proc.fetchFleetAccount();
  let fleetStats: ShipStats = fleetAccount.data.stats;
  if (fleetStats.cargoStats.ammoConsumptionRate == 0) {
    let ammoCondition = (proc.actionsChain[0] as TransferCargoAction).resources[1].condition;
    if (ammoCondition) ammoCondition.whenLessThen = 1;
  }

  await proc.repeat();
}
run().catch((err) => {
  console.error(err);
  process.exit(1);
});
