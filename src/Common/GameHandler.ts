import {
  PublicKey,
  Connection,
  TransactionInstruction,
  Keypair,
  AddressLookupTableAccount,
  RpcResponseAndContext,
  SimulatedTransactionResponse,
  SignatureResult,
  TransactionMessage,
  VersionedTransaction,
  TransactionSignature,
  TransactionError,
  Transaction,
  GetProgramAccountsFilter,
  GetProgramAccountsResponse,
  KeyedAccountInfo,
  Signer,
} from "@solana/web3.js";
import { getAssociatedTokenAddress, Account as TokenAccount, transfer } from "@solana/spl-token";
import _ from "lodash";
import { prompt } from "./prompt";

import {
  InstructionReturn,
  getParsedTokenAccountsByOwner,
  AsyncSigner,
  TransactionReturn,
  sendTransaction,
  DecodedAccountData,
  Account,
  readFromRPCOrError,
  createAssociatedTokenAccountIdempotent,
} from "@staratlas/data-source";
import { CargoIDLProgram, CargoPod } from "@staratlas/cargo";
import { cleanUpStarbaseCargoPods, getCleanPodsByStarbasePlayerAccounts, getPodCleanupInstructions } from "@staratlas/sage-main/src/utils";
import { ProfileFactionAccount, ProfileFactionIDL, ProfileFactionIDLProgram } from "@staratlas/profile-faction";
import { PlayerProfileIDL } from "@staratlas/player-profile";
import { AnchorProvider, BN, BorshAccountsCoder, Program } from "@project-serum/anchor";
import { log } from "console";
import { Coordinates } from "../Model/Coordinates";
import { logger, Logger } from "../utils";
import { bs58 } from "@project-serum/anchor/dist/cjs/utils/bytes";
import { ProgramAccountListener } from "./ProgramAccountListener";
import { EventEmitter } from "events";
import { GameMapStore, RpcFleetSource, ZmeyHubFleetWsSource, type FleetMovementState, type FleetSnapshot } from "./GameMapService";
import { FleetHandler } from "./FleetHandler";
export type AnySageIDLProgram = import("@staratlas/sage-main").SageIDLProgram | import("../holoHandlers/IDL/constants").SageIDLProgram;

export { byteArrayToString } from "@staratlas/data-source";
export const StarbaseDamage = {
  T1: 5000, // todo: test and check
  T2: 8500,
  T3: 15300,
  T4: 20000, // todo: test and check
  T5: 30000, // Todo: test and check
};
// Define multiple sage versions support

export interface SageResourcesMints {
  [key: string]: PublicKey;
}

export interface SagePlanetAddresses {
  [key: string]: PublicKey;
}

export interface StarbaseMapItem {
  location: Coordinates;
  resources: string[];
  richness: number[];
  name: string; // UST-1, ONI-1, MUD-1, MRZ-23
  fraction: string; // UST, ONI, MUD
  starbasePublicKey: string; // publicKey
  craftingFacility?: string; // publicKey
  upgradeFacility?: string; // publicKey
}

export interface StarbaseMap {
  [key: string]: StarbaseMapItem;
}

export interface StarbaseLike {
  data: {
    sector: BN[];
    seqId: number;
  };
}
export function getRichness(base: StarbaseMapItem, resourceName: string): number {
  let index = base.resources.findIndex((v) => v === resourceName);
  return base.richness[index] || 0;
}
export type ResourceHardnessMap = Record<string, number>;

export async function parseFleetAccountsShared<TFleet, TProgram>(
  accounts: GetProgramAccountsResponse | KeyedAccountInfo[],
  program: TProgram,
  decoder: (account: KeyedAccountInfo, program: TProgram) => DecodedAccountData<TFleet> | Promise<DecodedAccountData<TFleet>>,
): Promise<{
  [key: string]: TFleet;
}> {
  const results: { [key: string]: TFleet } = {};

  for (const account of accounts) {
    const keyedAccount: KeyedAccountInfo =
      "accountId" in account && "accountInfo" in account
        ? account
        : {
            accountId: account.pubkey,
            accountInfo: account.account,
          };

    const decoded = await decoder(keyedAccount, program);
    if (decoded.type !== "ok") continue;

    const fleet = decoded.data as any;
    const key = typeof fleet?.key === "string" ? fleet.key : typeof fleet?.key?.toBase58 === "function" ? fleet.key.toBase58() : undefined;
    if (!key) continue;

    results[key] = decoded.data;
  }

  return results;
}

