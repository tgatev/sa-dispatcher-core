import { ShipStats } from "@staratlas/sage-main";
import Dispatcher from "../../src/Model/Dispatcher";
import { DockAction } from "../../src/Model/DockAction";
import { Coordinates, MoveAction, iPathCost } from "../../src/Model/MoveAction";
import { MiningBuildOptions, Process } from "../../src/Model/FleetProcess";
import { TransferCargoAction } from "../../src/Model/TransferCargoAction";
import { UnDockAction } from "../../src/Model/UndockAction";
import { SageGameHandler } from "../../src/gameHandlers/GameHandler";
import { StartMiningAction } from "../../src/Model/StartMiningAction";
import { StopMiningAction } from "../../src/Model/StopMining";

process.env["TRANSACTION_PRIORITY_FEE_LIMIT"] = "5000";
process.env["TRANSACTION_PRIORITY_FEE_CAP"] = "100000";
process.env["TRANSACTION_PRIORITY_FEE_MIN_CHANCE"] = "90";
process.env["TRANSACTION_PRIORITY_FEE_INCREASE_STEP"] = "10000";
process.env["TRANSACTION_PRIORITY_FEE_INCREASE_BASE_FEE"] = "2000";
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
  let proc = new Process(dispatcher, "pernik", new Coordinates(25, 14));

  let fleetAccount = await proc.fetchFleetAccount();
  let fleetStats = fleetAccount.data.stats as ShipStats;
  // @ts-ignore type cargoCapacity Never
  let cargoSize: number = fleetAccount.data.stats.cargoStats.cargoCapacity as number;

  // let costTo = MoveAction.calcPathCosts(fleetAccount.data.stats, new Coordinates(40, 30), pathTo, "Hybrid");
  // let costBack = MoveAction.calcPathCosts(fleetAccount.data.stats, new Coordinates(40, 30), pathTo, "Hybrid");
  // console.log("Cost To:", costTo);
  // console.log("Cost Back:", costBack);
  /** Provide pointer reference to handlers */
  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation

  let paths = {
    "21to16": MoveAction.calcWarpPath(new Coordinates(25, 14), new Coordinates(39, -1), fleetStats.movementStats.maxWarpDistance / 100, 1),
    "16toUSt1": MoveAction.calcWarpPath(
      new Coordinates(39, -1),
      new Coordinates(40, 30),
      fleetStats.movementStats.maxWarpDistance / 100,
      2
    ),
    USt1to21: MoveAction.calcWarpPath(new Coordinates(40, 30), new Coordinates(25, 14), fleetStats.movementStats.maxWarpDistance / 100, 2),
  };

  let pathCosts = {
    "21to16": MoveAction.calcPathCosts(fleetStats, new Coordinates(25, 14), paths["21to16"], "Hybrid"),
    "16toUSt1": MoveAction.calcPathCosts(fleetStats, new Coordinates(39, -1), paths["16toUSt1"], "Hybrid"),
    USt1to21: MoveAction.calcPathCosts(fleetStats, new Coordinates(40, 30), paths.USt1to21, "Hybrid"),
  };

  console.log("paths:", paths);
  console.log("pathCosts:", pathCosts);

  let costTotal = {
    "21to16": pathCosts["21to16"]
      .map((v) => v as iPathCost)
      .reduce((a, c) => {
        return { fuel: a.fuel + c.fuel, time: a.time + c.time, type: "Hybrid" };
      }),
    "16toUSt1": pathCosts["16toUSt1"]
      .map((v) => v as iPathCost)
      .reduce((a, c) => {
        return { fuel: a.fuel + c.fuel, time: a.time + c.time, type: "Hybrid" };
      }),
    USt1to21: pathCosts["USt1to21"]
      .map((v) => v as iPathCost)
      .reduce((a, c) => {
        return { fuel: a.fuel + c.fuel, time: a.time + c.time, type: "Hybrid" };
      }),
  };
  console.log(
    "pathCosts 21to16",
    pathCosts["21to16"]
      .map((v) => v as iPathCost)
      .reduce((a, c) => {
        return { fuel: a.fuel + c.fuel, time: a.time + c.time, type: "Hybrid" };
      })
  );
  console.log(
    "pathCosts 16toUSt1",
    pathCosts["16toUSt1"]
      .map((v) => v as iPathCost)
      .reduce((a, c) => {
        return { fuel: a.fuel + c.fuel, time: a.time + c.time, type: "Hybrid" };
      })
  );
  console.log(
    "pathCosts USt1to21",
    pathCosts["USt1to21"]
      .map((v) => v as iPathCost)
      .reduce((a, c) => {
        return { fuel: a.fuel + c.fuel, time: a.time + c.time, type: "Hybrid" };
      })
  );

  let transferCss21Amount = Math.floor(cargoSize / 6); // 22926;
  let foodConsumption16 = 0;
  let unloadCss_ = new TransferCargoAction(proc, [
    { isImportToFleet: false, resourceName: "titanium_ore", amount: "max" },
    { isImportToFleet: false, resourceName: "food", amount: "max", condition: { whenMoreThen: 0 } },
    { isImportToFleet: true, resourceName: "fuel", cargoType: "fuelTank", amount: "max" },
    { isImportToFleet: true, resourceName: "radiation_absorber", cargoType: "cargoHold", amount: transferCss21Amount },
    // { isImportToFleet: true, resourceName: "ammunitions", cargoType: "ammoBank", amount: "max", condition: { whenLessThen: 4719 } },
  ]);

  let reloadUst21 = new TransferCargoAction(proc, [
    { isImportToFleet: false, resourceName: "radiation_absorber", amount: "max", condition: { whenMoreThen: 0 } },
    { isImportToFleet: true, resourceName: "food", amount: foodConsumption16 },
    { isImportToFleet: true, resourceName: "fuel", amount: cargoSize - foodConsumption16 },

    { isImportToFleet: true, resourceName: "fuel", cargoType: "fuelTank", amount: "max" },
    // { isImportToFleet: true, resourceName: "ammunitions", cargoType: "ammoBank", amount: "max", condition: { whenLessThen: 4719 } },
  ]);

  let reloadUst16 = new TransferCargoAction(proc, [
    { isImportToFleet: false, resourceName: "fuel", amount: "max" },
    { isImportToFleet: true, resourceName: "fuel", amount: "max", cargoType: "fuelTank" },
  ]);

  // Sart Point UST 21 to 16 to CSS and back to 21
  proc.addAction(reloadUst21);
  proc.addAction(new UnDockAction(proc, new Coordinates(25, 14)));
  proc.actionsChain.push(...(await Process.generatePathActions(proc, paths["21to16"], "Hybrid", new Coordinates(25, 14), true)));
  proc.addAction(new DockAction(proc, new Coordinates(39, -1)));
  proc.addAction(reloadUst16);
  proc.addAction(new UnDockAction(proc, new Coordinates(39, -1)));
  proc.addAction(new StartMiningAction(proc, "titanium_ore", 5, 2));
  proc.addAction(new StopMiningAction(proc));
  proc.actionsChain.push(...(await Process.generatePathActions(proc, paths["16toUSt1"], "Hybrid", new Coordinates(39, -1), false)));
  proc.addAction(new DockAction(proc, new Coordinates(40, 30)));
  proc.addAction(unloadCss_);
  // proc.addAction(loadCss_);
  proc.addAction(new UnDockAction(proc, new Coordinates(40, 30)));
  proc.actionsChain.push(...(await Process.generatePathActions(proc, paths["USt1to21"], "Hybrid", new Coordinates(39, -1), true)));
  proc.addAction(new DockAction(proc, new Coordinates(25, 14)));

  /**
   * MINING Flow ... UST21 Hydrogen - cost fuel Cost is 2*cargo
   */
  proc.addAction(
    new TransferCargoAction(proc, [
      { isImportToFleet: false, resourceName: "radiation_absorber", amount: "max", condition: { whenMoreThen: 0 } },
    ])
  );
  let miningBase = await SageGameHandler.readStarbaseByName("mrz21");
  let miningResource = await SageGameHandler.readStarbaseResource(miningBase, "hydrogen");

  let options = {
    miningTimes: 3,
  } as MiningBuildOptions;

  console.log(JSON.stringify(options));
  proc.actionsChain.push(...(await proc.generateMiningProcessSteps(miningBase, miningResource, options)).actions);
  proc.actionsChain.push(...(await proc.generateMiningProcessSteps(miningBase, miningResource, options)).actions);

  await proc.repeat();
}

// Start execution
run().catch((err) => {
  console.error(err);
  process.exit(1);
});
