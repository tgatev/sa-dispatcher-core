import { ShipStats } from "@staratlas/sage-main";
import { DockAction } from "../../src/Model/DockAction";
import { Coordinates } from "../../src/Model/MoveAction";
import { Process } from "../../src/Model/FleetProcess";
import { TransferCargoAction } from "../../src/Model/TransferCargoAction";
import { UnDockAction } from "../../src/Model/UndockAction";
import { SubwarpAction } from "../../src/Model/SubwarpAction";

/**
 *  Provide Transfer resources between CSS and UST-21 with mining on UST-21 by Hybrid Mode and Process.generatePathActions()
 *    - Layer1 - using Base Actions chain
 */

async function run() {
  console.time("init_dispatcher");
  // const dispatcher = await Dispatcher.build({ useLookupTables: true });
  console.timeEnd("init_dispatcher");
  console.time("Full execution tme");

  /** Provide pointer reference to handlers */
  // let proc = new Process(dispatcher, "pernik", new Coordinates(25, 14));
  let proc = await Process.build(undefined, "mrz21");
  let fleetAccount = await proc.fetchFleetAccount();
  let fleetStats = fleetAccount.data.stats as ShipStats;
  // @ts-ignore type cargoCapacity Never
  let cargoSize: number = fleetAccount.data.stats.cargoStats.cargoCapacity as number;
  // Cargo loads
  let unloadCss_ = new TransferCargoAction(proc, [
    { isImportToFleet: false, resourceName: "titanium_ore", amount: "max", condition: { whenMoreThen: 0 } },
    { isImportToFleet: true, resourceName: "ammunitions", amount: "max", cargoType: "ammoBank" },
    { isImportToFleet: true, resourceName: "food", cargoType: "cargoHold", amount: 79380 },
  ]);

  let reloadUst21 = new TransferCargoAction(proc, [
    { isImportToFleet: false, resourceName: "food", amount: "max", condition: { whenMoreThen: 0 } },
    { isImportToFleet: false, resourceName: "ammunitions", amount: "max", cargoType: "ammoBank", condition: { whenMoreThen: 0 } },
    { isImportToFleet: true, resourceName: "fuel", amount: "max", cargoType: "fuelTank" },
    { isImportToFleet: true, resourceName: "field_stabilizer", amount: 13230 },
  ]);

  let reloadUst16 = new TransferCargoAction(proc, [
    { isImportToFleet: false, resourceName: "field_stabilizer", amount: "max" },
    { isImportToFleet: true, resourceName: "titanium_ore", amount: 79380 },
    // { isImportToFleet: true, resourceName: "fuel", amount: "max", cargoType: "fuelTank" },
  ]);

  // Start Point UST 21 to 16 to CSS and back to 21

  proc.addAction(reloadUst21);
  proc.addAction(new UnDockAction(proc, new Coordinates(25, 14)));
  // Travel ( transport ) to UST 16
  proc.addAction(new SubwarpAction(proc, new Coordinates(39, -1), new Coordinates(25, 14)));
  proc.addAction(new DockAction(proc, new Coordinates(39, -1)));
  proc.addAction(reloadUst16);
  proc.addAction(new UnDockAction(proc, new Coordinates(39, -1)));

  // Travel ( transport ) To CSS
  proc.addAction(new SubwarpAction(proc, new Coordinates(40, 30), new Coordinates(39, -1)));
  proc.addAction(new DockAction(proc, new Coordinates(40, 30)));
  proc.addAction(unloadCss_);
  proc.addAction(new UnDockAction(proc, new Coordinates(40, 30)));

  // Travel ( transport ) To 21
  proc.addAction(new SubwarpAction(proc, new Coordinates(25, 14), new Coordinates(40, 30)));
  proc.addAction(new DockAction(proc, new Coordinates(25, 14)));

  // Add Fuel Mining 6* 15min
  // await addHydrogenMining(proc);

  await proc.repeat();
}

// Start execution
run().catch((err) => {
  console.error(err);
  process.exit(1);
});
