import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

import { SageGameHandler } from "../src/holoHandlers/GameHandler";
import { SageFleetHandler } from "../src/holoHandlers/FleetHandler";
import { log } from "../src/Common/PatchConsoleLog";
import { buildDynamicTransactions, keypairToAsyncSigner, sendTransaction } from "@staratlas/data-source";
import { ReasourcesMints, DispatcherHolosim } from "../src/holoHandlers/HolosimMintsImporter";
/**
 //! Run with $ dotenv -e .env.holo -- bun run scripts/miningHolo.ts 
 */
const FLEET_NAME = "test";
const RESOURCE = "hydrogen";
const MINING_MINUTES = 1;

const setupWallet = async () => {
  const rpc_url = process.env["SOLANA_RPC_URL"] || "http://localhost:8899";
  const connection = new Connection(rpc_url, "confirmed");
  const secretKey = process.env["SOLANA_WALLET_SECRET_KEY"];

  if (!secretKey) {
    throw new Error("SOLANA_WALLET_SECRET_KEY environment variable is not set");
  }

  const walletKeypair = Keypair.fromSecretKey(bs58.decode(secretKey));

  if (!PublicKey.isOnCurve(walletKeypair.publicKey.toBytes())) {
    throw "wallet keypair is not on curve";
  }

  return { connection, walletKeypair };
};

const setupSageGameHandlerReadyAndLoadGame = async (walletKeypair: Keypair, connection: Connection) => {
  const sageGameHandler = new SageGameHandler(connection);
  console.log("SAGE Game Handler initialized");

  await sageGameHandler.ready;
  console.log("SAGE Game Handler ready");

  await sageGameHandler.loadGame();
  console.log("SAGE Game Handler game loaded");

  const playerPubkey = new PublicKey(process.env["OWNER_WALLET"] || walletKeypair);

  let playerProfile = await sageGameHandler.getPlayerProfileAddress(walletKeypair.publicKey);
  return { sageGameHandler, playerPubkey, playerProfile };
};