export abstract class GameHandler<
  TSageProgram extends AnySageIDLProgram,
  TFleet,
  TStarbase extends StarbaseLike = StarbaseLike,
  // Note this IDLS Has Match between versions
  TProfileFactionIDL extends ProfileFactionIDL = ProfileFactionIDL,
  TPlayerProfileIDL extends PlayerProfileIDL = PlayerProfileIDL,
> {
  static readonly getDiscriminator = (accountIdlName: string) => bs58.encode(Uint8Array.from(BorshAccountsCoder.accountDiscriminator(accountIdlName)));
  static SAGE_PROGRAM_ID: string = "";
  static POINTS_PROGRAM_ID: string = "";
  static POINTS_STORE_PROGRAM_ID: string = "";
  static PLAYER_PROFILE_PROGRAM_ID: string = "";
  static PROFILE_FACTION_PROGRAM_ID: string = "";
  static GALAXY_MARKETPLACE_PROGRAM_ID: string = "";
  static CARGO_PROGRAM_ID: string = "";
  static fleetAccountListener: ProgramAccountListener<any> | null = null;

  /**
   * Provide Current class for static calls in object context
   * @returns
   */
  asStatic() {
    return this.constructor as typeof GameHandler;
  }
  /**
   * Define Starbase Export map to config file
   *  * purpose - to provide starbase data for scripts without refetching from chain
   *
   * @param path - path to save file
   */
  async exportStarbaseDataAsConfig(_path: string) {
    throw new Error("Not Implemented");
  }
  /**
   * * Initialization promise - resolved when initialization is done
   */
  abstract ready: Promise<string>;
  /**
   * * Connection to solana
   */
  abstract connection: Connection;
  /**
   * SAGE Anchor Program interface - specific for sage version
   */
  abstract program: TSageProgram;
  protected abstract provider: AnchorProvider;

  /**
   * Cargo Anchor Program interface - specific for sage version
   */
  abstract cargoProgram: CargoIDLProgram;
  /**
   * Profile Faction Anchor Program interface - specific for sage version
   */
  abstract profileFactionProgram: Program<TProfileFactionIDL>;
  abstract playerProfileProgram: Program<TPlayerProfileIDL>;
  /*
   * Found after initialization -
   */
  abstract gameId?: PublicKey;
  abstract gameState?: PublicKey;
  abstract cargoStatsDefinition?: PublicKey;
  abstract getFleetAccount(fleetPubkey: PublicKey): Promise<TFleet>;
  abstract sageFleetHandler: FleetHandler<any>;
  /**
   * Used when Start/Stop Mining - to create instructions
   */
  planetLookup?: SagePlanetAddresses;

  /**
   *
   * @param coordinates - [x,y] coordinates as BN array
   * @returns
   */
  async getPlanetAddress(coordinates: [BN, BN]) {
    if (!this.planetLookup) {
      throw "this.planetLookup not set";
    }

    return this.planetLookup[coordinates.toString()];
  }

  static Logger: Logger = logger;
  logger: Logger = GameHandler.Logger;
  static SAGE_RESOURCES_MINTS: SageResourcesMints = {};
  static getResourceMints(): SageResourcesMints {
    return this.SAGE_RESOURCES_MINTS; //! this. in static context pointing to class
  }

  static starbaseMap: StarbaseMap = {};
  static getStarbaseData(starbaseName: string): StarbaseMapItem | undefined {
    return this.starbaseMap[starbaseName];
  }
  static getStarbaseMapKeys() {
    return Object.keys(this.starbaseMap);
  }

  static resourceHardness: ResourceHardnessMap = {};
  recourseWight: Map<PublicKey, number> = new Map<PublicKey, number>();

  gameMap: GameMapStore = new GameMapStore({
    interpolationTickMs: Number(process.env["GAME_MAP_INTERPOLATION_TICK_MS"] || 1000),
  });
  private mapSourceMode: "ws" | "rpc" | "off" = "off";
  private mapWsSource?: ZmeyHubFleetWsSource;
  private mapRpcSource?: RpcFleetSource<any, any>;
  private mapSourceUnsubscribers: Array<() => void> = [];
  private mapReadyPromise?: Promise<void>;
  private mapBootstrapPromise?: Promise<void>;
  private mapBridgeEmitter?: EventEmitter;

  constructor() {
    this.gameMap.startInterpolation();
    this.gameMap.on("fleet:update", (payload: { current: FleetSnapshot; previous?: FleetSnapshot }) => {
      if (!this.mapBridgeEmitter) return;
      this.mapBridgeEmitter.emit("gameMap:fleet:update", payload.current);
      if (payload.previous && (payload.previous.position.x !== payload.current.position.x || payload.previous.position.y !== payload.current.position.y)) {
        // this.mapBridgeEmitter.emit(`gameMap:sector:${payload.previous.position.x}:${payload.previous.position.y}`, payload.current);
      }
      this.mapBridgeEmitter.emit(`gameMap:sector:${payload.current.position.x}:${payload.current.position.y}`, payload.current);
    });
  }

  static async readStarbaseByName(sbName = "", label = "Starbase") {
    if (!sbName) sbName = ((await prompt(label + " name[ustN|mrzN]: ")) || "").toString().trim();

    let sbData = this.starbaseMap[sbName];
    log("Starbase data:", sbData);
    if (!sbData) {
      this.Logger.crit("Wrong starbase name :", `[${sbName}]`);
      this.Logger.crit("Available star-bases: ", _.sortBy(this.getStarbaseMapKeys()));
      throw "Can't find starbase by Name!";
    }

    return sbData;
  }

  attachDispatcherEventEmitter(emitter: EventEmitter) {
    this.mapBridgeEmitter = emitter;
  }

  async initializeGameMap(options: { wsUrl?: string; force?: boolean } = {}): Promise<void> {
    if (this.mapReadyPromise && !options.force) {
      return this.mapReadyPromise;
    }

    this.mapReadyPromise = (async () => {
      await this.ready;
      console.time("initializeGameMap:source-socket");
      const wsUrl = options.wsUrl || process.env["ZMEY_WS_URL"] || "ws://127.0.0.1:8091";
      const wsConnected = await this.tryStartWsMapSource(wsUrl);
      console.timeEnd("initializeGameMap:source-socket");

      console.time("initializeGameMap:source-rpc");
      if (!wsConnected) {
        await this.startRpcMapSource();
      }
      console.timeEnd("initializeGameMap:source-rpc");

      this.startGameMapBootstrapInBackground(options.force === true);
    })();

    return this.mapReadyPromise;
  }

  getGameMapSourceMode(): "ws" | "rpc" | "off" {
    return this.mapSourceMode;
  }

  protected abstract listAllFleetAccountsForGameMap(): Promise<TFleet[]>;

  private startGameMapBootstrapInBackground(force = true): void {
    if (this.mapBootstrapPromise && !force) {
      return;
    }

    this.mapBootstrapPromise = (async () => {
      console.time("initializeGameMap:bootstrap");
      try {
        console.error("Start game map bootstrap from all fleets - this may take a while...");
        await this.bootstrapGameMapFromAllFleets();
        console.error("FNISH game map bootstrap from all fleets ");
      } catch (err) {
        this.logger.warn("[GameMap] bootstrap failed", err);
      } finally {
        console.timeEnd("initializeGameMap:bootstrap");
      }
    })();
  }

  private async bootstrapGameMapFromAllFleets(): Promise<void> {
    const fleets = await this.listAllFleetAccountsForGameMap();
    for (const fleet of fleets) {
      const pubkey = this.resolveFleetPubkey(fleet);
      // Skip if fleet already has a live (non-bootstrap) entry — bootstrap data
      // may be stale relative to RPC/WS updates received during the fetch window.
      if (pubkey && this.gameMap.getFleet(pubkey)?.source !== "bootstrap") {
        const existing = this.gameMap.getFleet(pubkey);
        if (existing) continue;
      }
      await this.upsertFleetIntoGameMap(fleet, pubkey, "bootstrap");
    }
  }

  private async tryStartWsMapSource(wsUrl: string, rooms: string[] = ["fleet:all"]): Promise<boolean> {
    await this.stopActiveMapSources();

    const wsSource = new ZmeyHubFleetWsSource({ wsUrl, rooms, connectTimeoutMs: 3000 });
    this.mapWsSource = wsSource;
    this.mapSourceUnsubscribers.push(
      wsSource.onFleetUpdate((update) => {
        this.upsertFleetIntoGameMap(update.fleet, update.pubkey, update.source).catch((err) => this.logger.warn("[GameMap][WS]", err));
      }),
    );
    this.mapSourceUnsubscribers.push(
      wsSource.onError((err) => {
        this.logger.warn("[GameMap][WS] error", err);
      }),
    );
    wsSource.on("close", () => {
      if (this.mapSourceMode !== "ws") return;
      this.logger.warn("[GameMap] WS source closed. Switching to RPC source.");
      this.startRpcMapSource().catch((err) => this.logger.warn("[GameMap] RPC fallback start failed", err));
    });

    try {
      await wsSource.start();
      this.mapSourceMode = "ws";
      this.logger.info("[GameMap] source=ws", wsUrl);
      return true;
    } catch (err) {
      this.logger.warn("[GameMap] WS unavailable, fallback to RPC.", err);
      await wsSource.stop();
      this.mapWsSource = undefined;
      this.cleanupMapUnsubscribers();
      return false;
    }
  }

  private async startRpcMapSource(): Promise<void> {
    await this.stopActiveMapSources();
    const listener = this.asStatic().fleetAccountListener as any;
    if (!listener) {
      throw new Error("FleetAccountListener is not initialized");
    }

    const rpcSource = new RpcFleetSource<any, any>({ listener });
    this.mapRpcSource = rpcSource;
    this.mapSourceUnsubscribers.push(
      rpcSource.onFleetUpdate((update) => {
        this.upsertFleetIntoGameMap(update.fleet, update.pubkey, update.source).catch((err) => this.logger.warn("[GameMap][RPC]", err));
      }),
    );
    this.mapSourceUnsubscribers.push(
      rpcSource.onError((err) => {
        this.logger.warn("[GameMap][RPC] error", err);
      }),
    );

    await rpcSource.start();
    this.mapSourceMode = "rpc";
    this.logger.info("[GameMap] source=rpc");
  }

  private async stopActiveMapSources(): Promise<void> {
    this.cleanupMapUnsubscribers();
    if (this.mapWsSource) {
      await this.mapWsSource.stop();
      this.mapWsSource = undefined;
    }
    if (this.mapRpcSource) {
      await this.mapRpcSource.stop();
      this.mapRpcSource = undefined;
    }
    this.mapSourceMode = "off";
  }

  private cleanupMapUnsubscribers(): void {
    for (const unsubscribe of this.mapSourceUnsubscribers) unsubscribe();
    this.mapSourceUnsubscribers = [];
  }

  private async upsertFleetIntoGameMap(fleetLike: any, pubkeyOverride?: string, source: "ws" | "rpc" | "bootstrap" = "rpc"): Promise<void> {
    const pubkey = pubkeyOverride || this.resolveFleetPubkey(fleetLike);
    if (!pubkey) return;

    const prev = this.gameMap.getFleet(pubkey);
    const movement = this.extractMovementStateFromFleetLike(fleetLike);
    const fastPosition = await this.sageFleetHandler.getCurrentSector(fleetLike); //this.extractIdlePositionFromFleetLike(fleetLike) || prev?.position || movement?.from || { x: 0, y: 0 };

    let position = fastPosition;
    // if (movement || fleetLike?.state?.StarbaseLoadingBay || fleetLike?.state?.MineAsteroid || !position) {
    //   const current = await this.tryResolveCurrentSector(fleetLike);
    //   if (current) {
    //     position = current;
    //   }
    // }

    const snapshot: FleetSnapshot = {
      pubkey,
      position,
      state: this.extractStateLabelFromFleetLike(fleetLike),
      faction: this.extractFactionFromFleetLike(fleetLike),
      movement,
      source,
      raw: fleetLike,
      updatedAtMs: Date.now(),
    };

    this.gameMap.upsertFleet(snapshot);
  }

  protected resolveFleetPubkey(fleetLike: any): string | undefined {
    const key = fleetLike?.key;
    if (typeof key === "string") return key;
    if (key && typeof key.toBase58 === "function") return key.toBase58();
    return undefined;
  }

  protected async tryResolveCurrentSector(fleetLike: any): Promise<{ x: number; y: number } | undefined> {
    const fleetHandler = (this as any).sageFleetHandler;
    if (!fleetHandler || typeof fleetHandler.getCurrentSector !== "function") {
      return undefined;
    }
    try {
      const current = await fleetHandler.getCurrentSector(fleetLike);
      return {
        x: Number(current.x),
        y: Number(current.y),
      };
    } catch {
      return undefined;
    }
  }

  protected extractFactionFromFleetLike(fleetLike: any): string {
    const fromData = fleetLike?.data?.faction;
    const fromState = fleetLike?.faction;
    const v = fromData ?? fromState;
    if (v === undefined || v === null) return "neutral";
    if (typeof v === "string") return v;
    if (typeof v.toString === "function") return String(v.toString());
    return "neutral";
  }

  protected extractStateLabelFromFleetLike(fleetLike: any): string {
    const state = fleetLike?.state || {};
    return Object.keys(state).join(",") || "unknown";
  }

  protected extractIdlePositionFromFleetLike(fleetLike: any): { x: number; y: number } | undefined {
    // if)
    const idleSector = fleetLike?.state?.Idle?.sector;
    if (!Array.isArray(idleSector)) return undefined;
    return {
      x: Number(idleSector[0]),
      y: Number(idleSector[1]),
    };
  }

  protected extractMovementStateFromFleetLike(fleetLike: any): FleetMovementState | undefined {
    const state = fleetLike?.state || {};
    if (state.MoveSubwarp) {
      return {
        kind: "MoveSubwarp",
        from: {
          x: Number(state.MoveSubwarp.fromSector[0]),
          y: Number(state.MoveSubwarp.fromSector[1]),
        },
        to: {
          x: Number(state.MoveSubwarp.toSector[0]),
          y: Number(state.MoveSubwarp.toSector[1]),
        },
        departureTimeSec: Number(state.MoveSubwarp.departureTime),
        arrivalTimeSec: Number(state.MoveSubwarp.arrivalTime),
      };
    }
    if (state.MoveWarp) {
      return {
        kind: "MoveWarp",
        from: {
          x: Number(state.MoveWarp.fromSector[0]),
          y: Number(state.MoveWarp.fromSector[1]),
        },
        to: {
          x: Number(state.MoveWarp.toSector[0]),
          y: Number(state.MoveWarp.toSector[1]),
        },
        departureTimeSec: Number(state.MoveWarp.warpStart),
        arrivalTimeSec: Number(state.MoveWarp.warpFinish),
      };
    }
    return undefined;
  }

  static async readMovementMode(): Promise<"Hybrid" | "Subwarp" | "Warp"> {
    while (true) {
      let input = (await prompt("Movement Mode [(S)ubwarp|((W)arp|(H)ybrid)]:")) || "";

      switch (input.toLowerCase()) {
        case "s":
        case "subwarp": {
          return "Subwarp";
          break;
        }
        case "w":
        case "warp": {
          return "Warp";
          break;
        }
        case "h":
        case "hybrid": {
          return "Hybrid";
          break;
        }
        default:
          continue;
      }
    }
  }

  /**
   * ! Resource Weights are used for cargo space calculation
   */
  /**
   * Set weight for resources
   * @param resourceNames
   * @param weight
   */
  setResourceWeights(resourceNames: string[], weight: number) {
    for (const iterator of resourceNames) {
      this.recourseWight.set(this.asStatic().SAGE_RESOURCES_MINTS[iterator], weight);
      if (!this.asStatic().SAGE_RESOURCES_MINTS[iterator]) {
        this.logger.crit(`Set weight ${weight} for resource ${iterator}`);
        throw "Unmatchable definition setup!!!";
      }
    }
  }

  /**
   * Find weight of resource
   * @param resourcePublicKey
   * @returns
   */
  findWeight(resourcePublicKey: string): number {
    let key = Array.from(this.recourseWight.keys()).find((key) => key.toBase58() === resourcePublicKey);
    if (!key) return 0;
    return this.recourseWight.get(key) || 0;
  }

  /**
   * Calculate used amount of space
   * @param resourceName
   * @param amount
   * @returns
   */
  calcCargoSpaceUsed(resourceName: string, amount: number): number {
    let weight = this.findWeight(this.getResourceMintAddress(resourceName).toBase58()); //  this.recourseWight.get(this.asStatic().SAGE_RESOURCES_MINTS[resourceName]) || 1;

    return amount * weight;
  }

  getResourceMintAddress(resource: string) {
    return this.asStatic().SAGE_RESOURCES_MINTS[resource];
  }

  /**
   *
   * @param mint - resource mint public key
   * @returns
   * @throws - if not found
   *
   */
  getResourceNameByMint(mint: PublicKey): string {
    let mints = this.asStatic().SAGE_RESOURCES_MINTS;
    const resourceName = Object.keys(mints).find((key) => mints[key].equals(mint));
    if (!resourceName) {
      throw `Unknown mint, could not find resource name for ${mint.toBase58()}`;
    }
    return resourceName;
  }

  /**
   *
   * @param cargo - cargo public key
   * @param mints
   * @returns
   */
  async getAmountsByMints(cargo: PublicKey, mints: PublicKey[] = []): Promise<Map<string, number>> {
    const tokenAccounts = await this.getParsedTokenAccountsByOwner(cargo);
    const result: Map<string, number> = new Map();
    if (mints.length == 0) {
      mints.push(...Object.values(this.asStatic().SAGE_RESOURCES_MINTS)); // ensure mints are loaded);
    }

    for (const tokenAccount of tokenAccounts) {
      const mint = mints.filter((v) => {
        return v.equals(tokenAccount.mint);
      });
      if (mint.length > 0) {
        result.set(tokenAccount.mint.toBase58(), Number(tokenAccount.amount));
      }
    }

    return result;
  }

  /**
   * List all resources on the chain
   * @returns all resources on the chain ( could be filtered by gameId in future )
   */
  async listSageResources() {
    // @ts-ignore - account not found in type
    return await this.program.account.resource.all([
      {
        // Filter by game id
        // memcmp: {
        //   offset: 41,
        //   bytes: playerProfile.toBase58(),
        // },
      },
    ]);
  }

  /**
   * ! Faction methods - still the same
   */
  /**
   *
   * @returns all factions on the chain
   */
  async getAllFactionAccounts(filter: GetProgramAccountsFilter[] | undefined = undefined) {
    // Wait for initialization if needed
    await this.ready;
    // @ts-ignore Fetch all ProfileFaction accounts
    const factions = await this.profileFactionProgram.account.profileFactionAccount.all(...(filter ? [filter] : []));
    return factions;
  }
  async getFactionAccount(factionAccountAddress: PublicKey) {
    return readFromRPCOrError(
      this.connection,
      this.profileFactionProgram as any, // ! ignore ts error
      factionAccountAddress,
      ProfileFactionAccount,
      "confirmed",
    );
  }

  /**
   * Provide player profile faction address ( key )
   * @param playerProfile
   * @returns
   */
  getProfileFactionAddress(playerProfile: PublicKey): PublicKey {
    const [profileFaction] = ProfileFactionAccount.findAddress(this.profileFactionProgram as unknown as ProfileFactionIDLProgram, playerProfile);

    return profileFaction;
  }
  /**
   * ! StarBase methods
   */
  /**
   * Idl Specific methods providing information
   * @param coordinates
   */
  abstract getStarbaseAddress(coordinates: [BN, BN]): PublicKey;
  abstract getStarbaseAccount(starbaseKey: PublicKey): Promise<TStarbase>;
  abstract getAllStarbaseAccounts(gameId: PublicKey | undefined): Promise<DecodedAccountData<Account>[]>;

  async fetchLocationByStarbaseKey(starbaseKey: PublicKey): Promise<Coordinates> {
    let starbase = await this.getStarbaseAccount(starbaseKey);
    return new Coordinates(Number(starbase.data.sector[0]), Number(starbase.data.sector[1]));
  }

  abstract getSagePlayerProfileAddress(playerProfileKey: PublicKey): Promise<PublicKey>;
  abstract getStarbasePlayerAddress(starbaseKey: PublicKey, sagePlayerProfile: PublicKey, seqId: number): PublicKey;

  static async readStarbaseResource(starbase: StarbaseMapItem, resource: string | undefined = "") {
    if (starbase.resources.length == 1) {
      console.log("Mining resource:", starbase.resources[0]);
      return starbase.resources[0];
    }

    do {
      resource = starbase.resources.find((v) => v == resource);
      if (!resource) {
        console.log("Chose on of mining resources on this starbase: ", starbase.resources);
        resource = ((await prompt("Resource: ")) || "").toString().trim();
      }
    } while (!resource);

    return resource;
  }

  /**
   * Provide starbase Cargo pods
   * @param playerProfile
   */
  abstract getStarbasePlayerCargoPods(starbasePlayer: PublicKey): Promise<{
    mainCargoPod: PublicKey;
    allCargoPods: PublicKey[];
  }>;

  /**
   * Get Starbase Player Address
   * @param ownerProfile - Is the wallet owning the SagePlayerProfile
   * @param coordinates - Coordinates of Starbase
   */
  async getStarbaseCargoPodByOwner(ownerProfile: PublicKey, baseIdentity: BN[] | PublicKey): Promise<{ publicKey: PublicKey; account: CargoPod }[]> {
    let sbPublicKey: PublicKey;
    if (Array.isArray(baseIdentity)) {
      sbPublicKey = this.getStarbaseAddress([baseIdentity[0], baseIdentity[1]]);
    } else {
      sbPublicKey = baseIdentity;
    }
    // Set public key
    const starbaseAccount = await this.getStarbaseAccount(sbPublicKey);

    const sagePlayerProfile = await this.getSagePlayerProfileAddress(ownerProfile);
    let sbPlayerKey = this.getStarbasePlayerAddress(sbPublicKey, sagePlayerProfile, starbaseAccount.data.seqId);

    // @ts-ignore - account not found in type
    const spbCargoHolds = await this.cargoProgram.account.cargoPod.all([
      {
        memcmp: {
          offset: 41,
          bytes: sbPlayerKey.toBase58(),
        },
      },
    ]);

    // set Cargo Pod
    return spbCargoHolds as { publicKey: PublicKey; account: CargoPod }[];
  }

  /**
   *
   * @param owner - cargo public key
   * @returns
   */
  async getParsedTokenAccountsByOwner(owner: PublicKey): Promise<TokenAccount[]> {
    return await getParsedTokenAccountsByOwner(this.connection, owner);
  }
  /*
        tokenAccounts: is result of getParsedTokenAccountsByOwner
        mint: mint sub-account for Nft expected to have tokenAccount
    */
  getTokenAccountByMint(tokenAccounts: TokenAccount[], mint: PublicKey) {
    return tokenAccounts.find((tokenAccount) => tokenAccount.mint.toBase58() === mint.toBase58());
  }

  async getOwnerTokenAccountByMintForCargo(owner: PublicKey, mint: PublicKey): Promise<TokenAccount | undefined> {
    return this.getTokenAccountByMint(await this.getParsedTokenAccountsByOwner(owner), mint);
  }

  async getTokenAccountMintAmount(accountOwner: PublicKey, mint: PublicKey) {
    let tokenAccount = await this.getOwnerTokenAccountByMintForCargo(accountOwner, mint);
    return Number(tokenAccount?.amount || 0);
  }

  /**
   * Cleans up empty cargo pods for a player of all starbases starbase
   *
   * @param playerProfileKey - player profile public key
   * @param key - Signer ( owner | hot wallet ) - with private key
   * @param keyIndex - hot wallet permissions index
   * @returns array of InstructionReturn
   */
  async ixCleanUpAllStarbasesCargoPods(
    // starbaseKey: PublicKey,
    playerProfileKey: PublicKey,
    key: AsyncSigner, // Signer ( owner | hot wallet ) - with private key
    keyIndex: number = 0, // hot wallet permissions index
  ): Promise<InstructionReturn[]> {
    if (!this.gameId || !this.gameState || !this.cargoStatsDefinition) throw new Error("Game Handler not initialized yet!");

    // const cargoPods = await this.getStarbasePlayerCargoPods(starbaseKey, playerProfileKey);
    const profileFactionKey = this.getProfileFactionAddress(playerProfileKey);

    const ixrs = await cleanUpStarbaseCargoPods(
      this.connection,
      this.program as any,
      this.cargoProgram,
      playerProfileKey,
      profileFactionKey,
      this.cargoStatsDefinition,
      this.gameId,
      this.gameState,
      key, // Signer
      keyIndex, // hot wallet permittions
    );

    return ixrs;
  }

  /**
   * Cleans up empty cargo pods for a player per Starbase
   *
   * @param playerProfileKey - player profile public key
   * @param key - Signer ( owner | hot wallet ) - with private key
   * @param keyIndex - hot wallet permissions index
   * @returns array of InstructionReturn
   */
  async ixCleanUpStarbaseCargoPods(starbaseKey: PublicKey, playerProfileKey: PublicKey, key: AsyncSigner, keyIndex: number): Promise<InstructionReturn[]> {
    if (!this.gameId || !this.gameState || this.cargoStatsDefinition == undefined) throw "Game is not loaded!";
    const starbaseAccount = await this.getStarbaseAccount(starbaseKey);
    const sagePlayerProfile = await this.getSagePlayerProfileAddress(playerProfileKey);
    const starbasePlayerKey = await this.getStarbasePlayerAddress(starbaseKey, sagePlayerProfile, starbaseAccount.data.seqId);
    let cleanups = await getCleanPodsByStarbasePlayerAccounts(this.connection, this.cargoProgram, starbasePlayerKey);

    const profileFaction = this.getProfileFactionAddress(playerProfileKey);
    if (!cleanups) return [];

    console.error("---------------------------------------------------------------------------------------");
    log(
      `Found ${
        cleanups.podsAndTokensToClean.length
      } empty cargo pods to cleanup for starbase ${starbaseKey.toBase58()} and player ${playerProfileKey.toBase58()}`,
    );
    console.error("---------------------------------------------------------------------------------------");
    cleanups.podsAndTokensToClean.forEach(([podKey, accounts]) => {
      log(` - Pod: ${podKey.toBase58()} `);
      log(` ---- Accounts: `);
      let tableData = accounts.map((a) => {
        let name = "unknown";
        try {
          name = this.getResourceNameByMint(a.mint);
        } catch (e) {}
        return { name, amount: Number(a.amount), address: a.address, mint: a.mint.toBase58() };
      });
      console.table(tableData);
    });
    const ixs: InstructionReturn[] = await getPodCleanupInstructions(
      cleanups,
      this.program as any,
      this.cargoProgram,
      starbasePlayerKey,
      starbaseKey,
      playerProfileKey,
      profileFaction,
      this.cargoStatsDefinition,
      this.gameId,
      this.gameState,
      key,
      keyIndex,
    );
    return ixs;
  }

  /**
   * ! Instruction Helpers
   *
   */
  /**
   * Convert InstructionReturn to Instruction
   *
   * @param ixs
   * @returns
   */
  async convertInstructionReturnToTransactionInstruction(funder: AsyncSigner, ixs: InstructionReturn[]): Promise<TransactionInstruction[]> {
    let transactionInstructions: TransactionInstruction[] = [];

    for (const iterator of ixs) {
      let res = await iterator(funder);
      if (Array.isArray(res)) {
        for (const i of res) {
          transactionInstructions.push(i.instruction);
          //@ts-ignore
          // this.logger.dbg(i.instruction.toJSON());
        }
      } else {
        transactionInstructions.push(res.instruction);
        //@ts-ignore
        // this.logger.dbg(res.instruction.toJSON());
      }
    }

    return transactionInstructions;
  }

  getConnection() {
    return this.connection;
  }
  /**
   * Build, sign and send v0transaction
   * @param ixs
   * @param simulate
   * @returns
   */
  async v0SignAndSend(
    funder: Keypair,
    ixs: TransactionInstruction[],
    lookupTables: AddressLookupTableAccount[] = [],
    simulate = false,
  ): Promise<string | RpcResponseAndContext<SimulatedTransactionResponse> | RpcResponseAndContext<SignatureResult>> {
    // create and send createAndSendV0Tx
    let latestBlockhash = await this.connection.getLatestBlockhash("confirmed");
    let messageV0 = new TransactionMessage({
      payerKey: funder.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: ixs,
    }).compileToV0Message(lookupTables);
    const transaction = new VersionedTransaction(messageV0);
    transaction.sign([funder]);

    if (simulate) {
      return await this.connection.simulateTransaction(transaction);
    } else {
      const txid = await this.connection.sendTransaction(transaction, { maxRetries: 5 });
      const confirmation = await this.connection.confirmTransaction({
        signature: txid,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      });

      if (confirmation.value.err) {
        throw new Error("❌ - Transaction not confirmed.");
      }
      return confirmation;
    }
  }

  /** Keep he most simple send Transaction implementations  */
  async sendTransaction(tx: TransactionReturn): Promise<RpcResponseAndContext<TransactionSignature | TransactionError>> {
    return await sendTransaction(tx, this.connection);
  }

  /**
   * Send nft between two wallets
   * @param funder
   * @param to
   * @param mint
   * @param amount
   * @returns
   */
  async sendNftTo(funder: Signer, to: PublicKey, mint: PublicKey, amount: number): Promise<TransactionSignature> {
    // mint: PublicKey на NFT-то
    // sender: PublicKey на изпращача
    // recipient: PublicKey на получателя
    // senderSigner: Keypair или Signer на изпращача

    const ataRecipient = await createAssociatedTokenAccountIdempotent(mint, to, true);
    const ataSender = await getAssociatedTokenAddress(mint, funder.publicKey, true);

    return transfer(this.connection, funder, ataSender, ataRecipient.address, funder.publicKey, amount);
  }
}

