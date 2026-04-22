import {
  AccountMeta,
  AddressLookupTableAccount,
  Connection,
  Keypair,
  ParsedTransactionWithMeta,
  PublicKey,
  RpcResponseAndContext,
  SimulatedTransactionResponse,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
  ComputeBudgetProgram,
  TransactionExpiredBlockheightExceededError,
  BlockheightBasedTransactionConfirmationStrategy,
  SignatureResult,
  SystemProgram,
  Blockhash,
  Signer,
} from "@solana/web3.js";
import {
  AsyncSigner,
  buildDynamicTransactions,
  buildDynamicTransactionsNoSigning,
  buildLookupTableSet,
  getTransactionSize,
  InstructionReturn,
  InstructionsWithSignersAndLUTs,
  ixToIxReturn,
  keypairToAsyncSigner,
} from "@staratlas/data-source";
import { EventEmitter } from "events";
import bs58 from "bs58";
import _, { clone, isArray } from "lodash";
import { LookupTable, MAX_TABLE_SIZE } from "./LookupTable";
import { Queue, iQueueItem } from "./Queue";
import { iSimpleAction } from "./Action";
import fetch from "node-fetch";

import { logger, Logger } from "../utils";
import { NotPermittedKeypair, SimulationError, TransactionPreBuildError } from "../Error/ErrorHandlers";
import { iActionSignals } from "../Common/Interfaces";
import { ProfileHandler, type ProfilePermittedWalletsData } from "../gameHandlers/ProfileHandler";

import { PlayerProfileIDL } from "@staratlas/player-profile";
import { Program } from "@project-serum/anchor";
import { FleetProcess, iAction } from "../..";
const fs = require("node:fs");
const path = require("node:path");

const Dummy = Keypair.generate();
/// $$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
// import * as ts from "typescript";
// import { BN } from '@project-serum/anchor';
// function tsCompile(source: string, options: ts.TranspileOptions = {}): string {
//     // Default options -- you could also perform a merge, or use the project tsconfig.json
//     if (null === options) {
//         options = { compilerOptions: { module: ts.ModuleKind.CommonJS }};
//     }
//     return ts.transpileModule(source, options).outputText;
// }
// // Make sure it works
// const source = "let foo: string  = 'bar'";
// let result = tsCompile(source);
// this.logger.log(result); // var foo = 'bar';
/// $$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$

const BLOCK_LISTENER_TIME = 500; // 3 sec is normal block closing
export interface iPriorityFeeConfig {
  enable: boolean;
  limit?: number;
  cap?: number;
  minChance?: number;
  lockbackSlots?: number;
  increaseStep?: number;
  increaseBaseFee?: number;
  cuLimit?: number;
}

export type DispatcherTransactionDetails = {
  prioritySetting: iPriorityFeeConfig;
  totalRetries: number;
  donation: number;
  priorityApplied: number;
  accounts: number;
};
export type DispatcherParsedTransactionWithMeta = DispatcherTransactionDetails & ParsedTransactionWithMeta;

export type DispatcherMode = "main" | "holo";

export interface DispatcherRuntimeAdapter {
  mode: DispatcherMode;
  sageGameHandler: any;
  sageFleetHandler: any;
  sageMarketHandler: any;
  starbaseHandler: any;
  lookupTablesSuffix?: string;
}

export default class Dispatcher {
  static feesAggregator: number = 0;
  eventEmitter = new EventEmitter();
  runtimeMode: DispatcherMode = "main";
  sageGameHandler: any;
  sageFleetHandler: any;
  sageMarketHandler: any;
  StarbaseHandler: any;
  transactionRetryTimes: number = Number(process.env["TRANSACTION_RETRY_COUNT"]) || 3;
  transactionRetrySeconds: number = Number(process.env["TRANSACTION_RETRY_SECONDS"]) || 5;
  // Lookup Tables
  lookupTablesStorage: string = import.meta.dir + process.env["LT_STORAGE"];
  lookupTables: LookupTable[] = [];
  // Queue Properties
  queue: Queue<iAction> = new Queue();
  queueGetPeriod: number = 10;
  queueIntervalId?: Timer;
  // Solana Connection BlockHash
  blockListenerIntervalId?: Timer;

  transactionConnection: Connection;
  donate: boolean = true;
  // use to restrict maximum number of instructions in transaction: use case is to restrict max size of transaction when SOLANA HEIGH LOAD in searching of better priority fee balance
  maxInstructions: number = 0;
  /** Hello Moon <only> rpc url //! Work only with payed rpc url */
  static feeCheckerRpcUrl?: string = process.env["SOLANA_RPC_URL_HELLO_MOON_FEE_CHECKER"] || undefined;
  static feeCheckerConnection?: Connection;
  static baseDonation = 8000; // 0.000008
  static verbose = 0;
  static Logger: Logger = logger;
  logger: Logger = Dispatcher.Logger;
  static lastBlockSyncTime: number = 0;
  static blockHashData: Promise<{ blockhash: Blockhash; lastValidBlockHeight: number }>;
  // static lastValidBlockHeight: number = 0;
  // static blockHash: string = "";

  /**
   * Warp method to be always repeated
   * @param callback
   * @returns
   */
  static async wrap<T>(callback: () => Promise<T>): Promise<T> {
    let iter = 0;
    while (iter >= 0)
      try {
        return await callback();
      } catch (e) {
        Dispatcher.Logger.warn(e);
        await new Promise((resolve) => setTimeout(resolve, iter * 60 * 1000));
        iter++;
        if (iter > 10) iter = 10;
        continue;
      }

    throw "WarpedError";
  }

  signedIn: boolean = false; // If dispatcher is signed in then true
  signer: { kp: Keypair; as: AsyncSigner } = {
    kp: Dummy,
    // @ts-ignore - VERSIONs differences in types
    as: keypairToAsyncSigner(Dummy),
  }; // Default signer is sageGameHandler keypair

  permittedWallets: Promise<ProfilePermittedWalletsData[]> = new Promise<ProfilePermittedWalletsData[]>((resolve) => resolve([]));
  funderPermissionIdex: number = 0;
  private _playerProfile?: PublicKey;
  get playerProfile(): PublicKey {
    if (!this.signedIn) {
      Dispatcher.Logger.error("Dispatcher is not signed in, playerProfile may not be set.");
    }
    if (!this._playerProfile) {
      throw new Error("playerProfile is not set. Make sure Dispatcher is signed in.");
    }
    return this._playerProfile;
  }

  set playerProfile(value: PublicKey) {
    Dispatcher.Logger.dbg("[SignedIn] Setting playerProfile:", value.toBase58());
    this._playerProfile = value;
  }

  profileFaction!: PublicKey;
  // sagePlayerProfile!: PublicKey;

  static createRuntimeAdapter(mode: DispatcherMode, sageGameHandler: any): DispatcherRuntimeAdapter {
    return {
      mode,
      sageGameHandler,
      sageFleetHandler: sageGameHandler.sageFleetHandler,
      sageMarketHandler: sageGameHandler.sageGalaxyMarketHandler,
      starbaseHandler: sageGameHandler.StarbaseHandler,
      lookupTablesSuffix: mode === "holo" ? "holosim/" : "",
    };
  }

  private static isRuntimeAdapter(v: any): v is DispatcherRuntimeAdapter {
    return !!v && typeof v === "object" && "sageGameHandler" in v && "sageFleetHandler" in v;
  }

