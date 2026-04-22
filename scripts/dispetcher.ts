import Dispatcher from "../src/Model/Dispatcher";
import { Coordinates } from "../src/Model/MoveAction";
import { FleetProcess as Process } from "../src/Model/FleetProcess";
import { StartMiningAction } from "../src/Model/StartMiningAction";

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
  let proc = new Process(dispatcher, "t1", new Coordinates(40, 30));
  let startMiningAction = new StartMiningAction(
    proc,
    "hydrogen", // resource
    1, // hardness - should getfrom mine account that will be minned
    1, // richness
    { miningTime: 15 * 60 + 30, autoStop: false }, // timeTo mine ( posible calculation )
  );
  let miningR4Costs = await startMiningAction.calcMiningTimesCosts(1);
  console.log("Mining Costs: ", miningR4Costs);
  console.log("Minin Time: ", await startMiningAction.getTimeCost());

  //   Dock;
  // proc.add(new DockAction(proc));

  //   /***
  //     Specific start point conditional cargo loading in Single Transaction
  //         test cases:
  //         # load Fuel to fleet by fixed amount in fuelTank, when thank is empty ( less then minimum to farm )
  //         { amount: <X>, cargoType: "fuelTank", condition: { whenLessThen: <minToMine> } }
  //         # load Ammo by fixed amount in fuelTank, when thank is empty ( less then minimum to farm )
  //         { amount: <X>, cargoType: "fuelTank", condition: { whenMoreThen: <minToMine> } }
  //         # deposit to starbase full cargo

  //         # !!! Nice To Have #  load Food by upTo( X ) = x - current amount, by conditionCallback - exportable code example
  //     */
  //   proc.add(
  //     // TransferCargoAction( is)
  //     new TransferCargoAction(proc, [
  //       // transfer amonition to ammo bank account (additional cargo space)
  //       // { amount: 120, cargoType: "ammoBank" , conditionCallback: (action) => {} }, // Ammo
  //       // [X] the Simple Case transfer 14 foodto fleet cargoHold
  //       // {isImportToFleet: true, resourceName: "food", amount: 14 },
  //       // [X] transfer 14 food to Starbase cargo cargoHold
  //       // {isImportToFleet: false, resourceName: "food", amount: 14 },
  //       // [X] transfer fuel to cargo hold account as any other resource
  //       // {isImportToFleet: true, amount: 120, resourceName: "fuel", cargoType: "cargoHold" },
  //       // [X] importToFleet cargo hold  5 fuel in cargoHold when in cargo hold have less then 5
  //       // {isImportToFleet: true, resourceName: "fuel", amount: 5, condition: { whenLessThen: 5 } },
  //       // [X] Refill fuelTank with 445 when have less then 5
  //       // {isImportToFleet: true, resourceName: "fuel", amount: 445, cargoType: "fuelTank", condition: { whenLessThen: 5 } },
  //       // {isImportToFleet: true, resourceName: "ammunitions", amount: 50, cargoType: "ammoBank", condition: { whenMoreThen: 5 } },
  //       // [X] Refill ammoBank with 50 when have more then 50 in Starbase
  //       // {isImportToFleet: true, resourceName: "ammunitions", amount: 50, cargoType: "ammoBank", condition: { whenMoreThen: 50 } },
  //       // [X] Transfer 50 Ammo from fleet ammoBank when have more then 50 in fleet
  //       // {isImportToFleet: false, resourceName: "ammunitions", amount: 50, cargoType: "ammoBank", condition: { whenMoreThen: 5 } },
  //       // current use case
  //       {
  //         isImportToFleet: true,
  //         resourceName: "fuel",
  //         amount: 445,
  //         cargoType: "fuelTank",
  //         condition: { whenLessThen: 6 },
  //       },
  //       {
  //         isImportToFleet: true,
  //         resourceName: "ammunitions",
  //         amount: 90,
  //         cargoType: "ammoBank",
  //         condition: { whenLessThen: 13 },
  //       },

  //       {
  //         isImportToFleet: true,
  //         resourceName: "ammunitions",
  //         amount: 42,
  //         // cargoType: "cargoHold", // this is default value
  //         condition: { whenLessThen: 14 },
  //       },
  //     ])
  //   );

  //   //   UnDock;
  //   proc.add(new UnDockAction(proc));

  // Move Definition
  //   let moveSubwarp = new SubwarpMoveAction(
  //     proc,
  //     {
  //       x: 40,
  //       y: 29,
  //       isShipCenter: false,
  //       exitWrapDelay: 0,
  //     },
  //     false
  //   );
  //   let moveWarp = new WarpMoveAction(
  //     proc,
  //     {
  //       x: 40,
  //       y: 30,
  //       isShipCenter: false,
  //     },
  //     true
  //   );
  //   proc.add(moveWarp);

  //   proc.add(moveSubwarp);

  //   await moveWarp.execute();
  //   console.log("Movement costs: ", await move.calcCostVariants());

  // Scan
  // proc.add(new ScanAction(proc));

  // Start Mine
  // proc.add(startMiningAction);

  // await proc.start();
}
run().catch((err) => {
  console.error(err);
  process.exit(1);
});
