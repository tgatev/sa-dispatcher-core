/**
Loading the SRSLY Program in a TypeScript Project
[ WIP >>> This is a work in progress and may not be fully functional yet. Please refer to the official SRSLY documentation for the most up-to-date information. ]
In your project, set up your Anchor provider and load the SRSLY program as follows.
1️⃣ Import Required Dependencies

In your TypeScript file, import the necessary modules:
*/
import { ixToIxReturn } from "@staratlas/data-source";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import { Connection, GetProgramAccountsResponse, Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import FLEET_RENTAL_IDL from "./RentalHandler/IDLv2.json"; // Adjust the path to point to your IDL file
// import { type FleetRentalIdl, FLEET_RENTAL_IDL } from "./RentalHandler/IDL"; // Ensure the IDL is imported correctly
import bs58 from "bs58";
import { log } from "../Common/PatchConsoleLog";
import { getOrCreateAssociatedTokenAccount } from "@solana/spl-token";

import Dispatcher from "../Model/Dispatcher";
const ATLAS_MINT = new PublicKey("ATLASXmbPQxBUYbxPsV97usA3fPQYEqzQBUHgiFCUsXx");
const setupWallet = async () => {
  const rpc_url = process.env["SOLANA_RPC_URL"] || "http://localhost:8899";
  const connection = new Connection(rpc_url, "confirmed");
  const secretKey = process.env["SOLANA_WALLET_SECRET_KEY"];

  if (!secretKey) {
    throw new Error("SOLANA_WALLET_SECRET_KEY environment variable is not set");
  }

  const secretKeyBytes = Uint8Array.from(bs58.decode(secretKey));
  const walletKeypair = Keypair.fromSecretKey(secretKeyBytes);

  if (!PublicKey.isOnCurve(walletKeypair.publicKey.toBytes())) {
    throw "wallet keypair is not on curve";
  }

  return { connection, walletKeypair };
};

// const TEST = [
//   new PublicKey("DV6mRBZJnQcV5GT9A5gcREu17zJM8g27915gL1pWqsSU"),
//   new PublicKey("EBCRRAB5Vcs7TzttpXUBFHxNp2vacTquXS6vG2b7YpDp"),
//   new PublicKey("94LdKdSHuG3Na6H1YhkgJsq1caYVxUNeBRm7rLB6hd8k"),
//   new PublicKey("FNSgUrbRLShNFLwBPPsgbefJyyEP73NNMSVFkR3R78yB"),
//   new PublicKey("5N2oYkuWj8ExZnXZ61VdtzPHP88kCUMDhgAi37xNqx4H"),
//   new PublicKey("EyDjQXAnuGtVvxFsNxuKubcqiEZo16hESpVshjUqAgP7"),
//   new PublicKey("GAMEzqJehF8yAnKiTARUuhZMvLvkZVAsCVri5vSfemLr"),
//   new PublicKey("Ey1pir4MPEJyDDWzP2h9NrrTTUHf1Tw14Fb9NQzP7YEe"),
//   new PublicKey("o7iFkqPNgDv12uF4Xw7X37WvWvMSumSdBbiNWN3hywS"),
//   new PublicKey("ATLASXmbPQxBUYbxPsV97usA3fPQYEqzQBUHgiFCUsXx"),
//   new PublicKey("6U5Hnc4cYVTtNqm2pzPFdaFsAZ8FgM5WosnUSXgxYTeA"),
//   new PublicKey("9gBVPNAH15rR4KBEvKoscgHcAh8stpvmv1mnn9RkY6pa"),
//   new PublicKey("DkQ249Jar8qofsEDAdFL83yErAWiXzomQdqikfmRo4BQ"),
//   new PublicKey("SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE"),
//   new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
//   new PublicKey("AgThdyi1P5RkVeZD2rQahTvs8HePJoGFFxKtvok5s2J1"),
//   new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
//   new PublicKey("11111111111111111111111111111111"),
//   new PublicKey("7brLskDzoDLGb68ShNsJM6cmikYS655EY2obtuKYMcjX"),
// ];
let { connection, walletKeypair } = await setupWallet();
/**
Set Up the Anchor Provider
Establish your Solana connection and wallet provider:
 */
// const provider = AnchorProvider.local();
// setProvider(provider);

// @ts-ignore
let provider = new AnchorProvider(connection, new Wallet(walletKeypair), AnchorProvider.defaultOptions());
/**
 *  Load the SRSLY Program
    Once the provider is set, load the SRSLY program from your local workspace:
 */

const program = new Program(FLEET_RENTAL_IDL as any, provider);
console.log("SRSLY Program ID:", program.programId.toBase58());
// This confirms that you have the correct program loaded.
let dispatcher = await Dispatcher.build({ useLookupTables: true });
await dispatcher.permittedWallets;
// dispatcher.sag;
/**
    Quick Start: Running Sample Scripts

    Once your environment is set, you can run sample scripts. Below are two examples for fetching account data.
    Example: Fetch a Rental Contract Account

    Assume you have already derived the program–derived address (PDA) for the contract. For example:
 */

// Fleet: 4D93CmNq2y3qRM7zz2QatBBRVrfWwXfDAjN6WkQXFqMC
// Contract: 8mKMPzKCy1qdqpT5WD8bwBRcvk2WgA4s6mHLbSAJJRi4
// ! // Todo: add Fleet Public Key
// const fleetPublicKey = new PublicKey("5da2opD4V7kSviKH1rtdmdST4MwXgKFWm7TDqLCDsPzu"); // !  Replace with your fleet's public key
// const [contractPDA] = PublicKey.findProgramAddressSync([Buffer.from("rental_contract"), fleetPublicKey.toBuffer()], program.programId);

// log(contractPDA); // 8mKMPzKCy1qdqpT5WD8bwBRcvk2WgA4s6mHLbSAJJRi4

class FleetRentalHandler {
  static readonly programId = new PublicKey("SRSLY1fq9TJqCk1gNSE7VZL2bztvTn9wm4VR8u8jMKT");
  static readonly ATLAS_MINT = new PublicKey("ATLASXmbPQxBUYbxPsV97usA3fPQYEqzQBUHgiFCUsXx");
  static readonly TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  static readonly ATOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
  static readonly rentalAuthorityPDA = PublicKey.findProgramAddressSync([Buffer.from("rental_authority")], program.programId);
  static readonly getContractPDA = (fleetPublicKey: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("rental_contract"), fleetPublicKey.toBuffer()], program.programId);
  static readonly getRentalStatePDA = (contractPDA: PublicKey, ownerPublicKey: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("rental_state"), contractPDA.toBuffer(), ownerPublicKey.toBuffer()], program.programId);
  static readonly getRentalThreadPDA = (rentalStatePDA: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [
        // Buffer.from("thread"), // seed: "thread"
        FleetRentalHandler.rentalAuthorityPDA[0].toBuffer(), // seed: rental_authority PDA
        rentalStatePDA.toBuffer(), // seed: rental_state PDA
        // rentalAuthorityPDA.toBuffer(), rentalStatePDA.toBuffer()
      ],
      // new PublicKey("SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE") // Sage Program ID;
      // program.programId
      new PublicKey("AgThdyi1P5RkVeZD2rQahTvs8HePJoGFFxKtvok5s2J1")
    );
  static readonly getRentalTokenAccountPDA = (rentalStatePDA: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [rentalStatePDA.toBuffer(), FleetRentalHandler.TOKEN_PROGRAM_ID.toBuffer(), FleetRentalHandler.ATLAS_MINT.toBuffer()],
      FleetRentalHandler.ATOKEN_PROGRAM_ID
    );

  program: Program;
  private provider: AnchorProvider;
  constructor(private connection: Connection, private walletKeypair: Keypair) {
    this.connection = connection;
    this.walletKeypair = walletKeypair;
    this.program = program;
    this.provider = new AnchorProvider(this.connection, new Wallet(this.walletKeypair), AnchorProvider.defaultOptions());
  }

  /**
   * Find Contract by Fleet Public Key
   * Contract exists only for already BORROWED fleets.
   * @param fleetPublicKey Public key of the fleet to fetch the contract for.
   * @returns
   */
  async getContract(fleetPublicKey: PublicKey) {
    const [contractPDA] = PublicKey.findProgramAddressSync([Buffer.from("rental_contract"), fleetPublicKey.toBuffer()], program.programId);

    try {
      console.log("Contract PDA:", contractPDA.toBase58());

      // First, check if the account exists
      const accountInfo = await connection.getAccountInfo(contractPDA);
      if (!accountInfo) {
        console.log("Account does not exist at PDA:", contractPDA.toBase58());
        return;
      }

      console.log("Account exists, data length:", accountInfo.data.length);
      console.log("Account owner:", accountInfo.owner.toBase58());
      console.log("Program ID:", program.programId.toBase58());

      // Verify the account is owned by our program
      if (!accountInfo.owner.equals(program.programId)) {
        console.log("Account is not owned by the expected program");
        console.log("Expected:", program.programId.toBase58());
        console.log("Actual:", accountInfo.owner.toBase58());
        return;
      }

      // Try to decode the account data manually
      try {
        return (await this.parseContractStateData([{ pubkey: contractPDA, account: accountInfo }]))[0];
      } catch (decodeError) {
        console.error("Error decoding account data:", decodeError);
        console.log("Raw account data length:", accountInfo.data.length);
        console.log("First 32 bytes:", accountInfo.data.slice(0, 32));
      }
    } catch (error) {
      console.error("Error fetching contract:", error);
      console.log("This might indicate:");
      console.log("1. The account doesn't exist");
      console.log("2. The account structure doesn't match the IDL");
      console.log("3. The fleet public key is incorrect");
    }
  }

  /**
   * Fetch all rental contracts from the program.
   * @returns Array of contract data with their PDAs
   */
  async getAllContracts() {
    try {
      console.log("Fetching all contracts...");

      // ContractState discriminator from the IDL
      const contractStateDiscriminator = new Uint8Array([190, 138, 10, 223, 189, 116, 222, 115]);

      // Get all program accounts with the ContractState discriminator
      const accounts = await this.connection.getProgramAccounts(this.program.programId, {
        filters: [
          {
            memcmp: {
              offset: 0, // Discriminator is at the start
              bytes: bs58.encode(contractStateDiscriminator),
            },
          },
        ],
      });
      console.log(`Found ${accounts.length} contract accounts`);
      return accounts;
    } catch (error) {
      console.error("Error fetching all contracts:", error);
      return [];
    }
  }

  /**
   *
   * @param contractAccounts
   * @returns
   */
  async parseContractStateData(contractAccounts: GetProgramAccountsResponse) {
    let defaultNotRented = new PublicKey("11111111111111111111111111111111"); // Default value for not rented state
    const contracts = [];
    for (const { pubkey, account } of contractAccounts) {
      try {
        const data = account.data.subarray(8); // Skip the first 8 bytes (discriminator)
        let offset = 0;
        const version = data[offset]; // 1 byte for version - u8
        offset += 1;

        const toClose = data[offset] !== 0; // 1 byte for boolean - bool
        offset += 1;

        // Rate is the price In Atlas
        const rate = new DataView(data.buffer, data.byteOffset + offset, 8).getBigUint64(0, true); // 8 bytes for rate - u64
        offset += 8;

        const durationMin = new DataView(data.buffer, data.byteOffset + offset, 8).getBigUint64(0, true);
        offset += 8;
        const durationMax = new DataView(data.buffer, data.byteOffset + offset, 8).getBigUint64(0, true);
        offset += 8;

        const paymentsFeqValue = data[offset]; // offset is where the field starts
        const paymentsFeqNames = ["Decasecond", "Minute", "Hourly", "Daily", "Weekly", "Monthly"];
        const paymentsFeq = paymentsFeqNames[paymentsFeqValue] || `Unknown(${paymentsFeqValue})`;
        offset += 1;

        const fleet = new PublicKey(data.subarray(offset, offset + 32));
        offset += 32;

        const gameId = new PublicKey(data.subarray(offset, offset + 32));
        offset += 32;

        const currentRentalState = new PublicKey(data.subarray(offset, offset + 32));
        offset += 32;

        const owner = new PublicKey(data.subarray(offset, offset + 32));
        offset += 32;

        const ownerTokenAccount = new PublicKey(data.subarray(offset, offset + 32));
        offset += 32;

        const ownerProfile = new PublicKey(data.subarray(offset, offset + 32));
        offset += 32;

        const bump = data[offset];
        offset += 1;

        const contractData = {
          contractPDA: pubkey,
          version,
          toClose,
          // Atlas price Amount
          rate,
          // Minimum duration in days
          durationMin,
          // Maximum duration in days
          durationMax,
          paymentsFeq,
          fleet,
          gameId,
          currentRentalState,
          owner,
          ownerTokenAccount,
          ownerProfile,
          bump,
          rented: currentRentalState ? !currentRentalState.equals(defaultNotRented) : false,
        };

        contracts.push(contractData);
      } catch (parseError) {
        console.error(`Error parsing contract at ${pubkey.toBase58()}:`, parseError);
        console.log("Data length:", account.data.length);
        console.log("First 64 bytes:", account.data.subarray(0, 64));
        break;
      }
    }

    console.log(`\n=== SUCCESSFULLY PARSED ${contracts.length} CONTRACTS ===`);
    return contracts;
  }

  /**
   * Accepts a rental contract.
   *  aka Borrow FLeet
   *  
    This call allows a borrower to accept a rental contract. It sets up a rental state, transfers tokens into an escrow account, and creates a recurring payment thread.
   */
  async ixAcceptRental(
    cost: number | BN,
    durationDays: number | BN,
    accounts: {
      borrower_token_account: PublicKey; // Associated Token Account for ATLAS
      starbase: PublicKey; // Starbase public key [from contract]
      starbase_player: PublicKey; // Starbase Player public key [from contract]
      /// ------
      atlasWalletPDA?: PublicKey; // Associated Token Account for ATLAS (optional, can be derived)
      contract_public_key: PublicKey;
      borrower: PublicKey; // Signer accepting the rental [WALLET KEY]
      fleet: PublicKey; // Fleet public key [from contract]
      game_id: PublicKey; // Game ID from contract [from contract]
      borrower_profile: PublicKey; // Sage Player Profile [ Game Handler ];
      borrower_profile_faction: PublicKey; // Sage Player Faction [ Game Handler ];
      rental_state_PDA: PublicKey; // Rental State PDA [from contract]
      rental_token_account_PDA: PublicKey; // Rental Token Account PDA [from contract]
      rental_thread_PDA: PublicKey; // Rental Thread Public Key [from contract]
      rental_authority: PublicKey; // PDA using seed "rental_authority"
    }
  ): Promise<TransactionInstruction> {
    // If cost/durationDays are numbers, convert to BN
    const costBN = BN.isBN(cost) ? cost : new BN(cost);
    const durationBN = BN.isBN(durationDays) ? durationDays : new BN(durationDays);
    console.log("Accepting rental with cost:", costBN.toString(), "and duration:", durationBN.toString());
    // CSS - Starbase Player [#key] : FNSgUrbRLShNFLwBPPsgbefJyyEP73NNMSVFkR3R78yB
    // CSS - Starbase Player [] : FNSgUrbRLShNFLwBPPsgbefJyyEP73NNMSVFkR3R78yB
    log(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>");
    // ! v2
    // const FEE_SEED_1 = Buffer.from([
    //   200, 182, 122, 108, 74, 122, 176, 202, 84, 111, 116, 161, 175, 85, 111, 229, 188, 105, 205, 151, 154, 187, 178, 50, 133, 209, 48, 56,
    //   107, 39, 184, 43,
    // ]);
    // const FEE_SEED_2 = Buffer.from([
    //   6, 221, 246, 225, 215, 101, 161, 147, 217, 203, 225, 70, 206, 235, 121, 172, 28, 180, 133, 237, 95, 91, 55, 145, 58, 140, 245, 133,
    //   126, 255, 0, 169,
    // ]);
    // const [feeTokenAccountPDA] = PublicKey.findProgramAddressSync(
    //   [FEE_SEED_1, FEE_SEED_2, ATLAS_MINT.toBuffer()],
    //   new PublicKey("SRSLY1fq9TJqCk1gNSE7VZL2bztvTn9wm4VR8u8jMKT")
    // );
    // // Create the ATA for the feeTokenAccountPDA if it does not exist
    // // const { getOrCreateAssociatedTokenAccount } = await import("@solana/spl-token");
    // const feeAta = await getOrCreateAssociatedTokenAccount(
    //   connection,
    //   walletKeypair, // payer
    //   ATLAS_MINT,
    //   feeTokenAccountPDA, // owner is the PDA!
    //   true // allow owner off curve
    // );
    // console.log("B1:", FEE_SEED_1.toString());
    // console.log("B2:", FEE_SEED_2.toString);
    // const ataInfo = await connection.getParsedAccountInfo(feeAta.address);
    // console.log("feeAta.address:", feeAta.address.toBase58());
    // log("ATA info:", ataInfo.value);
    // throw "DDDD";
    log({
      borrower: accounts.borrower,
      borrowerTokenAccount: accounts.borrower_token_account, // Associated Token Account for ATLAS
      borrowerProfile: accounts.borrower_profile,
      borrowerProfileFaction: accounts.borrower_profile_faction,
      // --------
      starbase: accounts.starbase, // Starbase public key [from contract]
      starbasePlayer: accounts.starbase_player, // Starbase Player public key [from contract]
      // ------------
      contract: accounts.contract_public_key, // The PDA for the contract (from ["rental_contract", fleet])
      fleet: accounts.fleet,
      gameId: accounts.game_id,
      mint: ATLAS_MINT,
      rentalState: accounts.rental_state_PDA,
      rentalAuthority: accounts.rental_authority, // PDA using seed "rental_authority"
      rentalToken_account: accounts.rental_token_account_PDA,
      rentalThread: accounts.rental_thread_PDA,
      // feeTokenAccount: feeAta.address, //!v2 Pass the ATA address, not the AccountInfo object
      // referralTokenAccount: new PublicKey("7dV8FfaWZPL6ugjSWqtbmkm7HztyJ61qoonJthdPvWFx"), //!v2 Referral Token Account for ATLAS
      sageProgram: new PublicKey("SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE"),
      tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
      antegenProgram: new PublicKey("AgThdyi1P5RkVeZD2rQahTvs8HePJoGFFxKtvok5s2J1"),
      associatedTokenProgram: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
      systemProgram: new PublicKey("11111111111111111111111111111111"),
    });
    log(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>");

    // throw new Error("This function is not implemented yet. Please use the ixAcceptRental method instead.");
    return await program.methods["acceptRental"](costBN, durationBN)
      .accounts({
        referralTokenAccount: new PublicKey("ATLASXmbPQxBUYbxPsV97usA3fPQYEqzQBUHgiFCUsXx"), // Referral Token Account for ATLAS
        borrower: accounts.borrower,
        borrowerTokenAccount: accounts.borrower_token_account, // Associated Token Account for ATLAS
        // --------
        starbase: accounts.starbase, // Starbase public key [from contract]
        starbasePlayer: accounts.starbase_player, // Starbase Player public key [from contract]
        // ------------
        contract: accounts.contract_public_key, // The PDA for the contract (from ["rental_contract", fleet])

        fleet: accounts.fleet,
        gameId: accounts.game_id,
        borrowerProfile: accounts.borrower_profile,
        borrowerProfileFaction: accounts.borrower_profile_faction,
        mint: ATLAS_MINT,
        rentalState: accounts.rental_state_PDA,
        rentalToken_account: accounts.rental_token_account_PDA,
        rentalThread: accounts.rental_thread_PDA,
        // feeTokenAccount: feeAta.address, // <-- Pass the correct ATA address for the fee_token_account
        sageProgram: new PublicKey("SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE"),
        tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
        antegenProgram: new PublicKey("AgThdyi1P5RkVeZD2rQahTvs8HePJoGFFxKtvok5s2J1"),
        associatedTokenProgram: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
        systemProgram: new PublicKey("11111111111111111111111111111111"),
        rentalAuthority: accounts.rental_authority, // PDA using seed "rental_authority"
      })
      .instruction();
  }
}

const FRH = new FleetRentalHandler(connection, walletKeypair);
const profileFaction = await dispatcher.sageGameHandler.getProfileFactionAddress(dispatcher.playerProfile);

//! Execute: fetch single contract data
// Fetch a specific contract by fleet public key
const contracts = [await FRH.getContract(new PublicKey("CwfsvsUV3v1VAysSQ7Q29MNx71rfyyD4YjhBnQN9Th5j"))];
console.log(` -- Found ${contracts.length} contract(s) for the fleet`);
console.log(contracts);
// ! Get Instruction to accept rental
// contracts[0]?.fleet;

if (contracts[0]) {
  const atlas_ata = await getOrCreateAssociatedTokenAccount(
    connection,
    dispatcher.signer.kp, // usually your wallet keypair
    ATLAS_MINT, // ATLAS mint public key
    dispatcher.signer.kp.publicKey, // borrower's public key
    false
  );

  // const statePDA = new PublicKey("6U5Hnc4cYVTtNqm2pzPFdaFsAZ8FgM5WosnUSXgxYTeA");
  // const authorityPDA = new PublicKey("7brLskDzoDLGb68ShNsJM6cmikYS655EY2obtuKYMcjX");
  // const pId = new PublicKey("AgThdyi1P5RkVeZD2rQahTvs8HePJoGFFxKtvok5s2J1");
  // const [pda] = PublicKey.findProgramAddressSync([statePDA.toBuffer(), authorityPDA.toBuffer()], pId);
  // console.log(Buffer.from(new Uint8Array([116, 104, 114, 101, 97, 100])).toString("utf-8"), ":::: ", pda.toBase58());
  // const programId = new PublicKey("SRSLY1fq9TJqCk1gNSE7VZL2bztvTn9wm4VR8u8jMKT");

  // !v2 thread
  // const [rentalThreadPDA] = PublicKey.findProgramAddressSync(
  //   [
  //     Buffer.from("thread"), // seed: "thread"
  //     rentalAuthorityPDA.toBuffer(), // seed: rental_authority PDA
  //     rentalStatePDA.toBuffer(), // seed: rental_state PDA
  //     // rentalAuthorityPDA.toBuffer(), rentalStatePDA.toBuffer()
  //   ],
  //   // new PublicKey("SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE") // Sage Program ID;
  //   program.programId
  //   // new PublicKey("AgThdyi1P5RkVeZD2rQahTvs8HePJoGFFxKtvok5s2J1")
  // );

  const [contractPDA] = FleetRentalHandler.getContractPDA(contracts[0].fleet);
  const [rentalStatePDA] = FleetRentalHandler.getRentalStatePDA(contractPDA, dispatcher.signer.kp.publicKey);
  const [rentalAuthorityPDA] = FleetRentalHandler.rentalAuthorityPDA;
  const [rentalThreadPDA] = FleetRentalHandler.getRentalThreadPDA(rentalStatePDA);
  const [rentalTokenAccountPDA] = FleetRentalHandler.getRentalTokenAccountPDA(rentalStatePDA);

  let ix = await FRH.ixAcceptRental(contracts[0].rate, 1, {
    //|| contracts[0].durationMax || 24
    starbase: new PublicKey("94LdKdSHuG3Na6H1YhkgJsq1caYVxUNeBRm7rLB6hd8k"), // Starbase Public Key [from contract]
    starbase_player: new PublicKey("FNSgUrbRLShNFLwBPPsgbefJyyEP73NNMSVFkR3R78yB"), // Starbase Player Public Key [from contract]
    borrower: dispatcher.signer.kp.publicKey,
    borrower_profile: dispatcher.playerProfile, // Sage Player Profile
    borrower_profile_faction: profileFaction as PublicKey, // Sage Player Faction
    borrower_token_account: atlas_ata.address, // Associated Token Account for ATLAS
    game_id: contracts[0].gameId, //new PublicKey("5da2opD4V7kSviKH1rtdmdST4MwXgKFWm7TDqLCDsPzu"), // Game ID Public Key
    fleet: contracts[0].fleet, // Fleet Public Key
    rental_state_PDA: rentalStatePDA, //! System Program But Another one was used
    rental_token_account_PDA: rentalTokenAccountPDA, // Rental Token Account PDA [from contract]
    rental_thread_PDA: rentalThreadPDA,
    atlasWalletPDA: atlas_ata.address,
    contract_public_key: contracts[0].contractPDA, // The PDA for the contract (from ["rental_contract", fleet])
    rental_authority: rentalAuthorityPDA, // PDA using seed "rental_authority"
  });
  log(ix);

  let ixr = ixToIxReturn(ix, [dispatcher.signer.as]);
  console.log("IS FREE ?? ?? ? ", contracts[0].rented);
  await dispatcher.signAndSend([ixr], false, { increaseBaseFee: 1000, enable: true });
}
//! Execute: fetch all contracts

// const allContracts = await FRH.getAllContracts();
// const parseContractsData = await FRH.parseContractStateData(allContracts);

// Display summary
// if (allContracts.length > 0) {
//   console.log("\n=== CONTRACTS SUMMARY ===");
//   parseContractsData.forEach((contract, index) => {
//     console.log(`\n--------------------------------------------------`);
//     console.log(`${index + 1}. Contract: ${contract.contractPDA.toBase58()}`);
//     log(contract);
//   });
// }
// console.log(`\nFound    ${allContracts.length} total contracts`);
// console.log(
//   `\nBorrowed ${
//     parseContractsData.filter((v) => v.currentRentalState && !v.currentRentalState.equals(PublicKey.default)).length
//   } total contracts`
// );
// console.log(
//   `\nWaiting  ${
//     parseContractsData.filter((v) => !v.currentRentalState || v.currentRentalState.equals(PublicKey.default)).length
//   } total contracts`
// );