  constructor(runtimeOrGameHandler: DispatcherRuntimeAdapter | any, transactionConnection: Connection | undefined = undefined) {
    const runtime = Dispatcher.isRuntimeAdapter(runtimeOrGameHandler) ? runtimeOrGameHandler : Dispatcher.createRuntimeAdapter("main", runtimeOrGameHandler);

    this.runtimeMode = runtime.mode;
    this.sageGameHandler = runtime.sageGameHandler;
    this.sageFleetHandler = runtime.sageFleetHandler;
    this.sageMarketHandler = runtime.sageMarketHandler;
    this.StarbaseHandler = runtime.starbaseHandler;

    if (this.sageGameHandler && typeof this.sageGameHandler.attachDispatcherEventEmitter === "function") {
      this.sageGameHandler.attachDispatcherEventEmitter(this.eventEmitter);
    }

    if (runtime.lookupTablesSuffix) {
      this.lookupTablesStorage += runtime.lookupTablesSuffix;
    }

    if (!transactionConnection) {
      this.transactionConnection = this.sageGameHandler.connection;
    } else {
      this.transactionConnection = transactionConnection;
    }
    // let env_vars = process.env;
    // delete env_vars["SOLANA_WALLET_SECRET_KEY"];
    // this.logger.dbg("ENVIRONMENT VARIABLES: ", env_vars);
    this.fetchBlockData();

    // Public method Should be called manual after if need constant sync -> which is making requests on time period
    // this.startBlockHashListener();
  }

  async signIn({
    wallet_secret_key = process.env["SOLANA_WALLET_SECRET_KEY"], // Secret Key of the wallet ( wallet could be owner or permitted wallet)
    owner_public_key = process.env["OWNER_WALLET"], // When owner is not the same as wallet owner //! It is assets owner public key
    player_profile = process.env["PLAYER_PROFILE"], // Player Profile Public Key, if not provided will be fetched from game handler
  }: {
    wallet_secret_key: string | undefined;
    owner_public_key: string | undefined;
    player_profile: string | undefined;
  }): Promise<Dispatcher> {
    console.time("<<<SIGN-IN>>> Dispatcher SignIn Time");
    let cDispatcher = clone(this);
    cDispatcher.signedIn = false;
    if (!wallet_secret_key) throw "<<<SIGN-IN>>> Cant signIn dispatcher, wallet_secret_key is empty";
    const walletKeypair = Keypair.fromSecretKey(bs58.decode(wallet_secret_key));
    this.logger.info(" <<<SIGN-IN>>> Sign In with options:", { signer: walletKeypair.publicKey, owner_public_key, player_profile });
    let isHotWallet = (() => {
      if (owner_public_key) {
        return owner_public_key !== walletKeypair.publicKey.toBase58();
      } else {
        return false;
      }
    })();

    let playerPubkeyOwner;
    // Set new signer object
    cDispatcher.signer = {
      //@ts-ignore - VERSIONs differences in types
      as: keypairToAsyncSigner(walletKeypair),
      kp: walletKeypair,
    };
    if (!owner_public_key) {
      Dispatcher.Logger.warn("<<<SIGN-IN>>> Owner Public Key is not provided, using SIGNER public key as owner! [profileIdx: 0]");
      playerPubkeyOwner = walletKeypair.publicKey; // Use wallet public key as owner public key
    } else {
      playerPubkeyOwner = new PublicKey(owner_public_key); // Use provided owner public key
    }
    // Find Sage Player Profile to finish sign in
    if (!player_profile) {
      Dispatcher.Logger.warn("<<<SIGN-IN>>> Sage Player Profile is not provided to SignIn... Search by owner public key:", owner_public_key);
      cDispatcher.playerProfile = await cDispatcher.sageGameHandler.getPlayerProfileAddress(playerPubkeyOwner);
    } else {
      cDispatcher.playerProfile = new PublicKey(player_profile);
    }

    console.log("<<<SIGN-IN>>> ??? isHOTWallet ???:", isHotWallet);
    /**
     * As Slow as many Wallets are permitted to the player profile
     */
    cDispatcher.permittedWallets = isHotWallet // aka.owner
      ? cDispatcher
          .getProfilePermittedWallets(
            cDispatcher.sageGameHandler.connection,
            cDispatcher.sageGameHandler.playerProfileProgram,
            playerPubkeyOwner,
            cDispatcher.playerProfile,
          )
          .then((permitted) => {
            const permittedList = permitted as ProfilePermittedWalletsData[];
            let walletData = permittedList.find((acc) => {
              // console.log("", acc.account == walletKeypair.publicKey.toString() && (acc.scope == "sage" || acc.scope == "default"));
              // walletKeypair.publicKey <aka.funder> - wallet that is permitted to sign transactions on behalf of owner
              return acc.account == walletKeypair.publicKey.toString() && (acc.scope == "sage" || acc.scope == "default");
            });
            cDispatcher.logger.dbg(walletData);
            if (!walletData) throw new NotPermittedKeypair(playerPubkeyOwner.toBase58(), walletKeypair.publicKey.toBase58());
            cDispatcher.funderPermissionIdex = walletData?.idx || 0;
            return permitted;
          })
      : (async () => {
          // when owner is missing is expected funder to be the owner -> default index = 0
          cDispatcher.funderPermissionIdex = 0;
          return [] as ProfilePermittedWalletsData[];
        })();
    await cDispatcher.permittedWallets;
    cDispatcher.signedIn = true;
    Dispatcher.Logger.info("Signed In with wallet:", walletKeypair.publicKey.toBase58());
    Dispatcher.Logger.info("Signed In PlayerProfile:", cDispatcher.playerProfile.toBase58());
    Dispatcher.Logger.info("Wallet Key Index:", cDispatcher.funderPermissionIdex);
    console.timeEnd("<<<SIGN-IN>>> Dispatcher SignIn Time");

    return cDispatcher;
  }
  /**
   * Build dispatcher:
   *  - prepare connection, game handlers
   *  - pre load / create lookup tables
   * @returns
   */
  public static async build(
    options: {
      mode?: DispatcherMode;
      useLookupTables?: boolean;
      rpc_url?: string;
      rpc_transaction_url?: string;
      wallet_secret_key?: string;
      owner_public_key?: string;
      player_profile?: string;
    } = {
      useLookupTables: true,
      rpc_url: "",
      rpc_transaction_url: "",
      wallet_secret_key: "",
      owner_public_key: "",
      player_profile: process.env["PLAYER_PROFILE"],
    },
  ) {
    const mode: DispatcherMode = options.mode || (process.env["SAGE_MODE"] === "holo" ? "holo" : "main");
    const defaultRpc = mode === "holo" ? process.env["ATLASNET_RPC_URL"] || "http://localhost:8899" : process.env["SOLANA_RPC_URL"] || "http://localhost:8899";
    const rpc_url = options.rpc_url || defaultRpc;
    Dispatcher.Logger.dbg("RPC_URL", rpc_url);
    const connection = new Connection(rpc_url, "confirmed");
    const transactionConnection = new Connection(options.rpc_transaction_url || process.env["SOLANA_RPC_TRANSACTION_URL"] || rpc_url, "confirmed");

    const handlerModule = mode === "holo" ? await import("../holoHandlers/HolosimMintsImporter") : await import("../gameHandlers/GameHandler");
    const SageGameHandlerCtor = handlerModule.SageGameHandler;

    //walletKeypair.publicKey ,connection , playerPubkeyOwner, playerProfilePubkey || undefined
    const sageGameHandler = new SageGameHandlerCtor(connection); //walletKeypair.publicKey, connection, owner?: PublicKey, playerPubkeyOwner?: PublicKey
    await sageGameHandler.ready;
    await sageGameHandler.loadGame();
    if (typeof sageGameHandler.initializeGameMap === "function") {
      sageGameHandler.initializeGameMap({ wsUrl: process.env["ZMEY_HOLOSIM_WS_URL"], force: true });
    }

    if (Dispatcher.feeCheckerRpcUrl) {
      Dispatcher.feeCheckerConnection = new Connection(Dispatcher.feeCheckerRpcUrl, "confirmed");
    }

    // Dispatcher.Logger.info("Player Profile:", playerProfilePubkey?.toBase58());
    let dispatcher = new Dispatcher(Dispatcher.createRuntimeAdapter(mode, sageGameHandler), transactionConnection);
    if (options.wallet_secret_key || process.env["SOLANA_WALLET_SECRET_KEY"]) {
      dispatcher = await dispatcher.signIn({
        wallet_secret_key: options.wallet_secret_key || process.env["SOLANA_WALLET_SECRET_KEY"],
        owner_public_key: options.owner_public_key || process.env["OWNER_WALLET"],
        player_profile: options.player_profile || process.env["PLAYER_PROFILE"],
      });
    }

    await dispatcher.permittedWallets;
    // init lookup tables
    if (options && options.useLookupTables === true) {
      await dispatcher.initLookupTables();
      Dispatcher.Logger.dbg(
        "dispatcher Loaded lookup tables:",
        dispatcher.lookupTables.map((lt) => lt.address?.toBase58()),
      );
    }

    return dispatcher;
  }

