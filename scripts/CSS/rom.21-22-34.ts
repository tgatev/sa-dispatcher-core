import { Coordinates } from "../../src/Model/MoveAction";
import { MiningBuildOptions, Process } from "../../src/Model/FleetProcess";
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
   * Transport FUEL for Food
   *  : Fuel to UST-1
   *  : Food to MRZ-21
   */

  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation
  let config21 = {
    miningTimes: 0,
    movementMode: "Hybrid",
    subwarpDistance: 2,
    // pathToMiningStarbase: [new Coordinates(26, 14), new Coordinates(25, 14)],
    pathToSafeStarbase: [new Coordinates(32, 21), new Coordinates(33, 22), new Coordinates(40, 29), new Coordinates(40, 30)],
    // fuelTankToMiningBase: true,
    ammoBankToMiningBase: true,
    transportToMiningBase: [{ resourceName: "polymer", percent: 1 }],
    fuelTankToSaveStarbase: true,
    // ammoBankToSaveStarbase: true,
    loadTravelingFuelOnMiningBase: true,
    transportToSafeStarbase: [{ resourceName: "crystal_lattice", percent: 1 }],
    unloadFuelTankOnSaveBase: true,
  } as MiningBuildOptions;
  // MRZ-21
  await Process.buildAndAppendActions(proc, "hydrogen", "mrz21", config21, 1);

  // MRZ-21
  config21.unloadFuelTankOnSaveBase = 0;
  await Process.buildAndAppendActions(proc, "hydrogen", "mrz21", config21, 1);

  // MRZ-22
  await Process.buildAndAppendActions(
    proc,
    "carbon",
    "mrz22",
    {
      miningTimes: 0,
      movementMode: "Hybrid",
      pathToMiningStarbase: [new Coordinates(37, 21), new Coordinates(37, 20), new Coordinates(36, 17), new Coordinates(35, 16)],
      // fuelTankToMiningBase: true,
      ammoBankToMiningBase: true,
      transportToMiningBase: [{ resourceName: "ammunitions", percent: 1 }],

      pathToSafeStarbase: [new Coordinates(38, 25), new Coordinates(38, 26), new Coordinates(39, 29), new Coordinates(40, 30)],
      // loadTravelingFuelOnMiningBase: true,
      transportToSafeStarbase: [{ resourceName: "graphene", percent: 1 }],
      // unloadAmmoBankOnSaveBase: 0,
    },
    1
  );

  // MRZ-34
  await Process.buildAndAppendActions(
    proc,
    "lumanite",
    "mrz34",
    {
      miningTimes: 0,
      movementMode: "Hybrid",
      pathToMiningStarbase: [new Coordinates(30, 31), new Coordinates(29, 31), new Coordinates(23, 31), new Coordinates(22, 31)],
      // transportToMiningBase: [{ resourceName: "ammunitions", percent: 1 }],

      pathToSafeStarbase: [new Coordinates(32, 31), new Coordinates(33, 31), new Coordinates(39, 30), new Coordinates(40, 30)],
      transportToSafeStarbase: [{ resourceName: "lumanite", percent: 1 }],
      // unloadFuelTankOnSaveBase: 0,
      unloadFuelTankOnSaveBase: true,
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

  // let optionsUST22 = {
  //   miningTimes: 3,
  // } as MiningBuildOptions;
  // let mine = await proc.generateMiningProcessSteps(miningBaseUST22, miningResourceUST22, optionsUST22);
  // proc.actionsChain.push(...mine.actions);
  // proc.actionsChain.push(...mine.actions);
  // proc.actionsChain.push(...mine.actions);
  /**
   * Loop the process N times
   */
  await proc.repeat(repeat);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
