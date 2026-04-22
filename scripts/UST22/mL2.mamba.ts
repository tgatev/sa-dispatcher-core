import { FleetProcess as Process } from "../../src/Model/FleetProcess";

process.env["TRANSACTION_PRIORITY_FEE_LIMIT"] = "5000";
process.env["TRANSACTION_PRIORITY_FEE_CAP"] = "20000";
// process.env['TRANSACTION_PRIORITY_FEE_LIMIT'] = "10000";
// process.env['TRANSACTION_PRIORITY_FEE_CAP'] = "100000";
process.env["TRANSACTION_PRIORITY_FEE_MIN_CHANCE"] = "90";
// process.env["TRANSACTION_PRIORITY_FEE_MIN_CHANCE"] = "50";
process.env["TRANSACTION_PRIORITY_FEE_INCREASE_STEP"] = "2500";
process.env["TRANSACTION_PRIORITY_FEE_INCREASE_BASE_FEE"] = "100";

async function run() {
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

  // Need for definition only but not used
  await Process.buildAndAppendActions(proc, "copper_ore", "mrz22", { miningTimes: 1 });
  await Process.buildAndAppendActions(proc, "copper_ore", "mrz22", { miningTimes: 1 });
  // await Process.buildAndAppendActions(proc, "hydrogen", "mrz21", {
  //   miningTimes: 0,
  //   movementMode: "Hybrid",
  //   pathToMiningStarbase: [new Coordinates(26, 14), new Coordinates(25, 14)],
  //   transportToMiningBase: [{ resourceName: "carbon", percent: 1 }],
  //   ammoBankToMiningBase: true,
  //   pathToSafeStarbase: [new Coordinates(34, 16), new Coordinates(35, 16)],
  //   transportToSafeStarbase: [{ resourceName: "hydrogen", percent: 1 }],
  //   fuelTankToSaveStarbase: true,
  //   loadTravelingFuelOnMiningBase: true,
  // });
  await Process.buildAndAppendActions(proc, "carbon", "mrz22", { miningTimes: 1 });
  await Process.buildAndAppendActions(proc, "carbon", "mrz22", { miningTimes: 1 });
  /**
   * Loop the process N times
   */
  await proc.repeat();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
