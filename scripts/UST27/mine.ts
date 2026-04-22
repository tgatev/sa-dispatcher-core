import { MiningBuildOptions, Process } from "../../src/Model/FleetProcess";
import { SageGameHandler } from "../../src/gameHandlers/GameHandler";
// process.env["TRANSACTION_PRIORITY_FEE_LIMIT"] = "5000";
// process.env["TRANSACTION_PRIORITY_FEE_CAP"] = "20000";
// process.env["TRANSACTION_PRIORITY_FEE_MIN_CHANCE"] = "90";
// process.env["TRANSACTION_PRIORITY_FEE_INCREASE_STEP"] = "5000";
// process.env["TRANSACTION_PRIORITY_FEE_INCREASE_BASE_FEE"] = "100";
// process.env["SOLANA_RPC_TRANSACTION_URL"] = "https://mainnet.helius-rpc.com/?api-key=3206000a-59df-4aa0-89dd-dcc6bfd01867";
async function run() {
  const saveStarbaseName = "mrz27";
  /** Provide pointer reference to handlers */
  let proc = await Process.build("ᚨᛚᚱᚹᛃ🎆🌌🌠", saveStarbaseName);
  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation
  // proc.dispatcher.logger.setVerbosity(-1);
  let miningBase = await SageGameHandler.readStarbaseByName("mrz27");
  let miningResource = await SageGameHandler.readStarbaseResource(miningBase, "lumanite");

  let options = {
    miningTimes: 1,
  } as MiningBuildOptions;

  console.log(JSON.stringify(options));
  proc.actionsChain.push(...(await proc.generateMiningProcessSteps(miningBase, miningResource, options)).actions);
  // Import resource: fuel, 556200, cargo: fuelTank <whenLessThen> {556200}
  // Import resource: ammunitions, max, cargo: ammoBank <whenLessThen> {56194}
  // Import resource: food, 93130, cargo: cargoHold <whenLessThen> {93130}

  // proc.actionsChain[0] = new TransferCargoAction(proc, [
  //   {
  //     isImportToFleet: true,
  //     amount: "max",
  //     cargoType: "fuelTank",
  //     resourceName: "fuel",
  //     condition: {
  //       whenLessThen: 40000,
  //     },
  //   },
  //   {
  //     isImportToFleet: true,
  //     amount: "max",
  //     cargoType: "ammoBank",
  //     resourceName: "ammunitions",
  //     condition: {
  //       whenLessThen: 56194,
  //     },
  //   },
  //   {
  //     isImportToFleet: true,
  //     amount: 93130,
  //     resourceName: "food",
  //     condition: {
  //       whenLessThen: 93130,
  //     },
  //   },
  // ]);
  await proc.repeat(1000);
  throw "DDD";
}
run().catch((err) => {
  console.error(err);
  process.exit(1);
});
