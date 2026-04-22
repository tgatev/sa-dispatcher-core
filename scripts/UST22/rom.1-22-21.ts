import { Coordinates } from "../../src/Model/MoveAction";
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

  /**
   * Transport FUEL for Food
   *  : Fuel to UST-1
   *  : Food to MRZ-21
   */

  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation

  // await Process.buildAndAppendActions(
  //   proc,
  //   "hydrogen",
  //   "ust1",
  //   {
  //     miningTimes: 0,
  //     movementMode: "Hybrid",
  //     pathToMiningStarbase: [new Coordinates(38, 25), new Coordinates(38, 26), new Coordinates(39, 29), new Coordinates(40, 30)],
  //     pathToSafeStarbase: [new Coordinates(37, 21), new Coordinates(37, 20), new Coordinates(36, 17), new Coordinates(35, 16)],
  //     fuelTankToMiningBase: true,
  //     // ammoBankToMiningBase: true,
  //     transportToMiningBase: [{ resourceName: "graphene", percent: 1 }],
  //     // fuelTankToSaveStarbase: true,
  //     ammoBankToSaveStarbase: true,
  //     // loadTravelingFuelOnMiningBase: true,
  //     transportToSafeStarbase: [{ resourceName: "ammunitions", percent: 1 }],
  //     unloadAmmoBankOnSaveBase: 0,
  //   },
  //   1
  // );

  // // MRZ-21
  // await Process.buildAndAppendActions(
  //   proc,
  //   "hydrogen",
  //   "mrz21",
  //   {
  //     miningTimes: 0,
  //     movementMode: "Hybrid",
  //     pathToMiningStarbase: [new Coordinates(26, 14), new Coordinates(25, 14)],
  //     pathToSafeStarbase: [new Coordinates(34, 16), new Coordinates(35, 16)],
  //     // fuelTankToMiningBase: true,
  //     // ammoBankToMiningBase: true,
  //     transportToMiningBase: [{ resourceName: "food", percent: 1 }],
  //     fuelTankToSaveStarbase: true,
  //     // ammoBankToSaveStarbase: true,
  //     loadTravelingFuelOnMiningBase: true,
  //     transportToSafeStarbase: [{ resourceName: "fuel", percent: 1 }],
  //     unloadFuelTankOnSaveBase: 0,
  //   },
  //   1
  // );
  // MRZ-21
  await Process.buildAndAppendActions(
    proc,
    "hydrogen",
    "mrz21",
    {
      miningTimes: 0,
      movementMode: "Hybrid",
      pathToMiningStarbase: [new Coordinates(26, 14), new Coordinates(25, 14)],
      pathToSafeStarbase: [new Coordinates(34, 16), new Coordinates(35, 16)],
      // fuelTankToMiningBase: true,
      ammoBankToMiningBase: true,
      transportToMiningBase: [{ resourceName: "ammunitions", percent: 1 }],
      fuelTankToSaveStarbase: true,
      // ammoBankToSaveStarbase: true,
      loadTravelingFuelOnMiningBase: true,
      transportToSafeStarbase: [{ resourceName: "fuel", percent: 1 }],
      unloadFuelTankOnSaveBase: 0,
    },
    1
  );

  // // MRZ-21
  // await Process.buildAndAppendActions(
  //   proc,
  //   "hydrogen",
  //   "mrz23",
  //   {
  //     miningTimes: 0,
  //     movementMode: "Hybrid",
  //     // pathToMiningStarbase: [new Coordinates(26, 14), new Coordinates(25, 14)],
  //     // pathToSafeStarbase: [new Coordinates(34, 16), new Coordinates(35, 16)],
  //     // fuelTankToMiningBase: true,
  //     ammoBankToMiningBase: true,
  //     transportToMiningBase: [{ resourceName: "copper_ore", percent: 1 }],
  //     // fuelTankToSaveStarbase: true,
  //     // ammoBankToSaveStarbase: true,
  //     // loadTravelingFuelOnMiningBase: true,
  //     transportToSafeStarbase: [{ resourceName: "food", percent: 1 }],
  //     // unloadFuelTankOnSaveBase: true,
  //   },
  //   1
  // );

  /**
   * Loop the process N times
   */
  await proc.repeat(repeat);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
