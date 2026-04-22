import { Connection, PublicKey } from "@solana/web3.js";
import { argv, SageGameHandler } from "./GameHandler";
import { prompt } from "../Common/prompt";
import Dispatcher from "../Model/Dispatcher";
import { MiningBuildOptions, FleetProcess as Process } from "../Model/FleetProcess";
import { LookupTable } from "../Model/LookupTable";

//  !! EXPORTS
export * from "./GameHandler";
export * from "./mod";
export * from "./FleetHandler";

const fs = require("node:fs");
const path = require("node:path");
// ! NOTE IMPORTANT - Force new mints to the dispatcher imported Handler

export class DispatcherHolosim extends Dispatcher {
  /**
   * Build dispatcher:
   *  - prepare connection, game handlers
   *  - pre load / create lookup tables
   * @returns
   */
  public static async build(
    options: {
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
    const rpc_url = options.rpc_url || process.env["ATLASNET_RPC_URL"] || "http://localhost:8899";
    Dispatcher.Logger.dbg("RPC_URL", rpc_url);
    const connection = new Connection(rpc_url, "confirmed");
    const transactionConnection = new Connection(rpc_url, {
      // httpHeaders: {
      //   "Content-Type": "application/json",
      //   "solana-client": "solana-client: js/1.0.0-maintenance",
      //   "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:148.0) Gecko/20100101 Firefox/148.0",
      //   "Priority": "u=1, i", //"u=1, i"
      //   "Referer": "https://holosim.staratlas.com/",
      //   "Origin": "https://holosim.staratlas.com",
      //   "Connection": "keep-alive",
      //   "TE": "trailers",
      //   "Sec-Fetch-Site": "cross-site",
      //   "Sec-Fetch-Dest": "empty",
      //   "Sec-Fetch-Mode": "cors",
      // } as Record<string, string>,

      commitment: "confirmed",
      fetchMiddleware: (url: any, options: any, next) => {
        // Dispatcher.Logger.dbg("Fetch Middleware - URL:", url);
        // Dispatcher.Logger.dbg("Fetch Middleware - Options:", options.method || "GET", options.headers, options.body);
        return next(url, options);
      },
    });
    this.Logger.dbg("Init Game Handler");
    //walletKeypair.publicKey ,connection , playerPubkeyOwner, playerProfilePubkey || undefined
    const sageGameHandler = new SageGameHandler(connection); //walletKeypair.publicKey, connection, owner?: PublicKey, playerPubkeyOwner?: PublicKey
    await sageGameHandler.ready;

    Dispatcher.Logger.dbg("READY RPC_URL", rpc_url);

    await sageGameHandler.loadGame();
    if (typeof sageGameHandler.initializeGameMap === "function") {
      sageGameHandler.initializeGameMap({ wsUrl: process.env["ZMEY_HOLOSIM_WS_URL"], force: true });
    }
    if (Dispatcher.feeCheckerRpcUrl) {
      Dispatcher.feeCheckerConnection = new Connection(Dispatcher.feeCheckerRpcUrl, "confirmed");
    }
    // Dispatcher.Logger.info("Player Profile:", playerProfilePubkey?.toBase58());
    let dispatcher = new Dispatcher(Dispatcher.createRuntimeAdapter("holo", sageGameHandler), transactionConnection);
    dispatcher.donate = false;
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
    console.log("LT Folder", folderPath);
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
}

export class ProcessHolosim extends Process {
  static async build(fleetName: string = "", saveStarbaseName: string = "", logPrefix: string = "", logFileNameSuffix = undefined) {
    let dispatcher;
    // When RPC Failed till building the dispatcher
    while (true)
      try {
        dispatcher = await DispatcherHolosim.build({ useLookupTables: true });
        break;
      } catch (e) {
        DispatcherHolosim.Logger.crit("Rebuild dispatcher...", e);
        await new Promise((resolve) => setTimeout(resolve, 2 * 1000));

        continue;
      }
    // console.timeEnd("init_dispatcher");

    if (!fleetName) {
      fleetName = argv.fleetName || ((await prompt("FleetName: ")) || "").toString().trim();
    }

    saveStarbaseName = saveStarbaseName || argv.sbName;
    let fsb = await dispatcher.sageGameHandler.asStatic().readStarbaseByName(saveStarbaseName);
    return new Process(dispatcher, fleetName, fsb.location, logPrefix, logFileNameSuffix);
  }
}
