import { MiningBuildOptions, Process } from "../../src/Model/FleetProcess";
import { SageGameHandler } from "../../src/gameHandlers/GameHandler";

/**
 *  Provide Transfer resources between CSS and UST-4 with mining on UST-4
 *    mining times 1 and unload minned cargo on CSS
 *    - Layer2 - using process generator and process.build()
 */

// Overwrite env values
// process.env['TRANSACTION_PRIORITY_FEE_LIMIT'] = "15000";
// process.env['TRANSACTION_PRIORITY_FEE_CAP'] = "100000";
// process.env["TRANSACTION_PRIORITY_FEE_MIN_CHANCE"] = "75";
process.env["TRANSACTION_PRIORITY_FEE_INCREASE_STEP"] = "3000";
process.env["TRANSACTION_PRIORITY_FEE_INCREASE_BASE_FEE"] = "100";

// const resource = argv.resourceName || "iron_ore";
// const movementMode: "Warp" | "Subwarp" = "Warp";
async function run() {
  const saveStarbaseName = "ust1";
  /** Provide pointer reference to handlers */
  let proc = await Process.build(undefined, saveStarbaseName);
  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation

  await buildScenario(proc, "iron_ore", "mrz23", {
    miningTimes: 0,
    movementMode: "Subwarp",
    // subwarpDistance: 1.5,
    // pathToMiningStarbase: [new Coordinates(42, 20), new Coordinates(42, 19), new Coordinates(44, 11), new Coordinates(44, 10)],
    // pathToSafeStarbase: [new Coordinates(42, 20), new Coordinates(42, 21), new Coordinates(40, 29), new Coordinates(40, 30)],
    fuelTankToMiningBase: false,
    transportToMiningBase: [
      { resourceName: "electromagnet", percent: 1 },
      // { resourceName: "copper_wire", percent: 1 },
    ],
    transportToSafeStarbase: [{ resourceName: "titanium_ore", percent: 1 }],
    // loadTravelingFuelOnMiningBase: true,
    ammoBankToMiningBase: true,
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
