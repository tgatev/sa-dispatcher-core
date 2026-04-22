import { Coordinates } from "../../src/Model/MoveAction";
import { MiningBuildOptions, Process } from "../../src/Model/FleetProcess";
import { SageGameHandler } from "../../src/gameHandlers/GameHandler";

/**
 *  Provide Transfer resources between CSS and UST-4 with mining on UST-4
 *    mining times 1 and unload mined cargo on CSS
 *    - Layer2 - using process generator and process.build()
 */

// Overwrite env values
process.env["TRANSACTION_PRIORITY_FEE_LIMIT"] = "1500";
process.env["TRANSACTION_PRIORITY_FEE_CAP"] = "10000";
process.env["TRANSACTION_PRIORITY_FEE_MIN_CHANCE"] = "75";
process.env["TRANSACTION_PRIORITY_FEE_INCREASE_STEP"] = "1000";
process.env["TRANSACTION_PRIORITY_FEE_INCREASE_BASE_FEE"] = "10";

// const resource = argv.resourceName || "iron_ore";
// const movementMode: "Warp" | "Subwarp" = "Warp";
async function run() {
  const saveStarbaseName = "mrz21";
  /** Provide pointer reference to handlers */
  let proc = await Process.build(undefined, saveStarbaseName);
  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation

  await buildScenario(proc, "copper_ore", "ust5", {
    miningTimes: 0,
    movementMode: "Hybrid",
    pathToMiningStarbase: [new Coordinates(29, 23), new Coordinates(29, 24), new Coordinates(30, 27), new Coordinates(30, 28)],
    pathToSafeStarbase: [new Coordinates(26, 19), new Coordinates(26, 18), new Coordinates(25, 15), new Coordinates(25, 14)],
    transportToMiningBase: [
      { resourceName: "field_stabilizer", percent: 1 },
      // { resourceName: "electronics", percent: 0.6 },
      // { resourceName: "toolkit", percent: 0.3 },
    ],
    transportToSafeStarbase: [{ resourceName: "copper_ore", percent: 1 }],
    fuelTankToMiningBase: true,
  });

  await proc.repeat();
}
run().catch((err) => {
  console.error(err);
  process.exit(1);
});

async function buildScenario(proc: Process, resourceName: string, miningBase: string, options: MiningBuildOptions) {
  let miningSB = await SageGameHandler.readStarbaseByName(miningBase);
  let miningResource = await SageGameHandler.readStarbaseResource(miningSB, resourceName);

  console.log(JSON.stringify(options));
  proc.actionsChain.push(...(await proc.generateMiningProcessSteps(miningSB, miningResource, options)).actions);
}

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
