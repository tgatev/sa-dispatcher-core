import Dispatcher from "../../src/Model/Dispatcher";
import { DockAction } from "../../src/Model/DockAction";
import { Coordinates } from "../../src/Model/MoveAction";
import { FleetProcess as Process } from "../../src/Model/FleetProcess";
import { TransferCargoAction } from "../../src/Model/TransferCargoAction";
import { UnDockAction } from "../../src/Model/UndockAction";
import { WarpAction } from "../../src/Model/WarpAction";
import { argv } from "../../src/gameHandlers/GameHandler";
/**
 *  Provide Transfer resources between CSS and UST-2
 *    - Layer1 - using Base Actions chain
 */
async function run() {
  console.time("init_dispatcher");
  const dispatcher = await Dispatcher.build();
  console.timeEnd("init_dispatcher");
  console.time("Full execution tme");

  /** Provide pointer reference to handlers */
  let proc = new Process(dispatcher, "pernik", new Coordinates(40, 30));

  let fleetAccount = await proc.fetchFleetAccount();
  // @ts-ignore type cargoCapacity Never
  let cargoSize: number = fleetAccount.data.stats.cargoStats.cargoCapacity as number;

  let unloadCss_ = new TransferCargoAction(proc, [{ isImportToFleet: false, resourceName: "food", amount: "max" }]);
  let unloadUst4 = new TransferCargoAction(proc, [{ isImportToFleet: false, resourceName: "electromagnet", amount: "max" }]);
  let reloadUst4 = new TransferCargoAction(proc, [{ isImportToFleet: true, resourceName: "food", amount: "max" }]);

  let reloadCss_ = new TransferCargoAction(proc, [
    {
      isImportToFleet: true,
      resourceName: "electromagnet",
      // amount: cargoSize / 2  //  devide by weight,
      amount: "max",
      condition: { whenLessThen: 1 },
    },
    {
      isImportToFleet: true,
      resourceName: "fuel",
      // amount: 26696,
      amount: "max",
      cargoType: "fuelTank",
      condition: { whenLessThen: 13012 + 6 },
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

  console.log("Start Step:", argv.startStep);
  // Transport Process

  //--startStep 0 reloadCss electromagnet / power_source ... etc
  proc.addAction(reloadCss_);
  //--startStep 1 Undock
  proc.addAction(new UnDockAction(proc));
  //--startStep 2 Move To UST5
  proc.addAction(new WarpAction(proc, new Coordinates(42, 35)));
  //--startStep 4 Dock
  proc.addAction(new DockAction(proc));
  //--startStep 5 Unload Cargo on UST5 power_source
  proc.addAction(unloadUst4);
  //--startStep 6 Reload Cargo on UST5 food / biomass ... etc
  proc.addAction(reloadUst4);
  //--startStep 7 Undock
  proc.addAction(new UnDockAction(proc));
  //--startStep 8 Move to CSS
  proc.addAction(new WarpAction(proc, new Coordinates(40, 30)));
  //--startStep 10 Dock
  proc.addAction(new DockAction(proc));
  //--startStep 11 Unload Cargo on CSS food / biomass ... etc
  proc.addAction(unloadCss_);

  await proc.repeat();
}

// Start execution
run().catch((err) => {
  console.error(err);
  process.exit(1);
});
