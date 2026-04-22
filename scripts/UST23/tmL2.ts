import { MiningBuildOptions, Process } from "../../src/Model/FleetProcess";
import { SageGameHandler } from "../../src/gameHandlers/GameHandler";

process.env["SOLANA_RPC_URL"] = process.env["HELIUS"];
// process.env["SOLANA_RPC_URL_HELLO_MOON_FEE_CHECKER"] = process.env["BACKPACK_HM_RPC"];
async function run() {
  const saveStarbaseName = "mrz23";
  /** Provide pointer reference to handlers */
  let proc = await Process.build(undefined, saveStarbaseName);
  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation

  let miningBase = await SageGameHandler.readStarbaseByName(saveStarbaseName);
  let miningResource = await SageGameHandler.readStarbaseResource(miningBase, undefined);

  let options = {
    miningTimes: 1,
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
