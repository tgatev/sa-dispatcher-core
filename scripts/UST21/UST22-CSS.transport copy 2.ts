import { ShipStats } from "@staratlas/sage-main";
import Dispatcher from "../../src/Model/Dispatcher";
import { DockAction } from "../../src/Model/DockAction";
import { Coordinates, MoveAction } from "../../src/Model/MoveAction";
import { MiningBuildOptions, Process } from "../../src/Model/FleetProcess";
import { TransferCargoAction } from "../../src/Model/TransferCargoAction";
import { UnDockAction } from "../../src/Model/UndockAction";
import { SageGameHandler } from "../../src/gameHandlers/GameHandler";

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
  let proc = new Process(dispatcher, "pernik", new Coordinates(40, 30));

  let fleetAccount = await proc.fetchFleetAccount();
  let fleetStats = fleetAccount.data.stats as ShipStats;
  // @ts-ignore type cargoCapacity Never
  let cargoSize: number = fleetAccount.data.stats.cargoStats.cargoCapacity as number;

  let paths = {
    "21to22": MoveAction.calcWarpPath(new Coordinates(25, 14), new Coordinates(35, 16), fleetStats.movementStats.maxWarpDistance / 100, 1),
    "22toUSt1": MoveAction.calcWarpPath(
      new Coordinates(35, 16),
      new Coordinates(40, 30),
      fleetStats.movementStats.maxWarpDistance / 100,
      1
    ),
    USt1to21: MoveAction.calcWarpPath(new Coordinates(40, 30), new Coordinates(25, 14), fleetStats.movementStats.maxWarpDistance / 100, 2),
  };

  let pathCosts = {
    "21to22": MoveAction.calcPathCosts(fleetStats, new Coordinates(25, 14), paths["21to22"], "Hybrid"),
    "22toUSt1": MoveAction.calcPathCosts(fleetStats, new Coordinates(35, 16), paths["22toUSt1"], "Hybrid"),
    USt1to21: MoveAction.calcPathCosts(fleetStats, new Coordinates(40, 30), paths.USt1to21, "Hybrid"),
  };

  console.log("paths:", paths);
  console.log("pathCosts:", pathCosts);

  // let costTotal = {
  //   "21to22": pathCosts["21to22"]
  //     .map((v) => v as iPathCost)
  //     .reduce((a, c) => {
  //       return { fuel: a.fuel + c.fuel, time: a.time + c.time, type: "Hybrid" };
  //     }),
  //   "22toUSt1": pathCosts["22toUSt1"]
  //     .map((v) => v as iPathCost)
  //     .reduce((a, c) => {
  //       return { fuel: a.fuel + c.fuel, time: a.time + c.time, type: "Hybrid" };
  //     }),
  //   USt1to21: pathCosts["USt1to21"]
  //     .map((v) => v as iPathCost)
  //     .reduce((a, c) => {
  //       return { fuel: a.fuel + c.fuel, time: a.time + c.time, type: "Hybrid" };
  //     }),
  // };
  // console.log(
  //   "pathCosts 21to22",
  //   pathCosts["21to22"]
  //     .map((v) => v as iPathCost)
  //     .reduce((a, c) => {
  //       return { fuel: a.fuel + c.fuel, time: a.time + c.time, type: "Hybrid" };
  //     })
  // );
  // console.log(
  //   "pathCosts 22toUSt1",
  //   pathCosts["22toUSt1"]
  //     .map((v) => v as iPathCost)
  //     .reduce((a, c) => {
  //       return { fuel: a.fuel + c.fuel, time: a.time + c.time, type: "Hybrid" };
  //     })
  // );
  // console.log(
  //   "pathCosts USt1to21",
  //   pathCosts["USt1to21"]
  //     .map((v) => v as iPathCost)
  //     .reduce((a, c) => {
  //       return { fuel: a.fuel + c.fuel, time: a.time + c.time, type: "Hybrid" };
  //     })
  // );

  let unloadCss_ = new TransferCargoAction(proc, [
    { isImportToFleet: false, resourceName: "graphene", amount: "max", condition: { whenMoreThen: 0 } },
    { isImportToFleet: false, resourceName: "ammunitions", amount: "max", condition: { whenMoreThen: 0 } },
    { isImportToFleet: true, resourceName: "fuel", cargoType: "fuelTank", amount: 23195 }, // ??? How much is needed???
    { isImportToFleet: true, resourceName: "radiation_absorber", cargoType: "cargoHold", amount: 15636 },
  ]);

  let reloadUst21 = new TransferCargoAction(proc, [
    { isImportToFleet: false, resourceName: "radiation_absorber", amount: "max", condition: { whenMoreThen: 0 } },
    { isImportToFleet: true, resourceName: "fuel", amount: 93817 },
    { isImportToFleet: true, resourceName: "fuel", cargoType: "fuelTank", amount: "max" },
  ]);

  let unloadUst22 = new TransferCargoAction(proc, [
    { isImportToFleet: false, resourceName: "fuel", amount: "max" },
    // { isImportToFleet: true, resourceName: "fuel", amount: "max", cargoType: "fuelTank" },
  ]);
  let loadUst22 = new TransferCargoAction(proc, [
    { isImportToFleet: true, resourceName: "graphene", amount: "max" },
    { isImportToFleet: true, resourceName: "ammunitions", amount: "max", cargoType: "ammoBank" },
    // { isImportToFleet: true, resourceName: "fuel", amount: "max", cargoType: "fuelTank" },
  ]);

  // Sart Point UST 21 to 16 to CSS and back to 21

  // Travel ( transport ) to UST 22
  proc.addAction(reloadUst21);
  proc.addAction(new UnDockAction(proc, new Coordinates(25, 14)));
  proc.actionsChain.push(...(await Process.generatePathActions(proc, paths["21to22"], "Hybrid", new Coordinates(25, 14), false)));
  proc.addAction(new DockAction(proc, new Coordinates(35, 16)));
  proc.addAction(unloadUst22);

  // Mining steps for graphen
  await addGraphenMining(proc);
  proc.addAction(loadUst22);

  // Travel ( transport ) To CSS
  proc.addAction(new UnDockAction(proc, new Coordinates(35, 16)));

  proc.actionsChain.push(...(await Process.generatePathActions(proc, paths["22toUSt1"], "Hybrid", new Coordinates(35, 16), false)));
  proc.addAction(new DockAction(proc, new Coordinates(40, 30)));
  proc.addAction(unloadCss_);

  // Travel ( transport ) To 21
  proc.addAction(new UnDockAction(proc, new Coordinates(40, 30)));
  proc.actionsChain.push(...(await Process.generatePathActions(proc, paths["USt1to21"], "Hybrid", new Coordinates(40, 30), false)));
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

