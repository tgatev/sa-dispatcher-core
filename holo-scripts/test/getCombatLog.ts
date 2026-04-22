import { BN } from "@coral-xyz/anchor";
import { log } from "../../src/Common/PatchConsoleLog";
import { argv } from "../../src/gameHandlers/GameHandler";
import { DispatcherHolosim as Dispatcher } from "../../src/holoHandlers/HolosimMintsImporter";
let sector = { x: argv.x || 40, y: argv.y || 30 };

console.log(argv);

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

async function run() {
  console.time("init_dispatcher");
  const ANONYMOUS = await Dispatcher.build({ useLookupTables: true, wallet_secret_key: "", player_profile: "", owner_public_key: "" });
  console.timeEnd("init_dispatcher");
  console.time("Full execution tme");
  await printStarbaseData({ x: 25, y: 14 }, ANONYMOUS);
  await printStarbaseData({ x: 22, y: 31 }, ANONYMOUS);
  throw "DONE";
}

async function printStarbaseData(sector: { x: number; y: number }, ANONYMOUS: Dispatcher) {
  let starbaseAddress = await ANONYMOUS.sageGameHandler.getStarbaseAddress([new BN(sector.x), new BN(sector.y)]);
  let starbaseAccount = await ANONYMOUS.sageGameHandler.getStarbaseAccount(starbaseAddress);

  log("Starbase Address:", starbaseAddress.toBase58());
  log("Starbase Account:", starbaseAccount);
}
