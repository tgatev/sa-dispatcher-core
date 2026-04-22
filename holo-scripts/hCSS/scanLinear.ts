import { Coordinates } from "../../src/Model/MoveAction";
import { MiningBuildOptions } from "../../src/Model/FleetProcess";
import { SageGameHandler, argv } from "../../src/holoHandlers/GameHandler";
import { ProcessHolosim as Process } from "../../src/holoHandlers/HolosimMintsImporter";
import { generateStepsFromStart } from "../../src/Common/SectorMap";
import { SubwarpAction } from "../../src/Model/SubwarpAction";
import { Fleet, ShipStats } from "@staratlas/holosim";
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
// const movementMode: "Warp" | "Subwarp" = "Warp";
const direction: "l" | "r" | "t" | "b" = argv.dir || "left";
async function run() {
  const saveStarbaseName = "ust1"; // ust1 ust2 ust3 ust4 ust5 - mrz21
  /** Provide pointer reference to handlers */

  const samyManualScanLiner = (fleetName: string) => {};

  let proc = await Process.build(undefined, saveStarbaseName);

  while (true) {
    let fa = (await proc.fetchFleetAccount()) as unknown as Fleet;
    let checkTimeout = (fa.data.stats as ShipStats).miscStats.scanCoolDown / 4; // seconds;
    let currentSector = await proc.dispatcher.sageFleetHandler.getCurrentSector(fa as any);
    let expired = Date.now() > Number(fa.data.scanCooldownExpiresAt) * 1000;

    let [nextSector] = generateStepsFromStart([currentSector.x, currentSector.y], "l", 1);
    if (expired) {
      // wait and try again - fleet is moving only when scan is on cooldown
      await new Promise((res) => setTimeout(res, checkTimeout));
      // wait for scann action before be ing moved
      console.log(proc.fleetName, "Waiting for scan before move to ", nextSector[0], ",", nextSector[1]);
      continue;
    }
    let sw = new SubwarpAction(proc, new Coordinates(nextSector[0], nextSector[1]));
    await sw.run();
    // Manual move
    // await prompt("Press enter to move");
  }
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
