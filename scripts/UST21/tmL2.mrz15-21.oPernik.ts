import { Coordinates } from "../../src/Model/MoveAction";
import { MiningBuildOptions, Process } from "../../src/Model/FleetProcess";
import { SageGameHandler } from "../../src/gameHandlers/GameHandler";

/**
 *  Provide Transfer resources between CSS and UST-4 with mining on UST-4
 *    mining times 1 and unload mined cargo on CSS
 *    - Layer2 - using process generator and process.build()
 */

// Overwrite env values
process.env["TRANSACTION_PRIORITY_FEE_LIMIT"] = "10500";
process.env["TRANSACTION_PRIORITY_FEE_CAP"] = "20000";
process.env["TRANSACTION_PRIORITY_FEE_MIN_CHANCE"] = "93";
process.env["TRANSACTION_PRIORITY_FEE_INCREASE_STEP"] = "5000";
process.env["TRANSACTION_PRIORITY_FEE_INCREASE_BASE_FEE"] = "100";

// const resource = argv.resourceName || "iron_ore";
// const movementMode: "Warp" | "Subwarp" = "Warp";
async function run() {
  const saveStarbaseName = "mrz21";
  /** Provide pointer reference to handlers */
  let proc = await Process.build(undefined, saveStarbaseName);
  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation

  await Process.buildAndAppendActions(proc, "copper_ore", "mrz15", {
    miningTimes: 2,
    movementMode: "Hybrid",
    fuelTankToMiningBase: true,
    // ammoBankToMiningBase: true,
    pathToMiningStarbase: [
      // new Coordinates(22, 6),
      new Coordinates(22, 5),
    ],
    pathToSafeStarbase: [
      //new Coordinates(25, 13),
      new Coordinates(25, 14),
    ],
    transportToMiningBase: [
      { resourceName: "radiation_absorber", percent: 1 },
      // { resourceName: "toolkit", percent: 0.4 },
    ],
    // transportToSafeStarbase: [{ resourceName: "copper", amount: 5 }],
  });

  await Process.buildAndAppendActions(proc, "hydrogen", "mrz21", {
    miningTimes: 2,
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