const run = async () => {
  console.log(`<!-- Start Mining (${RESOURCE}) with ${FLEET_NAME} -->`);

  // Setup wallet and SAGE game handler
  const { connection, walletKeypair } = await setupWallet();
  console.log(`Wallet public key: ${walletKeypair.publicKey.toBase58()}`);
  const { sageGameHandler, playerPubkey, playerProfile } = await setupSageGameHandlerReadyAndLoadGame(walletKeypair, connection);
  log(` --- Player         key: ${playerPubkey.toBase58()}`);
  log(` --- Player Profile key: ${playerProfile.toBase58()}`);

  // ! Show XP CAtegories
  // let categories = await sageGameHandler.listAllPointsCategories();
  // log(`Point Categories: `, categories.length);
  // if (categories.length > 0) {
  //   categories.forEach((category) => {
  //     log(category.account, ` -|-- Category: ${category.publicKey.toBase58()})`);
  //   });
  // }
  // let upa = await sageGameHandler.listProfilePointsAccounts(playerProfile);
  // log(`User Point Account: `, upa.length);
  // log(
  //   upa.forEach((account) => {
  //     log(` -|-- User Point Account:`, account);
  //   })
  // );
  // throw "DDD";

  // ! Show All Fleets
  // let r = await sageGameHandler.loadPlayerProfileFleets(playerProfile);
  // r.forEach((fleet) => {
  //   log(` --- Fleet: ${fleet.publicKey.toBase58()})`, fleet.account.fleetLabel);
  //   log(` --- Fleet state: `, fleet);
  // });

  // ! Show Fleets With Stats
  // let f = await sageGameHandler.loadPlayerProfileFleets(playerProfile);
  // f.forEach((fleet) => {
  //   log(` -|-- FleetAccount: ${fleet.publicKey.toBase58()})`, fleet.account.fleetLabel);
  //   log(` -|-- Fleet state: `, fleet);
  // });
  // let fleetByName = await sageGameHandler.getFleetAddress(playerProfile, "a4");
  // log(fleetByName, ` --- Fleet by name:  `);
  //getPlayerProfileFleetsAccounts

  // // Get the player profile and fleet addresses (public keys)
  const playerProfilePubkey = await sageGameHandler.getPlayerProfileAddress(playerPubkey);
  const fleetPubkey = await sageGameHandler.getFleetAddress(playerProfilePubkey, FLEET_NAME);
  console.log(`Fleet address: ${fleetPubkey.toBase58()}`);
  const sageFleetHandler = new SageFleetHandler(sageGameHandler);
  log(`Fleet Handler ready `);

  // Get the fleet account
  let fleetAccount = await sageFleetHandler.getFleetAccount(fleetPubkey);
  log(`Fleet account: `, fleetAccount);

  // log(`Fleet State `, (await sageFleetHandler.getFleetAccount(fleetPubkey)).state);
  // throw "FLEETS TATE ";
  // !!! DOCK is working - [Working] only from idle
  // Instruct the fleet to dock to the starbase
  // console.log("Prepare to dock to starbase...");
  // let ix = await sageFleetHandler.ixDockToStarbase(fleetPubkey, keypairToAsyncSigner(walletKeypair), 0);
  // log(ix, `Docking fleet to starbase...`);

  // !!! UNDOCK is [WORKING]
  // // Check Undock
  // console.log("Prepare to undock to starbase...");
  // let ix = await sageFleetHandler.ixUndockFromStarbase(fleetPubkey, keypairToAsyncSigner(walletKeypair), 0);
  // log(ix, `UNDocking fleet to starbase...`);

  // !!! Exit Subwarp - [WORKING]
  // console.log("Prepare to exitSubwarp ...");
  // let ix1 = await sageFleetHandler.ixReadyToExitSubwarp(fleetPubkey, keypairToAsyncSigner(walletKeypair), 0);
  // log(ix, `ExitSubwarp ...`);

  // ! Exit Warp - [WORKING]
  // console.log("Prepare to Exit Warp ...");
  // let ix = await sageFleetHandler.ixReadyToExitWarp(fleetPubkey, keypairToAsyncSigner(walletKeypair), 0);
  // log(ix, `Exit Warp  ...`);
  // ! SUBWarp - [WORKING]
  // console.log("Prepare to dock to starbase...");
  // let ix = await sageFleetHandler.ixSubwarpToCoordinate(fleetPubkey, [new BN(40), new BN(31)], keypairToAsyncSigner(walletKeypair), 0);
  // log(ix, `Docking fleet to starbase...`);

  // ! Warp - [WORKING]
  // console.log("Prepare to dock to starbase...");
  // let ix2 = await sageFleetHandler.ixWarpToCoordinate(fleetPubkey, [new BN(40), new BN(30)], keypairToAsyncSigner(walletKeypair), 0);
  // log(ix2, `Docking fleet to starbase...`);

  //  ! Transfer to Starbase - [WORKING]
  // console.log("Prepare to Transfer to starbase from Fuel Thank...");
  // let ix2 = await sageFleetHandler.ixWithdrawCargoFromFleet(
  //   fleetPubkey,
  //   SageGameHandler.SAGE_RESOURCES_MINTS["fuel"],
  //   new BN(90),
  //   new PublicKey("DnvPigkfVwnqf5UFu4612j7GRPLEhi1fvcys1kCevJe4"),
  //   keypairToAsyncSigner(walletKeypair),
  //   0
  // );
  // log(ix2, `Execute Transfer to starbase from Fuel Thank...`);

  //  ! Transfer to Fleet from Starbase - [WORKING]
  // console.log("Prepare to Transfer Fuel to fleet Fuel Thank...");
  // let ix2 = await sageFleetHandler.ixDepositCargoToFleet(
  //   fleetPubkey,
  //   new PublicKey("DnvPigkfVwnqf5UFu4612j7GRPLEhi1fvcys1kCevJe4"),
  //   SageGameHandler.SAGE_RESOURCES_MINTS["fuel"],
  //   new BN(90),
  //   keypairToAsyncSigner(walletKeypair),
  //   0
  // );
  // log(ix2, `Execute Transfer Fuel to fleet Fuel Thank...`);

  //  ! Transfer Crew from Fleet to Starbase - [WORKING]
  // console.log("Transfer Crew from Fleet to Starbase...");
  // let ix2 = await sageFleetHandler.ixUnloadFleetCrew(fleetPubkey, 1, keypairToAsyncSigner(walletKeypair), 0);
  // log(ix2, `Execute Transfer Crew from Fleet to Starbase...`);

  //  ! Transfer Crew from Starbase to  Fleet  - [WORKING]
  // console.log("Prepare to Transfer Crew from Starbase to  Fleet...");
  // let ix1 = await sageFleetHandler.ixLoadFleetCrew(fleetPubkey, 1, keypairToAsyncSigner(walletKeypair), 0);
  // log(ix1, `Execute Transfer FCrew from Starbase to  Fleet...`);

  // !!! UNDOCK is working
  // console.log("Prepare to Undock...");
  // let ix2 = await sageFleetHandler.ixUndockFromStarbase(fleetPubkey, keypairToAsyncSigner(walletKeypair), 0);
  // console.log("Prepare to Undock...");

  // ! Start Mining - [WORKING]
  // let ix3 = await sageFleetHandler.ixStartMining(fleetPubkey, keypairToAsyncSigner(walletKeypair), 0,"hydrogen");
  let ix3 = await sageFleetHandler.ixStopMining(fleetPubkey, keypairToAsyncSigner(walletKeypair), 0);

  // log(ix, `UNDocking fleet to starbase...`);
  // tx = await sageGameHandler.buildAndSignTransaction(ix);
  let txr = await buildDynamicTransactions(
    [
      // ...ix1,
      // ...ix2,
      ...ix3,
    ],
    keypairToAsyncSigner(walletKeypair),
    { connection: connection }
  );
  if (txr.isOk()) {
    for (const tx of txr.value) {
      log(tx, `Sending transaction...`);
      let sent = await sendTransaction(tx, connection);
      if (sent.value.isOk()) {
        log(sent, `Fleet Exited from SubWarp successfully.`);
      }
    }
  }

  log(`Fleet State `, (await sageFleetHandler.getFleetAccount(fleetPubkey)).state);
  throw "FLEETS TATE ";

  // // Check that the fleet is idle, abort if not
  // if (!fleetAccount.state.Idle) {
  //   throw "fleet is expected to be idle before mining";
  // }

  // // Instruct the fleet to start mining
  // let ix = await sageFleetHandler.ixStartMining(fleetPubkey, RESOURCE);
  // let tx = await sageGameHandler.buildAndSignTransaction(ix);
  // let rx = await sageGameHandler.sendTransaction(tx);

  // // Check that the transaction was a success, if not abort
  // if (!rx.value.isOk()) {
  //   throw "fleet failed to start mining";
  // }

  // // Refresh the fleet account
  // fleetAccount = await sageFleetHandler.getFleetAccount(fleetPubkey);
  // console.log(`Fleet state: ${JSON.stringify(fleetAccount.state)}`);

  // // Wait for n minutes
  // console.log(`Waiting for ${MINING_MINUTES} minutes...`);
  // await new Promise((resolve) => setTimeout(resolve, MINING_MINUTES * 60 * 1000));

  // // Instruct the fleet to stop mining
  // console.log("Prepare to stopping mining...");
  // ix = await sageFleetHandler.ixStopMining(fleetPubkey);
  // tx = await sageGameHandler.buildAndSignTransaction(ix);
  // rx = await sageGameHandler.sendTransaction(tx);

  // // Check that the transaction was a success, if not abort
  // if (!rx.value.isOk()) {
  //   throw "fleet failed to stop mining";
  // }

  // // Instruct the fleet to dock to the starbase
  // console.log("Prepare to dock to starbase...");
  // ix = await sageFleetHandler.ixDockToStarbase(fleetPubkey);
  // tx = await sageGameHandler.buildAndSignTransaction(ix);
  // rx = await sageGameHandler.sendTransaction(tx);

  // // Check that the transaction was a success, if not abort
  // if (!rx.value.isOk()) {
  //   throw "fleet failed to dock to starbase";
  // }

  // // Instruct the fleet to deposit the mined resources (note, use very large amount to depsit all)
  // console.log("Prepare to deposit mined resources...");
  // const resourceToken = sageGameHandler.getResourceMintAddress(RESOURCE);
  // ix = await sageFleetHandler.ixWithdrawCargoFromFleet(fleetPubkey, resourceToken, new BN(9_999_999));
  // tx = await sageGameHandler.buildAndSignTransaction(ix);
  // rx = await sageGameHandler.sendTransaction(tx);

  // // Check that the transaction was a success, if not abort
  // if (!rx.value.isOk()) {
  //   throw "fleet failed to deposit mined resources";
  // }

  // console.log(`<!-- Stop Mining (${RESOURCE}) with ${FLEET_NAME} -->`);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
