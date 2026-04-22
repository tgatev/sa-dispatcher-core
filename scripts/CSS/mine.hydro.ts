import Dispatcher from "../../src/Model/Dispatcher";
import { DockAction } from "../../src/Model/DockAction";
import { Coordinates } from "../../src/Model/MoveAction";
import { FleetProcess as Process } from "../../src/Model/FleetProcess";
import { StartMiningAction } from "../../src/Model/StartMiningAction";
import { StopMiningAction } from "../../src/Model/StopMining";
import { TransferCargoAction } from "../../src/Model/TransferCargoAction";
import { UnDockAction } from "../../src/Model/UndockAction";
/**
 *  Provide Transfer resources between CSS and UST-3 with mining on UST-3 before go back
 *    mining times 1: unload carbon to CSS
 *    - Layer1 - using Base Actions chain
 */
async function run() {
  console.time("init_dispatcher");
  const dispatcher = await Dispatcher.build({ useLookupTables: true });
  console.timeEnd("init_dispatcher");
  console.time("Full execution tme");

  /** Provide pointer reference to handlers */
  let proc = new Process(dispatcher, "pernik", new Coordinates(40, 30));

  // Mining Process
  //0
  proc.addAction(
    new TransferCargoAction(proc, [
      {
        isImportToFleet: true,
        resourceName: "fuel",
        amount: "max",
        cargoType: "fuelTank",
        condition: { whenLessThen: 5000 },
      },
      {
        isImportToFleet: true,
        resourceName: "ammunitions",
        amount: "max",
        cargoType: "ammoBank",
      },
      {
        isImportToFleet: true,
        resourceName: "ammunitions",
        amount: 2000,
        cargoType: "cargoHold",
      },
    ]),
  );
  //--startStep 1
  proc.addAction(new UnDockAction(proc));
  //--startStep 2
  proc.addAction(new StartMiningAction(proc, "hydrogen", 1, 1.5, { autoStop: false }));
  //--startStep 3
  proc.addAction(new StopMiningAction(proc));
  //--startStep 4
  proc.addAction(new DockAction(proc));

  // proc.addAction(new WarpAction(proc, new Coordinates(47, 32)));
  // proc.addAction(new SubwarpAction(proc, new Coordinates(48, 32)));

  await proc.repeat();
}
run().catch((err) => {
  console.error(err);
  process.exit(1);
});
