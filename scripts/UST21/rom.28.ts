import { Coordinates } from "../../src/Model/MoveAction";
import { MiningBuildOptions, FleetProcess as Process } from "../../src/Model/FleetProcess";

process.env["TRANSACTION_PRIORITY_FEE_LIMIT"] = "8000";
process.env["TRANSACTION_PRIORITY_FEE_CAP"] = "20000";
process.env["TRANSACTION_PRIORITY_FEE_MIN_CHANCE"] = "90";
process.env["TRANSACTION_PRIORITY_FEE_INCREASE_STEP"] = "2000";
process.env["TRANSACTION_PRIORITY_FEE_INCREASE_BASE_FEE"] = "100";

async function run() {
  /**
   * Mining 21 Hydro - fill fuel buffer
   */
  /** Provide pointer reference to handlers */
  let proc = await Process.build(undefined, "mrz21");
  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation
  //! // // 21->28->21
  await Process.buildAndAppendActions(proc, "carbon", "mrz28", {
    miningTimes: 0,
    movementMode: "Hybrid",

    pathToMiningStarbase: [new Coordinates(18, 21), new Coordinates(17, 21)],
    transportToMiningBase: [{ resourceName: "electronics", percent: 1 }],
    transportToSafeStarbase: [{ resourceName: "graphene", percent: 1 }],
    pathToSafeStarbase: [new Coordinates(24, 14), new Coordinates(25, 14)],

    fuelTankToMiningBase: true,
    // ammoBankToMiningBase: true,
  } as MiningBuildOptions);
  /**
   * Loop the process N times
   */
  await proc.repeat();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
