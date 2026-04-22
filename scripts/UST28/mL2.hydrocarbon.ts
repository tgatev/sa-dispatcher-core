import { MiningBuildOptions, Process } from "../../src/Model/FleetProcess";
import { SageGameHandler } from "../../src/gameHandlers/GameHandler";

// process.env['TRANSACTION_PRIORITY_FEE_LIMIT'] = "10000";
// process.env['TRANSACTION_PRIORITY_FEE_CAP'] = "100000";
// process.env["TRANSACTION_PRIORITY_FEE_MIN_CHANCE"] = "90";
// process.env["TRANSACTION_PRIORITY_FEE_INCREASE_STEP"] = "10000";
// process.env["TRANSACTION_PRIORITY_FEE_INCREASE_BASE_FEE"] = "10000";

async function run() {
  /**
   * Mining 21 Hydro - fill fuel buffer
   */
  /** Provide pointer reference to handlers */
  let proc = await Process.build(undefined, "mrz28");
  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation

  let miningBase = await SageGameHandler.readStarbaseByName("mrz28");

  /**
   * Mine Hydrocarbon materials
   *  : Fuel to UST-1
   *  : Food to MRZ-21
   */

  // Need for definition only but not used
  let miningResourceH = await SageGameHandler.readStarbaseResource(miningBase, "hydrogen");
  let miningResourceC = await SageGameHandler.readStarbaseResource(miningBase, "carbon");

  let optionsUST28 = {
    miningTimes: 3,
  } as MiningBuildOptions;

  proc.actionsChain.push(...(await proc.generateMiningProcessSteps(miningBase, miningResourceH, optionsUST28)).actions);
  proc.actionsChain.push(...(await proc.generateMiningProcessSteps(miningBase, miningResourceC, optionsUST28)).actions);

  /**
   * Loop the process N times
   */
  await proc.repeat();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
