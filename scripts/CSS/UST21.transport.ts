import Dispatcher from "../../src/Model/Dispatcher";
import { DockAction } from "../../src/Model/DockAction";
import { Coordinates, MoveAction } from "../../src/Model/MoveAction";
import { FleetProcess as Process } from "../../src/Model/FleetProcess";
import { TransferCargoAction } from "../../src/Model/TransferCargoAction";
import { UnDockAction } from "../../src/Model/UndockAction";

/**
 *  Provide Transfer resources between CSS and UST-21 with mining on UST-21 by Hybrid Mode and Process.generatePathActions()
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

  let pathTo = MoveAction.calcWarpPath(new Coordinates(40, 30), new Coordinates(25, 14), 1);
  let pathBack = MoveAction.calcWarpPath(new Coordinates(40, 30), new Coordinates(25, 14), 1);
  /**
   * Generate PATHS
   */
  // let pathTo = [
  //   new Coordinates(35, 25),
  //   new Coordinates(35, 24),
  //   new Coordinates(30, 19),
  //   new Coordinates(29, 18),
  //   new Coordinates(25, 14),
  // ];
  // let pathBack = [
  //   new Coordinates(30, 19),
  //   new Coordinates(30, 20),
  //   new Coordinates(35, 25),
  //   new Coordinates(36, 26),
  //   new Coordinates(40, 30),
  // ];
  let costTo = MoveAction.calcPathCosts(fleetAccount.data.stats, new Coordinates(40, 30), pathTo, "Hybrid");
  let costBack = MoveAction.calcPathCosts(fleetAccount.data.stats, new Coordinates(40, 30), pathTo, "Hybrid");
  // Display Fuel Costs
  console.log(
    ["Fuel TO"],
    pathTo.map((v) => {
      return v.x + "," + v.y;
    }),
    costTo.reduce((p, c) => ({ fuel: p.fuel + c.fuel, time: p.time + c.time, type: "Hybrid" })),
  );
  console.log(
    ["Fuel Back"],
    pathTo.map((v) => {
      return v.x + "," + v.y;
    }),
    costBack.reduce((p, c) => ({ fuel: p.fuel + c.fuel, time: p.time + c.time, type: "Hybrid" })),
  );
  // console.log("Cost To:", costTo);
  // console.log("Cost Back:", costBack);
  // throw "STOPPED"

  // / / / / / / / / / / / / / / / / / / / / / / /
  // Transport Process
  // / / / / / / / / / / / / / / / / / / / / / / /

  proc.addAction(
    new TransferCargoAction(proc, [
      {
        isImportToFleet: true,
        resourceName: "field_stabilizer",
        // amount: cargoSize / 2  //  devide by weight,
        amount: "max",
        condition: { whenLessThen: cargoSize },
      },
      {
        isImportToFleet: true,
        resourceName: "fuel",
        // amount: 26696,
        amount: "max",
        cargoType: "fuelTank",
        condition: { whenLessThen: cargoSize },
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
    ]),
  );
  proc.addAction(new UnDockAction(proc));
  //--startStep 2 ... 2+N Move To UST5
  proc.actionsChain.push(...Process.generatePathActions(proc, pathTo, "Hybrid"));
  proc.addAction(new DockAction(proc));
  proc.addAction(
    new TransferCargoAction(proc, [
      { isImportToFleet: false, resourceName: "field_stabilizer", amount: "max" },
      // {           }
    ]),
  );

  proc.addAction(
    new TransferCargoAction(proc, [
      { isImportToFleet: true, resourceName: "fuel", amount: "max" },
      { isImportToFleet: true, resourceName: "fuel", amount: "max", cargoType: "fuelTank" },
    ]),
  );
  proc.addAction(new UnDockAction(proc));

  proc.actionsChain.push(...Process.generatePathActions(proc, pathBack, "Hybrid"));

  proc.addAction(new DockAction(proc));
  proc.addAction(new TransferCargoAction(proc, [{ isImportToFleet: false, resourceName: "fuel", amount: "max" }]));

  await proc.repeat();
}

// Start execution
run().catch((err) => {
  console.error(err);
  process.exit(1);
});
