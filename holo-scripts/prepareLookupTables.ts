import { Fleet, GLOBAL_SCALE_DECIMALS_4 } from "@staratlas/sage-main";
import { DispatcherHolosim as Dispatcher } from "../src/holoHandlers/HolosimMintsImporter";
import { log } from "../src/Common/PatchConsoleLog";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { LookupTable } from "../src/Model/LookupTable";

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

async function run() {
  console.time("init_dispatcher");
  const dispatcher = await Dispatcher.build();
  dispatcher.initLookupTables();
  dispatcher.lookupTables[0].addAddresses([]);

  async function requestAirdrop() {
    const signature = await dispatcher.sageGameHandler.connection.requestAirdrop(dispatcher.signer.kp.publicKey, 2 * LAMPORTS_PER_SOL);
    await dispatcher.sageGameHandler.connection.confirmTransaction(signature, "confirmed");
    console.log("Airdrop complete!");
  }

  // await requestAirdrop();
  async function addToLookupBatcher(addresses: PublicKey[]) {
    // 8KvrhPWHKXwGon3T3o36VqDiw327PoeEDuqBZUNLKPNV - contain game keys, Resource MINTS, starbases, mineItems, some planets
    // HNRJxQQ89kcTNQr7QDsco5e3xESsTwtAAJPNY1VBBtYp - contain  most of the planets
    let keysToAdd: PublicKey[] = [];
    // TODO : find or create new lookup table if current is full
    // let lt = dispatcher.lookupTables[dispatcher.lookupTables.length - 1];
    // let lt = dispatcher.lookupTables.find((lt) => lt.address?.toBase58() == "8BJocumQ33uyQAJuReDZy5MfkdpDAUyhwfjuqYJBxsgu"); // This is the first created
    let lt = dispatcher.lookupTables.find((lt) => lt.address?.toBase58() == "CwYEcvTsaDj48pTbSYU5kb9TLS197t5DLYfaHoGLyuuu"); // This is last created

    if (!lt) {
      // lt = await new LookupTable(dispatcher).build();
      throw "Lookup table not found";
    } else {
      console.log("Using lookup table to add keys:", lt.address?.toBase58());
    }
    // || (await new LookupTable(dispatcher).build());
    // this.logger.dbg([folderPath]);
    // await new LookupTable(this).build()
    for (let mint of addresses) {
      if (!dispatcher.hasKeyInLookupTables(mint)) keysToAdd.push(mint);
      if (keysToAdd.length >= 10) {
        try {
          await lt.addAddresses(keysToAdd);
        } catch (e) {
          lt = await new LookupTable(dispatcher).build();
          await lt.addAddresses(keysToAdd);

          console.error("Error adding addresses to lookup table:", e);
        }

        keysToAdd = [];
      }
    }
    await dispatcher.lookupTables[0].addAddresses(keysToAdd);
    // await dispatcher.lookupTables[0].dispatcher.appendLookupTables();
  }
  const initGAMELookupTables = async () => {
    // /* //! INITIAL Address creation  */
    await addToLookupBatcher([
      new PublicKey(dispatcher.sageGameHandler.asStatic().SAGE_PROGRAM_ID),
      new PublicKey(dispatcher.sageGameHandler.asStatic().PLAYER_PROFILE_PROGRAM_ID),
      new PublicKey(dispatcher.sageGameHandler.asStatic().PROFILE_FACTION_PROGRAM_ID),
      new PublicKey(dispatcher.sageGameHandler.asStatic().CARGO_PROGRAM_ID),
      new PublicKey(dispatcher.sageGameHandler.asStatic().POINTS_PROGRAM_ID),
      new PublicKey(dispatcher.sageGameHandler.asStatic().POINTS_STORE_PROGRAM_ID),
      new PublicKey(dispatcher.sageGameHandler.asStatic().GALAXY_MARKETPLACE_PROGRAM_ID),
      // Todo: get categories from Game Handler when available
      // lpXpCategory =
      new PublicKey("LPpdwMuXRuGMz298EMbNcUioaARN8CUU6dA2qyq46g8"),
      // dataRunningXpCategory =
      new PublicKey("DXPsKQPMyaDtunxDWqiKTGWbQga3Wihck8zb8iSLATJQ"),
      // councilRankXpCategory =
      new PublicKey("CRXPW3csNpkEYU5U4DUp6Ln6aEEWq4PSUAwV8v6Ygcqg"),
      // pilotingXpCategory =
      new PublicKey("PXPfCZwu5Vuuj6aFdEUAXbxudDGeXVktTo6imwhZ5nC"),
      // miningXpCategory =
      new PublicKey("MXPkuZz7yXvqdEB8pGtyNknqhxbCzJNQzqixoEiW4Q7"),
      //craftingXpCategory =
      new PublicKey("CXPukKpixXCFPrfQmEUGR9VqnDvkUsKfPPLfdd4sKSH8"),
      // combatXpCategory =
      new PublicKey("coXptoc2GdykGZpPu4EKHoJXHuWE4GsbkiPiuVH5CB2"),
      new PublicKey("So11111111111111111111111111111111111111112"),
      new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
      new PublicKey("Sysvar1nstructions1111111111111111111111111"),
      new PublicKey("SysvarS1otHashes111111111111111111111111111"),
      new PublicKey("ArRpgHaCAoUvgQusGdkF7ogyen4vgdm12xdEBruzc6wV"), // token Mint
      new PublicKey("GAmEqxNYaUqLmLkXGhzUvv4Ud8FotnWPLj6ChdBkUh9j"), // cargo type Ammo -- Add cargo type FUel and othere resource cargo types - not need for C4
      new PublicKey("CsTat96vGHBFyLmgfU9dfiuBJYye7ic2XxvXC9NY1Zto"),
    ]);
    //  Need to kill
    // let combatSpecificAccounts = [
    //   new PublicKey("8ss4B8eGsvGWhEYWy8H4nLesHpChwDvushRSuxdDk9XE"), // Combat Log owner System Program
    //   new PublicKey("9fTzq4E8yQi9vHA9BwqtPmZB5e7TmHxh8844wxwYLib9"), // By Cargo
    //   new PublicKey("9TU2rcwhBwLhS6e3WAcsowVmoc25uKHc2cESssZKhw72"), // By Sage
    //   // new PublicKey("9fTzq4E8yQi9vHA9BwqtPmZB5e7TmHxh8844wxwYLib9"),
    //   // new PublicKey("9fTzq4E8yQi9vHA9BwqtPmZB5e7TmHxh8844wxwYLib9"),
    // ];
    // await addToLookupBatcher(combatSpecificAccounts);
    // // ! gameHandler.mints are duplicated keys
    addToLookupBatcher([...Object.values(dispatcher.sageGameHandler.mints!)]);
    // const collectMineItemAddresses = async () => {
    //   let mineItems = await dispatcher.sageGameHandler.getAllMineItems();
    //   log(mineItems[0]);
    //   log(mineItems.length, "mine Items found");
    //   log("keys:", Object.keys(mineItems[0]));
    //   return mineItems.map((p: any) => p.key); //  DecodedAccountData<MineItem>
    // };
    // const collectStarbaseAddresses = async () => {
    //   // @ts-ignore  Get All planets
    //   let starbases = await dispatcher.sageGameHandler.getAllStarbaseAccounts();
    //   log(starbases[0]);
    //   log(starbases.length, "starbases found");
    //   log("keys:", Object.keys(starbases[0]));
    //   return starbases.map((p: any) => p.key); //  DecodedAccountData<MineItem>
    // };

    // Add Starbase, Mine Items, Planets [ & Asteroids ]
    const collectPlanetAddresses = async () => {
      //8[discriminator] + 1[version] + 64[name] + 32[gameId] + 8*2[sector] + 8*2[subCoordinates] + 1[planetType] + 1[position] + 8[size] + 8[maxHp] + 8[currentHealth] + 8[amountMined] + 1[numMiners]
      // @ts-ignore Get All planets
      let planets = await dispatcher.sageGameHandler.program.account.planet.all([
        {
          memcmp: {
            offset: 8 + 1 + 64, // discriminator + version + name : [32 gameId]
            bytes: dispatcher.sageGameHandler.gameId?.toBase58() || "",
          },
        },
      ]);
      log(planets[0]);
      log(planets.length, "planets found");
      log("keys:", Object.keys(planets[0]));
      return planets.map((p: any) => p.publicKey);
    };
    // let starbaseAddresses = await collectStarbaseAddresses();
    // log("Adding starbases:", starbaseAddresses.length);
    // let mineItemsAddresses = await collectMineItemAddresses();
    // log("Adding mine items:", mineItemsAddresses.length);
    // await addToLookupBatcher([...mineItemsAddresses, ...starbaseAddresses]);
    let planetAddresses = await collectPlanetAddresses();
    log("Adding planets:", planetAddresses.length);
    // await dispatcher.lookupTables[0].addAddresses(planetAddresses);
    await addToLookupBatcher([...planetAddresses]);
  };

  /** Game Common keys */
  await initGAMELookupTables();
  // TODO Create USER LOOKUP TABLE
  //  - create new Lookup table
  //  - add game lookup table addresses
  //  - add user profile
  //  - add user faction profile
  //  - add user profile, cargo, fleet, starbase, planet, mine items
  //  - add mints when needed

  /// Close Lookup Tables
  // await dispatcher.lookupTables[0].deactivate();
  // await dispatcher.lookupTables[1].deactivate();
  // After 400 Blocks can be closed
  // await dispatcher.lookupTables[0].close();
  // await dispatcher.lookupTables[1].close();
  throw "DDDD";
}
