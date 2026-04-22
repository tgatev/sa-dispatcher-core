import { Process } from "../../src/Model/FleetProcess";

/**
 *  Provide Transfer resources between CSS and UST-4 with mining on UST-4
 *    mining times 1 and unload mined cargo on CSS
 *    - Layer2 - using process generator and process.build()
 */

// Overwrite env values
/**
 *  Provide Transfer resources between CSS and UST-4 with mining on UST-4
 *    mining times 1 and unload mined cargo on CSS
 *    - Layer2 - using process generator and process.build()
 */
// Overwrite env values
process.env["TRANSACTION_PRIORITY_FEE_LIMIT"] = "10000";
process.env["TRANSACTION_PRIORITY_FEE_CAP"] = "20000";
process.env["TRANSACTION_PRIORITY_FEE_MIN_CHANCE"] = "93";
process.env["TRANSACTION_PRIORITY_FEE_INCREASE_STEP"] = "3000";
process.env["TRANSACTION_PRIORITY_FEE_INCREASE_BASE_FEE"] = "100";
process.env["SOLANA_RPC_URL"] = process.env["SLY"];

// const resource = argv.resourceName || "iron_ore";
// const movementMode: "Warp" | "Subwarp" = "Warp";
async function run() {
  const saveStarbaseName = "ust1";
  /** Provide pointer reference to handlers */
  let proc = await Process.build(undefined, saveStarbaseName);
  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation

  await Process.buildAndAppendActions(proc, "lumanite", "mrz34", {
    miningTimes: 1,
    movementMode: "Subwarp",
    // subwarpDistance: 1,
    transportToMiningBase: [
      { resourceName: "food", percent: 1 },
      // { resourceName: "toolkit", percent: 1 },
    ],
    // transportToSafeStarbase: [{ resourceName: "carbon", percent: 1 }],
    // transportToSafeStarbase: [{ resourceName: "graphene", percent: 1 }],
    fuelTankToMiningBase: true,
    ammoBankToMiningBase: true,

    // crewToMiningBase: "max",
    // loadTravelingFuelOnMiningBase: true,
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
//   // load mining resources on mining starbase - means use more cargo for transfer in direction to mining base
//   loadMiningAmmoOnMiningBase: false,
//   loadMiningFuelOnMiningBase: false,
//   loadMiningFoodOnMiningBase: false,

//   // Use thanks for transfer fuel and ammo
//   fuelTankToMiningBase: false,
//   ammoBankToMiningBase: false,

//   fuelTankToSaveStarbase: false,
//   ammoBankToSaveStarbase: false,
// } as MiningBuildOptions;
