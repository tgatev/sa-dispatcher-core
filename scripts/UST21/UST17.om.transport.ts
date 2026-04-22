import { ShipStats } from "@staratlas/sage-main";
import Dispatcher from "../../src/Model/Dispatcher";
import { DockAction } from "../../src/Model/DockAction";
import { Coordinates, MoveAction } from "../../src/Model/MoveAction";
import { Process } from "../../src/Model/FleetProcess";
import { TransferCargoAction } from "../../src/Model/TransferCargoAction";
import { UnDockAction } from "../../src/Model/UndockAction";

// process.env["TRANSACTION_PRIORITY_FEE_LIMIT"] = "5000";
// process.env["TRANSACTION_PRIORITY_FEE_CAP"] = "10000";
// process.env["TRANSACTION_PRIORITY_FEE_MIN_CHANCE"] = "70";
// process.env["TRANSACTION_PRIORITY_FEE_INCREASE_STEP"] = "1000";
// process.env["TRANSACTION_PRIORITY_FEE_INCREASE_BASE_FEE"] = "10";
/**
 *  Provide Transfer resources between CSS and UST-21 with mining on UST-21 by Hybrid Mode and Process.generatePathActions()
 *    - Layer1 - using Base Actions chain
 */

async function run() {
  console.time("init_dispatcher");
  const dispatcher = await Dispatcher.build({ useLookupTables: true });
  console.timeEnd("init_dispatcher");
  console.time("Full execution tme");

  /** Provide pointer reference to handlers */
  let proc = new Process(dispatcher, "om", new Coordinates(25, 14));

  let fleetAccount = await proc.fetchFleetAccount();
  let fleetStats = fleetAccount.data.stats as ShipStats;
  let cargoSize: number = fleetStats.cargoStats.cargoCapacity as number;

  let pathTo = [new Coordinates(21, 5), new Coordinates(20, 4), new Coordinates(17, -4), new Coordinates(16, -5)];
  let pathBack = [new Coordinates(20, 4), new Coordinates(21, 5), new Coordinates(24, 13), new Coordinates(25, 14)];

  let costsTo = MoveAction.calcPathCosts(fleetStats, new Coordinates(25, 14), pathTo, "Hybrid");
  let costsBack = MoveAction.calcPathCosts(fleetStats, new Coordinates(16, -5), pathBack, "Hybrid");
  let costTo = MoveAction.calcTotalCost(costsTo);
  let costBack = MoveAction.calcTotalCost(costsBack);
  // console.log("FUEL Costs:", { costsTo, costsBack });
  console.log("FUEL Costs:", { costTo, costBack, total: costTo + costBack });
  // throw "ddd";
  // Start Point UST 21 to 17 and go back
  proc.addAction(
    new TransferCargoAction(proc, [
      {
        isImportToFleet: false,
        amount: "max",
        resourceName: "arco",
        condition: { whenMoreThen: 0 },
      },
      {
        cargoType: "fuelTank",
        isImportToFleet: true,
        amount: "max",
        resourceName: "fuel",
      },
      {
        cargoType: "ammoBank",
        isImportToFleet: true,
        amount: "max",
        resourceName: "ammunitions",
      },
      {
        cargoType: "cargoHold",
        isImportToFleet: true,
        amount: Math.floor(cargoSize / 6),
        resourceName: "field_stabilizer",
      },
    ])
  );

  proc.addAction(new UnDockAction(proc, new Coordinates(25, 14)));
  // fuel burn 6112
  // proc.addAction(new SubwarpAction(proc, new Coordinates(16, -5), new Coordinates(25, 14)));
  proc.actionsChain.push(...Process.generatePathActions(proc, pathTo, "Hybrid", new Coordinates(25, 14), true));
  proc.addAction(new DockAction(proc, new Coordinates(39, -1)));
  console.log("EXPORT FUEL On Starbase:", fleetStats.cargoStats.fuelCapacity - (costTo + costBack + 1));
  proc.addAction(
    new TransferCargoAction(proc, [
      // Export fuel to mrz17
      {
        cargoType: "fuelTank",
        isImportToFleet: false,
        amount: fleetStats.cargoStats.fuelCapacity - (costTo + costBack + 2),
        resourceName: "fuel",
      },
      {
        cargoType: "ammoBank",
        isImportToFleet: false,
        amount: "max",
        resourceName: "ammunitions",
        condition: { whenMoreThen: 0 },
      },
      {
        cargoType: "cargoHold",
        isImportToFleet: false,
        amount: "max",
        resourceName: "field_stabilizer",
      },
      {
        cargoType: "cargoHold",
        isImportToFleet: true,
        amount: cargoSize,
        resourceName: "arco",
      },
    ])
  );
  proc.addAction(new UnDockAction(proc, new Coordinates(39, -1)));
  // proc.addAction(new SubwarpAction(proc, new Coordinates(25, 14), new Coordinates(16, -5)));
  proc.actionsChain.push(...Process.generatePathActions(proc, pathBack, "Hybrid", new Coordinates(16, -5), true));

  proc.addAction(new DockAction(proc, new Coordinates(25, 14)));

  await proc.repeat();
}

// Start execution
run().catch((err) => {
  console.error(err);
  process.exit(1);
});
