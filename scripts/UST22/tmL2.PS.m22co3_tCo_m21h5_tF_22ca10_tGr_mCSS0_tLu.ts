import { MiningBuildOptions, Process } from "../../src/Model/FleetProcess";
import { SageGameHandler, StarbaseMapItem } from "../../src/gameHandlers/GameHandler";

// process.env['TRANSACTION_PRIORITY_FEE_LIMIT'] = "10000";
// process.env['TRANSACTION_PRIORITY_FEE_CAP'] = "100000";
// process.env["TRANSACTION_PRIORITY_FEE_MIN_CHANCE"] = "90";
// process.env["TRANSACTION_PRIORITY_FEE_INCREASE_STEP"] = "10000";
// process.env["TRANSACTION_PRIORITY_FEE_INCREASE_BASE_FEE"] = "10000";

export async function run(repeat: number | undefined = undefined) {
  /**
   * Mining 22 Graphen/Ammo for Resource
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
    subwarpDistance: 2,
    // fuelTankToMiningBase: true,
    ammoBankToMiningBase: true,
    transportToMiningBase: [{ resourceName: "graphene", percent: 1 }],
    transportToSafeStarbase: [{ resourceName: "lumanite", percent: 1 }],
    loadTravelingFuelOnMiningBase: true,
    fuelTankToSaveStarbase: true,
  } as MiningBuildOptions;

  let gen = await proc.generateMiningProcessSteps(miningBaseUST1, miningResourceUST1, optionsUST1);

  proc.actionsChain.push(...gen.actions);

  let optionsUST22 = {
    miningTimes: 2,
  } as MiningBuildOptions;
  let mine = await proc.generateMiningProcessSteps(miningBaseUST22, miningResourceUST22, optionsUST22);
  proc.actionsChain.push(...mine.actions);
  proc.actionsChain.push(...mine.actions);
  proc.actionsChain.push(...mine.actions);
  proc.actionsChain.push(...mine.actions);
  /**
   * Loop the process N times
   */
  await proc.repeat(repeat);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
