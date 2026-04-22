import { describe, expect, test, beforeAll } from "bun:test";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

import { SageGameHandler } from "../src/gameHandlers/GameHandler";
import { ProfileHandler } from "../src/gameHandlers/ProfileHandler";
import { SageFleetHandler } from "../src/gameHandlers/FleetHandler";
import { bs58 } from "@project-serum/anchor/dist/cjs/utils/bytes";
let playerPubkey: PublicKey;
let playerProfilePubkey: PublicKey;
let sageGameHandler: SageGameHandler;

beforeAll(async () => {
  console.log("begin");

  const rpc_url = process.env["SOLANA_RPC_URL"] || "http://localhost:8899";

  const connection = new Connection(rpc_url, "confirmed");
  //@ts-ignore
  const walletKeypair = Keypair.fromSecretKey(bs58.decode(process.env["SOLANA_WALLET_SECRET_KEY"]));
  playerPubkey = new PublicKey(process.env.OWNER_WALLET || walletKeypair);
  console.log("playerPubkey: " + playerPubkey.toString());
  sageGameHandler = new SageGameHandler(walletKeypair, connection);

  await sageGameHandler.ready;

  playerProfilePubkey = await sageGameHandler.getPlayerProfileAddress(playerPubkey);
  console.log("playerProfilePubkey: " + playerProfilePubkey.toString());
});

describe("SAGE Labs", () => {
  test("GameHandler", async () => {
    let profileFactionPubkey = sageGameHandler.getProfileFactionAddress(playerProfilePubkey);
    console.log("profileFaction", profileFactionPubkey.toBase58());
    expect(profileFactionPubkey.toBase58()).toBeTypeOf("string");

    let fleetPubkey = sageGameHandler.getFleetAddress(playerProfilePubkey, "t1");
    console.log("fleet", fleetPubkey.toBase58());

    let _ = await sageGameHandler.loadGame();
    console.log("GameBegin", fleetPubkey.toBase58());
    expect(sageGameHandler.gameId).toBe(sageGameHandler.game?.key as PublicKey);
  });

  test("ProfileHandler", async () => {
    const profileHandler = new ProfileHandler(sageGameHandler);
    const playerProfile = await profileHandler.getPlayerProfile(playerProfilePubkey);
    expect(playerProfile.key).toBe(playerProfilePubkey);
  });

  test("FleetHandler", async () => {
    console.log("Fleet Handler Begin ...");
    await sageGameHandler.loadGame();
    console.log("Fleet Handler:", "after Load Game");

    const fleetPubkey = sageGameHandler.getFleetAddress(playerProfilePubkey, "t1");
    console.log("Fleet pubKey", fleetPubkey.toString());

    const sageFleetHandler = new SageFleetHandler(sageGameHandler);
    const fleetAccount = await sageFleetHandler.getFleetAccount(fleetPubkey);

    console.log("fleet - key", fleetAccount.key.toBase58());
    // console.log("fleet - data", fleetAccount.data);
    console.log("fleet - state", fleetAccount.state);
    expect(fleetAccount.key).toBe(fleetPubkey);
  });
});
