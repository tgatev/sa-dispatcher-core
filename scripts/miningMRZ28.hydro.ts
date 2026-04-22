import { BN } from "@project-serum/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

import { SageGameHandler } from "../src/gameHandlers/GameHandler";
import { SageFleetHandler } from "../src/gameHandlers/FleetHandler";

const RETRY_COUNTS = 3;
const RETRY_SECONDS = 60;
const FLEET_NAME = "pernik";
const RESOURCE_HYDRO = "hydrogen";
const RESOURCE_IRON_OER = "iron_ore";
const RESOURCE_COPPER_OER = "copper_ore";
const RESOURCE_CARBON = "carbon";

const RESOURCE = RESOURCE_HYDRO;
const MINING_SECONDS_MRZ28 = 17 * 60 + 32;
const MINING_SECONDS_USTUR_CSS = 26 * 60 + 22;
const MINING_SECONDS_MRZ_35 = 35 * 60 + 10;
const MINING_SECONDS = MINING_SECONDS_MRZ28;
const ITERATIONS = 30;
// To optimize transaction costs do not load ammonitions an fuel on each turn
// Offen the capacity amount is bigo so the storages could be prepared befor start mining script
const MINING_COST = {
  ammunitions: 0,
  fuel: 0, // const - from fleet size
  food: 258, // mrz-28
  //food: 386 // css
  //food: 515 // mrz-35
};

const setupWallet = async () => {
  const rpc_url =
    process.env["SOLANA_RPC_URL"] ||
    "https://global.rpc.hellomoon.io/186ec97f-1bc5-4f66-bde3-5d6f11009851" ||
    "https://api.devnet.solana.com";
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
  const sageGameHandler = new SageGameHandler(walletKeypair, connection);
  await sageGameHandler.ready;
  await sageGameHandler.loadGame();

  const playerPubkey = new PublicKey(process.env.OWNER_WALLET || walletKeypair);
  console.log("PlayerPubKey: ", playerPubkey.toString());
  return { sageGameHandler, playerPubkey };
};

