import { ShipStats } from "@staratlas/sage-main";
import { FleetProcess as Process } from "../src/Model/FleetProcess";
import { TransferCargoAction } from "../src/Model/TransferCargoAction";
import { SageGameHandler, prompt, argv } from "../src/gameHandlers/GameHandler";

// process.env['TRANSACTION_PRIORITY_FEE_LIMIT'] = "5000";
// process.env['TRANSACTION_PRIORITY_FEE_CAP'] = "100000";
// process.env["TRANSACTION_PRIORITY_FEE_MIN_CHANCE"] = "80";
// process.env["TRANSACTION_PRIORITY_FEE_INCREASE_STEP"] = "10000";
// process.env["TRANSACTION_PRIORITY_FEE_INCREASE_BASE_FEE"] = "101";
// process.env["SOLANA_RPC_URL"] = process.env.SOLANA_RPC_TRANSACTION_URL;

let miningTimes = Number(argv.miningTimes);

async function run() {
  /** Provide pointer reference to handlers */
  let miningStarbase = SageGameHandler.starbaseMap.mrz23;
  let proc = await Process.build(undefined, "mrz23");
  // Validate resource input
  let resource = await SageGameHandler.readStarbaseResource(miningStarbase, undefined);

  while (!miningTimes) {
    miningTimes = Number((await prompt("Mining Times per single load of food, fuel and ammo:")).trim());
  }

  await proc.generateMiningProcessSteps(miningStarbase, resource, {
    miningTimes: miningTimes,
  });

  // if the fleet is only miner no need to load resurces in thes scenario cause
  //   1 there is no added transportation of them
  //   2 there is no consumption rate
  let fleetAccount = await proc.fetchFleetAccount();
  let fleetStats: ShipStats = fleetAccount.data.stats;
  if (fleetStats.cargoStats.ammoConsumptionRate == 0) {
    let ammoCondition = (proc.actionsChain[0] as TransferCargoAction).resources[1].condition;
    if (ammoCondition) ammoCondition.whenLessThen = 1;
  }

  await proc.repeat();
}
run().catch((err) => {
  console.error(err);
  process.exit(1);
});