  async getProfilePermittedWallets(
    connection: Connection,
    playerProfileProgram: Program<PlayerProfileIDL>,
    ownerWalletAddress: PublicKey,
    playerProfile?: PublicKey,
  ) {
    if (playerProfile) return this.sageGameHandler.sagePlayerProfileHandler.getPermittedWalletsPerProfile(playerProfile);

    return this.sageGameHandler.sagePlayerProfileHandler.getPermittedWalletsPerProfile(ownerWalletAddress, false);
  }

  /**
   * Fetch data from onchain player profile account and
   *    read delegated permissions for all permitted wallets
   *
   * @param sagePlayerProfile
   */
  async OLD_getProfilePermittedWallets(
    connection: Connection,
    playerProfileProgram: Program<PlayerProfileIDL>,
    ownerWalletAddress: PublicKey,
    playerProfile?: PublicKey,
  ) {
    // log({ ownerWalletAddress: ownerWalletAddress.toBase58(), playerProfile: playerProfile?.toBase58() });
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Fetch account data from player profile program for sagePlayerProfile
    let profiles = await connection.getProgramAccounts(new PublicKey(this.sageGameHandler.asStatic().PLAYER_PROFILE_PROGRAM_ID), {
      filters: [
        {
          memcmp: {
            offset: 30,
            bytes: ownerWalletAddress.toBase58(), // Owner Wallet address public key
          },
        },
      ],
    });
    // log("Profiles: ", profiles.length);
    const [sagePlayerProfileAccount] = playerProfile
      ? profiles.filter((account) => {
          // Find passed Player Profile
          return account.pubkey.equals(playerProfile);
        })
      : // Use first found profile
        profiles;
    // log("<<<<<<<< sagePlayerProfileAccount >>>>>>>>", sagePlayerProfileAccount, "<<<<<<<<_sagePlayerProfileAccount_>>>>>>>> ");
    // List Permitted Wallets
    let permittedAccounts = [];

    // The first 30 bytes are general information about the Profile
    let profileData = sagePlayerProfileAccount.account.data.subarray(30); // Cut first 30 bytes
    let iter = 0;
    // Each account which has been granted access to this Profile
    //   is listed in 80 byte chunks
    while (profileData.length >= 80) {
      let currProfileKey = profileData.subarray(0, 80);
      // Get Related Account/Wallet PublicKey
      let decodedProfileKey = playerProfileProgram.coder.types.decode("ProfileKey", currProfileKey);
      // log(iter, "decodedProfileKey", decodedProfileKey);
      // Find the Player Profile associated with the account which has been granted access
      let targetUserProfiles = await connection.getProgramAccounts(new PublicKey(this.sageGameHandler.asStatic().PLAYER_PROFILE_PROGRAM_ID), {
        filters: [
          {
            memcmp: {
              offset: 30,
              bytes: decodedProfileKey.key.toString(), // filter all program accounts by Player Profile address
            },
          },
        ],
      });
      // log(iter, "targetUserProfiles", targetUserProfiles.length);

      let targetUserProfile = targetUserProfiles[0];
      // log(iter, targetUserProfile);
      // Find the Player Name associated with the account which has been granted access
      let playerNameAcct;
      // If has profile - fetch name
      if (targetUserProfile) {
        [playerNameAcct] = await connection.getProgramAccounts(new PublicKey(this.sageGameHandler.asStatic().PLAYER_PROFILE_PROGRAM_ID), {
          filters: [
            {
              memcmp: {
                offset: 9,
                bytes: targetUserProfile.pubkey.toString(),
              },
            },
          ],
        });
      }

      //@ts-ignore
      let playerName = playerNameAcct ? new TextDecoder().decode(playerNameAcct.account.data.subarray(42)) : "";
      let permissionType;
      switch (decodedProfileKey.scope.toString()) {
        case this.sageGameHandler.asStatic().SAGE_PROGRAM_ID:
          permissionType = "sage";
          break;
        case this.sageGameHandler.asStatic().POINTS_PROGRAM_ID:
          permissionType = "points";
          break;
        case this.sageGameHandler.asStatic().POINTS_STORE_PROGRAM_ID:
          permissionType = "points_store";
          break;
        case this.sageGameHandler.asStatic().PLAYER_PROFILE_PROGRAM_ID:
          permissionType = "default";
          break;
      }

      let permissions = await ProfileHandler.decodePermissions(decodedProfileKey.permissions);
      // log(iter, "Type", permissionType);

      permittedAccounts.push({
        account: decodedProfileKey.key.toString(),
        name: playerName,
        idx: iter,
        scope: permissionType,
        permissions: permissions,
      });
      // Shift data (iteration)
      profileData = profileData.subarray(80);
      iter += 1;
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }

    this.logger.log("**********************************************");
    this.logger.log("PERMISSIONS ACCOUNTS ", permittedAccounts);
    this.logger.log("**********************************************");

    return permittedAccounts;
  }

  /**
   * Set Static block data,
   * This method is providing cached block data refreshed on demand if data is older then BLOCK_LISTENER_TIME
   * @returns
   */
  async fetchBlockData() {
    if (Dispatcher.lastBlockSyncTime + BLOCK_LISTENER_TIME < new Date().getTime()) {
      while (true)
        try {
          Dispatcher.lastBlockSyncTime = new Date().getTime();
          Dispatcher.blockHashData = this.sageGameHandler.connection.getLatestBlockhash({ commitment: "finalized" });
          break;
        } catch (e) {
          this.logger.error("Cant Fetch Blockhash ... try after ", BLOCK_LISTENER_TIME / 1000, "seconds");
          // console.error(e);
          await new Promise((resolve) => setTimeout(resolve, BLOCK_LISTENER_TIME));

          continue;
        }
    }
    let data = {
      blockHash: (await Dispatcher.blockHashData).blockhash,
      lastValidBlockHeight: (await Dispatcher.blockHashData).lastValidBlockHeight,
    };
    return data;
  }

  async startBlockHashListener() {
    return new Promise(async () => {
      await this.fetchBlockData();
      // Update blockhash Data
      setInterval(async () => {
        // Get the new valid block height
        try {
          await this.fetchBlockData();
        } catch (e) {
          this.logger.error("Cant Fetch Blockhash ... try after ", BLOCK_LISTENER_TIME / 1000, "seconds");
          this.logger.error(e);
        }
      }, BLOCK_LISTENER_TIME);
    });
  }

  /**
   * TODO: Change implementation to use web-socket subscription for new blocks
   *  When Block Comes to resolve waiter
   *
   * Wait for new block
   */
  waitForNewBlock(targetHeight: number = 1): Promise<void> {
    // this.logger.dbg(`Waiting for ${targetHeight} new blocks`);
    return new Promise(async (resolve: any) => {
      // Get the last valid block height of the blockchain
      const lastValidBlockHeight = (await Dispatcher.blockHashData).lastValidBlockHeight;

      // Set an interval to check for new blocks every 1000ms
      const intervalId = setInterval(async () => {
        // Get the new valid block height
        const newValidBlockHeight = (await Dispatcher.blockHashData).lastValidBlockHeight;

        // this.logger.dbg(newValidBlockHeight)
        // Check if the new valid block height is greater than the target block height
        if (newValidBlockHeight > lastValidBlockHeight + targetHeight) {
          // If the target block height is reached, clear the interval and resolve the promise
          clearInterval(intervalId);
          resolve();
        }
      }, 1000);
    });
  }

