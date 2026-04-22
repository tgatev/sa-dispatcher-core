import { CargoStats } from "@staratlas/sage-main";
import Dispatcher from "../src/Model/Dispatcher";
import { FleetProcess as Process } from "../src/Model/FleetProcess";
import { DockAction } from "../src/Model/DockAction";
import { Coordinates } from "../src/Model/MoveAction";
import { StartMiningAction } from "../src/Model/StartMiningAction";
import { StopMiningAction } from "../src/Model/StopMining";
import { TransferCargoAction } from "../src/Model/TransferCargoAction";
import { UnDockAction } from "../src/Model/UndockAction";
import { SubwarpAction } from "../src/Model/SubwarpAction";
import { WarpAction } from "../src/Model/WarpAction";

async function run() {
  console.time("init_dispatcher");
  const dispatcher = await Dispatcher.build();
  console.time("Full execution tme");
  let args = {
    sageFleetHandler: dispatcher.sageGameHandler,
    sageGameHandler: dispatcher.sageFleetHandler,
  };

  /** Provide pointer reference to handlers */
  let proc = new Process(dispatcher, "pernik", new Coordinates(17, 21));

  let fleetAccount = await proc.fetchFleetAccount();
  console.log("FleetState: ", fleetAccount.state);
  const cargoStats = (await fleetAccount).data.stats.cargoStats as CargoStats;
  // throw cargoStats;
  let fuelCurrentVal = await args.sageFleetHandler.getOwnerTokenAccountByMintForCargo(
    fleetAccount.data.fuelTank,
    args.sageFleetHandler.getResourceMintAddress("fuel"),
  );
  let fuelFullReload = cargoStats.fuelCapacity - Number(fuelCurrentVal?.amount || 0);

  console.log("fuelFullReload: ", fuelFullReload);
  // proc.dispatcher.
  // (await fleetAccount).data.cargoHold

  // 52 * 60 + 42; // timeTo mine ( posible calculation )
  let fleetReload = new TransferCargoAction(proc, [
    {
      isImportToFleet: true,
      resourceName: "fuel",
      amount: "max",
      cargoType: "fuelTank",
      condition: { whenLessThen: 34733 + 1 },
    },
    {
      isImportToFleet: true,
      resourceName: "food",
      amount: 634,
      condition: { whenLessThen: 634 },
      // cargoType: "cargoHold", // this is default value // food is only in cargoHold
    },
  ]);

  let depositCargoToStarbase = new TransferCargoAction(proc, [
    { isImportToFleet: false, resourceName: "lumanite", amount: 70000 }, // amount could be more then cargo amount [ No problem - this will move the existing amount ]
  ]);

  ///////////////////////////////////////////////////
  //  Define Move and mine process                //
  // Start from MRZ-27, Mine on MRZ-28 and go back //
  ///////////////////////////////////////////////////

  proc.addAction(fleetReload);
  proc.addAction(new UnDockAction(proc));

  // Path from Save Starbase to MRZ-27
  proc.addAction(
    new WarpAction(proc, {
      x: 10,
      y: 23,
      isShipCenter: false,
    } as Coordinates),
  );
  proc.addAction(
    new SubwarpAction(proc, {
      x: 8,
      y: 24,
      isShipCenter: false,
    } as Coordinates),
  );

  // Starbase MRZ-27
  proc.addAction(
    new WarpAction(proc, {
      x: 2,
      y: 26,
      isShipCenter: false,
    } as Coordinates),
  );

  proc.addAction(new StartMiningAction(proc, "lumanite", 2, 1.5, { autoStop: false })); // Expectedtime: 43m 16
  proc.addAction(new StopMiningAction(proc));

  // from Starbase MRZ-27 to MRZ-28
  proc.addAction(
    new WarpAction(proc, {
      x: 8,
      y: 24,
      isShipCenter: false,
    } as Coordinates),
  );

  proc.addAction(
    new SubwarpAction(proc, {
      x: 10,
      y: 23,
      isShipCenter: false,
    } as Coordinates),
  );
  proc.addAction(
    new WarpAction(proc, {
      x: 17,
      y: 21,
      isShipCenter: false,
    } as Coordinates),
  );

  proc.addAction(new DockAction(proc));
  proc.addAction(depositCargoToStarbase);

  ///////////////////////////////////////////////////
  // End of definition                             //
  ///////////////////////////////////////////////////

  let limit = 2;
  for (let iter = 1; iter <= limit; iter++) {
    console.log(`======= MINING === CICLE === ${iter} [${limit}] === START `);

    console.time(`======= MINING === CICLE === ${iter} [${limit}] === END `);
    await proc.start();
    console.timeEnd(`======= MINING === CICLE === ${iter} [${limit}] === END `);
  }
}
run().catch((err) => {
  console.error(err);
  process.exit(1);
});
