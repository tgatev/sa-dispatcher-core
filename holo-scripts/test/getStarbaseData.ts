import { BN } from "@coral-xyz/anchor";
import { log } from "../../src/Common/PatchConsoleLog";
import { argv } from "../../src/gameHandlers/GameHandler";
import { DispatcherHolosim as Dispatcher } from "../../src/holoHandlers/HolosimMintsImporter";
console.time("init_dispatcher");
const ANONYMOUS = await Dispatcher.build({ useLookupTables: true, wallet_secret_key: "", player_profile: "", owner_public_key: "" });
console.timeEnd("init_dispatcher");
console.log(argv);

const run = async () => {
  console.time("Full execution tme");
  // await printStarbaseData({ x: -9, y: 24 }, ANONYMOUS);
  // await printStarbaseData({ x: 31, y: -19 }, ANONYMOUS);
  // await printStarbaseData({ x: 22, y: 5 }, ANONYMOUS);
  // await printStarbaseData({ x: 44, y: 10 }, ANONYMOUS);
  await printStarbaseData({ x: 39, y: -1 }, ANONYMOUS);
  // await printStarbaseData({ x: 22, y: 31 }, ANONYMOUS);
  throw "DONE";
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

async function printStarbaseData(sector: { x: number; y: number }, ANONYMOUS: Dispatcher) {
  let starbaseAddress = await ANONYMOUS.sageGameHandler.getStarbaseAddress([new BN(sector.x), new BN(sector.y)]);
  let starbaseAccount = await ANONYMOUS.sageGameHandler.getStarbaseAccount(starbaseAddress);

  log("Starbase Address:", starbaseAddress.toBase58());
  log("Starbase Account:", starbaseAccount);
}

async function getStarbasePlayer(ANONYMOUS: Dispatcher, sector: { x: number; y: number }, playerName: string) {
  let all = await ANONYMOUS.sageGameHandler.sagePlayerProfileHandler.findPlayerProfileByName([playerName]);
  let starbaseAddress = await ANONYMOUS.sageGameHandler.getStarbaseAddress([new BN(sector.x), new BN(sector.y)]);
  let starbasePlayerProfile = await ANONYMOUS.sageGameHandler.getStarbasePlayerAccount(starbaseAddress, all[0].key);

  log("Starbase Player Profile Data:", starbasePlayerProfile.data);

  let table = {
    shipEscrowCount: starbasePlayerProfile.data.shipEscrowCount,
    updatedShipEscrowCount: starbasePlayerProfile.data.updatedShipEscrowCount,
    countWrappedShips: starbasePlayerProfile.wrappedShipEscrows.length,
  };
  console.table(table);
  console.table(starbasePlayerProfile.wrappedShipEscrows.map((s: any) => ({ amount: s.amount, ship: s.ship.toBase58(), updateId: s.updateId })));
}
