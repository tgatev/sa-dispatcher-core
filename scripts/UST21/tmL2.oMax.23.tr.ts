import { Coordinates } from "../../src/Model/MoveAction";
import { MiningBuildOptions, Process } from "../../src/Model/FleetProcess";
import { SageGameHandler, StarbaseMapItem } from "../../src/gameHandlers/GameHandler";

process.env["TRANSACTION_PRIORITY_FEE_LIMIT"] = "1000";
process.env["TRANSACTION_PRIORITY_FEE_CAP"] = "10000";
process.env["TRANSACTION_PRIORITY_FEE_MIN_CHANCE"] = "90";
process.env["TRANSACTION_PRIORITY_FEE_INCREASE_STEP"] = "1000";
process.env["TRANSACTION_PRIORITY_FEE_INCREASE_BASE_FEE"] = "100";

async function run() {
  /**
   * Mining 21 Hydro - fill fuel buffer
   */
  /** Provide pointer reference to handlers */
  let proc = await Process.build(undefined, "mrz21");
  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation

  let miningBase = await SageGameHandler.readStarbaseByName("mrz23");

  /**
   * Mining 28 Hydrogen and transfer
   *  : Fuel to 28
   *  : polymer or electronics to 21
   */

  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation
  let miningBase23: StarbaseMapItem = await SageGameHandler.readStarbaseByName("mrz23");
  let miningResource23b = await SageGameHandler.readStarbaseResource(miningBase23, "biomass");

  /**
   * Mining 28 Carbon and transfer
   *  : Fuel to 28
   *  : polymer or electronics to 21
   */

  let options23 = {
    miningTimes: 0,
    movementMode: "Hybrid",
    // subwarpDistance: 1,
    pathToMiningStarbase: [new Coordinates(35, 12), new Coordinates(36, 12), new Coordinates(43, 10), new Coordinates(44, 10)],
    pathToSafeStarbase: [new Coordinates(34, 12), new Coordinates(33, 12), new Coordinates(26, 14), new Coordinates(25, 14)],
    fuelTankToMiningBase: true,
    transportToMiningBase: [{ resourceName: "field_stabilizer", percent: 1 }],
    transportToSafeStarbase: [{ resourceName: "iron_ore", percent: 1 }],
    ammoBankToMiningBase: true,
    loadTravelingFuelOnMiningBase: true,
  } as MiningBuildOptions;

  // Enter 12 times to mine the fuel needed to transport and to transfer
  proc.actionsChain.push(...(await proc.generateMiningProcessSteps(miningBase, miningResource23b, options23)).actions);

  /**
   * Loop the process N times
   */
  await proc.repeat();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
