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
  let proc = await Process.build(undefined, "mrz22");
  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation

  /**
   * Transport FUEL for Food
   *  : Fuel to UST-1
   *  : Food to MRZ-21
   */

  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation
  let miningBaseUST23: StarbaseMapItem = await SageGameHandler.readStarbaseByName("mrz23");
  let miningBaseUST22: StarbaseMapItem = await SageGameHandler.readStarbaseByName("mrz22");
  // Need for definition only but not used
  let miningResourceUST23 = await SageGameHandler.readStarbaseResource(miningBaseUST23, "iron_ore");
  let miningResourceUST22 = await SageGameHandler.readStarbaseResource(miningBaseUST22, "carbon");
  let miningResourceUST22CO = await SageGameHandler.readStarbaseResource(miningBaseUST22, "copper_ore");

  let optionsUST23 = {
    miningTimes: 2,
    movementMode: "Hybrid",
    subwarpDistance: 1,
    fuelTankToMiningBase: true,
    ammoBankToMiningBase: true,
    pathToMiningStarbase: [new Coordinates(43, 11), miningBaseUST23.location],
    pathToSafeStarbase: [new Coordinates(36, 15), proc.saveStarbase],
    transportToMiningBase: [{ resourceName: "copper_ore", percent: 1 }],
    transportToSafeStarbase: [
      { resourceName: "magnet", percent: 1 },
      // { resourceName: "food", percent: 0.3 },
    ],
    // loadTravelingFuelOnMiningBase: true,
    // loadTravelingFuelOnMiningBase: true,
    // loadMiningFoodOnMiningBase: true,
  } as MiningBuildOptions;

  let optionsUST22 = {
    miningTimes: 1,
  } as MiningBuildOptions;
  let genIO = await proc.generateMiningProcessSteps(miningBaseUST23, miningResourceUST23, optionsUST23);
  let genCa = await proc.generateMiningProcessSteps(miningBaseUST22, miningResourceUST22, optionsUST22);
  // genCa = await proc.generateMiningProcessSteps(miningBaseUST22, miningResourceUST22, optionsUST22);

  proc.actionsChain.push(...genIO.actions);
  proc.actionsChain.push(...genCa.actions);

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
