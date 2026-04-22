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
  let proc = await Process.build(undefined, "mrz22");
  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation

  /**
   * Transport FUEL for Food
   *  : Fuel to UST-1
   *  : Food to MRZ-21
   */
  // Dispatcher.Logger.setVerbosity(4);

  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation
  let miningBaseUST22: StarbaseMapItem = await SageGameHandler.readStarbaseByName("mrz22");
  let miningBaseUST21: StarbaseMapItem = await SageGameHandler.readStarbaseByName("mrz21");
  // Need for definition only but not used
  let miningResourceUST22ca = await SageGameHandler.readStarbaseResource(miningBaseUST22, "carbon");
  let miningResourceUST22co = await SageGameHandler.readStarbaseResource(miningBaseUST22, "copper_ore");
  let miningResourceUST21 = await SageGameHandler.readStarbaseResource(miningBaseUST21, "hydrogen");

  let optionsUST22 = {
    miningTimes: 1,
  } as MiningBuildOptions;

  let optionsUST21 = {
    miningTimes: 5,
    movementMode: "Warp",

    // subwarpDistance: 2,
    fuelTankToSaveStarbase: true,
    // ammoBankToSaveStarbase: true,
    // pathToMiningStarbase: [new Coordinates(34, 16), new Coordinates(35, 16)],
    // pathToSafeStarbase: [new Coordinates(26, 14), new Coordinates(25, 14)],
    transportToMiningBase: [{ resourceName: "energy_substrate", percent: 1 }],
    transportToSafeStarbase: [{ resourceName: "crystal_lattice", percent: 1 }],
    // loadTravelingFuelOnMiningBase: true,
  } as MiningBuildOptions;

  let gen22ca = await proc.generateMiningProcessSteps(miningBaseUST22, miningResourceUST22ca, optionsUST22);
  let gen21 = await proc.generateMiningProcessSteps(miningBaseUST21, miningResourceUST21, optionsUST21);
  // let gen22co = await proc.generateMiningProcessSteps(miningBaseUST22, miningResourceUST22co, optionsUST22);

  proc.actionsChain.push(...gen21.actions);
  proc.actionsChain.push(...gen22ca.actions);
  // proc.actionsChain.push(...gen22co.actions);
  // proc.actionsChain.push(...gen21.actions);

  /**
   * Loop the process N times
   */
  await proc.repeat(repeat);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
