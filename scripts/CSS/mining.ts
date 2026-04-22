import Dispatcher from "../../src/Model/Dispatcher";
import { DockAction } from "../../src/Model/DockAction";
import { Coordinates } from "../../src/Model/MoveAction";
import { FleetProcess as Process } from "../../src/Model/FleetProcess";
import { StartMiningAction } from "../../src/Model/StartMiningAction";
import { StopMiningAction } from "../../src/Model/StopMining";
import { TransferCargoAction } from "../../src/Model/TransferCargoAction";
import { UnDockAction } from "../../src/Model/UndockAction";
import { argv } from "../../src/gameHandlers/GameHandler";

/**
 *  Provide mining Hydrogen on Ustur CSS
 *    - Layer1 - using base actions flowing
 */
const fleetName = argv.fleetName || "pernik";
const resource = argv.respurcename || "hydrogen";
const richness = argv.r || argv.richness || 1;
const hardness = argv.h || argv.hardness || 1;
const miningTime = argv.miningTime || null;

async function run() {
  console.time("init_dispatcher");
  const dispatcher = await Dispatcher.build();
  console.timeEnd("init_dispatcher");
  console.time("Full execution tme");
  // dispatcher.sageFleetHandler.getFleetAccount()

  /** Provide pointer reference to handlers */
  let proc = new Process(dispatcher, fleetName, new Coordinates(40, 30));
  let startMiningAction = new StartMiningAction(
    proc,
    resource, // resource
    hardness, // hardness - should getfrom mine account that will be minned
    richness, // richness
    { miningTime: miningTime, autoStop: false }, //, 52 * 60 + 42 // timeTo mine ( posible calculation )
  );
  let foodCost = (await startMiningAction.getResourceCost()).food || 0;

  let fleetReload = new TransferCargoAction(proc, [
    {
      isImportToFleet: true,
      resourceName: "fuel",
      // amount: 26696,
      amount: "max",
      cargoType: "fuelTank",
      condition: { whenLessThen: 350 },
    },
    {
      isImportToFleet: true,
      resourceName: "food",
      amount: foodCost,
      // cargoType: "cargoHold", // this is default value // food is only in cargoHold
      condition: { whenLessThen: foodCost },
    },
    {
      // Miners do not get ammo to mine but its nice to have opened token account for ammo cause stop mining expect it ( todo: update instruction to check and create associated
      //    token account for ammo in the cargo hold)
      isImportToFleet: true,
      resourceName: "ammunitions",
      amount: 1,
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
  //--startStep 0
  proc.addAction(fleetReload);
  //--startStep 1
  proc.addAction(new UnDockAction(proc));
  //--startStep 2
  proc.addAction(startMiningAction);
  //--startStep 3
  proc.addAction(new StopMiningAction(proc));
  //--startStep 4
  proc.addAction(new DockAction(proc));
  // //--startStep 5
  proc.addAction(depositCargoToStarbase);

  proc.repeat();
}
run().catch((err) => {
  console.error(err);
  process.exit(1);
});
