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
  let proc = new Process(dispatcher, "pernik", new Coordinates(40, 30));

  // [start, end, this.config.path] = [end, start, this.config.path.reverse()];
  let start = {
    coordinates: { x: 40, y: 30 },
    recourseList: new Map<PublicKey, number>().set(SageGameHandler.SAGE_RESOURCES_MINTS["toolkit"], 1 * 32270),
    fuelCost: "max",
    fuelTank: "reload",
    // ammoBank: "reload",
    // cargoLoadMode: "heavy-to-light",
    // cargoLoadMode: new Map<PublicKey, number>().set(SageGameHandler.SAGE_RESOURCES_MINTS["toolkit"], 100),
  } as iTransferStarbaseConfig;
  let end = {
    coordinates: { x: 17, y: 21 },
    recourseList: new Map<PublicKey, number>()
      // .set(SageGameHandler.SAGE_RESOURCES_MINTS["fuel"], 5 * 32270)
      .set(SageGameHandler.SAGE_RESOURCES_MINTS["sdu"], 1 * 32270),
    fuelCost: "max",
    fuelTank: "reload",
    // ammoBank: "unload",
    // cargoLoadMode: new Map<PublicKey, number>()
    //   // .set(SageGameHandler.SAGE_RESOURCES_MINTS["fuel"], 50)
    //   .set(SageGameHandler.SAGE_RESOURCES_MINTS["lumanite"], 100),
  } as iTransferStarbaseConfig;

  let coordinates = [
    //ustCss:
    new Coordinates(40, 30),
    //point0:  <-[w]-> 1:12
    new Coordinates(34, 26),
    //point1: <-[sw]-> 4:20
    new Coordinates(33, 26),
    //point2:  <-[sw]-> 1:12
    new Coordinates(26, 24),
    //point3: <-[sw]-> 9:30
    new Coordinates(24, 23),
    //mrz28: <-[w]-> // 1:12
    new Coordinates(17, 21),
  ];

  // If reverse start
  // [start, end, coordinates] = [end, start, coordinates.reverse()];

  proc.addAction(
    new TransportAction(proc, {
      sb1: start,
      sb2: end,
      path: coordinates,
      movementMode: "Hybrid",
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
