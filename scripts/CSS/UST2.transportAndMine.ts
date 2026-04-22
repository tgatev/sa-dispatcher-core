import Dispatcher from "../../src/Model/Dispatcher";
import { DockAction } from "../../src/Model/DockAction";
import { Coordinates } from "../../src/Model/MoveAction";
import { FleetProcess as Process } from "../../src/Model/FleetProcess";
import { StartMiningAction } from "../../src/Model/StartMiningAction";
import { StopMiningAction } from "../../src/Model/StopMining";
import { TransferCargoAction } from "../../src/Model/TransferCargoAction";
import { UnDockAction } from "../../src/Model/UndockAction";
import { WarpAction } from "../../src/Model/WarpAction";
import { SageGameHandler, argv } from "../../src/gameHandlers/GameHandler";
/**
 *  Provide Transfer resources between CSS and UST-2 with mining on UST-2 before go back
 *    mining times N: unload biomass on UST-2 and Transfer Food to CSS
 *    - Layer1 - using Base Actions chain
 */
run().catch((err) => {
  console.error(err);
  process.exit(1);
});

async function run() {
  console.time("init_dispatcher");
  const dispatcher = await Dispatcher.build({ useLookupTables: true, owner_public_key: "" });
  console.timeEnd("init_dispatcher");
  console.time("Full execution tme");

  let limit = 30;
  let resouceName = "field_stabilizer";

  for (let iter = 1; iter <= limit; iter++) {
    console.log(`======= MINING === CICLE === ${iter} [${limit}] === START `);
    let process = await buildProcess(dispatcher, resouceName);
    console.time(`======= MINING === CICLE === ${iter} [${limit}] === END `);
    await process.start(argv.startStep);
    console.timeEnd(`======= MINING === CICLE === ${iter} [${limit}] === END `);
    argv.startStep = 0;
    // if (resouceName == "polymer") {
    //   resouceName = "copper";
    // } else {
    //   resouceName = "polymer";
    // }
  }
}

async function buildProcess(dispatcher: Dispatcher, transferResouceName: string) {
  /** Provide pointer reference to handlers */
  let proc = new Process(dispatcher, "pernik", new Coordinates(40, 30), "");

  let fa = await proc.fetchFleetAccount();
  console.log("OwnerProfile:", fa.data.ownerProfile);

  // @ts-ignore
  let cargoSize = Number(fa.data.stats.cargoStats.cargoCapacity);
  console.log("CargoCap:");

  let foodCost = 386;
  let miningTimes = 3;

  let resourceWeight = dispatcher.sageGameHandler.recourseWight.get(SageGameHandler.SAGE_RESOURCES_MINTS[transferResouceName]) || 1;
  // 3 minig times
  foodCost = miningTimes * foodCost - (miningTimes - 1) * 2;

  console.log("========== Food Cost", foodCost);
  let fleetReloadCss = new TransferCargoAction(proc, [
    {
      isImportToFleet: true,
      resourceName: "fuel",
      amount: "max",
      cargoType: "fuelTank",
      condition: { whenLessThen: 15300 },
    },

    {
      isImportToFleet: true,
      resourceName: transferResouceName,
      amount: Math.floor((cargoSize - foodCost) / resourceWeight),
    },

    {
      isImportToFleet: true,
      resourceName: "food",
      amount: foodCost,
    },
    // {
    //   // Miners do not get ammo to mine but its nice to have opened token account for ammo cause stop mining expect it ( todo: update instruction to check and create associated
    //   //    token account for ammo in the cargo hold)
    //   isImportToFleet: true,
    //   resourceName: "ammunitions",
    //   amount: 1,
    //   cargoType: "ammoBank", // this is default value // food is only in cargoHold
    //   condition: { whenLessThen: 1 },
    // },
  ]);

  let moveFromUST1ToUST2 = new WarpAction(proc, new Coordinates(42, 35));

  let moveFromUST2toUST1 = new WarpAction(proc, new Coordinates(40, 30), new Coordinates(0, 0));

  console.log("Start Step:", argv.startStep);
  // Mining Process
  //0
  proc.addAction(fleetReloadCss);
  //--startStep 1
  proc.addAction(new UnDockAction(proc));
  //--startStep 2
  proc.addAction(moveFromUST1ToUST2);
  //--startStep 3
  proc.addAction(new DockAction(proc));
  //--startStep 5
  proc.addAction(new TransferCargoAction(proc, [{ isImportToFleet: false, resourceName: transferResouceName, amount: "max" }]));

  // /// Mining
  // //--startStep 6
  // proc.addAction(
  //   new TransferCargoAction(proc, [
  //     {
  //       isImportToFleet: true,
  //       resourceName: "food",
  //       amount: foodCost,
  //       condition: { whenLessThen: foodCost / miningTimes },
  //     },
  //   ])
  // );
  //--startStep 7
  proc.addAction(new UnDockAction(proc));

  //--startStep 8
  proc.addAction(
    new StartMiningAction(
      proc,
      "biomass", // resource
      1, // hardness - should getfrom mine account that will be minned
      1, // richness
      //, 52 * 60 + 42 // timeTo mine ( posible calculation )
      { autoStop: false },
    ),
  );
  //--startStep 9
  proc.addAction(new StopMiningAction(proc));

  proc.addAction(new DockAction(proc));
  //--startStep 10
  proc.addAction(new TransferCargoAction(proc, [{ isImportToFleet: false, resourceName: "biomass", amount: "max" }]));
  //--startStep 11
  proc.addAction(new UnDockAction(proc));

  //--startStep 12
  proc.addAction(
    new StartMiningAction(
      proc,
      "biomass", // resource
      1, // hardness - should getfrom mine account that will be minned
      1, // richness
      //, 52 * 60 + 42 // timeTo mine ( posible calculation )
      { autoStop: false },
    ),
  );
  //--startStep 13
  proc.addAction(new StopMiningAction(proc));

  proc.addAction(new DockAction(proc));
  //--startStep 14
  proc.addAction(new TransferCargoAction(proc, [{ isImportToFleet: false, resourceName: "biomass", amount: "max" }]));

  //--startStep 15
  proc.addAction(new UnDockAction(proc));

  //--startStep 16
  proc.addAction(
    new StartMiningAction(
      proc,
      "biomass", // resource
      1, // hardness - should getfrom mine account that will be minned
      1, // richness
      //, 52 * 60 + 42 // timeTo mine ( posible calculation )
      { autoStop: false },
    ),
  );
  //--startStep 17
  proc.addAction(new StopMiningAction(proc));
  // //--startStep 18
  // proc.addAction(new DockAction(proc));
  // //--startStep 19
  // proc.addAction(new TransferCargoAction(proc, [{ isImportToFleet: false, resourceName: "biomass", amount: "max" }]));

  // // start going to css
  // //--startStep 20
  // proc.addAction(new TransferCargoAction(proc, [{ isImportToFleet: true, resourceName: "food", amount: "max" }]));

  // //--startStep 21
  // proc.addAction(new UnDockAction(proc));

  // Load And Transport
  //--startStep 22
  proc.addAction(moveFromUST2toUST1);
  //--startStep 23
  proc.addAction(new DockAction(proc));
  //--startStep 25
  proc.addAction(new TransferCargoAction(proc, [{ isImportToFleet: false, resourceName: "biomass", amount: cargoSize }]));
  return proc;
}