  /**
   * Add Active lookup tables if there is *.lt files
   *  if there is no active lookup tables will create new one.
   * Lookup tables are used in v0Transactions to optimize max transaction size
   *
   * @returns LookupTables[]
   */
  async initLookupTables(): Promise<LookupTable[]> {
    this.logger.dbg("Dispatcher initialize lookup tables.");
    const isFile = (fileName: string) => {
      return fs.lstatSync(fileName).isFile();
    };
    let folderPath = this.lookupTablesStorage;
    this.logger.dbg([folderPath]);
    for (const file of fs.readdirSync(folderPath)) {
      let filePath = path.join(folderPath, file);
      this.logger.dbg(filePath);

      if (isFile(filePath)) {
        let publicKey = new PublicKey(file.substring(0, file.length - 3));
        let lt = await new LookupTable(this, publicKey).build();
        if (lt.account?.isActive()) {
          this.lookupTables.push(lt);
        }
      }
    }

    // if there is no active lookup Tables Create New
    if (this.lookupTables.length === 0) {
      this.lookupTables.push(await new LookupTable(this).build());
    }

    return this.lookupTables;
  }

  /**
   * Provide priority fee
   * @param tx
   * @param chance default .env TRANSACTION_PRIORITY_MIN_CHANCE
   * @param limit default .env TRANSACTION_PRIORITY_FEE_LIMIT
   * @param lookbackSlots default .env TRANSACTION_PRIORITY_FEE_LOCKBACK_SLOTS
   * @returns
   */
  static async getPriorityFee(
    instructions: TransactionInstruction[],
    chance: number = Number(process.env["TRANSACTION_PRIORITY_FEE_MIN_CHANCE"]),
    lookbackSlots: number = Number(process.env["TRANSACTION_PRIORITY_FEE_LOCKBACK_SLOTS"]),
    limit: number = Number(process.env["TRANSACTION_PRIORITY_FEE_LIMIT"]) || 50000,
    appendInstructions: TransactionInstruction[] = [],
  ): Promise<{ fee: number; accounts: number }> {
    let fee: number = 0;
    let writables: number = 0;
    if (Dispatcher.feeCheckerConnection) {
      let data = await Dispatcher.fetchHMPriorityFees([...instructions, ...appendInstructions], [chance, 75, 90, 100], lookbackSlots);
      writables = data.writables;
      //@ts-ignore
      let amount = Math.round(chance / 100) * Number(data.result.percentileToFee["100"]);
      // let am = Number(data.result.percentileToFee[chance]);

      Dispatcher.Logger.dbg("getPriorityFee MIN:", amount, "Limit", Number(limit));
      //@ts-ignore
      fee = Math.min(Number(amount), Number(limit));
    } else {
      Dispatcher.Logger.warn("_________________ PRIOrity FEE Checker Disabled ________________");
    }
    return { fee: fee, accounts: writables }; // + Number(process.env["TRANSACTION_PRIORITY_FEE_INCREASE_STEP"] || 0); // + X lanport prioritize when have 0 value on the percent
  }

  /**
   * Export all unique writable keys from transaction
   *
   * @param tx
   * @returns
   */
  static getWritableKeys = (instructions: TransactionInstruction[]) => {
    let writables: string[] = []; // PublicKey.toBase58()
    instructions.forEach((i: TransactionInstruction) => {
      i.keys.forEach((am: AccountMeta) => {
        if (am.isWritable) {
          writables.push(am.pubkey.toBase58());
        }
      });
    });

    return _.uniq(writables);
  };

  /**
   *  Provide how often a key is found in transaction
   *    and key "TotalCount" is a value how much keys there is in all instructions
   *  Map<string,number>: string is PublicKey.toBase58(), number is how often is found in all instructions
   *  Map<number,number>: is Map< InstructionIndex, found keys in instruction >
   *  Map<"Total",number>: is count of all non unique keys found
   *
   * @param instructions
   * @returns
   */
  static getPubKeysCounts(instructions: TransactionInstruction[]): Map<string | number, number> {
    let keys: Map<string | number, number>;
    keys = new Map<string, number>();
    let totalCount = 0;
    instructions.forEach((i: TransactionInstruction, index) => {
      let instructionKeys = 0;
      i.keys.forEach((am: AccountMeta) => {
        totalCount += 1;
        let keyFound = keys.get(am.pubkey.toBase58()) || 0;
        keys.set(am.pubkey.toBase58(), keyFound + 1);
        instructionKeys++;
      });

      // Set total keys found in instruction
      keys.set(index, instructionKeys);
      Dispatcher.Logger.dbg("Instruction", index, "keys:", instructionKeys);
    });
    // Set count of all keys found (not unique)
    keys.set("Total", totalCount);
    let uniqueKeys = [...keys.keys()].length - instructions.length - 1;
    keys.set("Unique", uniqueKeys);

    return keys;
  }

  /**
   * Provide list of writables in transaction instructions
   * @param tx
   * @param percentiles default .env [0, 25, 50, 100]
   * @param lookbackSlots default .env TRANSACTION_PRIORITY_FEE_LOCKBACK_SLOTS
   * @returns
   */
  static async fetchHMPriorityFees(
    instructions: TransactionInstruction[],
    percentiles: number[] = [0, 25, 50, 100],
    lookbackSlots: number = Number(process.env["TRANSACTION_PRIORITY_FEE_LOCKBACK_SLOTS"]),
  ) {
    let writables = Dispatcher.getWritableKeys(instructions);
    let keyStatistics = Dispatcher.getPubKeysCounts(instructions);

    Dispatcher.Logger.dbg("Keys: Unique", keyStatistics.get("Unique"), "of", keyStatistics.get("Total"));
    Dispatcher.Logger.dbg("Writables COUNT", writables.length);
    // Dispatcher.Logger.dbg("percentiles:", percentiles);
    Dispatcher.Logger.dbg("lookbackSlots:", lookbackSlots);

    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "getPrioritizationFee",
      params: {
        writableAccounts: writables,
        percentiles: percentiles,
        lookbackSlots: lookbackSlots,
      },
    };
    Dispatcher.Logger.dbg("Response .... ", Dispatcher.feeCheckerRpcUrl);
    //@ts-ignore
    const response = await fetch(Dispatcher.feeCheckerRpcUrl, {
      method: "post",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }).catch((e) => {
      this.Logger.error(e);
      throw e;
    });

    let resp = await response.text();
    /** @ts-ignore */
    var data = JSON.parse(resp);
    data.writables = writables.length;
    Dispatcher.Logger.dbg(data.result.percentileToFee);

