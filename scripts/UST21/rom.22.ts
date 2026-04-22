import { Coordinates } from "../../src/Model/MoveAction";
import { MiningBuildOptions, Process } from "../../src/Model/FleetProcess";
import { SageGameHandler, StarbaseMapItem, argv } from "../../src/gameHandlers/GameHandler";

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
  await Process.buildAndAppendActions(
    proc,
    "carbon",
    "mrz22",
    {
      miningTimes: 0,
      movementMode: "Hybrid",

      pathToMiningStarbase: [new Coordinates(34, 16), new Coordinates(35, 16)],
      transportToMiningBase: [{ resourceName: "hydrogen", percent: 1 }],
      crewToSaveBase: "max",
      transportToSafeStarbase: [{ resourceName: "electromagnet", percent: 1 }],
      pathToSafeStarbase: [new Coordinates(26, 14), new Coordinates(25, 14)],

      fuelTankToMiningBase: true,
      ammoBankToSaveStarbase: true,
    } as MiningBuildOptions,
    13
  );

  // await Process.buildAndAppendActions(
  //   proc,
  //   "hydrogen",
  //   "mrz21",
  //   {
  //     miningTimes: 1,
  //     // movementMode: "Hybrid",

  //     // pathToMiningStarbase: [new Coordinates(34, 16), new Coordinates(35, 16)],
  //     // transportToMiningBase: [{ resourceName: "hydrogen", percent: 1 }],
  //     // crewToSaveBase: "max",
  //     // transportToSafeStarbase: [{ resourceName: "electromagnet", percent: 1 }],
  //     // pathToSafeStarbase: [new Coordinates(26, 14), new Coordinates(25, 14)],

  //     // fuelTankToMiningBase: true,
  //     // ammoBankToSaveStarbase: true,
  //   } as MiningBuildOptions,
  //   13
  // );

  /**
   * Loop the process N times
   */
  await proc.repeat();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
