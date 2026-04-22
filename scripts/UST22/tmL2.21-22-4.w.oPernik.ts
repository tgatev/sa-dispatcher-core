import { Process } from "../../src/Model/FleetProcess";
import { SageGameHandler, argv } from "../../src/gameHandlers/GameHandler";

/**
 *  Provide Transfer resources between CSS and UST-4 with mining on UST-4
 *    mining times 1 and unload minned cargo on CSS
 *    - Layer2 - using process generator and process.build()
 */

// Overwrite env values
// process.env["TRANSACTION_PRIORITY_FEE_LIMIT"] = "15000";
// process.env["TRANSACTION_PRIORITY_FEE_CAP"] = "100000";
// process.env["TRANSACTION_PRIORITY_FEE_MIN_CHANCE"] = "75";
// process.env["TRANSACTION_PRIORITY_FEE_INCREASE_STEP"] = "10000";
// process.env["TRANSACTION_PRIORITY_FEE_INCREASE_BASE_FEE"] = "5000";

// const resource = argv.resourceName || "iron_ore";
// const movementMode: "Warp" | "Subwarp" = "Warp";
async function run() {
  const saveStarbaseName = "mrz22";
  /** Provide pointer reference to handlers */
  let proc = await Process.build(undefined, saveStarbaseName);
  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation

  // await Process.buildAndAppendActions(proc, "hydrogen", "mrz21", {
  //   miningTimes: 2,
  //   movementMode: "Warp",
  //   // pathToSafeStarbase: [new Coordinates(40, 29), new Coordinates(40, 30)],
  //   transportToMiningBase: [{ resourceName: "energy_substrate", percent: 1 }],
  //   // transportToMiningBase: [{ resourceName: "field_stabilizer", percent: 1 }],
  //   ammoBankToMiningBase: true,
  //   fuelTankToSaveStarbase: true,
  //   loadTravelingFuelOnMiningBase: true,
  //   // loadMiningAmmoOnMiningBase: true,
  //   // transportToSafeStarbase: [{ resourceName: "crystal_lattice", percent: 1 }],
  // });

  // await Process.buildAndAppendActions(proc, "carbon", "mrz22", {
  //   miningTimes: 1,
  // });

  // await Process.buildAndAppendActions(proc, "hydrogen", "mrz21", {
  //   miningTimes: 2,
  //   movementMode: "Warp",
  //   // pathToSafeStarbase: [new Coordinates(40, 29), new Coordinates(40, 30)],
  //   transportToMiningBase: [{ resourceName: "energy_substrate", percent: 1 }],
  //   // transportToMiningBase: [{ resourceName: "field_stabilizer", percent: 1 }],
  //   ammoBankToMiningBase: true,
  //   fuelTankToSaveStarbase: true,
  //   loadTravelingFuelOnMiningBase: true,
  //   // loadMiningAmmoOnMiningBase: true,
  //   // transportToSafeStarbase: [{ resourceName: "crystal_lattice", percent: 1 }],
  // });

  // await Process.buildAndAppendActions(proc, "carbon", "mrz22", {
  //   miningTimes: 1,
  // });

  await Process.buildAndAppendActions(proc, "iron_ore", "ust4", {
    miningTimes: 2,
    movementMode: "Warp",
    transportToMiningBase: [{ resourceName: "electromagnet", percent: 1 }],
    ammoBankToMiningBase: true,
    // transportToSafeStarbase: [{ resourceName: "crystal_lattice", percent: 1 }],
  });

  await Process.buildAndAppendActions(proc, "carbon", "mrz22", {
    miningTimes: 1,
  });
  await Process.buildAndAppendActions(proc, "iron_ore", "ust4", {
    miningTimes: 2,
    movementMode: "Warp",
    transportToMiningBase: [{ resourceName: "electromagnet", percent: 1 }],
    ammoBankToMiningBase: true,
    // transportToSafeStarbase: [{ resourceName: "crystal_lattice", percent: 1 }],
  });

  await Process.buildAndAppendActions(proc, "copper_ore", "mrz22", {
    miningTimes: 1,
  });
  await proc.repeat();
}
run().catch((err) => {
  console.error(err);
  process.exit(1);
});

// let options = {
//   miningTimes: 1,
//   movementMode: "Warp",
//   pathToMiningStarbase: [new Coordinates(38, 25)],
//   pathToSafeStarbase: [new Coordinates(40, 30)],
//   transportToMiningBase: [{ resourceName: "electromagnet", percent: 1 }],
//   transportToSafeStarbase: [{ resourceName: "iron", percent: 1 }],
//   loadTravelingFuelOnMiningBase: false,
//   // load minig resources on mining starbase - means use more cargo for transer in direction to mining base
//   loadMiningAmmoOnMiningBase: false,
//   loadMiningFuelOnMiningBase: false,
//   loadMiningFoodOnMiningBase: false,

//   // Use thanks for transfer fuel and ammo
//   fuelTankToMiningBase: false,
//   ammoBankToMiningBase: false,

//   fuelTankToSaveStarbase: false,
//   ammoBankToSaveStarbase: false,
// } as MiningBuildOptions;
