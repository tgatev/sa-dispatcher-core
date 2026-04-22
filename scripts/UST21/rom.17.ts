import { Coordinates } from "../../src/Model/MoveAction";
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

  await Process.buildAndAppendActions(proc, "hydrogen", "mrz17", {
    miningTimes: 0,
    movementMode: "Hybrid",
    // subwarpDistance: 2,

    fuelTankToMiningBase: true,
    ammoBankToMiningBase: true,
    transportToMiningBase: [{ resourceName: "fuel", percent: 1 }],
    pathToMiningStarbase: [new Coordinates(21, 5), new Coordinates(20, 4), new Coordinates(17, -4), new Coordinates(16, -5)],

    transportToSafeStarbase: [{ resourceName: "arco", percent: 1 }],
    pathToSafeStarbase: [new Coordinates(20, 4), new Coordinates(21, 5), new Coordinates(24, 13), new Coordinates(25, 14)],
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
