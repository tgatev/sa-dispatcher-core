import Dispatcher from "../src/Model/Dispatcher";
import { Coordinates } from "../src/Model/MoveAction";
import { FleetProcess as Process } from "../src/Model/FleetProcess";
import { iTransferStarbaseConfig, TransportAction } from "../src/Model/TransportAction";
import { SageGameHandler } from "../src/gameHandlers/GameHandler";
import { PublicKey } from "@solana/web3.js";

async function run() {
  console.time("init_dispatcher");
  const dispatcher = await Dispatcher.build();
  console.time("Full execution tme");

  /** Provide pointer reference to handlers */
  let proc = new Process(dispatcher, "max", new Coordinates(30, 40));

  // [start, end, this.config.path] = [end, start, this.config.path.reverse()];
  let start = {
    coordinates: { x: 17, y: 21 },
    recourseList: new Map<PublicKey, number>().set(SageGameHandler.SAGE_RESOURCES_MINTS["toolkit"], 500000),
    // .set(SageGameHandler.SAGE_RESOURCES_MINTS["food"], 50000),
    fuelCost: "max",
    fuelTank: "reload",
    ammoBank: "reload",
    // cargoLoadMode: "heavy-to-light",
    cargoLoadMode: new Map<PublicKey, number>().set(SageGameHandler.SAGE_RESOURCES_MINTS["toolkit"], 100),
    // .set(SageGameHandler.SAGE_RESOURCES_MINTS["food"], 10),
  } as iTransferStarbaseConfig;
  let end = {
    coordinates: { x: 17, y: 21 },
    recourseList: new Map<PublicKey, number>().set(SageGameHandler.SAGE_RESOURCES_MINTS["toolkit"], 27158),
    fuelCost: "max",
    fuelTank: "unload",
    ammoBank: "unload",
    cargoLoadMode: "heavy-to-light",
  } as iTransferStarbaseConfig;

  let coordinates = [
    //ustCss:
    new Coordinates(17, 21),
    new Coordinates(18, 21),
    new Coordinates(18, 22),
    new Coordinates(17, 21),
  ];

  // If reverse start
  // [start, end, coordinates] = [end, start, coordinates.reverse()];

  proc.addAction(
    new TransportAction(proc, {
      sb1: start,
      sb2: end,
      path: coordinates,
      movementMode: "WarpScan",
    }),
  );
  let limit = 1;
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
