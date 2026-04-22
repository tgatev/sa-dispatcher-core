import { Coordinates } from "../..";
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
  let proc = await Process.build(undefined, "mrz23");
  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation

  /**
   * Transport FUEL for Food
   *  : Fuel to UST-1
   *  : Food to MRZ-21
   */

  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation
  let miningBaseUST16: StarbaseMapItem = await SageGameHandler.readStarbaseByName("mrz16");
  let miningBaseUST23: StarbaseMapItem = await SageGameHandler.readStarbaseByName("mrz23");
  // Need for definition only but not used
  let miningResourceUST23 = await SageGameHandler.readStarbaseResource(miningBaseUST23, "iron_ore");
  let miningResourceUST16 = await SageGameHandler.readStarbaseResource(miningBaseUST16, "titanium_ore");

  let optionsUST16 = {
    miningTimes: 0,
    movementMode: "Hybrid",
    subwarpDistance: 1,
    // fuelTankToMiningBase: true,
    ammoBankToMiningBase: true,
    pathToMiningStarbase: [new Coordinates(40, 1), miningBaseUST16.location],
    pathToSafeStarbase: [new Coordinates(43, 8), proc.saveStarbase],
    transportToMiningBase: [{ resourceName: "electromagnet", percent: 1 }],
    transportToSafeStarbase: [
      { resourceName: "titanium_ore", percent: 1 },
      // { resourceName: "food", percent: 0.3 },
    ],
    loadTravelingFuelOnMiningBase: true,
    crewToMiningBase: "max",
    // loadTravelingFuelOnMiningBase: true,
    // loadMiningFoodOnMiningBase: true,
  } as MiningBuildOptions;

  let optionsUST23 = {
    miningTimes: 1,
  } as MiningBuildOptions;
  let genTI = await proc.generateMiningProcessSteps(miningBaseUST16, miningResourceUST16, optionsUST16);
  // let genIO = await proc.generateMiningProcessSteps(miningBaseUST23, miningResourceUST23, optionsUST23);

  proc.actionsChain.push(...genTI.actions);
  // proc.actionsChain.push(...genIO.actions);

  // proc.actionsChain.push(...genCa.actions);
  // proc.actionsChain.push(...genCa.actions);

  /**
   * Loop the process N times
   */
  await proc.repeat(repeat);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
