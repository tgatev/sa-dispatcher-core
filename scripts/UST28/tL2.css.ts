import { Coordinates } from "../../src/Model/MoveAction";
import { MiningBuildOptions, Process } from "../../src/Model/FleetProcess";
import { SageGameHandler, StarbaseMapItem } from "../../src/gameHandlers/GameHandler";

// process.env['TRANSACTION_PRIORITY_FEE_LIMIT'] = "10000";
// process.env['TRANSACTION_PRIORITY_FEE_CAP'] = "100000";
// process.env["TRANSACTION_PRIORITY_FEE_MIN_CHANCE"] = "90";
// process.env["TRANSACTION_PRIORITY_FEE_INCREASE_STEP"] = "10000";
// process.env["TRANSACTION_PRIORITY_FEE_INCREASE_BASE_FEE"] = "10000";

export async function run(repeat: number | undefined = undefined) {
  /**
   * Mining 21 Hydro - fill fuel buffer
   */
  /** Provide pointer reference to handlers */
  let proc = await Process.build(undefined, "mrz28");
  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation

  /**
   * Transport FUEL for Food
   *  : Fuel to UST-1
   *  : Food to MRZ-21
   */

  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation
  let miningBaseUST1: StarbaseMapItem = await SageGameHandler.readStarbaseByName("ust1");
  // Need for definition only but not used
  let miningResourceUST1 = await SageGameHandler.readStarbaseResource(miningBaseUST1, "hydrogen");

  let optionsUST1 = {
    miningTimes: 0,
    movementMode: "Hybrid",
    // subwarpDistance: 2,
    pathToMiningStarbase: [
      new Coordinates(24, 23), // w
      new Coordinates(25, 23), // sw
      new Coordinates(31, 26), // w
      new Coordinates(32, 26), // sw
      new Coordinates(38, 29), // w
      new Coordinates(40, 30), // sw
    ],
    loadTravelingFuelOnMiningBase: true,
    pathToSafeStarbase: [
      new Coordinates(34, 27), // w
      new Coordinates(33, 26), // sw
      new Coordinates(27, 24), // w
      new Coordinates(26, 23), // sw
      new Coordinates(19, 21), // w
      new Coordinates(17, 21), // sw
    ],
    fuelTankToMiningBase: false,
    ammoBankToSaveStarbase: true,
    transportToMiningBase: [{ resourceName: "polymer", percent: 1 }],
    transportToSafeStarbase: [
      { resourceName: "electromagnet", percent: 0.9 },
      { resourceName: "food", percent: 0.1 },
    ],
  } as MiningBuildOptions;

  let gen = await proc.generateMiningProcessSteps(miningBaseUST1, miningResourceUST1, optionsUST1);

  proc.actionsChain.push(...gen.actions);

  console.log("****** Scenario Details ");
  console.log(gen.analytics);
  console.log("****** ******** ******* ");

  /**
   * Loop the process N times
   */
  await proc.repeat(repeat);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