    return data;
  }

  /**
   * Provide solana equity of the lanports
   * @param lanports
   * @returns
   */
  static lanportsToSol(lanports: number): number {
    return lanports / LAMPORTS_PER_SOL;
  }

  /**
   * Provide lanports for solana
   * @param sol
   */
  static solToLanports(sol: number): number {
    return sol * LAMPORTS_PER_SOL;
  }

  /**
   *
   * @relatesTo {this.donate}
   * @param ix - Instructions to prepare
   * @param priorityFeeEnabled @default false PASS True when priority fee is enabled
   *
   * @returns
   */
  async prepareInstructionChunks(ix: InstructionReturn[], priorityFeeEnabled?: boolean): Promise<InstructionsWithSignersAndLUTs[]> {
    ix = ix.flat();
    const LutMap: AddressLookupTableAccount[] = this.lookupTables.map((lt) => lt.account).filter((lt) => !!lt); // predicted Look up tables map for each instruction batch - aligned with ixs chunks

    // ! NOTE: This instruction is not used in the transaction, it is only for weight calculation
    // !       and to avoid duplication of the predicate weight in the transaction
    // !       - it is used to predict the weight of the transaction
    let { instructions: predicateWight } = Dispatcher.appendInstructions(111111, this.signer.kp.publicKey);
    let pfInst = ixToIxReturn(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 111111,
      }),
      [this.signer.as],
    );
    let limit = ixToIxReturn(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: 400_000,
      }),
      [this.signer.as],
    );
    let build = await buildDynamicTransactionsNoSigning(
      ix,
      this.signer.as,
      [...(priorityFeeEnabled ? [limit, pfInst] : [])], // Add priority fee instruction if enabled
      //! Add To proper weight prediction - then actualize depending on priority fee ! NOTE - pop last instruction to avoid duplication
      [...(this.donate ? predicateWight.map((t) => ixToIxReturn(t, [this.signer.as])) : [])],
      LutMap,
      this.maxInstructions > 0 ? this.maxInstructions : undefined,
    );

    if (build.isErr()) {
      throw new TransactionPreBuildError(build.error);
    }

    /**
     * Remove SPACERS - aka optionally added instructions for proper space calculations
     * ixs is Chunks of instructions that will be sent in one transaction
     *  - each chunk is limited by maxInstructions
     *  - each chunk is aligned with lookup tables
     *  *  - each chunk is prepared for priority fee if enabled/disabled condition
     *  *  - each chunk is prepared for predicate weight if donate is enabled/disabled condition
     */
    const ixs: InstructionsWithSignersAndLUTs[] = build.value.map((b: InstructionsWithSignersAndLUTs) => {
      /** Remove SPACERS */
      let size = getTransactionSize(b.instructions, this.signer.as.publicKey(), buildLookupTableSet(b.lookupTables));
      this.logger.info(
        "Transaction size:",
        size.size,
        "bytes",
        "with",
        b.instructions.length,
        "instructions,",
        b.lookupTables.length,
        "lookup tables",
        "and",
        size.uniqueKeyCount,
        "unique keys.",
      );
      //! remove priority fee instruction from the beginning of the instructions this will be added later with proper value
      if (priorityFeeEnabled) {
        b.instructions.shift();
        b.instructions.shift();
      }
      //! PoP predicateWight instruction
      if (this.donate) b.instructions.pop();
      return b;
    });
    this.logger.info("--- Prepared", ixs.length, "instruction chunks for transactions.");

    return ixs;
  }

  /**
   * Sign and Send transaction for passed instructions
   * retry on error
   *
   * @param ix
   * @param skipOnError - when true if transaction fail with error it will skip this transaction and continue to next one, when false it will retry transaction on error based on transactionRetryConfig
   * @param priorityFeeLimit default .env
   * @param transactionRetryConfig
   * @returns
   */
  async signAndSend(
    ix: InstructionReturn[],
    skipOnError = false, // [Continue after ALL REPEATS]  when true if transaction fail with error it will skip this transaction and continue to next one, when false it will retry transaction on error based on transactionRetryConfig
    priorityFeeConfig: iPriorityFeeConfig = { enable: Boolean(process.env["TRANSACTION_PRIORITY_FEE_ENABLE"] || 0) },
    transactionRetryConfig: {
      retryOnTimeout?: boolean | ((d: Dispatcher, log: any) => Promise<boolean>);
      continueOnError?: boolean; // ![BREAK REPEAT SYSTEM on ERROR] when true if transaction fail with error it will skip this transaction and continue to next one, when false it will retry transaction on error based on retryOnTimeout config
      signals?: iActionSignals;
      retry_wait_time?: number;
      doNotSimulate?: boolean; // when true transaction will be send without simulation with current priority fee config - use case when you are sure about priority fee value and want to skip simulation step
    } = {
      retryOnTimeout: true,
      continueOnError: false,
      retry_wait_time: this.transactionRetrySeconds,
      doNotSimulate: false,
    },
  ): Promise<Array<DispatcherParsedTransactionWithMeta>> {
    let rx: DispatcherParsedTransactionWithMeta;
    // ix = ix.flat();

    const LutMap: AddressLookupTableAccount[] = this.lookupTables.map((lt) => lt.account).filter((lt) => !!lt); // predicted Look up tables map for each instruction batch - aligned with ixs chunks
    let rxs: Array<DispatcherParsedTransactionWithMeta> = [];
    if (priorityFeeConfig.enable) {
      if (!priorityFeeConfig.minChance) priorityFeeConfig.minChance = Number(process.env["TRANSACTION_PRIORITY_FEE_MIN_CHANCE"] || 50);
      if (!priorityFeeConfig.lockbackSlots) priorityFeeConfig.lockbackSlots = Number(process.env["TRANSACTION_PRIORITY_FEE_LOCKBACK_SLOTS"] || 50);
      if (!priorityFeeConfig.increaseStep) priorityFeeConfig.increaseStep = Number(process.env["TRANSACTION_PRIORITY_FEE_INCREASE_STEP"] || 0);
      if (!priorityFeeConfig.increaseBaseFee) priorityFeeConfig.increaseBaseFee = Number(process.env["TRANSACTION_PRIORITY_FEE_INCREASE_BASE_FEE"] || 0);
      if (!priorityFeeConfig.limit) priorityFeeConfig.limit = Number(process.env["TRANSACTION_PRIORITY_FEE_LIMIT"] || 0);
      if (!priorityFeeConfig.cap) priorityFeeConfig.cap = Number(process.env["TRANSACTION_PRIORITY_FEE_CAP"] || 0);
    }
    let feeCap: number = priorityFeeConfig.cap || 0;
    // ! Get Instruction example for weight calculation
    let { instructions: priorityFeePredicateWight } = Dispatcher.appendInstructions(1, this.signer.kp.publicKey);

    // ! Chuck instructions to avoid max transaction size overflow - keep space if priority fee and donates are enabled
    const ixs = await this.prepareInstructionChunks(ix, !!priorityFeeConfig.enable);
    this.logger.dbg(
      "Instructions chunks sizes:",
      ixs.map((i) => i.instructions.length),
      ixs.length,
      "Chunks of instructions to send in one transactions",
    );

    this.logger.dbg("Build ", ixs.length, " [IXS] ");

    for (let iIterator = 0; iIterator < ixs.length; iIterator++) {
      // let instructions = await this.sageGameHandler.convertInstructionReturnToTransactionInstruction(this.signer.as, ixs[iIterator]);
      // i.instructions[0].signers
      let i = ixs[iIterator];
      let instructions = i.instructions.map((i) => i.instruction);
      let asSigners = i.instructions.map((i) => i.signers).flat();

      let useLuts = i.lookupTables && i.lookupTables.length > 0 ? i.lookupTables : LutMap;
      let priorityIncrease = 0;
      let lastError;
      for (let errCount = 0; errCount < this.transactionRetryTimes; errCount++) {
        // Listen for breaker signal
        if (transactionRetryConfig.signals) {
          // console.log("AbortSignal", transactionRetryConfig.signals.abort);
          let sigs = transactionRetryConfig.signals;
          if ((typeof sigs.abort.state === "boolean" && sigs.abort.state) || (typeof sigs.abort.state !== "boolean" && (await sigs.abort.state({})))) {
            await sigs.abort.beforeAbort({});
            await sigs.abort.thrower({});
          }
        }

        let instructionsToSubmit = [...instructions]; // clone array data - use copy of initial instructions at the beginning of the iteration
        console.time("[TransactionExecutionTime]");
        try {
          let pfCheck = await Dispatcher.getPriorityFee(
            this.donate ? [...instructions, ...priorityFeePredicateWight] : instructions,
            priorityFeeConfig.minChance,
            priorityFeeConfig.lockbackSlots,
            priorityFeeConfig.limit || undefined,
          );
          let priorityFee =
            1 +
            (priorityFeeConfig.increaseBaseFee || 0) +
            priorityIncrease +
            // Actual priorities after throwing error ( it is possible to need less lanports )
            pfCheck.fee;
          // Cap the fee value based on config
          priorityFee = Math.min(priorityFee, feeCap);
          if (priorityFeeConfig.cuLimit && priorityFeeConfig.cuLimit > 0) {
            let cu = Math.max(200000, priorityFeeConfig.cuLimit);
            this.logger.info("{AddPriorityFee}:", cu, "[CU Limit]");
            const computeLimitIx = ComputeBudgetProgram.setComputeUnitLimit({
              // Increase limit when priority fee is active for bigger transactions
              units: cu, // 200_000 is default value
            });
            instructionsToSubmit.unshift(computeLimitIx);
          }

          if (priorityFeeConfig.enable && priorityFee) {
            const computePriceIx = ComputeBudgetProgram.setComputeUnitPrice({
              microLamports: priorityFee,
              // microLamports: priorityFee,
            });

            instructionsToSubmit.unshift(computePriceIx);
            this.logger.info("{AddPriorityFee}:", priorityFee, "[units]", "accounts:", pfCheck.accounts); // pfCheck.accounts *
          }

          this.logger.dbg(instructionsToSubmit.length, "ixs", this.constructor.name, "Simulate transaction ...");

          let {
            transaction: simTransaction,
            strategy: simStrategy,
            transfer: simTransfer,
          } = await this.v0Transaction(instructionsToSubmit, useLuts, false, priorityFee, this.donate);

          const simulationsFlow = async () => {
            let sim = await this.v0Simulate(simTransaction, asSigners);
            if (sim.value.err) {
              this.logger.dbg("sim.value", sim.value);
              this.logger.error("sim.value.logs", sim.value.logs);
              this.logger.error("sim.value.err", sim.value.err);
              throw new SimulationError(sim.value);
            } else {
              this.logger.dbg("Transaction returns: ", sim.value.returnData);
              this.logger.dbg("sim.value.logs", sim.value.logs);
            }
            this.logger.info("Simulation Computed Units used:", sim.value.unitsConsumed, this.constructor.name);
          };

          // Log accounts strictly before simulation
          if (instructionsToSubmit.length > 1) {
            Dispatcher.logAccountsInInstructionOrder(instructionsToSubmit);
          }

          if (!transactionRetryConfig.doNotSimulate) {
            await simulationsFlow();
          } else {
            this.logger.warn("Skipping transaction simulation as per configuration. Sending transaction with current priority fee settings.");
          }

          let { transaction, strategy, transfer } = { transaction: simTransaction, strategy: simStrategy, transfer: simTransfer };

          this.logger.warn(this.constructor.name, "Sending transaction ...", strategy);
          rx = {
            ...(await this.v0SignAndSend(transaction, strategy)),
            donation: Dispatcher.lanportsToSol(transfer),
            priorityApplied: priorityFeeConfig.enable && priorityFee ? priorityFee : 0,
            accounts: pfCheck.accounts,
            prioritySetting: priorityFeeConfig,
            totalRetries: errCount,
          };

          console.timeEnd("[TransactionExecutionTime]");
          if (rx.meta) {
            rx.meta.fee += transfer || 0;
            Dispatcher.feesAggregator += rx.meta?.fee || 0;

            this.logger.dbg("Transaction Computed Units used:", rx.meta?.computeUnitsConsumed);
            if (rx.transaction?.signatures?.[0]) {
              // let link = `https://solscan.io/tx/${rx.transaction.signatures[0]}`; //
              // ?cluster=custom&customUrl=https://rpc.ironforge.network/devnet?apiKey=01JEB7YQ0YPK31WQTC0VQ5Y9YP
              //
              //https://solscan.io/tx/4Yv1p9DKZaUv8iehnb2YgyGuR1Ar5ebapV6z9bCxS85ZWBBwpGpExVarHWP3e2fe5noKg2bGhdBGSfs5bNSG2ApZ
              this.logger.info(`✅ Transaction Success: https://solana.fm/tx/${rx.transaction.signatures[0]}`);
            }
            this.logger.dbg("Base Transaction Fee:", Dispatcher.lanportsToSol(rx.meta?.fee || 0));
            this.logger.dbg("Donation:", Dispatcher.lanportsToSol(transfer));

            this.logger.info("Transaction :", Dispatcher.lanportsToSol(rx.meta?.fee || 0) - Dispatcher.lanportsToSol(transfer));
            this.logger.info("Totals:", Dispatcher.lanportsToSol(rx.meta?.fee || 0), "of", Dispatcher.lanportsToSol(Dispatcher.feesAggregator));
          }

          break;
        } catch (e) {
          console.timeEnd("[TransactionExecutionTime]");

          lastError = e;
          let retry_wait_time = this.transactionRetrySeconds;
          // Overwrite default retry_wait_time if it is set in config
          if (transactionRetryConfig.retry_wait_time != undefined) {
            retry_wait_time = Math.max(transactionRetryConfig.retry_wait_time, 0);
          }

          if (e instanceof Error) {
            let retryOnTimeout: boolean;
            if (!transactionRetryConfig.retryOnTimeout || "boolean" == typeof transactionRetryConfig.retryOnTimeout) {
              retryOnTimeout = Boolean(transactionRetryConfig.retryOnTimeout);
            } else if ("function" == typeof transactionRetryConfig.retryOnTimeout) {
              /**
               * This method is called often to limit false negative timeout situations
               * Custom transaction verification ( true means repeat false is not repeat transaction )
               */
              retryOnTimeout = await transactionRetryConfig.retryOnTimeout(this, e);
            } else {
              retryOnTimeout = true;
            }
            // console.log("RETRY_ON_TIMEOUT", retryOnTimeout);
            if (e.name === "TransactionExpiredBlockheightExceededError") {
              // This is network error  when there is to much transactions
              //   - retry until transaction is processed.
              errCount = 0; // reset counter
              retry_wait_time = 0.1; // after long waiting retry the transaction after 1 second

              // Increase Priority Fee based on config
              if (priorityFeeConfig.enable && priorityFeeConfig.increaseStep) {
                priorityIncrease += priorityFeeConfig.increaseStep;
              }
              // await new Promise((resolve) => setTimeout(resolve, 1000 * (retry_wait_time + errCount * retry_wait_time)));
              if (retryOnTimeout == true) {
                continue;
              } else {
                rx = {} as DispatcherParsedTransactionWithMeta;
                break;
              }
            } else if (e.message.match(/Blockhash not found/)) {
              // Always repeat - this happened when the block was expired, So we catch the block hash at the last moment of his valid time
              errCount = 0; // reset counter
              retry_wait_time = 0.1; // wait 1 second
              // error: failed to send transaction: Transaction simulation failed: Blockhash not found
            }
            // console.error("Dispatcher::signAndSend - Error catch-ed:", e.constructor.name, e.name);
          }
          if (transactionRetryConfig.continueOnError) {
            break;
          }

          // Silent catch when verbose is negative value
          await new Promise((resolve) => setTimeout(resolve, 1000 * (retry_wait_time + errCount * retry_wait_time)));
        }
      }
      //@ts-ignore rx initialized
      if (!skipOnError && rx?.meta?.err) {
        throw rx.meta?.err;
        //@ts-ignore rx initialized
      } else if (!skipOnError && !rx) {
        throw lastError || "Dispatcher::signAndSend UNKNOWN ERROR";
      }
      //@ts-ignore rx initialized
      rxs.push(rx);
    }

    return rxs;
  }
  /**
   * Find a key in lookup tables and return this table
   *
   * @param key
   * @returns Lookup table containing the key
   */
  hasKeyInLookupTables(key: PublicKey): LookupTable | undefined {
    return this.lookupTables.find((table: LookupTable) => table.accounts.has(key.toBase58()));
  }

  /**
   * Get not found keys in all lookup tables from Transaction Instructions.
   *
   * @param instructions PublicKey[]
   */
  getMissingKeysInLookupTables(instructions: TransactionInstruction[]) {
    let newAccounts: PublicKey[] = [];

    instructions.map((ti: TransactionInstruction) => {
      ti.keys.forEach((accountMeta: AccountMeta) => {
        // ( NOT ) is account in some lookup table
        if (!this.hasKeyInLookupTables(accountMeta.pubkey)) {
          newAccounts.push(accountMeta.pubkey);
        }
      });
      if (!this.hasKeyInLookupTables(ti.programId)) {
        newAccounts.push(ti.programId);
      }
    });

    return _.uniqWith(newAccounts, (a, b) => a.toBase58() === b.toBase58());
  }

  /**
   *
   * Check all lookup tables which accounts are new for all of them
   *  then fill them to the limit of 256 addresses.
   *
   * If there is no free slots in lookup tables will
   *  !!! CREATE [ cost 0.0035 SOL ] !!!
   *  Can create a new lookup tables and append to this.lookupTables
   *  in !!! Recursive Call !!!
   * MAX insert by 32 accounts per transaction
   * All tables are used in .v0Transaction()
   * Creation Hold
   *
   * @param instructions
   */
  async appendLookupTables(instructions: TransactionInstruction[], accountsLimit = 24): Promise<void> {
    let newAccounts = this.getMissingKeysInLookupTables(instructions);
    this.logger.dbg("Begin:appendLookupTables ", newAccounts.length, ">", 0);
    this.logger.dbg(newAccounts.map((v) => v.toBase58()));
    // Fill existing tables
    if (newAccounts.length > 0) {
      this.logger.dbg("New accounts found:", newAccounts.length);
      for (const lookupTable of this.lookupTables) {
        // Max accounts in lookup table is 256
        let freeSlots = MAX_TABLE_SIZE - lookupTable.accounts.size;
        this.logger.dbg(lookupTable.address?.toBase58(), "free slots", freeSlots);
        if (freeSlots > 0) {
          accountsLimit = Math.min(accountsLimit, freeSlots);

          if (newAccounts.length > 0 && newAccounts.length >= accountsLimit) {
            let addList = newAccounts.slice(0, accountsLimit);
            await lookupTable.addAddresses(addList);
            await lookupTable.fetchAccountData();
            // Recursive call to add another pool of accounts
            await this.appendLookupTables(instructions);
            // after add address need to be fetched new list of accounts
            await this.waitForNewBlock(100);

            newAccounts = this.getMissingKeysInLookupTables(instructions);
          } else {
            // recursion bottom 1 - when all existing tables filled
            // load all accounts when they are more then zero
            if (newAccounts.length > 0) {
              await lookupTable.addAddresses(newAccounts);
              // Re-check for missing accounts

              await this.waitForNewBlock(100);
              await lookupTable.fetchAccountData();
              newAccounts = this.getMissingKeysInLookupTables(instructions);
            }
            // this.logger.dbg("------- BREAK -------");
            break;
          }
        } else {
          if (freeSlots === 0) {
            // Table is full go to next table
            continue;
          } else {
            // free Slots can not be negative
            this.logger.dbg("Not Enough free slots:", freeSlots, "Continue");
            throw " Should not happen negative value!!!";
          }
        }
      }
    }

    // if there is no enough free slots in existing tables still there is accounts
    // Create new lookup table and
    // Recursive call - after exiting the bottom 1 to with new created table to fill
    //   - each time when go on top is checked for not added accounts.
    // newAccounts re-fetched after adding addresses
    if (newAccounts.length > 0) {
      this.logger.dbg("=============================================");
      this.logger.dbg("     Before Create new Table:", newAccounts.length);
      this.logger.dbg("=============================================");
      // append lookup tables
      this.lookupTables.push(
        // Create new Lookup Table and initialize accounts
        await new LookupTable(this).build(newAccounts.slice(0, accountsLimit)),
      );
      await this.waitForNewBlock(1);
      // Re-check for missing accounts
      newAccounts = this.getMissingKeysInLookupTables(instructions);

      // If still there is account now we have a new lookup table
      //  recursive call again
      if (newAccounts.length > 0) {
        await this.appendLookupTables(instructions);
      }
    }
  }

  /**
   * v0 Transaction is a new form of transactions with available option for lookup table usage
   *    see solana cookbook
   *
   * @param instructions transaction instructions
   * @param lookupTables lookup tables to use - when not passed use default dispatcher lookup tables
   * @param appendLookupTables default true, set to false in addAddress to lookup tables
   */
  async v0Transaction(
    instructions: TransactionInstruction[],
    lookupTablesAccount: AddressLookupTableAccount[] | null = [],
    appendLookupTables = false, // appending lookup tables is possible only when you have privileges,
    priorityFee: number = 0,
    appendInstructions: boolean = true,
  ): Promise<{ transaction: VersionedTransaction; strategy: BlockheightBasedTransactionConfirmationStrategy; transfer: number }> {
    // appendInstructions = false;

    // Append lookup tables content - execute transaction to extend lookup table with missing accounts
    if (appendLookupTables) {
      await this.appendLookupTables(instructions);
    }

    let { instructions: aInstructions, amount } = Dispatcher.appendInstructions(priorityFee, this.signer.kp.publicKey);

    if (appendInstructions) {
      this.logger.info("DONATE:", amount, "microLamports", `(${Dispatcher.lanportsToSol(amount)} SOL)`);
      instructions.push(...aInstructions);
    } // get Accounts from LookupTables if there is no passed LT
    if (lookupTablesAccount && lookupTablesAccount.length == 0) {
      this.lookupTables.forEach((lt: LookupTable) => {
        if (lt.account) {
          lookupTablesAccount.push(lt.account);
        }
      });
    }
    this.logger.dbg("LookupTables:", this.lookupTables.length);
    // Transaction call fetching block data ( optimization for RPC in case of not started listener )
    let { blockHash, lastValidBlockHeight } = await this.fetchBlockData();
    // Build Transaction Message
    let messageV0 = new TransactionMessage({
      payerKey: this.signer.kp.publicKey,
      recentBlockhash: blockHash,
      instructions,
    }).compileToV0Message(lookupTablesAccount || []);

    // console.timeEnd("v0Transaction.Build");
    let transaction = new VersionedTransaction(messageV0);

    this.logger.dbg("Serialized Weight:", transaction.serialize().length, "bytes");
    return {
      transaction: transaction,
      strategy: {
        signature: "",
        blockhash: blockHash,
        lastValidBlockHeight: lastValidBlockHeight,
      } as BlockheightBasedTransactionConfirmationStrategy,
      transfer: appendInstructions ? amount : 0,
    };
  }

  /**
   * Execute transaction onChain
   *
   * @param transaction
   * @returns
   */
  async v0SignAndSend(
    transaction: VersionedTransaction,
    strategy: BlockheightBasedTransactionConfirmationStrategy,
    signers: AsyncSigner[] = [],
  ): Promise<ParsedTransactionWithMeta> {
    console.time("v0SignAndSend - execution time");
    // sign your transaction with the required `Signers`
    // this.sageGameHandler.funder.sign(transaction);
    if (signers.length > 0) {
      for (const signer of signers) {
        this.logger.dbg("[SIGN with]", signer.publicKey().toBase58());
        await signer.sign(transaction);
      }
    } else {
      this.logger.dbg("[SIGN with]", this.signer.kp.publicKey.toBase58());
      transaction.sign([this.signer.kp]);
    }

    // send our v0 transaction to the cluster
    this.logger.log("v0-SendTransaction: ", new Date().toISOString(), "by", this.transactionConnection.rpcEndpoint);

    /**
     * simulate real TimeOut for test purpose
     */
    // throw new TransactionExpiredBlockheightExceededError("TestTrue_Timeout_noTransactionCompleted-retryNTimes");

    const txid = await this.transactionConnection.sendTransaction(transaction, { skipPreflight: true });
    this.logger.log(`https://explorer.solana.com/tx/${txid}`); // ?cluster=devnet
    // Append with current transaction Id
    strategy = {
      signature: txid,
      blockhash: strategy.blockhash,
      lastValidBlockHeight: strategy.lastValidBlockHeight,
    } as BlockheightBasedTransactionConfirmationStrategy;

    let res: RpcResponseAndContext<SignatureResult> = await this.sageGameHandler.connection.confirmTransaction(strategy);
    if (res.value.err) {
      throw res.value.err;
    }

    await new Promise((resolve) => setTimeout(resolve, 2 * 1000));
    let parsedTx = await this.sageGameHandler.connection.getParsedTransaction(txid, {
      maxSupportedTransactionVersion: 0,
    });

    /**
     * simulate 'False TimeOut' - transaction was done but throwing a timeout */
    // if (parsedTx) {
    //   throw new TransactionExpiredBlockheightExceededError(txid);
    // }
    /*   */
    if (!parsedTx) {
      this.logger.warn("No Transaction RESPONSE !!! Retry fetch transaction after 3 seconds.");
      await new Promise((resolve) => setTimeout(resolve, 3 * 1000));
      parsedTx = await this.sageGameHandler.connection.getParsedTransaction(txid, {
        maxSupportedTransactionVersion: 0,
      });

      if (!parsedTx) {
        this.logger.warn("No Transaction RESPONSE !!! Retry fetch transaction after 3 seconds.");
        await new Promise((resolve) => setTimeout(resolve, 3 * 1000));
        parsedTx = await this.sageGameHandler.connection.getParsedTransaction(txid, {
          maxSupportedTransactionVersion: 0,
        });
      }
    }

    if (!parsedTx) throw new TransactionExpiredBlockheightExceededError(txid);
    console.timeEnd("v0SignAndSend - execution time");
    return parsedTx;
  }

  /**
   * Execute transaction onChain
   *
   * @param transaction
   * @returns
   */
  async v0Simulate(transaction: VersionedTransaction, signers: AsyncSigner[] = []): Promise<RpcResponseAndContext<SimulatedTransactionResponse>> {
    console.time("v0Simulate");
    // sign your transaction with the required `Signers`
    if (signers.length > 0) {
      for (const signer of signers) {
        this.logger.dbg("[SIGN with]", signer.publicKey().toBase58());
        await signer.sign(transaction);
      }
    } else {
      this.logger.dbg("[SIGN with]", this.signer.kp.publicKey.toBase58());
      transaction.sign([this.signer.kp]);
    }
    // send our v0 transaction to the cluster
    const txid = await this.sageGameHandler.connection.simulateTransaction(transaction);
    // console.timeEnd("v0Simulate");
    // this.logger.dbg(txid);
    return txid;
  }

  async startQueue(): Promise<void> {
    this.queue.isActive = true;
    let startTimestamp = new Date().getTime();
    this.logger.log("Start queue ... ", startTimestamp);

    this.queueIntervalId = setInterval(async () => {
      let processStartTime = new Date().getTime();
      this.logger.log("ProcessIntervalTime:", processStartTime, this.queue.isBusy);
      if (this.queue.isActive) {
        await this.processItems(processStartTime);
      } else {
        this.logger.log("Queue process is inactive.");
      }
    }, this.queueGetPeriod * 1000);

    return;
  }

  /**
   * Force isActive to false,
   *    this action will stop the the processing started
   * by .start()
   */
  stopQueue(): void {
    this.queue.isActive = false;
    clearInterval(this.queueIntervalId);
  }

  /**
   * Process items
   * @param processStartTime
   * @deprecated - this method is not used in current implementation, it is a placeholder for future implementation of queue processing logic, which will be based on the new action and process structure. The new structure will allow to define complex processes with multiple steps and actions, and the queue will be responsible for managing the execution of these processes based on their defined logic and dependencies.
   */
  async processItems(processStartTime: number = new Date().getTime()) {
    this.logger.log("processItems:qActive:", this.queue.isActive);
    this.logger.log("processItems:qIsBusy:", this.queue.isBusy);
    this.logger.log("processItems:pTime:", processStartTime, this.queue.isBusy);
    this.logger.log("processItems:length", this.queue.queueItems.length);

    let items = await this.queue.unqueue(processStartTime, 3);
    if (isArray(items)) {
      this.logger.log(`items: ${items.length} waiting items: ` + this.queue.queueItems.length);
      let isSimpleAction = (action: any): action is iSimpleAction => {
        return "getInstructions" in action;
      };

      let promises: Promise<any>[] = [];
      let instructions: TransactionInstruction[] = [];
      let fallbacks: iQueueItem<iAction>[] = [];
      for (const item of items) {
        this.logger.log(
          item.action.constructor.name,
          isSimpleAction(item.action),
          processStartTime,
          "processItems[item]",
          item.execTime,
          processStartTime,
          "delay:",
          processStartTime - item.execTime,
        );
        // Do something with items
        if (isSimpleAction(item.action)) {
          instructions.push(...(await item.action.getInstructions()));
          fallbacks.push(item);
        } else {
          // !!!! not simple action - execute then execute next step,
          if (item.next !== undefined) {
            /** @ts-ignore */
            promises.push(item.action.run().then(async () => item.next(item.action.process)));
          } else {
            // at the end of the process there is no next step
            promises.push(item.action.run().then(async () => item.action.process.forward()));
          }
        }
      }
      // this.logger.log("!!!!!! Promises Length: ", promises.length);
      // this.logger.log("instructions:", instructions.length, "fallbacks:", fallbacks.length);
      // Process Instructions
      if (instructions.length > 0) {
        // Remove [], false to enable lookup tables
        let { transaction, strategy } = await this.v0Transaction(instructions, [], false);

        // let transactionSimulationResponse = await dispatcher.v0Simulate(v0Transaction);
        await this.v0SignAndSend(transaction, strategy);
        await this.waitForNewBlock(10);
        // forceCallback
        fallbacks.forEach((qItem: iQueueItem<iAction>) => {
          if (qItem.next) qItem.next(qItem.action.process as FleetProcess); // do not wait ... when complete will add / or not next queue item
        });
      }
    }
  }

  static appendInstructions(priorityFee = 0, from: PublicKey) {
    priorityFee = Math.ceil(0.1 * priorityFee);

    let amount = Dispatcher.baseDonation + priorityFee;

    // console.log("Donation: ", amount, "micro lanports", Dispatcher.lanportsToSol(amount), "[sol]");
    return {
      instructions: [
        SystemProgram.transfer({
          fromPubkey: from, // new PublicKey(process.env.OWNER_WALLET || ""),
          toPubkey: new PublicKey("C2mb9pHT3ahmsJ4B44TckwdHqPbZYpp4emqQzX4ioEbT"),
          lamports: amount,
        }),
        // Memo Instruction
        // new TransactionInstruction({
        //   keys: [{ pubkey: new PublicKey(process.env.OWNER_WALLET || ""), isSigner: true, isWritable: true }],
        //   data: Buffer.from("Thankyou !!! Donate ...", "utf-8"),
        //   programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
        // }),
      ] as TransactionInstruction[],
      amount: amount,
    };
  }

  private static logAccountsInInstructionOrder(instructions: TransactionInstruction[]): void {
    if (!process.env["DISPATCHER_LOG_ACCOUNTS_ORDERED"]) return;
    const ordered: string[] = [];
    instructions.forEach((ix, ixIndex) => {
      ordered.push(`[${ixIndex}] program: ${ix.programId.toBase58()}`);
      ix.keys.forEach((k, kIndex) => {
        ordered.push(`  [${ixIndex}.${kIndex}] ${k.pubkey.toBase58()} | signer=${k.isSigner} | writable=${k.isWritable}`);
      });
    });
    Dispatcher.Logger.crit("Transaction accounts (ordered):\n" + ordered.join("\n"));
  }
}
