import { MiningBuildOptions } from "../../src/Model/FleetProcess";
import { SageGameHandler, argv } from "../../src/holoHandlers/GameHandler";
import { ProcessHolosim as Process } from "../../src/holoHandlers/HolosimMintsImporter";
import { Resource } from "../../src/holoHandlers/lib/Resource";
import { CustomCombatLogAction } from "../../src/Model/CombatFlowActions";
import { ShipStats } from "@staratlas/holosim/src/ship";

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
  const saveStarbaseName = "mrz17"; // ust1 ust2 ust3 ust4 ust5 - mrz21
  /** Provide pointer reference to handlers */
  let proc = await Process.build(undefined, saveStarbaseName);
  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation
  proc.addAction(new CustomCombatLogAction(proc));

  let fa = await proc.fetchFleetAccount();
  let mineConsumption = (fa.data.stats as unknown as ShipStats).movementStats.planetExitFuelAmount;

  await buildScenario(
    proc,
    Resource.arco,
    "mrz17",
    {
      miningTimes: 1,
    },
    1,
  );

  // (proc.actionsChain[0] as TransferCargoAction).resources[1].condition = { whenLessThen: "max" };
  // let fuelLoad = (proc.actionsChain[0] as TransferCargoAction).resources.find(
  //   (r) => r.resourceName === Resource.fuel && r.cargoType == "fuelTank",
  // );
  // fuelLoad!.amount = mineConsumption * 2; // Load fuel for 2 trips to be sure about fuel for mining and travel back
  // fuelLoad!.condition!.whenLessThen = mineConsumption * 2;

  // proc.actionsChain.push(new CustomCombatLogAction(proc));

  // (proc.actionsChain[1] as TransferCargoAction).resources[1].condition = { whenLessThen: "max" };
  proc.addAction(new CustomCombatLogAction(proc));

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
