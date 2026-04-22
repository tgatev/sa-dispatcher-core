import { MiningBuildOptions } from "../../src/Model/FleetProcess";
import { SageGameHandler, argv } from "../../src/holoHandlers/GameHandler";
import { ProcessHolosim as Process } from "../../src/holoHandlers/HolosimMintsImporter";
import { Resource } from "../../src/holoHandlers/lib/Resource";
import { TransferCargoAction } from "../../src/Model/TransferCargoAction";
import { CustomCombatLogAction } from "../../src/Model/CombatFlowActions";
import { ShipStats } from "@staratlas/holosim/src/ship";
// import { UnDockAction } from "../../src/Model/UndockAction";
// import { prompt } from "../../src/Common/prompt";

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
  const saveStarbaseName = "mrz27"; // ust1 ust2 ust3 ust4 ust5 - mrz21
  /** Provide pointer reference to handlers */
  let proc = await Process.build(undefined, saveStarbaseName);
  let fa = await proc.fetchFleetAccount();
  let mineConsumption = (fa.data.stats as unknown as ShipStats).movementStats.planetExitFuelAmount;
  proc.addAction(new CustomCombatLogAction(proc));

  await buildScenario(
    proc,
    Resource.lumanite,
    "mrz27",
    {
      miningTimes: 1,
    },
    1,
  );

  let load = proc.actionsChain[1] as TransferCargoAction;
  load.resources[1].condition = { whenLessThen: "max" };
  let fuelLoad = load.resources.find((r) => r.resourceName === Resource.fuel && r.cargoType == "fuelTank");
  fuelLoad!.amount = mineConsumption * 2; // Load fuel for 2 trips to be sure about fuel for mining and travel back
  fuelLoad!.condition!.whenLessThen = mineConsumption * 2;

  proc.actionsChain.push(new CustomCombatLogAction(proc));

  await proc.repeat(undefined, argv.startStep);
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
