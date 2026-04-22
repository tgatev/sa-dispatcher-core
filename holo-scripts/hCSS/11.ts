import { buildLootRetrieveHealerActions, cleanUpFoodLodLoads, forceAmmoLoading, MiningBuildOptions } from "../../src/Model/FleetProcess";
import { SageGameHandler, argv } from "../../src/holoHandlers/GameHandler";
import { ProcessHolosim as Process } from "../../src/holoHandlers/HolosimMintsImporter";
import { Resource } from "../../src/holoHandlers/lib/Resource";
import { iCargoTransferData, TransferCargoAction } from "../../src/Model/TransferCargoAction";
const resource = argv.rn || Resource.iron_ore;
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
async function run(fleetName: string | undefined = undefined) {
  const saveStarbaseName = "mrz11"; // ust1 ust2 ust3 ust4 ust5 - mrz21
  /** Provide pointer reference to handlers */
  let proc = await Process.build(fleetName, saveStarbaseName);
  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation

  await buildScenario(
    proc,
    Resource.gold_ore,
    "mrz11",
    {
      miningTimes: 1,
      bundleDockUndock: true,
    },
    1,
  );

  await buildScenario(
    proc,
    Resource.carbon,
    "mrz11",
    {
      miningTimes: 1,
      bundleDockUndock: true,
    },
    1,
  );

  forceAmmoLoading(proc); // Force loading ammo for right cargo calculation - if not enough cargo for transfer action - process will try to load ammo to fill cargo and make transfer - this is workaround for right cargo calculation without need to provide empty cargo on start
  cleanUpFoodLodLoads(proc); // Clean up food and lod transfer for right cargo calculation

  await proc.repeat(100000, argv.startStep);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

async function buildScenario(proc: Process, resourceName: string, miningBase: string, options: MiningBuildOptions, times = 1) {
  let miningSB = await SageGameHandler.readStarbaseByName(miningBase);
  let miningResource = await SageGameHandler.readStarbaseResource(miningSB, resourceName);
  let steps = await proc.generateMiningProcessSteps(miningSB, miningResource, options);

  for (let i = 0; i < times; i++) {
    proc.actionsChain.push(...steps.actions);

    await buildLootRetrieveHealerActions(proc, 0); // append retrieve loot and heal actions
  }
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
