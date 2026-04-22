import { FleetProcess as Process } from "../../src/Model/FleetProcess";

process.env["TRANSACTION_PRIORITY_FEE_LIMIT"] = "5000";
process.env["TRANSACTION_PRIORITY_FEE_CAP"] = "10000";
process.env["TRANSACTION_PRIORITY_FEE_MIN_CHANCE"] = "90";
process.env["TRANSACTION_PRIORITY_FEE_INCREASE_STEP"] = "1000";
process.env["TRANSACTION_PRIORITY_FEE_INCREASE_BASE_FEE"] = "100";

export async function run(repeat: number | undefined = undefined) {
  /**
   * Mining 21 Hydro - fill fuel buffer
   */
  /** Provide pointer reference to handlers */
  let proc = await Process.build(undefined, "mrz21");
  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation

  /**
   * Transport FUEL for Food
   *  : Fuel to UST-1
   *  : Food to MRZ-21
   */

  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation

  await Process.buildAndAppendActions(proc, "hydrogen", "ust1", {
    miningTimes: 0,
    movementMode: "Hybrid",
    subwarpDistance: 2,
    fuelTankToMiningBase: true,
    transportToMiningBase: [{ resourceName: "crystal_lattice", percent: 1 }],
    transportToSafeStarbase: [{ resourceName: "toolkit", percent: 1 }],
  });

  /**
   * Loop the process N times
   */
  await proc.repeat(repeat);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