// ! Helpers
// COMPACT ARRAY

const LOW_VALUE = 127; // 0x7f
const HIGH_VALUE = 16383; // 0x3fff
/**
 * Compact u16 array header size
 * @param n elements in the compact array
 * @returns size in bytes of array header
 */
const compactHeader = (n: number) => (n <= LOW_VALUE ? 1 : n <= HIGH_VALUE ? 2 : 3);

/**
 * Compact u16 array size
 * @param n elements in the compact array
 * @param size bytes per each element
 * @returns size in bytes of array
 */
const compactArraySize = (n: number, size: number) => compactHeader(n) + n * size;
export const getTxSize = (tx: Transaction, feePayer: PublicKey): number => {
  const feePayerPk = [feePayer.toBase58()];

  const signers = new Set<string>(feePayerPk);
  const accounts = new Set<string>(feePayerPk);

  const ixsSize = tx.instructions.reduce((acc, ix) => {
    ix.keys.forEach(({ pubkey, isSigner }) => {
      const pk = pubkey.toBase58();
      if (isSigner) signers.add(pk);
      accounts.add(pk);
    });

    accounts.add(ix.programId.toBase58());

    const nIndexes = ix.keys.length;
    const opaqueData = ix.data.length;

    return (
      acc +
      1 + // PID index
      compactArraySize(nIndexes, 1) +
      compactArraySize(opaqueData, 1)
    );
  }, 0);

  return (
    compactArraySize(signers.size, 64) + // signatures
    3 + // header
    compactArraySize(accounts.size, 32) + // accounts
    32 + // blockhash
    compactHeader(tx.instructions.length) + // instructions
    ixsSize
  );
};
