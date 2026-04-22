import Dispatcher from "../src/Model/Dispatcher";
import { Coordinates } from "../src/Model/MoveAction";
import { FleetProcess as Process } from "../src/Model/FleetProcess";
import { TransportAction, iTransferStarbaseConfig } from "../src/Model/TransportAction";
import { SageGameHandler } from "../src/gameHandlers/GameHandler";
import { PublicKey } from "@solana/web3.js";

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
async function run() {
  console.time("init_dispatcher");
  const dispatcher = await Dispatcher.build();
  console.timeEnd("init_dispatcher");
  console.time("Full execution tme");

  let proc = new Process(dispatcher, "max", new Coordinates(40, 30));

  let fleetAccount = await proc.fetchFleetAccount();
  console.log(await proc.dispatcher.sageGameHandler.getAmountsByMints(fleetAccount.data.cargoHold, [SageGameHandler.SAGE_RESOURCES_MINTS["food"]]));

  let transporter = new TransportAction(proc, {
    sb1: {
      coordinates: { x: 40, y: 30 },
      recourseList: new Map<PublicKey, number>()
        .set(SageGameHandler.SAGE_RESOURCES_MINTS["toolkit"], 500000)
        .set(SageGameHandler.SAGE_RESOURCES_MINTS["fuel"], 50000)
        .set(SageGameHandler.SAGE_RESOURCES_MINTS["power_source"], 50000),
      fuelCost: "max",
      fuelTank: "reload",
      ammoBank: "reload",
      // cargoLoadMode: "heavy-to-light",
      cargoLoadMode: new Map<PublicKey, number>()
        .set(SageGameHandler.SAGE_RESOURCES_MINTS["toolkit"], 60)
        .set(SageGameHandler.SAGE_RESOURCES_MINTS["fuel"], 30)
        .set(SageGameHandler.SAGE_RESOURCES_MINTS["power_source"], 10),
    } as iTransferStarbaseConfig,
    sb2: {
      coordinates: new Coordinates(49, 20),
      recourseList: new Map<PublicKey, number>()
        .set(SageGameHandler.SAGE_RESOURCES_MINTS["polimer"], 500000)
        .set(SageGameHandler.SAGE_RESOURCES_MINTS["power_source"], 50000),
      fuelCost: 1000,
      fuelTank: "unload",
      ammoBank: "unload",
    },
    path: [new Coordinates(40, 30), new Coordinates(45, 25), new Coordinates(49, 20)],
    movementMode: "Warp",
  });

  await transporter.build();
  await transporter.execute();

  throw "DDDDD";
  let cargo_free = await dispatcher.sageFleetHandler.getFleetFreeCargoSpaces(fleetAccount);
  // await this._gameHandler.getAmountByMint(cargo);
}
