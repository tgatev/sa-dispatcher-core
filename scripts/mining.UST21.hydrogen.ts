import Dispatcher from "../src/Model/Dispatcher";
import { DockAction } from "../src/Model/DockAction";
import { Coordinates } from "../src/Model/MoveAction";
import { FleetProcess as Process } from "../src/Model/FleetProcess";
import { StartMiningAction } from "../src/Model/StartMiningAction";
import { StopMiningAction } from "../src/Model/StopMining";
import { TransferCargoAction } from "../src/Model/TransferCargoAction";
import { UnDockAction } from "../src/Model/UndockAction";
import { argv } from "../src/gameHandlers/GameHandler";

process.env["TRANSACTION_PRIORITY_FEE_LIMIT"] = "10000";
process.env["TRANSACTION_PRIORITY_FEE_CAP"] = "100000";
process.env["TRANSACTION_PRIORITY_FEE_MIN_CHANCE"] = "70";
process.env["TRANSACTION_PRIORITY_FEE_INCREASE_STEP"] = "10000";
process.env["TRANSACTION_PRIORITY_FEE_INCREASE_BASE_FEE"] = "5000";
// process.env["SOLANA_RPC_URL"] = process.env.SOLANA_RPC_TRANSACTION_URL;

const fleetName = argv.fleetName || "pernik";
const resource = argv.resource || "hydrogen";
const richness = argv.r || argv.richness || 2;
const hardness = argv.h || argv.hardness || 1;
const miningTime = argv.miningTime || null;
let foodCost = argv.foodCost || null;

async function run() {
  console.time("init_dispatcher");
  const dispatcher = await Dispatcher.build();
  console.timeEnd("init_dispatcher");
  console.time("Full execution tme");

  /** Provide pointer reference to handlers */
  let proc = new Process(dispatcher, fleetName, new Coordinates(30, 40), "");
  proc.fetchFleetAccount();
  let startMiningAction = new StartMiningAction(
    proc,
    resource, // resource
    hardness, // hardness - should getfrom mine account that will be minned
    richness, // richness
    { miningTime: miningTime, autoStop: false }, //, 52 * 60 + 42 // timeTo mine ( posible calculation )
  );
  foodCost = foodCost || (await startMiningAction.calcMiningTimesCosts(4)).food;
  let foodBaseCost = foodCost || (await startMiningAction.getResourceCost()).food;

  let fleetReload = new TransferCargoAction(proc, [
    {
      isImportToFleet: true,
      resourceName: "fuel",
      // amount: 26696,
      amount: "max",
      cargoType: "fuelTank",
      condition: { whenLessThen: 333 },
    },
    {
      isImportToFleet: true,
      resourceName: "food",
      amount: foodCost,
      // cargoType: "cargoHold", // this is default value // food is only in cargoHold
      condition: { whenLessThen: foodBaseCost },
    },
    {
      // Miners do not get ammo to mine but its nice to have opened token account for ammo cause stop mining expect it ( todo: update instruction to check and create associated
      //    token account for ammo in the cargo hold)
      isImportToFleet: true,
      resourceName: "ammunitions",
      amount: "max",
      cargoType: "ammoBank", // this is default value // food is only in cargoHold
      condition: { whenLessThen: 1 },
    },
  ]);

  let depositCargoToStarbase = new TransferCargoAction(proc, [
    {
      isImportToFleet: false,
      resourceName: resource,
      amount: 70000,
    },
  ]);

  console.log("Start Step:", argv.startStep);
  // Mining Process
  //0
  proc.addAction(fleetReload);
  //--startStep 1
  proc.addAction(new UnDockAction(proc));
  //--startStep 2
  proc.addAction(startMiningAction);
  //--startStep 3
  proc.addAction(new StopMiningAction(proc));
  //--startStep 4
  proc.addAction(new DockAction(proc));
  //--startStep 5
  proc.addAction(depositCargoToStarbase);

  await proc.repeat();
}
run().catch((err) => {
  console.error(err);
  process.exit(1);
});
