import Dispatcher from "../../src/Model/Dispatcher";
import { Coordinates } from "../../src/Model/MoveAction";
import { FleetProcess as Process } from "../../src/Model/FleetProcess";
import { WarpAction } from "../../src/Model/WarpAction";
import { SubwarpAction } from "../../src/Model/SubwarpAction";
import { ExitWarpAction } from "../../src/Model/ExitWarpAction";
import { ExitSubwarpAction } from "../../src/Model/ExitSubwarpAction";
/**
 *  Provide Transfer resources between CSS and UST-2
 *    - Layer1 - using Base Actions chain
 */
async function run() {
  console.time("init_dispatcher");
  const dispatcher = await Dispatcher.build();
  dispatcher.logger.verbose = -1;
  console.timeEnd("init_dispatcher");
  console.time("Full execution tme");
  /** Provide pointer reference to handlers */
  let proc = new Process(dispatcher, "test", new Coordinates(40, 30));
  proc.addAction(new WarpAction(proc, new Coordinates(39, 30)));
  proc.addAction(new ExitWarpAction(proc));

  proc.addAction(new SubwarpAction(proc, new Coordinates(40, 30)));
  proc.addAction(new ExitSubwarpAction(proc));
  // proc.addAction(
  //   new TransferCargoAction(proc, [
  //     {
  //       cargoType: "cargoHold",
  //       amount: 50,
  //       isImportToFleet: true,
  //       resourceName: "iron_ore",
  //     },
  //   ])
  // );
  // proc.addAction(new PaymentAction(proc));
  // proc.addAction(new UnDockAction(proc));
  // proc.addAction(new StartMiningAction(proc, "copper_ore", 2, 1));
  // proc.addAction(new WarpAction(proc, new Coordinates(47, 32)));
  // proc.addAction(new SubwarpAction(proc, new Coordinates(48, 32)));
  // proc.addAction(new DockAction(proc));

  // proc.addAction(
  //   new TransferCargoAction(proc, [
  //     {
  //       cargoType: "cargoHold",
  //       amount: "max",
  //       isImportToFleet: false,
  //       resourceName: "electronics",
  //       condition: { whenMoreThen: 0 },
  //     },
  //     {
  //       cargoType: "cargoHold",
  //       amount: 94457,
  //       isImportToFleet: true,
  //       resourceName: "carbon",
  //     },
  //     {
  //       cargoType: "fuelTank",
  //       amount: "max",
  //       isImportToFleet: true,
  //       resourceName: "fuel",
  //     },
  //     {
  //       cargoType: "passengers",
  //       amount: "max", //29
  //       isImportToFleet: true,
  //       resourceName: "passenger",
  //     },
  //   ])
  // );
  // // proc.addAction(
  // //   new TransferCargoAction(proc, [
  // //     {
  // //       cargoType: "passengers",
  // //       amount: "max", //29
  // //       isImportToFleet: true,
  // //       resourceName: "passenger",
  // //     },
  // //   ])
  // // );
  // proc.addAction(new UnDockAction(proc));
  // proc.addAction(new WarpAction(proc, new Coordinates(41, 30)));
  // proc.addAction(new SubwarpAction(proc, new Coordinates(40, 30)));
  // proc.addAction(new DockAction(proc));

  // proc.addAction(
  //   new TransferCargoAction(proc, [
  //     {
  //       cargoType: "cargoHold",
  //       amount: "max",
  //       isImportToFleet: false,
  //       resourceName: "carbon",
  //       condition: { whenMoreThen: 0 },
  //     },
  //     {
  //       cargoType: "cargoHold",
  //       amount: 94457,
  //       isImportToFleet: true,
  //       resourceName: "toolkit", // framework
  //     },
  //   ])
  // );
  // proc.addAction(new UnDockAction(proc));
  // proc.addAction(new WarpAction(proc, new Coordinates(31, 28)));
  // proc.addAction(new SubwarpAction(proc, new Coordinates(30, 28)));
  // proc.addAction(new DockAction(proc));
  // proc.addAction(
  //   new TransferCargoAction(proc, [
  //     {
  //       cargoType: "passengers",
  //       amount: "max",
  //       isImportToFleet: false,
  //       resourceName: "passenger",
  //     },
  //     {
  //       cargoType: "cargoHold",
  //       amount: "max",
  //       isImportToFleet: false,
  //       resourceName: "toolkit",
  //     },
  //   ])
  // );
  // proc.addAction(new UnDockAction(proc));
  // proc.addAction(new WarpAction(proc, new Coordinates(39, 30)));
  // proc.addAction(new SubwarpAction(proc, new Coordinates(40, 30)));
  // proc.addAction(new DockAction(proc));

  await proc.repeat();
  return;
}

// Start execution
run()
  .catch((err) => {
    console.error(err);
  })
  .finally(() => process.exit(1));