async function addGraphenMining(proc: Process) {
  const saveStarbaseName = "mrz22";
  /** Provide pointer reference to handlers */
  let pro = await Process.build(undefined, saveStarbaseName);
  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation

  let miningBase = await SageGameHandler.readStarbaseByName("mrz22");
  let miningResource = await SageGameHandler.readStarbaseResource(miningBase, "carbon");

  let options = {
    miningTimes: 3,
  } as MiningBuildOptions;

  // console.log(JSON.stringify(options));
  proc.actionsChain.push(...(await pro.generateMiningProcessSteps(miningBase, miningResource, options)).actions);
  // proc.actionsChain.push(...(await pro.generateMiningProcessSteps(miningBase, miningResource, options)).actions);
}

async function addHydrogenMining(proc: Process) {
  const saveStarbaseName = "mrz21";
  /** Provide pointer reference to handlers */
  let pro = await Process.build(undefined, saveStarbaseName);
  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation

  let miningBase = await SageGameHandler.readStarbaseByName("mrz21");
  let miningResource = await SageGameHandler.readStarbaseResource(miningBase, "hydrogen");

  let options = {
    miningTimes: 3,
  } as MiningBuildOptions;

  // console.log(JSON.stringify(options));
  proc.actionsChain.push(...(await pro.generateMiningProcessSteps(miningBase, miningResource, options)).actions);
  proc.actionsChain.push(...(await pro.generateMiningProcessSteps(miningBase, miningResource, options)).actions);
}
