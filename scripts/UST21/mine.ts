import { MiningBuildOptions, Process } from "../../src/Model/FleetProcess";
import { SageGameHandler } from "../../src/gameHandlers/GameHandler";
// process.env["TRANSACTION_PRIORITY_FEE_LIMIT"] = "5000";
// process.env["TRANSACTION_PRIORITY_FEE_CAP"] = "20000";
// process.env["TRANSACTION_PRIORITY_FEE_MIN_CHANCE"] = "90";
// process.env["TRANSACTION_PRIORITY_FEE_INCREASE_STEP"] = "5000";
// process.env["TRANSACTION_PRIORITY_FEE_INCREASE_BASE_FEE"] = "100";
// process.env["SOLANA_RPC_TRANSACTION_URL"] = "https://mainnet.helius-rpc.com/?api-key=3206000a-59df-4aa0-89dd-dcc6bfd01867";
async function run() {
  const saveStarbaseName = "mrz21";
  /** Provide pointer reference to handlers */
  let proc = await Process.build("ᚨᛚᚱᚹᛃ🎆🌌🌠", saveStarbaseName);
  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation
  // proc.dispatcher.logger.setVerbosity(-1);
  let miningBase = await SageGameHandler.readStarbaseByName("mrz21");
  let miningResource = await SageGameHandler.readStarbaseResource(miningBase, "hydrogen");

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
