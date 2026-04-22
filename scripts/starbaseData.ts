import { BN } from "@project-serum/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

import { SageGameHandler } from "../src/gameHandlers/GameHandler";
import { byteArrayToString, DecodedAccountData } from "@staratlas/data-source";
import { getStarbasePlayersByProfile, StarbasePlayer } from "@staratlas/sage-main";
const FLEET_NAME = "MOVE#1";

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
  const sageGameHandler = new SageGameHandler(walletKeypair, connection);
  await sageGameHandler.ready;
  await sageGameHandler.loadGame();

  const playerPubkey = new PublicKey(process.env["OWNER_WALLET"] || walletKeypair);

  return { sageGameHandler, playerPubkey };
};

const run = async () => {
  console.log(`<!-- Start Warp with ${FLEET_NAME} -->`);

  // Setup wallet and SAGE game handler
  const { connection, walletKeypair } = await setupWallet();
  const { sageGameHandler, playerPubkey } = await setupSageGameHandlerReadyAndLoadGame(walletKeypair, connection);

  // Get the player profile and fleet addresses (public keys)
  const playerProfilePubkey = await sageGameHandler.getPlayerProfileAddress(playerPubkey);
  if (!playerProfilePubkey || !sageGameHandler.gameId) throw "Missing player profile or game id";
  console.log("playerProfilePubkey:", playerProfilePubkey?.toBase58());
  //@ts-ignore
  const sagePlayerProfile = await sageGameHandler.getSagePlayerProfileAddress(playerProfilePubkey);
  console.log("sagePlayerProfile:", sagePlayerProfile?.toBase58());

  let sbPublicKey = await sageGameHandler.getStarbaseAddress([new BN(40), new BN(30)]);
  console.log("sbPublicKey:", sbPublicKey.toBase58());

  let sbAccountData = await sageGameHandler.getStarbaseAccount(sbPublicKey);
  console.log("sbAccountData PUB:", sbAccountData.key.toBase58());
  console.log("sbAccountData: NAME", byteArrayToString(sbAccountData.data.name));
  let starbasePlayers: DecodedAccountData<StarbasePlayer>[] = await getStarbasePlayersByProfile(
    connection,
    sageGameHandler.program,
    playerProfilePubkey,
    sageGameHandler.gameId
  );
  console.log("DecodedAccountData<StarbasePlayer>[].length:", starbasePlayers.length);
  starbasePlayers.forEach((item, index) => {
    console.log(`================ ${index} =============`);
    // console.log(item);
    if (item.type !== "error") {
      console.log("baseKey:", item.data.key.toBase58());
      console.log("playerProfile:", item.data.data.playerProfile.toBase58());
      console.log("sagePlayerProfile:", item.data.data.sagePlayerProfile.toBase58());
      console.log("Crew Total:", item.data.totalCrew());
      console.log("Crew Busy:", item.data.data.busyCrew);
    } else {
      console.error("Error decoding StarbasePlayer:", item.error);
    }
    console.log(`================ ${index} =============`);
  });
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
