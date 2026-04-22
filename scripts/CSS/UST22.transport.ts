import Dispatcher from "../../src/Model/Dispatcher";
import { Coordinates } from "../../src/Model/MoveAction";
import { FleetProcess as Process } from "../../src/Model/FleetProcess";
import { SubwarpAction } from "../../src/Model/SubwarpAction";
import { TransferCargoAction } from "../../src/Model/TransferCargoAction";
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
  let proc = new Process(dispatcher, "RoM", new Coordinates(40, 30));

  let fleetAccount = await proc.fetchFleetAccount();
  // @ts-ignore type cargoCapacity Never
  let cargoSize: number = fleetAccount.data.stats.cargoStats.cargoCapacity as number;

  let cssTransfer = new TransferCargoAction(proc, [
    { isImportToFleet: true, resourceName: "fuel", amount: "max", cargoType: "fuelTank" },
    { isImportToFleet: false, resourceName: "steel", amount: "max", condition: { whenMoreThen: 0 } },
    { isImportToFleet: true, resourceName: "hydrogen", amount: 131155 },
  ]);

  let transfer22 = new TransferCargoAction(proc, [
    { isImportToFleet: false, resourceName: "hydrogen", amount: "max", condition: { whenMoreThen: 0 } },
    { isImportToFleet: true, resourceName: "steel", amount: 131155 },
  ]);

  console.log("Start Step:", argv.startStep);
  // Transport Process

  //--startStep 0 reloadCss electromagnet / power_source ... etc
  proc.addAction(cssTransfer);
  //--startStep 2 Move To UST5
  proc.addAction(new WarpAction(proc, new Coordinates(36, 21)));

  //--startStep 3 Move To UST5
  proc.addAction(new SubwarpAction(proc, new Coordinates(35, 20)));
  //--startStep 4 Warp
  proc.addAction(new WarpAction(proc, new Coordinates(35, 17)));
  proc.addAction(new SubwarpAction(proc, new Coordinates(35, 16)));
  proc.addAction(transfer22);

  //--startStep 8 Move to CSS
  proc.addAction(new WarpAction(proc, new Coordinates(38, 25)));
  proc.addAction(new SubwarpAction(proc, new Coordinates(38, 26)));
  //--startStep 4 Warp
  proc.addAction(new WarpAction(proc, new Coordinates(40, 29)));
  proc.addAction(new SubwarpAction(proc, new Coordinates(40, 30)));
  //--startStep 10 Dock

  await proc.repeat();
}

// Start execution
run().catch((err) => {
  console.error(err);
  process.exit(1);
});