const run = async () => {
  console.log(`<!-- Start Mining (${RESOURCE}) with ${FLEET_NAME} -->`);

  // Setup wallet and SAGE game handler
  const { connection, walletKeypair } = await setupWallet();
  const { sageGameHandler, playerPubkey } = await setupSageGameHandlerReadyAndLoadGame(walletKeypair, connection);

  // Setup fleet handler
  const sageFleetHandler = new SageFleetHandler(sageGameHandler);

  // Get the player profile and fleet addresses (public keys)
  const playerProfilePubkey = await sageGameHandler.getPlayerProfileAddress(playerPubkey);
  const fleetPubkey = sageGameHandler.getFleetAddress(playerProfilePubkey, FLEET_NAME);
  console.log(`playerProfile address: ${playerProfilePubkey.toString()}`);
  console.log(`Fleet address: ${fleetPubkey.toString()}`);

  async function signAndSend(ixf: CallableFunction, skipOnError = false) {
    let ix = await ixf();
    let tx, rx;
    for (let errCount = 0; errCount < RETRY_COUNTS; errCount++) {
      try {
        tx = await sageGameHandler.buildAndSignTransaction(ix);
        rx = await sageGameHandler.sendTransaction(tx);
        break;
      } catch (e) {
        console.error(e);
        console.log(`resend transaction ... wait ${RETRY_SECONDS} sec.`);
      }
    }

    if (!skipOnError && !rx?.value.isOk()) throw "!!! Transaction Failed !!!";

    return rx;
  }

  // Get the fleet account
  let fleetAccount = await sageFleetHandler.getFleetAccount(fleetPubkey);
  console.log(`FleetAccount address: ${fleetAccount.key.toString()}`);

  const fleetAmmoCapacity =
    //@ts-ignore
    fleetAccount.data.stats.cargoStats.ammoCapacity.toString();
  console.log("Ammo capacity: ", fleetAmmoCapacity);

  const fleetFuelCapacity =
    //@ts-ignore
    fleetAccount.data.stats.cargoStats.fuelCapacity.toString();
  console.log("Fuel capacity: ", fleetAmmoCapacity);

  // Instruction, transaction, result;
  let ix, tx, rx;

  if (fleetAccount.state.StarbaseLoadingBay?.starbase && !fleetAccount.state.Idle) {
    console.time("cargoLoad");
    // Instruct the fleet to deposit the mined resources (note, use very large amount to depsit all)
    console.log("Prepare put resources to fleet ...", MINING_COST);
    console.log("... add food up to:", MINING_COST.food);

    const cargoTokenAccounts = await sageGameHandler.getParsedTokenAccountsByOwner(fleetAccount.data.cargoHold);
    const fuelTokenAccounts = await sageGameHandler.getParsedTokenAccountsByOwner(fleetAccount.data.fuelTank);
    const ammoTokenAccounts = await sageGameHandler.getParsedTokenAccountsByOwner(fleetAccount.data.ammoBank);

    /**
     *  Load Food for mining
     */
    // ix = await sageFleetHandler.ixDepositCargoToFleet(fleetPubkey, fleetAccount.data.cargoHold, resourceFoodToken, new BN(MINING_COST.food));
    try {
      /**
       * Load Food if the amount is not enought to mine
       *  compared with pre defined constant
       */
      let foodTokenAccount = sageGameHandler.getTokenAccountByMint(cargoTokenAccounts, sageGameHandler.getResourceMintAddress("food"));
      let foodInCargo = parseInt(foodTokenAccount?.amount.toString() || "0", 10);
      const foodToLoad: number = MINING_COST.food - foodInCargo;
      console.log(`Food in cargo: `, foodInCargo, ` Load Food:  `, foodToLoad);

      if (foodToLoad > 0) {
        rx = await signAndSend(async () =>
          sageFleetHandler.ixDepositCargoToFleet(
            fleetPubkey,
            fleetAccount.data.cargoHold,
            sageGameHandler.getResourceMintAddress("food"),
            new BN(foodToLoad)
          )
        );
      }
    } catch {
      console.error("!!! No amunitions loaded... ");
    }

    /**
     *  Load Ammunitions for mining
     */
    const ammoTokenAccount = sageGameHandler.getTokenAccountByMint(
      ammoTokenAccounts,
      sageGameHandler.getResourceMintAddress("ammunitions")
    );
    const ammoAmaunt = parseInt(ammoTokenAccount?.amount.toString() || "0", 10);
    const ammoAfterLoad = MINING_COST.ammunitions + ammoAmaunt;

    console.log(`Ammo after loading: `, ammoAfterLoad, ` Load Ammo:  `, MINING_COST.ammunitions);
    // If there is ammonitions to transfer
    if (MINING_COST.ammunitions && ammoAfterLoad < fleetAmmoCapacity) {
      console.log("... add amunitions: ", MINING_COST.ammunitions);
      // ix = await sageFleetHandler.ixDepositCargoToFleet( fleetPubkey, fleetAccount.data.ammoBank as PublicKey, sageGameHandler.getResourceMintAddress('ammunitions'),new BN(MINING_COST.ammunitions));

      rx = await signAndSend(async () =>
        sageFleetHandler.ixDepositCargoToFleet(
          fleetPubkey,
          fleetAccount.data.ammoBank as PublicKey,
          sageGameHandler.getResourceMintAddress("ammunitions"),
          new BN(MINING_COST.ammunitions)
        )
      );
    } else {
      console.log("Skip amunition loading.");
    }

    /**
     *  Load Fuel for mining
     */
    const fuelTokenAccount = sageGameHandler.getTokenAccountByMint(fuelTokenAccounts, sageGameHandler.getResourceMintAddress("fuel"));
    const fuelAfterLoad = MINING_COST.fuel + parseInt(fuelTokenAccount?.amount.toString() || "0", 10);

    console.log(`Fuel after loading: `, fuelAfterLoad, ` Load Fuel:  `, MINING_COST.ammunitions);
    if (MINING_COST.fuel && fuelAfterLoad < fleetFuelCapacity) {
      console.log("...add fuel: ", MINING_COST.fuel);
      // ix = await sageFleetHandler.ixDepositCargoToFleet( fleetPubkey, fleetAccount.data.fuelTank, sageGameHandler.getResourceMintAddress('fuel'), new BN(MINING_COST.fuel));
      rx = await signAndSend(async () =>
        sageFleetHandler.ixDepositCargoToFleet(
          fleetPubkey,
          fleetAccount.data.fuelTank,
          sageGameHandler.getResourceMintAddress("fuel"),
          new BN(MINING_COST.fuel)
        )
      );
    } else {
      console.log("Skip fuel loading.");
    }
    console.timeEnd("cargoLoad");

    console.time("undock");
    // Undock fleet
    console.log("Undocking ... ");
    // ix = await sageFleetHandler.ixUndockFromStarbase(fleetPubkey);
    rx = await signAndSend(async () => sageFleetHandler.ixUndockFromStarbase(fleetPubkey));
    console.timeEnd("undock");
  }

  fleetAccount = await sageFleetHandler.getFleetAccount(fleetPubkey);
  // Check that the fleet is idle, abort if not
  if (!fleetAccount.state.Idle) {
    throw "fleet is expected to be idle before mining";
  }

  /** Start Mining */
  console.log(`Start Mining for ${RESOURCE}...`);
  console.time("startMining");
  // ix = await sageFleetHandler.ixStartMining(fleetPubkey, RESOURCE);
  rx = await signAndSend(async () => sageFleetHandler.ixStartMining(fleetPubkey, RESOURCE));
  console.timeEnd("startMining");

  // Wait for n minutes
  let waitingTime = new Date();
  waitingTime = new Date(waitingTime.getTime() + MINING_SECONDS * 1000);
  console.log(`Waiting for ${waitingTime.toISOString().slice(11, 19)} ...`);
  await new Promise((resolve) => setTimeout(resolve, MINING_SECONDS * 1000));
  /** Stop Mining */
  console.time("stopMining");

  // Refresh the fleet account before stop mining
  console.log("Prepare to stopping mining...");

  fleetAccount = await sageFleetHandler.getFleetAccount(fleetPubkey);
  console.log("Fleet account: ", fleetAccount.key.toString());
  // Instruct the fleet to stop mining
  // ix = await sageFleetHandler.ixStopMining(fleetPubkey);
  rx = await signAndSend(async () => sageFleetHandler.ixStopMining(fleetPubkey));
  console.timeEnd("stopMining");

  /** Dock to starbase */
  console.time("dock");
  console.log("Prepare to dock to starbase...");
  // Instruct the fleet to dock to the starbase
  // ix = await sageFleetHandler.ixDockToStarbase(fleetPubkey);
  rx = await signAndSend(async () => sageFleetHandler.ixDockToStarbase(fleetPubkey));
  console.timeEnd("dock");

  console.time("depositCargo");
  console.log("Prepare to deposit mined resources...");
  const resourceToken = sageGameHandler.getResourceMintAddress(RESOURCE);
  // Instruct the fleet to deposit the mined resources (note, use very large amount to depsit all)
  // ix = await sageFleetHandler.ixWithdrawCargoFromFleet(fleetPubkey, resourceToken, new BN(9_999_999));
  rx = await signAndSend(async () => sageFleetHandler.ixWithdrawCargoFromFleet(fleetPubkey, resourceToken, new BN(9_999_999)));
  console.timeEnd("depositCargo");

  console.log(`<!-- Stop Mining (${RESOURCE}) with ${FLEET_NAME} -->`);
  return true;
};

async function loop(times: number) {
  console.log("================ Begin ==================");
  while (times-- > 0) {
    if (await run()) {
      console.log(`================ Complete Mining [${times}] ==================`);
    }
  }
}

loop(ITERATIONS).catch((err) => {
  console.error(err);
  process.exit(1);
});
