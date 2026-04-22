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
  let proc = await Process.build(undefined, "ust1");
  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation

  /**
   * Transport FUEL,Electronics for IronOre
   */

  // MRZ-23
  await Process.buildAndAppendActions(
    proc,
    "iron_ore",
    "mrz23",
    {
      miningTimes: 0,
      movementMode: "Hybrid",
      pathToMiningStarbase: [new Coordinates(42, 20), new Coordinates(42, 19), new Coordinates(44, 11), new Coordinates(44, 10)],
      fuelTankToMiningBase: true,
      // ammoBankToMiningBase: true,
      transportToMiningBase: [{ resourceName: "electronics", percent: 1 }],

      pathToSafeStarbase: [new Coordinates(42, 20), new Coordinates(42, 21), new Coordinates(40, 29), new Coordinates(40, 30)],
      // loadTravelingFuelOnMiningBase: true,
      transportToSafeStarbase: [{ resourceName: "iron_ore", percent: 1 }],
      // unloadAmmoBankOnSaveBase: 0,
    },
    1
  );
  // // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation
  // let config21 = {
  //   miningTimes: 0,
  //   movementMode: "Hybrid",
  //   subwarpDistance: 2,
  //   // pathToMiningStarbase: [new Coordinates(26, 14), new Coordinates(25, 14)],
  //   pathToSafeStarbase: [new Coordinates(32, 21), new Coordinates(33, 22), new Coordinates(40, 29), new Coordinates(40, 30)],
  //   // fuelTankToMiningBase: true,
  //   ammoBankToMiningBase: true,
  //   transportToMiningBase: [{ resourceName: "polymer", percent: 1 }],
  //   fuelTankToSaveStarbase: true,
  //   // ammoBankToSaveStarbase: true,
  //   loadTravelingFuelOnMiningBase: true,
  //   transportToSafeStarbase: [{ resourceName: "crystal_lattice", percent: 1 }],
  //   unloadFuelTankOnSaveBase: true,
  // } as MiningBuildOptions;
  // // MRZ-21
  // await Process.buildAndAppendActions(proc, "hydrogen", "mrz21", config21, 1);

  // // MRZ-21
  // config21.unloadFuelTankOnSaveBase = 0;
  // await Process.buildAndAppendActions(proc, "hydrogen", "mrz21", config21, 1);

  /**
   * Loop the process N times
   */
  await proc.repeat(repeat);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
