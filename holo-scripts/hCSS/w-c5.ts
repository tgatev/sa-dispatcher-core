import { MiningBuildOptions } from "../../src/Model/FleetProcess";
import { SageGameHandler } from "../../src/holoHandlers/GameHandler";
import { ProcessHolosim as Process } from "../../src/holoHandlers/HolosimMintsImporter";

/**
 *  Provide Transfer resources between CSS and UST-4 with mining on UST-4
 *    mining times 1 and unload mined cargo on CSS
 *    - Layer2 - using process generator and process.build()
 */

// Overwrite env values
// process.env['TRANSACTION_PRIORITY_FEE_LIMIT'] = "15000";
// process.env['TRANSACTION_PRIORITY_FEE_CAP'] = "100000";
// process.env["TRANSACTION_PRIORITY_FEE_MIN_CHANCE"] = "75";
// process.env["TRANSACTION_PRIORITY_FEE_INCREASE_STEP"] = "3000";
// process.env["TRANSACTION_PRIORITY_FEE_INCREASE_BASE_FEE"] = "10";

// const resource = argv.resourceName || "iron_ore";
// const movementMode: "Warp" | "Subwarp" = "Warp";
async function run() {
  const saveStarbaseName = "ust1"; // ust1 ust2 ust3 ust4 ust5 - mrz21
  /** Provide pointer reference to handlers */
  let proc = await Process.build(undefined, saveStarbaseName);
  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation

  await buildScenario(
    proc,
    "carbon",
    "ust3",
    {
      miningTimes: 1,
      movementMode: "Warp",
    },
    1
  );
  await buildScenario(
    proc,
    "hydrogen",
    "ust1",
    {
      miningTimes: 1,
    },
    1
  );

  // await buildScenario(
  //   proc,
  //   "biomass",
  //   "ust2",
  //   {
  //     miningTimes: 1,
  //     movementMode: "Warp",
  //   },
  //   1
  // );
  await buildScenario(
    proc,
    "hydrogen",
    "ust1",
    {
      miningTimes: 1,
    },
    1
  );

  // await buildScenario(
  //   proc,
  //   "iron_ore",
  //   "ust4",
  //   {
  //     miningTimes: 1,
  //     movementMode: "Warp",
  //   },
  //   1
  // );
  await buildScenario(
    proc,
    "hydrogen",
    "ust1",
    {
      miningTimes: 1,
    },
    1
  );

  await buildScenario(
    proc,
    "copper_ore",
    "ust5",
    {
      miningTimes: 1,
      movementMode: "Warp",
    },
    1
  );
  await buildScenario(
    proc,
    "hydrogen",
    "ust1",
    {
      miningTimes: 1,
    },
    1
  );
  // await buildScenario(
  //   proc,
  //   "biomass",
  //   "ust2",
  //   {
  //     miningTimes: 1,
  //     movementMode: "Warp",
  //   },
  //   1
  // );
  await buildScenario(
    proc,
    "silica",
    "mrz34",
    {
      miningTimes: 1,
    },
    1
  );

  await buildScenario(
    proc,
    "hydrogen",
    "ust1",
    {
      miningTimes: 1,
    },
    1
  );

  await proc.repeat();
}
run().catch((err) => {
  console.error(err);
  process.exit(1);
});

async function buildScenario(proc: Process, resourceName: string, miningBase: string, options: MiningBuildOptions, times = 1) {
  let miningSB = await SageGameHandler.readStarbaseByName(miningBase);
  let miningResource = await SageGameHandler.readStarbaseResource(miningSB, resourceName);
  let steps = await proc.generateMiningProcessSteps(miningSB, miningResource, options);
  for (let i = 0; i < times; i++) proc.actionsChain.push(...steps.actions);
}

// let options = {
//   miningTimes: 1,
//   movementMode: "Warp",
//   pathToMiningStarbase: [new Coordinates(38, 25)],
//   pathToSafeStarbase: [new Coordinates(40, 300)],
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
