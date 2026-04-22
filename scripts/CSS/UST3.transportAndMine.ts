import Dispatcher from "../../src/Model/Dispatcher";
import { DockAction } from "../../src/Model/DockAction";
import { Coordinates } from "../../src/Model/MoveAction";
import { FleetProcess as Process } from "../../src/Model/FleetProcess";
import { StartMiningAction } from "../../src/Model/StartMiningAction";
import { StopMiningAction } from "../../src/Model/StopMining";
import { SubwarpAction } from "../../src/Model/SubwarpAction";
import { TransferCargoAction } from "../../src/Model/TransferCargoAction";
import { UnDockAction } from "../../src/Model/UndockAction";
import { WarpAction } from "../../src/Model/WarpAction";
import { argv } from "../../src/gameHandlers/GameHandler";
/**
 *  Provide Transfer resources between CSS and UST-3 with mining on UST-3 before go back
 *    mining times 1: unload carbon to CSS
 *    - Layer1 - using Base Actions chain
 */
async function run() {
  console.time("init_dispatcher");
  const dispatcher = await Dispatcher.build();
  console.timeEnd("init_dispatcher");
  console.time("Full execution tme");
  // dispatcher.sageFleetHandler.getFleetAccount()
  let args = {
    sageFleetHandler: dispatcher.sageGameHandler,
    sageGameHandler: dispatcher.sageFleetHandler,
  };

  /** Provide pointer reference to handlers */
  let proc = new Process(dispatcher, "pernik", new Coordinates(40, 30));
  let startMiningAction = new StartMiningAction(
    proc,
    "carbon", // resource
    1, // hardness - should getfrom mine account that will be minned
    1, // richness
    //, 52 * 60 + 42 // timeTo mine ( posible calculation )
    { autoStop: false },
  );
  let foodCost = 386;
  console.log("========== Food Cost", foodCost);
  let fleetReloadCss = new TransferCargoAction(proc, [
    {
      isImportToFleet: true,
      resourceName: "fuel",
      amount: "max",
      cargoType: "fuelTank",
      condition: { whenLessThen: 2 * (8795 + 332) + 333 },
    },
    {
      isImportToFleet: true,
      resourceName: "electronics",
      amount: Math.floor((69562 - foodCost) / 2), // / 2
    },
    {
      isImportToFleet: true,
      resourceName: "food",
      // amount: 26696,
      amount: foodCost,
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

  let depositCargoToStarbaseUst3 = new TransferCargoAction(proc, [{ isImportToFleet: false, resourceName: "electronics", amount: "max" }]);

  let depositCargoToStarbaseCss = new TransferCargoAction(proc, [
    { isImportToFleet: false, resourceName: "carbon", amount: 1000000 }, // Big number more then cargo to unload all when do not know the amount
  ]);

  let moveFromUST2toUST1 = new WarpAction(proc, new Coordinates(40, 30));

  console.log("Start Step:", argv.startStep);
  // Mining Process
  //0
  proc.addAction(fleetReloadCss);
  //--startStep 1
  proc.addAction(new UnDockAction(proc));
  //--startStep 2
  proc.addAction(new WarpAction(proc, new Coordinates(47, 32)));
  //--startStep 3
  proc.addAction(new SubwarpAction(proc, new Coordinates(48, 32)));
  //--startStep 5
  proc.addAction(new DockAction(proc));
  //--startStep 7
  proc.addAction(depositCargoToStarbaseUst3);

  // /// Mining
  //--startStep 6
  // proc.addAction(fleetReloadUst2mining);
  //--startStep 8
  proc.addAction(new UnDockAction(proc));
  //--startStep 9
  proc.addAction(startMiningAction);
  //--startStep 10
  proc.addAction(new StopMiningAction(proc));

  // Load And Transport
  //--startStep 11
  proc.addAction(new WarpAction(proc, new Coordinates(41, 30)));
  //--startStep 12
  proc.addAction(new SubwarpAction(proc, new Coordinates(40, 30)));
  //--startStep 14
  proc.addAction(new DockAction(proc));
  //--startStep 164
  proc.addAction(depositCargoToStarbaseCss);

  await proc.repeat();
}
run().catch((err) => {
  console.error(err);
  process.exit(1);
});
