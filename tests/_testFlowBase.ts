import { EventEmitter } from "events";
import Dispatcher from "../src/Model/Dispatcher";
// import { FleetProcess as Process } from "../src/Model/FleetProcess";
import { Coordinates } from "../src/Model/MoveAction";
import { SageGameHandler } from "../src/gameHandlers/GameHandler";
import { PublicKey } from "@solana/web3.js";
import { log } from "./../src/Common/PatchConsoleLog";
run().catch((err) => {
  console.error(err);
  process.exit(1);
});
async function run() {
  console.time("init_dispatcher");
  const dispatcher = await Dispatcher.build({ useLookupTables: true });
  console.timeEnd("init_dispatcher");
  console.time("Full execution tme");

  // let getPermittedWalletsPerProfile = async () => {
  //   /** Get Indexes in Single Call */
  //   let sagePlayerProfileAccount = await dispatcher.sageGameHandler.sagePlayerProfileHandler.getPlayerProfile(
  //     new PublicKey("Ey1pir4MPEJyDDWzP2h9NrrTTUHf1Tw14Fb9NQzP7YEe")
  //   );
  //   let accountData = sagePlayerProfileAccount.profileKeys.map((keysIndexes, index) => {
  //     return {
  //       idx: index,
  //       expireTime: Number(keysIndexes.expireTime),
  //       key: keysIndexes.key.toBase58(),
  //       scope: keysIndexes.scope.toBase58(),
  //       scopeLabel: "",
  //       permissions: keysIndexes.permissions
  //         .map((e) => {
  //           return e;
  //         })
  //         .join(),
  //     };
  //   });

  //   // log("sagePlayerProfileAccount", accountData);
  //   console.table(accountData);
  //   return accountData;
  // };
  // await getPermittedWalletsPerProfile();
  await new Promise((r) => setTimeout(r, 10000));

  await dispatcher.permittedWallets;
  console.log("funderPermissionIdex", dispatcher.funderPermissionIdex);
  console.log("??? Signed In ", dispatcher.signedIn);
  log(await dispatcher.permittedWallets);
  // let walletsData = await dispatcher.permittedWallets;
  // walletsData = await dispatcher.getProfilePermittedWallets(
  //   dispatcher.sageGameHandler.connection,
  //   dispatcher.sageGameHandler.playerProfileProgram,
  //   new PublicKey("DV6mRBZJnQcV5GT9A5gcREu17zJM8g27915gL1pWqsSU"),
  //   new PublicKey("Ey1pir4MPEJyDDWzP2h9NrrTTUHf1Tw14Fb9NQzP7YEe")
  // );

  // console.table(
  //   walletsData.map((d) => {
  //     return { index: d.idx, name: d.name, account: d.account, scope: d.scope };
  //   })
  // );

  // let proc = new Process(dispatcher, "t1", new Coordinates(40, 30));
  // console.log(SageGameHandler.starbaseMap["ust1"].starbasePublicKey);
  throw "END";

  let basePlayers = await dispatcher.StarbaseHandler.getAllStarbasePlayers(new PublicKey(SageGameHandler.starbaseMap["ust1"].starbasePublicKey!));
  console.log("base Players", basePlayers.length);
  console.log("basePlayer: ", basePlayers[0].key.toBase58());
  // Sample Example - single inventory
  // let starbasePlayer = basePlayers[0];
  // // get All players by PublicKeys
  // let cargoPods = await dispatcher.StarbaseHandler.getCargoPod(starbasePlayer.key);
  // let tokenAccounts = await dispatcher.sageGameHandler.getParsedTokenAccountsByOwner(cargoPods[0].publicKey);

  // console.log("cargoPods", cargoPods[0].key.toBase58());
  // Multiple Cargo Pods Example - single inventory
  let r2 = await dispatcher.StarbaseHandler.getAllStarbaseInventoriesV2(basePlayers[0].key);
  console.log("r2", r2.baseAggregations);

  // get All players by PublicKeys
  let r = await dispatcher.StarbaseHandler.getAllStarbaseInventoriesV2(new PublicKey(SageGameHandler.starbaseMap["mrz28"].starbasePublicKey!));
  // console.log("r", r.baseAggregations);
  Object.entries(r.baseAggregations)
    .sort(([, a], [, b]) => b - a) // Sort by value in descending order
    .forEach(([key, value]) => {
      let rName = Object.keys(SageGameHandler.SAGE_RESOURCES_MINTS).find((i) => SageGameHandler.SAGE_RESOURCES_MINTS[i].toBase58() === key);
      console.log("key", key, rName, value.toLocaleString());
    });
  // getCargoPod;
  // console.log("basePlayer: ", basePlayers[0].data);
  // data: StarbasePlayer;
  // console.log(basePlayers);

  dispatcher.eventEmitter.emit("t1.scan");
}
