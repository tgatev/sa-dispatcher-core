import Dispatcher from "../src/Model/Dispatcher";
import { Coordinates, MoveAction, iPathCost } from "../src/Model/MoveAction";
import { FleetProcess as Process } from "../src/Model/FleetProcess";
import { iTransferStarbaseConfig, TransportAction } from "../src/Model/TransportAction";

async function run() {
  console.time("init_dispatcher");
  const dispatcher = await Dispatcher.build();
  console.time("Full execution tme");

  /** Provide pointer reference to handlers */
  let proc = new Process(dispatcher, "s1", new Coordinates(7, 7), "");
  let fleetAccount = await proc.fetchFleetAccount();

  console.log("owner:", fleetAccount.data.ownerProfile.toBase58());
  console.log("ships: ", fleetAccount.data.stats.movementStats);

  //@ts-ignore
  let maxWarpDistance = fleetAccount.data.stats.movementStats.maxWarpDistance / 100;
  let fleetStats = fleetAccount.data.stats;
  console.log("Max Warp: ", maxWarpDistance);
  let path = MoveAction.calcWarpPath(new Coordinates(0, 0), new Coordinates(17, 21), 1.6);
  console.log(path);
  console.log(path.length);

  const displayData = (res: iPathCost[]) => {
    console.log(res.length);
    let fuelSum = 0;
    res.forEach((item) => (fuelSum += item.fuel));
    let timeSum = 0;
    res.forEach((item) => (timeSum += item.time + 2 * 30));

    console.log("Responce: ", res);
    console.log("Totals", "Fuel: ", fuelSum, timeSum);
  };

  displayData(MoveAction.calcPathCosts(fleetStats, new Coordinates(0, 0), path, "Warp"));
  displayData(MoveAction.calcPathCosts(fleetStats, new Coordinates(0, 0), path, "Hybrid"));
  displayData(MoveAction.calcPathCosts(fleetStats, new Coordinates(0, 0), [path[path.length - 1]], "Subwarp"));

  // let limit = 1;
  // for (let iter = 1; iter <= limit; iter++) {
  //   console.log(`======= MINING === CICLE === ${iter} [${limit}] === START `);
  //   console.time(`======= MINING === CICLE === ${iter} [${limit}] === END `);
  //   await proc.start();
  //   console.timeEnd(`======= MINING === CICLE === ${iter} [${limit}] === END `);
  // }
}
