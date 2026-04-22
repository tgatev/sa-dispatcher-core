import Dispatcher from "../src/Model/Dispatcher";
import { DockAction } from "../src/Model/DockAction";
import { Coordinates } from "../src/Model/MoveAction";
import { FleetProcess as Process } from "../src/Model/FleetProcess";
import { StartMiningAction } from "../src/Model/StartMiningAction";
import { StopMiningAction } from "../src/Model/StopMining";
import { TransferCargoAction } from "../src/Model/TransferCargoAction";
import { UnDockAction } from "../src/Model/UndockAction";
import { WaitWarpCooldownAction } from "../src/Model/WaitWarpCooldownAction";
import { WarpAction } from "../src/Model/WarpAction";
import { argv } from "../src/gameHandlers/GameHandler";

async function run() {
  console.time("init_dispatcher");
  const dispatcher = await Dispatcher.build();
  console.timeEnd("init_dispatcher");
  console.time("Full execution tme");
  // dispatcher.sageFleetHandler.getFleetAccount()
  let args = {
    sageFleetHandler: dispatcher.sageGameHandler,
    sageGameHandler: dispatcher.sageFleetHandler,
  };
  /** Provide pointer reference to handlers */
  let proc = new Process(dispatcher, "pernik", new Coordinates(40, 30));
  let startMiningAction = new StartMiningAction(
    proc,
    "iron_ore", // resource
    2, // hardness - should getfrom mine account that will be minned
    1, // richness
    //, 52 * 60 + 42 // timeTo mine ( posible calculation )
    { autoStop: false },
  );

  let fleetReload = new TransferCargoAction(proc, [
    {
      isImportToFleet: true,
      resourceName: "fuel",
      // amount: 26696,
      amount: "max",
      cargoType: "fuelTank",
      condition: { whenLessThen: 8172 },
    },
    {
      isImportToFleet: true,
      resourceName: "food",
      amount: 235 * 2,
      // cargoType: "cargoHold", // this is default value // food is only in cargoHold
      condition: { whenLessThen: 235 },
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
  ]);
  let depositCargoToStarbase = new TransferCargoAction(proc, [{ isImportToFleet: false, resourceName: "iron_ore", amount: 70000 }]);

  let moveFromUST1ToUST5 = new WarpAction(proc, new Coordinates(38, 25));

  let moveFromUST5toUST1 = new WarpAction(proc, new Coordinates(40, 30));
  console.log("Start Step:", argv.startStep);
  // Mining Process
  //0
  proc.addAction(fleetReload);
  //--startStep 1
  proc.addAction(new UnDockAction(proc));
  //--startStep 2
  proc.addAction(new WaitWarpCooldownAction(proc));
  //--startStep 3
  proc.addAction(moveFromUST1ToUST5);
  //--startStep 4
  proc.addAction(startMiningAction);
  //--startStep 5
  proc.addAction(new StopMiningAction(proc));
  //--startStep 6
  proc.addAction(moveFromUST5toUST1);
  //--startStep 7
  proc.addAction(new DockAction(proc));
  //--startStep 8
  proc.addAction(depositCargoToStarbase);

  let limit = 10;
  for (let iter = 1; iter <= limit; iter++) {
    console.log(`======= MINING === CICLE === ${iter} [${limit}] === START `);

    console.time(`======= MINING === CICLE === ${iter} [${limit}] === END `);
    await proc.start(argv.startStep);
    console.timeEnd(`======= MINING === CICLE === ${iter} [${limit}] === END `);
    argv.startStep = 0;
  }
}
run().catch((err) => {
  console.error(err);
  process.exit(1);
});
