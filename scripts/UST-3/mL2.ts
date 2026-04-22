import { MiningBuildOptions, Process } from "../../src/Model/FleetProcess";
import { SageGameHandler } from "../../src/gameHandlers/GameHandler";

// process.env['TRANSACTION_PRIORITY_FEE_LIMIT'] = "10000";
// process.env['TRANSACTION_PRIORITY_FEE_CAP'] = "100000";
// process.env["TRANSACTION_PRIORITY_FEE_MIN_CHANCE"] = "90";
// process.env['TRANSACTION_PRIORITY_FEE_LIMIT'] = "10000";
// process.env['TRANSACTION_PRIORITY_FEE_CAP'] = "100000";
// process.env["TRANSACTION_PRIORITY_FEE_MIN_CHANCE"] = "90";
process.env["TRANSACTION_PRIORITY_FEE_INCREASE_STEP"] = "1000";
process.env["TRANSACTION_PRIORITY_FEE_INCREASE_BASE_FEE"] = "100";

async function run() {
  /**
   * Mining 21 Hydro - fill fuel buffer
   */
  /** Provide pointer reference to handlers */
  let proc = await Process.build(undefined, "ust3");
  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation

  let miningBase = await SageGameHandler.readStarbaseByName("ust3");

  /**
   * Transport FUEL for Food
   *  : Fuel to UST-1
   *  : Food to MRZ-21
   */

  // Need for definition only but not used
  let miningResourceC = await SageGameHandler.readStarbaseResource(miningBase, "carbon");
  // let miningResourceCo = await SageGameHandler.readStarbaseResource(miningBase, "copper_ore");

  let optionsUST3 = {
    miningTimes: 1,
    // movementMode: "Hybrid",
    // subwarpDistance: 2.5,
    // fuelTankToMiningBase: true,
    // loadTravelingFuelOnMiningBase: true,
    // transportToMiningBase: [{ resourceName: "polymer", percent: 1 }],
    // transportToSafeStarbase: [{ resourceName: "field_stabilizer", percent: 1 }],
  } as MiningBuildOptions;

  proc.actionsChain.push(...(await proc.generateMiningProcessSteps(miningBase, miningResourceC, optionsUST3)).actions);
  /**
   * Loop the process N times
   */
  await proc.repeat();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
