import { Process } from "../../src/Model/FleetProcess";
import { SageGameHandler, StarbaseMapItem, argv } from "../../src/gameHandlers/GameHandler";

// process.env['TRANSACTION_PRIORITY_FEE_LIMIT'] = "10000";
// process.env['TRANSACTION_PRIORITY_FEE_CAP'] = "100000";
// process.env["TRANSACTION_PRIORITY_FEE_MIN_CHANCE"] = "90";
// process.env["TRANSACTION_PRIORITY_FEE_INCREASE_STEP"] = "10000";
// process.env["TRANSACTION_PRIORITY_FEE_INCREASE_BASE_FEE"] = "10000";

export async function run(repeat: number | undefined = undefined) {
  /**
   * Mining 22 Graphene/Ammo for Resource
   */
  /** Provide pointer reference to handlers */
  let proc = await Process.build(undefined, "mrz22");
  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation

  // await Process.buildAndAppendActions(proc, "hydrogen", "mrz21", {
  //   miningTimes: 1,
  //   movementMode: "Subwarp",
  //   fuelTankToSaveStarbase: true,
  //   ammoBankToMiningBase: true,
  //   loadTravelingFuelOnMiningBase: true,
  //   transportToMiningBase: [{ resourceName: "energy_substrate", percent: 1 }],
  //   // transportToSafeStarbase: [{ resourceName: "energy_substrate", percent: 1 }],
  //   // crewToMiningBase: "max",
  // });

  await Process.buildAndAppendActions(proc, "hydrogen", "mrz21", {
    miningTimes: 0,
    movementMode: "Subwarp",
    // subwarpDistance: 1,
    // fuelTankToMiningBase: true,
    ammoBankToMiningBase: true,
    transportToMiningBase: [{ resourceName: "energy_substrate", percent: 1 }],
    fuelTankToSaveStarbase: true,
    transportToSafeStarbase: [{ resourceName: "hydrogen", percent: 1 }],
    // loadTravelingFuelOnMiningBase: true,
    // fuelTankToSaveStarbase: false,
    // ammoBankToSaveStarbase: true,
  });

  await Process.buildAndAppendActions(proc, "hydrogen", "ust1", {
    miningTimes: 0,
    movementMode: "Subwarp",
    // subwarpDistance: 1,
    // fuelTankToMiningBase: true,
    transportToMiningBase: [{ resourceName: "titanium", percent: 1 }],
    ammoBankToSaveStarbase: true,
    transportToSafeStarbase: [{ resourceName: "ammunitions", percent: 1 }],
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
