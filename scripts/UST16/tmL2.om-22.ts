import { Coordinates } from "../../src/Model/MoveAction";
import { MiningBuildOptions, Process } from "../../src/Model/FleetProcess";
import { SageGameHandler } from "../../src/gameHandlers/GameHandler";

async function run() {
  const saveStarbaseName = "mrz16";
  /** Provide pointer reference to handlers */
  let proc = await Process.build(undefined, saveStarbaseName);
  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation

  let miningBase = await SageGameHandler.readStarbaseByName("mrz22");
  let miningResource = await SageGameHandler.readStarbaseResource(miningBase, "carbon");

  let options = {
    miningTimes: 0,
    movementMode: "Hybrid",
    ammoBankToSaveStarbase: true,
    pathToMiningStarbase: [new Coordinates(37, 7), new Coordinates(37, 8), new Coordinates(35, 15), new Coordinates(35, 16)],
    pathToSafeStarbase: [new Coordinates(37, 8), new Coordinates(37, 7), new Coordinates(39, 0), new Coordinates(39, -1)],
    transportToMiningBase: [{ resourceName: "titanium_ore", percent: 1 }],
    transportToSafeStarbase: [{ resourceName: "power_source", percent: 1 }],
  } as MiningBuildOptions;

  console.log(JSON.stringify(options));
  proc.actionsChain.push(...(await proc.generateMiningProcessSteps(miningBase, miningResource, options)).actions);

  await proc.repeat(1000);
  throw "DDD";
}
run().catch((err) => {
  console.error(err);
  process.exit(1);
});
