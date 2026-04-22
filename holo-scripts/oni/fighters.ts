// import Dispatcher from "../../src/Model/Dispatcher";
import { Coordinates } from "../../src/Model/MoveAction";
import { FleetProcess as Process } from "../../src/Model/FleetProcess";
import { SubwarpAction } from "../../src/Model/SubwarpAction";
import { TransferCargoAction } from "../../src/Model/TransferCargoAction";
import { argv } from "../../src/gameHandlers/GameHandler";
import { DispatcherHolosim } from "../../src/holoHandlers/HolosimMintsImporter";

/**
 *  Provide mining Hydrogen on Ustur CSS
 *    - Layer1 - using base actions flowing
 */
const fleetName = argv.fleetName || "F1";
const fuelAmount = 8750;
const toCoordinates = new Coordinates(43, 8);
async function run() {
  console.time("init_dispatcher");
  const dispatcher = await DispatcherHolosim.build({ useLookupTables: false });
  console.timeEnd("init_dispatcher");
  console.time("Full execution tme");
  // dispatcher.sageFleetHandler.getFleetAccount()

  /** Provide pointer reference to handlers */
  let proc = new Process(dispatcher, fleetName, new Coordinates(43, 8)); // new Coordinates(40, 30)
  proc.dispatcher.donate = false;

  const unload = (proc: Process) => {
    return new TransferCargoAction(proc, [
      {
        isImportToFleet: false,
        cargoType: "fuelTank",
        resourceName: "fuel",
        // amount: 26696,
        amount: "max",
      },
      {
        isImportToFleet: false,
        resourceName: "food",
        amount: "max",
      },
      {
        // Miners do not get ammo to mine but its nice to have opened token account for ammo cause stop mining expect it ( todo: update instruction to check and create associated
        //    token account for ammo in the cargo hold)
        isImportToFleet: false,
        cargoType: "ammoBank", // this is default value // food is only in cargoHold
        resourceName: "ammunitions",
        amount: "max",
      },
      {
        isImportToFleet: false,
        cargoType: "cargoHold",
        resourceName: "fuel",
        // amount: 26696,
        amount: "max",
      },
    ]);
  };
  const load = (proc: Process) => {
    return new TransferCargoAction(proc, [
      {
        isImportToFleet: true,
        resourceName: "fuel",
        // amount: 26696,
        cargoType: "fuelTank",
        amount: fuelAmount,
      },
    ]);
  };

  const travel = (proc: Process) => {
    let sw = new SubwarpAction(proc, toCoordinates);
    sw.isSafeMove = false;
    return new SubwarpAction(proc, toCoordinates);
  };
  const processes = [];
  for (let i = 1; i <= 9; i++) {
    let fleetName = "F" + i.toString();
    processes.push(new Process(dispatcher, fleetName, toCoordinates));
  }
  let act = processes.map(async (proc, index) => {
    proc.dispatcher.donate = false;
    // proc.addAction(unload(proc));
    proc.addAction(load(proc));
    proc.addAction(travel(proc));
    proc.start();
    console.log(`Process Started ${index} `);
    return "Done";
  });
  await Promise.all(act);
  console.log("All processes started");
}
run().catch((err) => {
  console.error(err);
  process.exit(1);
});
