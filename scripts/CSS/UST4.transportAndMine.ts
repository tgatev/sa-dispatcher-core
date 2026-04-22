import Dispatcher from "../../src/Model/Dispatcher";
import { DockAction } from "../../src/Model/DockAction";
import { Coordinates } from "../../src/Model/MoveAction";
import { FleetProcess as Process } from "../../src/Model/FleetProcess";
import { StartMiningAction } from "../../src/Model/StartMiningAction";
import { StopMiningAction } from "../../src/Model/StopMining";
import { TransferCargoAction } from "../../src/Model/TransferCargoAction";
import { UnDockAction } from "../../src/Model/UndockAction";
import { WarpAction } from "../../src/Model/WarpAction";
import { argv } from "../../src/gameHandlers/GameHandler";
/**
 *  Provide Transfer resources between CSS and UST-4 with mining on UST-4 before go back
 *    mining times N: unload biomass on UST-4 and Transfer Food to CSS
 *    - Layer1 - using Base Actions chain
 *  ###### Example:
 *  ## PriorityFee Config for singular actions - see Undock|Dock
 */
async function run() {
  console.time("init_dispatcher");
  const dispatcher = await Dispatcher.build();
  console.timeEnd("init_dispatcher");
  console.time("Full execution tme");
  let foodCost = 772;
  let fuelCost = 6506 * 2 + 333 + 1;

  /** Provide pointer reference to handlers */
  let proc = new Process(dispatcher, "pernik", new Coordinates(40, 30));
  let fleetAccount = await proc.fetchFleetAccount();
  //@ts-ignore cargoCapacity type never
  let cargoSpace: number = fleetAccount.data.stats.cargoStats.cargoCapacity;

  let miningResource = "iron_ore";
  let transportResource = "electromagnet";
  let transportAmount = (cargoSpace - foodCost) / 4;

  let startMiningAction = new StartMiningAction(
    proc,
    miningResource, // resource
    2, // hardness - should getfrom mine account that will be minned
    1, // richness
    //, 52 * 60 + 42 // timeTo mine ( posible calculation )
    { autoStop: false },
  );

  let cssReload = new TransferCargoAction(proc, [
    {
      isImportToFleet: true,
      resourceName: "fuel",
      // amount: 26696,
      amount: "max",
      cargoType: "fuelTank",
      condition: { whenLessThen: fuelCost },
    },
    {
      isImportToFleet: true,
      resourceName: "food",
      amount: 1 * foodCost,
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
    {
      isImportToFleet: true,
      resourceName: transportResource,
      amount: Math.floor(transportAmount),
    },
  ]);
  let ust5Unload = new TransferCargoAction(proc, [{ isImportToFleet: false, resourceName: transportResource, amount: "max" }]);

  let depositCargoToStarbase = new TransferCargoAction(proc, [{ isImportToFleet: false, resourceName: miningResource, amount: "max" }]);

  let moveFromUST1ToUST5 = new WarpAction(proc, new Coordinates(38, 25));

  let moveFromUST5toUST1 = new WarpAction(proc, new Coordinates(40, 30));

  console.log("Start Step:", argv.startStep);
  // Mining Process
  //--startStep 0
  proc.addAction(cssReload);
  //--startStep 1
  let uda1 = new UnDockAction(proc);
  // uda1.priorityFeeConfig = { enable: true, increaseBaseFee: 5000 };
  proc.addAction(uda1);
  //--startStep 2
  proc.addAction(moveFromUST1ToUST5);
  //--startStep 3
  let da1 = new DockAction(proc);
  // da1.priorityFeeConfig = { enable: true, increaseBaseFee: 5000 };
  proc.addAction(da1);
  //--startStep 4
  proc.addAction(ust5Unload);
  //--startStep 5
  let uda2 = new UnDockAction(proc);
  // uda2.priorityFeeConfig = { enable: true, increaseBaseFee: 5000 };
  proc.addAction(uda2);
  //--startStep 6
  proc.addAction(startMiningAction);
  //--startStep 7
  proc.addAction(new StopMiningAction(proc));
  //--startStep 8
  proc.addAction(moveFromUST5toUST1);
  //--startStep 9
  let da2 = new DockAction(proc);
  // da2.priorityFeeConfig = { enable: true, increaseBaseFee: 5000 };
  proc.addAction(da2);
  //--startStep 11
  proc.addAction(depositCargoToStarbase);

  await proc.repeat();
}
run().catch((err) => {
  console.error(err);
  process.exit(1);
});
