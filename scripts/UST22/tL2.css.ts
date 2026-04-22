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
   * Mining 22 Graphene/Ammo for Resource
   */
  /** Provide pointer reference to handlers */
  let proc = await Process.build(undefined, "mrz22");
  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation

  /**
   * Transport FUEL for Food
   *  : Fuel to UST-1
   *  : Food to MRZ-21
   */

  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation
  let miningBaseUST1: StarbaseMapItem = await SageGameHandler.readStarbaseByName("ust1");
  let miningBaseUST22: StarbaseMapItem = await SageGameHandler.readStarbaseByName("mrz22");
  // Need for definition only but not used
  let miningResourceUST1 = await SageGameHandler.readStarbaseResource(miningBaseUST1, "hydrogen");
  let miningResourceUST22 = await SageGameHandler.readStarbaseResource(miningBaseUST22, "carbon");

  let optionsUST1 = {
    miningTimes: 0,
    movementMode: "Hybrid",
    subwarpDistance: 1,
    fuelTankToMiningBase: false,
    // ammoBankToMiningBase: true,
    transportToMiningBase: [{ resourceName: "copper", percent: 1 }],
    pathToMiningStarbase: [new Coordinates(38, 25), new Coordinates(38, 26), new Coordinates(40, 29), new Coordinates(40, 30)],
    transportToSafeStarbase: [{ resourceName: "hydrogen", percent: 1 }],
    pathToSafeStarbase: [new Coordinates(37, 21), new Coordinates(36, 21), new Coordinates(35, 17), new Coordinates(35, 16)],
    crewToSaveBase: "max",
    // loadTravelingFuelOnMiningBase: true,
    fuelTankToSaveStarbase: false,
    ammoBankToSaveStarbase: false,
  } as MiningBuildOptions;

  let gen = await proc.generateMiningProcessSteps(miningBaseUST1, miningResourceUST1, optionsUST1);

  proc.actionsChain.push(...gen.actions);

  // let optionsUST22 = {
  //   miningTimes: 3,
  // } as MiningBuildOptions;
  // let mine = await proc.generateMiningProcessSteps(miningBaseUST22, miningResourceUST22, optionsUST22);
  // proc.actionsChain.push(...mine.actions);
  // proc.actionsChain.push(...mine.actions);
  // proc.actionsChain.push(...mine.actions);
  /**
   * Loop the process N times
   */
  await proc.repeat(repeat);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
