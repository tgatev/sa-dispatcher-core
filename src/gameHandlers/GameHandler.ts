import { AnchorProvider, BN, BorshAccountsCoder, Program, Wallet } from "@project-serum/anchor";
import {
  Connection,
  GetProgramAccountsFilter,
  GetProgramAccountsResponse,
  KeyedAccountInfo,
  Keypair,
  PublicKey,
  Transaction,
  ParsedAccountData,
} from "@solana/web3.js";
import bs58 from "bs58";
import { CARGO_IDL, CargoIDLProgram, CargoType } from "@staratlas/cargo";
import { DecodedAccountData, readAllFromRPC, readFromRPCOrError, stringToByteArray } from "@staratlas/data-source";
import { PlayerProfileIDL, PLAYER_PROFILE_IDL } from "@staratlas/player-profile";
import { ProfileFactionIDL, PROFILE_FACTION_IDL } from "@staratlas/profile-faction";
import {
  SAGE_IDL,
  SageIDLProgram,
  Fleet,
  Resource as SageResource,
  Game,
  GameState,
  MineItem,
  PlanetType,
  SagePlayerProfile,
  Sector,
  Starbase,
  StarbasePlayer,
  FLEET_MIN_DATA_SIZE,
  FleetAccount,
  Planet,
  getCleanPodsByStarbasePlayerAccounts,
  FleetStateData,
  Ship,
} from "@staratlas/sage-main";
import { POINTS_IDL, PointsIDLProgram, UserPoints } from "@staratlas/points";
import { Coordinates } from "../Model/Coordinates";
import _ from "lodash";
import { GALACTIC_MARKETPLACE_IDL, GalacticMarketplaceIDL } from "@staratlas/galactic-marketplace";

import { Sage } from "@staratlas/sage-main/dist/src/idl/sage";
import { SageFleetHandler } from "./FleetHandler";
import { GalacticMarketplaceHandler } from "./GalacticMarketplaceHandler";
import { StarbaseHandler } from "./StarbaseHandler";
import { ProfileHandler } from "./ProfileHandler";
import {
  GameHandler,
  ResourceHardnessMap,
  SagePlanetAddresses,
  SageResourcesMints,
  StarbaseMap,
  StarbaseMapItem,
  parseFleetAccountsShared,
} from "../Common/GameHandler";
import { SAGE_RESOURCES_MINTS, starbaseMapInstance, resourceHardness } from "./lib";
import { log } from "../Common/PatchConsoleLog";
import { FleetAccountListener } from "../Common/FleetAccountListener";

/**
 * Read Input parameters and export them for other classes, scripts and etc
 */
export const argv = require("yargs").argv;
export const factionToSymbol = ["Unknown", "MUD", "ONI", "USTUR"];

const findGame = async (provider: AnchorProvider, program?: Program<Sage> | SageIDLProgram) => {
  if (!program) program = await sageProgram(provider);
  // @ts-ignore
  const game = await program.account.game.all();
  // log("Game length:", game.length);

  return game;
};

const findAllPlanets = async (provider: AnchorProvider, program?: Program<Sage> | SageIDLProgram) => {
  if (!program) program = await sageProgram(provider);
  // @ts-ignore
  const planets = await program.account["planet"].all([
    // {
    //     memcmp: {
    //         offset: 9,
    //         bytes: bs58.encode(Buffer.from('UST-1-3')),
    //     },
    // },
  ]);

  return planets;
};
export const sageProgram = async (provider: AnchorProvider) => {
  return new Program(SAGE_IDL, new PublicKey(SageGameHandler.SAGE_PROGRAM_ID), provider);
};

// export type AssociativeArray<T = unknown> = { [key: string]: T | undefined } | T[];

export class SageGameHandler extends GameHandler<SageIDLProgram, Fleet, Starbase> {
  static readonly getDiscriminator = (accountIdlName: string) => bs58.encode(Uint8Array.from(BorshAccountsCoder.accountDiscriminator(accountIdlName)));

  // https://build.staratlas.com/dev-resources/mainnet-program-ids

  // Labs
  // static readonly SAGE_PROGRAM_ID = "SAGEqqFewepDHH6hMDcmWy7yjHPpyKLDnRXKb3Ki8e6";
  // static readonly CARGO_PROGRAM_ID = "Cargo8a1e6NkGyrjy4BQEW4ASGKs9KSyDyUrXMfpJoiH";
  // Starbase
  static readonly TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
  static readonly SAGE_PROGRAM_ID = process.env["SAGE_PROGRAM_ID"] || "SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE";
  static readonly CARGO_PROGRAM_ID = "Cargo2VNTPPTi9c1vq1Jw5d3BWUNr18MjRtSupAghKEk";
  static readonly POINTS_PROGRAM_ID = "Point2iBvz7j5TMVef8nEgpmz4pDr7tU7v3RjAfkQbM";
  static readonly POINTS_STORE_PROGRAM_ID = "PsToRxhEPScGt1Bxpm7zNDRzaMk31t8Aox7fyewoVse";
  static readonly PLAYER_PROFILE_PROGRAM_ID = "pprofELXjL5Kck7Jn5hCpwAL82DpTkSYBENzahVtbc9";
  static readonly PROFILE_FACTION_PROGRAM_ID = "pFACSRuobDmvfMKq1bAzwj27t6d2GJhSCHb1VcfnRmq";
  static readonly GALAXY_MARKETPLACE_PROGRAM_ID = "traderDnaR5w6Tcoi3NFm53i48FTDNbGjBSZwWXDRrg";

  static SAGE_RESOURCES_MINTS: SageResourcesMints = { ...SAGE_RESOURCES_MINTS };
  static resourceHardness: ResourceHardnessMap = { ...resourceHardness };
  static starbaseMap: StarbaseMap = starbaseMapInstance;

  async getStarbaseDataByKey(publicKey: string): Promise<StarbaseMapItem | undefined> {
    let baseName = Object.keys(this.asStatic().starbaseMap).find((key) => this.asStatic().starbaseMap[key].starbasePublicKey === publicKey);

    // ! Holosim - do not find the same keys
    if (!baseName) {
      let a = await this.getStarbaseAccount(new PublicKey(publicKey));
      if (!a) {
        throw "Cant find starbase account by key " + publicKey;
      }
      let location = new Coordinates(Number(a.data.sector[0]), Number(a.data.sector[1]));
      baseName = Object.keys(this.asStatic().starbaseMap).find((key) => this.asStatic().starbaseMap[key].location.equals(location));

      if (!baseName) {
        // getStarbaseAddress()
        throw "Cant find starbase name by location " + location.toString();
      }
      // TODO : -- refactor Map SageGameHandler - actually update only key
      this.asStatic().starbaseMap[baseName].starbasePublicKey = a.key.toBase58();
    }
    return this.asStatic().starbaseMap[baseName];
  }

  dataRunningXpCategory = new PublicKey("DataJpxFgHhzwu4zYJeHCnAv21YqWtanEBphNxXBHdEY");
  councilRankXpCategory = new PublicKey("XPneyd1Wvoay3aAa24QiKyPjs8SUbZnGg5xvpKvTgN9");
  pilotingXpCategory = new PublicKey("PiLotBQoUBUvKxMrrQbuR3qDhqgwLJctWsXj3uR7fGs");
  miningXpCategory = new PublicKey("MineMBxARiRdMh7s1wdStSK4Ns3YfnLjBfvF5ZCnzuw");
  craftingXpCategory = new PublicKey("CraftndAV62acibnaW7TiwEYwu8MmJZBdyrfyN54nre7");

  /**
   * Deprecated - use combatXpCategory - still not implemented in sage
   */
  combatXpCategory = new PublicKey("CraftndAV62acibnaW7TiwEYwu8MmJZBdyrfyN54nre7");

  // Provide Game XP Modifiers - key is category public key as string
  xpModifiers: Map<string, PublicKey> = new Map<string, PublicKey>();
  // Provide Game XP user accounts - key is category public key as string
  xpUserAccounts: Map<string, PublicKey> = new Map<string, PublicKey>();

  ready: Promise<string>;
  marketplaceProgram: Program<GalacticMarketplaceIDL>;
  protected provider: AnchorProvider;
  program: SageIDLProgram;
  playerProfileProgram: Program<PlayerProfileIDL>;
  // @ts-ignore // ! ???!?!?!!!!?!!!!!!!
  profileFactionProgram: Program<ProfileFactionIDL>;
  cargoProgram: CargoIDLProgram;
  pointsProgram: PointsIDLProgram;
  connection: Connection;
  gameId?: PublicKey;
  gameState?: PublicKey;
  cargoStatsDefinition?: PublicKey;
  cargoStatsDefinitionSeqId?: number;
  craftingDomain?: PublicKey;
  mints?: { [key: string]: PublicKey };

  game?: Game;
  sageFleetHandler: SageFleetHandler;
  sageGalaxyMarketHandler: GalacticMarketplaceHandler;

  sagePlayerProfileHandler: ProfileHandler;
  // sageProfileFactionHandler: SageProfileFactionHandler;
  StarbaseHandler: StarbaseHandler;
  shipAccountsCache: {
    type: "ok";
    key: PublicKey;
    data: Ship;
  }[] = [];

  /** Reduce RPC Call - Player Constants May affect if 1 executor work on 2 permitted wallets */
  static fleetAccountListener: FleetAccountListener<Fleet, SageIDLProgram> | null = null;
  static async parseFleetAccounts(
    accounts: GetProgramAccountsResponse | KeyedAccountInfo[],
    program: SageIDLProgram,
  ): Promise<{
    [key: string]: Fleet;
  }> {
    return parseFleetAccountsShared<Fleet, SageIDLProgram>(accounts, program, (account, p) => Fleet.decodeData(account, p));
  }

  /**
   * Initializes the game handler with the provided parameters.
   * @param funder - publicKey of signer wallet wallet //! NOTE: this is used to find perdition
   * @param connection - solana connection instance
   * @param owner - owner of the assets ! optional ! - if missing funder is used as owner Provide only if it is different from funder
   * @param playerProfile - player profile public key, if not provided will be fetched from the game
   */
  constructor(connection: Connection) {
    super();
    // const funder: Keypair; //= owner || Keypair.generate();
    this.connection = connection;

    // !!-!! DUMMY - READ ONLY Provider, USE: 'new Wallet(funder)' - can be replaced with {PublicKey: <PublicKey>} as any for Second Parameter not to be Dummy
    this.provider = new AnchorProvider(connection, new Wallet(Keypair.generate()) as any, AnchorProvider.defaultOptions()); //new Wallet(funder)
    // !!!! NOTE !!! Provider could be Replaced with Connection instance !!!
    this.logger.dbg("Loading HOLOSIM Begins ... ");

    //@ts-ignore  - program type is compatible
    this.program = new Program(SAGE_IDL, new PublicKey(this.asStatic().SAGE_PROGRAM_ID), this.provider);
    this.logger.dbg("Game Handler initialized with program id ", this.asStatic().SAGE_PROGRAM_ID);

    // @ts-ignore - program type is compatible
    this.cargoProgram = new Program(CARGO_IDL, new PublicKey(this.asStatic().CARGO_PROGRAM_ID), this.provider);
    this.logger.dbg("Cargo Program initialized with program id ", this.asStatic().CARGO_PROGRAM_ID);

    this.playerProfileProgram = new Program(PLAYER_PROFILE_IDL, new PublicKey(this.asStatic().PLAYER_PROFILE_PROGRAM_ID), this.provider);
    this.logger.dbg("Player Profile initialized with program id ", this.asStatic().PLAYER_PROFILE_PROGRAM_ID);

    this.profileFactionProgram = new Program(PROFILE_FACTION_IDL, new PublicKey(this.asStatic().PROFILE_FACTION_PROGRAM_ID), this.provider);
    this.logger.dbg("Profile Faction initialized with program id ", this.asStatic().PROFILE_FACTION_PROGRAM_ID);

    //@ts-ignore - program type is compatible
    this.pointsProgram = new Program(POINTS_IDL, new PublicKey(this.asStatic().POINTS_PROGRAM_ID), this.provider);
    this.logger.dbg("Points Program initialized with program id ", this.asStatic().POINTS_PROGRAM_ID);

    this.marketplaceProgram = new Program(GALACTIC_MARKETPLACE_IDL, new PublicKey(this.asStatic().GALAXY_MARKETPLACE_PROGRAM_ID), this.provider);
    this.logger.dbg("Market Place Program  initialized with program id ", this.asStatic().GALAXY_MARKETPLACE_PROGRAM_ID);

    this.sageFleetHandler = new SageFleetHandler(this);
    this.sageGalaxyMarketHandler = new GalacticMarketplaceHandler(this);
    this.sagePlayerProfileHandler = new ProfileHandler(this);
    // this.sageProfileFactionHandler = new SageProfileFactionHandler(this);
    this.StarbaseHandler = new StarbaseHandler(this);
    // this.marketplaceProgram.account.orderAccount.all();
    // this.keypair = funder;
    // this.funder = keypairToAsyncSigner(funder);
    // this.playerProfile = playerProfile;
    this.initResourceWeights();
    this.asStatic().fleetAccountListener = new FleetAccountListener<Fleet, SageIDLProgram>(
      this.connection,
      this.program,
      new PublicKey(this.asStatic().SAGE_PROGRAM_ID),
      SageGameHandler.parseFleetAccounts,
    );
    this.ready =
      Promise.all([findGame(this.provider, this.program), findAllPlanets(this.provider, this.program), this.getShipsAccounts()])
        .then((result) => {
          const game = result[0].find((d: any) => d.publicKey.toBase58() == "GAMEzqJehF8yAnKiTARUuhZMvLvkZVAsCVri5vSfemLr");
          // const game = result[0].find((d: any) => d.account.gameState.toBase58() !== "11111111111111111111111111111111");

          const planets = result[1];
          // const ships = result[2];
          this.gameId = game.publicKey;
          this.gameState = game.account.gameState;
          this.cargoStatsDefinition = game.account.cargo.statsDefinition;
          // TODO: note this could change if updated by team, would need to look-up new value in Cargo program
          // Labs.staratlas.com value
          // this.cargoStatsDefinitionSeqId = 1;
          // Based.staratlas.com value
          this.cargoStatsDefinitionSeqId = 0;
          this.craftingDomain = game.account.crafting.domain;
          this.mints = game.account.mints;
          log("Game Data", game.account);

          this.planetLookup = planets.reduce((lookup: { [x: string]: any }, planetAccount: { publicKey: any; account: any }) => {
            const pubkey = planetAccount.publicKey;
            const planet = planetAccount.account;

            if (planet.planetType === PlanetType.AsteroidBelt) {
              const sector = planet.sector.toString();
              lookup[sector] = pubkey;
            }

            return lookup;
          }, {} as SagePlanetAddresses);
        })

        .then(() => {
          return Promise.resolve("ready");
        }) || "";

    // this.recourseWight = new Map<PublicKey, number>();
  }

  protected async listAllFleetAccountsForGameMap(): Promise<Fleet[]> {
    const decoded = await readAllFromRPC(this.provider.connection, this.program, Fleet, "confirmed");
    return decoded.filter((d) => d.type === "ok").map((d) => d.data);
  }

  initResourceWeights() {
    this.setResourceWeights(
      [
        "council_rfr",
        "arco",
        "biomass",
        "carbon",
        "copper_ore",
        "diamond",
        "hydrogen",
        "iron_ore",
        "lumanite",
        "rochinol",
        "sdu",
        "ammunitions",
        "food",
        "fuel",
        "toolkit",
        "copper",
        "copper_wire",
        "iron",
        "magnet",
        "polymer",
        "steel",
        "framework",
        "nitrogen",
        "silica",
        "titanium_ore",
        "aerogel",
      ],
      1,
    );
    this.setResourceWeights(["electronics", "graphene", "hydrocarbon", "power_source"], 2);
    this.setResourceWeights(["electromagnet", "energy_substrate"], 4);
    this.setResourceWeights(["crystal_lattice", "strange_emitter", "super_conductor"], 5);
    this.setResourceWeights(["particle_accelerator", "radiation_absorber", "field_stabilizer"], 6);
    this.setResourceWeights(["mic", "oic", "uic"], 50);
    this.setResourceWeights(["mcgf", "ocvr", "ucor"], 50);
    this.setResourceWeights(["cqn", "csc"], 50);
  }

  async getPlanetAccount(planetName: string) {
    // @ts-ignore
    const program = this.program;
    // @ts-ignore
    const [planet] = await program.account.planet.all([
      {
        memcmp: {
          offset: 9,
          // @ts-ignore
          bytes: bs58.encode(Buffer.from(planetName)),
        },
      },
    ]);

    return planet;
  }

  async findAllPlanets(filter: GetProgramAccountsFilter[] = []): Promise<Planet[]> {
    // // @ts-ignore
    // const planets = await this.program.account["planet"].all([
    //   // {
    //   //     memcmp: {
    //   //         offset: 9,
    //   //         bytes: bs58.encode(Buffer.from('UST-1-3')),
    //   //     },
    //   // },
    // ]);
    let planets = await readAllFromRPC(this.provider.connection, this.program, Planet, "confirmed", filter);

    return planets.filter((p) => p.type == "ok").map((p) => p.data);
  }

  /**
   * Get ship accounts listed in the game
   * @returns List of all ships in the game
   */
  async getShipsAccounts(): Promise<
    {
      type: "ok";
      key: PublicKey;
      data: Ship;
    }[]
  > {
    if (this.shipAccountsCache.length > 0) {
      return this.shipAccountsCache;
    }

    const ships = await readAllFromRPC(this.provider.connection, this.program, Ship, "confirmed", [
      { memcmp: { offset: 8 + 1, bytes: this.gameId?.toBase58() || "" } }, // Game id filter
    ]);

    this.shipAccountsCache = ships.filter((s) => s.type == "ok").sort((a, b) => b.data.data.updateId - a.data.data.updateId);

    return this.shipAccountsCache;
  }

  findShipByMint(mint: PublicKey) {
    if (!this.shipAccountsCache.length) {
      throw new Error("Ship accounts cache is empty. Call getShipsAccounts() first.");
    }
    let ships = this.shipAccountsCache.filter((s) => s.data.data.mint.equals(mint));
    return ships[0] || undefined;
  }

  findShipByAccount(accountKey: PublicKey) {
    if (!this.shipAccountsCache.length) {
      throw new Error("Ship accounts cache is empty. Call getShipsAccounts() first.");
    }
    return this.shipAccountsCache.find((s) => s.type == "ok" && s.key.equals(accountKey));
  }

  /**
   * Provide list of ships in the wallet
   * @param wallet
   * @returns
   */
  async getShipsInWallet(wallet: PublicKey) {
    let shipAccounts = await this.getShipsAccounts();

    const accounts = await this.connection.getParsedTokenAccountsByOwner(wallet, {
      programId: new PublicKey(SageGameHandler.TOKEN_PROGRAM_ID),
    });

    const nfts = accounts.value
      .filter((acc) => {
        const info = acc.account.data.parsed.info;
        return info.tokenAmount.decimals === 0; // info.tokenAmount.uiAmount > 0 &&
      })
      .sort((a, b) => b.account.data.parsed.info.tokenAmount.uiAmount - a.account.data.parsed.info.tokenAmount.uiAmount);

    let allMints = nfts.map((acc) => {
      return {
        mint: new PublicKey(acc.account.data.parsed.info.mint),
        amount: acc.account.data.parsed.info.tokenAmount.uiAmount as number,
        accountKey: new PublicKey(acc.pubkey),
        name: shipAccounts.find((s) => s.data.data.mint.toBase58() == acc.account.data.parsed.info.mint)?.data.data.name || "",
        account: acc,
      };
    });

    return allMints.filter((s) => s.name != "");
  }

  async getMineItemAccount(mineItemPubkey: PublicKey): Promise<MineItem> {
    const mineItem = readFromRPCOrError(this.provider.connection, this.program, mineItemPubkey, MineItem, "confirmed");

    return mineItem;
  }

  async getAllMineItems(gameId: PublicKey | undefined = undefined) {
    if (!gameId) {
      gameId = this.gameId!;
    }

    return readAllFromRPC(this.provider.connection, this.program, MineItem, "confirmed", [
      {
        memcmp: {
          offset: 8 + +1,
          bytes: this.gameId?.toBase58() || "",
        },
      },
    ]);
  }

  async getAllPlanetsInSector(x: number, y: number): Promise<Planet[]> {
    let xBN = new BN(x);
    let xArr = xBN.toTwos(64).toArrayLike(Buffer, "le", 8);
    let x58 = bs58.encode(xArr);
    let yBN = new BN(y);
    let yArr = yBN.toTwos(64).toArrayLike(Buffer, "le", 8);
    let y58 = bs58.encode(yArr);

    // All Planets - on sector
    let planets =
      (await readAllFromRPC(this.provider.connection, this.program, Planet, "confirmed", [
        { memcmp: { offset: 73, bytes: this.gameId?.toBase58() || "" } }, // Game id filter
        { memcmp: { offset: 105, bytes: x58 } },
        { memcmp: { offset: 105 + 8, bytes: y58 } },
      ])) || [];

    return planets.filter((p) => p.type == "ok").map((p) => p.data);
  }

  async getPlanetAccountByKey(planetPubkey: PublicKey): Promise<Planet> {
    const planet = readFromRPCOrError(this.provider.connection, this.program, planetPubkey, Planet, "confirmed");

    return planet;
  }

  async getResourceAccount(resourcePubkey: PublicKey): Promise<SageResource> {
    const resource = readFromRPCOrError(this.provider.connection, this.program, resourcePubkey, SageResource, "confirmed");

    return resource;
  }

  async getSectorAccount(sectorPubkey: PublicKey): Promise<Sector> {
    const sector = readFromRPCOrError(this.provider.connection, this.program, sectorPubkey, Sector, "confirmed");

    return sector;
  }

  getFleetPlayerProfile(fleetAccount: Fleet): PublicKey {
    if (!fleetAccount.data.ownerProfile) {
      throw new Error("Fleet account does not have an owner profile");
    }
    // return fleetAccount.data.ownerProfile;

    if (fleetAccount.data.subProfile.key.toBase58() === "11111111111111111111111111111111") {
      return fleetAccount.data.ownerProfile;
    } else {
      return fleetAccount.data.subProfile.key;
    }
    // return fleetAccount.data.ownerProfile;
  }

  async getSectorFleets(x: number, y: number, exclude: { idle?: boolean; mining?: boolean; traveling?: boolean } = {}) {
    let promisses = [];
    if (!exclude.idle) {
      promisses.push(this.getFleetsIdle(x, y));
    }
    if (!exclude.mining) {
      promisses.push(this.getFleetsMiningOn(x, y));
    }
    if (!exclude.traveling) {
      promisses.push(this.getFleetsTravelingFrom(x, y, true));
      promisses.push(this.getFleetsTravelingTo(x, y, true));
    }

    return (await Promise.all(promisses)).flat();
  }

  async getFleetsIdle(x: number, y: number): Promise<Fleet[]> {
    let stateDiscriminator = this.sageFleetHandler.asStatic().stateDiscriminatorsMap.Idle;
    let fleets = await readAllFromRPC(this.provider.connection, this.program, Fleet, "confirmed", [
      {
        memcmp: { offset: FLEET_MIN_DATA_SIZE, bytes: bs58.encode(Uint8Array.from([stateDiscriminator])) }, // filter by discriminator of MineAsteroid state
      },
      {
        memcmp: { offset: FLEET_MIN_DATA_SIZE + 1, bytes: bs58.encode(Uint8Array.from([x])) }, // filter by discriminator of MineAsteroid state
      },
      {
        memcmp: { offset: FLEET_MIN_DATA_SIZE + 1 + 8, bytes: bs58.encode(Uint8Array.from([y])) }, // filter by discriminator of MineAsteroid state
      },
    ]);

    let fs = fleets.filter((f) => f.type == "ok").map((f) => f.data);

    return fs;
  }

  /**
   * Provide Mining fleets in sector - based on MineAsteroid state of fleets on planets in sector
   *
   * @param x
   * @param y
   * @returns List of fleets with MineAsteroid state in sector
   */
  async getFleetsMiningOn(x: number, y: number): Promise<Fleet[]> {
    let stateDiscriminator = this.sageFleetHandler.asStatic().stateDiscriminatorsMap.MineAsteroid;
    let planetsOn = await this.getAllPlanetsInSector(x, y);
    let miningFleets = [];
    for (let planet of planetsOn) {
      // log(planet.key.toBase58(), planet.prettyName);
      let fleets = await readAllFromRPC(this.provider.connection, this.program, Fleet, "confirmed", [
        {
          memcmp: { offset: FLEET_MIN_DATA_SIZE, bytes: bs58.encode(Uint8Array.from([stateDiscriminator])) }, // filter by discriminator of MineAsteroid state
        },
        {
          memcmp: { offset: FLEET_MIN_DATA_SIZE + 1, bytes: planet.key.toBase58() }, // filter by planet/asteroid key
        },
      ]);
      let fs = fleets.filter((f) => f.type == "ok").map((f) => f.data);
      miningFleets.push(...fs);
    }

    return miningFleets;
  }

  /**
   * Provide Traveling [warp/subwarp] fleets to sector
   * @param x
   * @param y
   * @returns
   */
  async getFleetsTravelingFrom(x: number, y: number, currentSectorInterpolationFilter = false) {
    // !! NOTE !! - COmments illustrate separated cal between warp and Supwarp - but to reduce RPC Calls - they are well combined

    // let warpDiscriminator = this.sageFleetHandler.asStatic().stateDiscriminatorsMap.MoveWarp;
    // let subwarpDiscriminator = this.sageFleetHandler.asStatic().stateDiscriminatorsMap.MoveSubwarp;
    let fleets: Fleet[] = [];
    let res = await Promise.all([
      // warpDiscriminator + u8[x_from] + u8[y_from] + u8[x_to] + u8[y_to]
      await readAllFromRPC(this.provider.connection, this.program, Fleet, "confirmed", [
        // {
        //   memcmp: { offset: FLEET_MIN_DATA_SIZE, bytes: bs58.encode(Uint8Array.from([warpDiscriminator])) }, // filter by discriminator of MineAsteroid state
        // },
        {
          memcmp: { offset: FLEET_MIN_DATA_SIZE + 1, bytes: bs58.encode(Uint8Array.from([x])) }, // filter by discriminator of MineAsteroid state
        },
        {
          memcmp: { offset: FLEET_MIN_DATA_SIZE + 1 + 8, bytes: bs58.encode(Uint8Array.from([y])) }, // filter by discriminator of MineAsteroid state
        },
        // ]),
        // await readAllFromRPC(this.provider.connection, this.program, Fleet, "confirmed", [
        //   {
        //     memcmp: { offset: FLEET_MIN_DATA_SIZE, bytes: bs58.encode(Uint8Array.from([subwarpDiscriminator])) }, // filter by discriminator of MineAsteroid state
        //   },
        //   {
        //     memcmp: { offset: FLEET_MIN_DATA_SIZE + 1, bytes: bs58.encode(Uint8Array.from([x])) }, // filter by discriminator of MineAsteroid state
        //   },
        //   {
        //     memcmp: { offset: FLEET_MIN_DATA_SIZE + 1 + 8, bytes: bs58.encode(Uint8Array.from([y])) }, // filter by discriminator of MineAsteroid state
        //   },
      ]),
    ]);

    for (let r of res) {
      let fs = r.filter((f) => f.type == "ok").map((f) => f.data);
      if (currentSectorInterpolationFilter) {
        for (let fleet of fs) {
          let location = await this.sageFleetHandler.getCurrentSector(fleet);
          if (location.x == x && location.y == y) {
            fleets.push(fleet);
          }
        }
      } else {
        fleets.push(...fs);
      }
    }
    return fleets;

    return fleets;
  }

  /**
   * Provide Traveling [warp/subwarp] fleets from sector
   * @param x
   * @param y
   * @returns
   */
  async getFleetsTravelingTo(x: number, y: number, currentSectorInterpolationFilter = false) {
    // !! NOTE !! - COmments illustrate separated cal between warp and Supwarp - but to reduce RPC Calls - they are well combined
    // let warpDiscriminator = this.sageFleetHandler.asStatic().stateDiscriminatorsMap.MoveWarp;
    // let subwarpDiscriminator = this.sageFleetHandler.asStatic().stateDiscriminatorsMap.MoveSubwarp;
    let fleets: Fleet[] = [];
    let res = await Promise.all([
      // warpDiscriminator + u8[x_from] + u8[y_from] + u8[x_to] + u8[y_to]
      await readAllFromRPC(this.provider.connection, this.program, Fleet, "confirmed", [
        // {
        //   memcmp: { offset: FLEET_MIN_DATA_SIZE, bytes: bs58.encode(Uint8Array.from([warpDiscriminator])) }, // filter by discriminator
        // },
        {
          memcmp: { offset: FLEET_MIN_DATA_SIZE + 1 + 16, bytes: bs58.encode(Uint8Array.from([x])) }, // filter by x
        },
        {
          memcmp: { offset: FLEET_MIN_DATA_SIZE + 1 + 16 + 8, bytes: bs58.encode(Uint8Array.from([y])) }, // filter by y
        },
        // ]),
        // await readAllFromRPC(this.provider.connection, this.program, Fleet, "confirmed", [
        //   {
        //     memcmp: { offset: FLEET_MIN_DATA_SIZE, bytes: bs58.encode(Uint8Array.from([subwarpDiscriminator])) }, // filter by discriminator
        //   },
        //   {
        //     memcmp: { offset: FLEET_MIN_DATA_SIZE + 1 + 16, bytes: bs58.encode(Uint8Array.from([x])) }, // filter by x
        //   },
        //   {
        //     memcmp: { offset: FLEET_MIN_DATA_SIZE + 1 + 16 + 8, bytes: bs58.encode(Uint8Array.from([y])) }, // filter by y
        //   },
      ]),
    ]);

    for (let r of res) {
      let fs = r.filter((f) => f.type == "ok").map((f) => f.data);
      if (currentSectorInterpolationFilter) {
        for (let fleet of fs) {
          let location = await this.sageFleetHandler.getCurrentSector(fleet);
          if (location.x == x && location.y == y) {
            fleets.push(fleet);
          }
        }
      } else {
        fleets.push(...fs);
      }
    }
    return fleets;

    return fleets;
  }

  // Forward to profile handler
  async getPlayerProfileAddress(playerPubkeyOwner: PublicKey) {
    return this.sagePlayerProfileHandler.getPlayerProfileAddress(playerPubkeyOwner);
  }

  async getStarbaseAccount(starbasePubkey: PublicKey): Promise<Starbase> {
    const starbase = await readFromRPCOrError(this.provider.connection, this.program, starbasePubkey, Starbase, "confirmed");

    return starbase;
  }

  /**
   * Get all Starbase accounts for a given gameId.
   * Override this method in child classes if the Starbase type differs.
   */
  async getAllStarbaseAccounts(gameId: PublicKey | undefined = undefined): Promise<DecodedAccountData<Starbase>[]> {
    // If your child class uses a different Starbase type, override this method and use the correct type.
    return readAllFromRPC(this.provider.connection, this.program, Starbase, "confirmed", [
      {
        memcmp: {
          offset: 8 + 1,
          bytes: gameId?.toBase58() || "",
        },
      },
    ]);
  }

  /**
   * Get Starbase Player Address
   * @param ownerProfile - Is the wallet owning the SagePlayerProfile
   * @param coordinates - Coordinates of Starbase
   */
  async getStarbaseCargoPod(ownerProfile: PublicKey, coordinates: BN[]): Promise<PublicKey> {
    // Set public key
    let sbPublicKey = this.getStarbaseAddress([coordinates[0], coordinates[1]]);
    // let fleetAccount = await this.process.fetchFleetAccount();
    const starbaseAccount = await this.getStarbaseAccount(sbPublicKey);
    const sagePlayerProfile = await this.getSagePlayerProfileAddress(ownerProfile);
    let sbPlayerKey = await this.getStarbasePlayerAddress(sbPublicKey, sagePlayerProfile, starbaseAccount.data.seqId);

    // FIXME: how is this different from `this.cargoProgram`?
    const cargo = new Program(CARGO_IDL, new PublicKey(this.asStatic().CARGO_PROGRAM_ID), this.provider);
    const spbCargoHolds = await cargo.account.cargoPod.all([
      {
        memcmp: {
          offset: 41,
          bytes: sbPlayerKey.toBase58(),
        },
      },
    ]);
    if (spbCargoHolds.length !== 1) {
      throw "expected to find one cargo pod for the starbase player";
    }
    // set Cargo Pod
    let cargoPod = spbCargoHolds[0].publicKey;

    return cargoPod;
  }

  /**
   * List all XP Categories from Points Program
   *
   *  * alternative to UserPoints.findAddress in getUserPointsAddress
   * @returns List of all Points Categories
   */
  async listAllPointsCategories(): Promise<any[]> {
    //@ts-expect-error - Property 'account' does not exist on type
    if (!this.pointsProgram.account) {
      throw "Points program accounts not initialized";
    }
    // Fetch all pointsCategory accounts from the Points program
    //@ts-expect-error - Property 'account' does not exist on type
    return this.pointsProgram.account.pointCategory.all();
  }

  async listProfilePointsAccounts(playerProfile: PublicKey, category: PublicKey): Promise<UserPoints[]> {
    // log(Object.keys(this.pointsProgram.account));
    const filters = [
      {
        memcmp: {
          offset: 1, // profile offset in UserPointsAccount
          bytes: playerProfile.toBase58(),
        },
      },
    ];

    if (category) {
      filters.push({
        memcmp: {
          offset: 33, // pointCategory offset in UserPointsAccount
          bytes: category.toBase58(),
        },
      });
    }
    return (
      //@ts-expect-error - Property 'account' does not exist on type
      (await this.pointsProgram.account.userPointsAccount.all(filters)) || ([] as UserPoints[])
    );
  }

  /**
   * Provide XP User Points Addresses per category
   *   Addresses are constants per Game and Profile combined
   * * [cache] them in map to reduce rpc calls
   *
   * @param playerPubkey
   * @param category
   * @returns
   */
  async getUserPointsAddress(playerPubkey: PublicKey, category: PublicKey) {
    let key = playerPubkey.toBase58() + category.toBase58();
    let xpAccount = this.xpUserAccounts.get(key);

    while (!xpAccount) {
      xpAccount = UserPoints.findAddress(this.pointsProgram, category, playerPubkey)[0];
      this.xpUserAccounts.set(key, xpAccount);
      if (!xpAccount) await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return xpAccount;
  }

  /**
   * Provide XP Modifiers per category
   *    Constants based on Game Id
   *
   * @param category
   * @returns
   */
  async findPointsModifierAddress(category: PublicKey) {
    let xpModifier = this.xpModifiers.get(category.toBase58());

    while (!xpModifier) {
      // @ts-ignore this.game is always defined
      xpModifier = Game.findPointsModifierAddress(this.program, this.game.key, category)[0];
      this.xpModifiers.set(category.toBase58(), xpModifier);
      if (!xpModifier) await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return xpModifier;
  }

  getCargoTypeAddress(mint: PublicKey) {
    if (!this.cargoStatsDefinition || this.cargoStatsDefinitionSeqId == undefined) {
      throw "this.cargoStatsDefinition not set (or missing SeqId)";
    }

    const [cargoType] = CargoType.findAddress(this.cargoProgram, this.cargoStatsDefinition, mint, this.cargoStatsDefinitionSeqId);

    return cargoType;
  }

  async getFleetAddress(playerProfile: PublicKey, fleetName: string): Promise<PublicKey> {
    if (!this.gameId) {
      throw "this.gameId not set";
    }
    // ! Used wen we need FleetAccount with States
    // let fleetsList = await this.getPlayerProfileFleetsAccounts(playerProfile);
    // let f = fleetsList.find((fleet) => {
    //   return fleet.type == "ok" && byteArrayToString(fleet.data.data.fleetLabel) == fleetName;
    // });
    // if (!f) {
    //   throw "Fleet not found";
    // }
    // return f.key;

    // ! Other way to get fleet address
    const fleetLabel = stringToByteArray(fleetName, 32);
    const [fleet] = Fleet.findAddress(this.program, this.gameId, playerProfile, fleetLabel);
    return fleet;
  }

  async getFleetAccount(fleetPubkey: PublicKey): Promise<Fleet> {
    const fleet = readFromRPCOrError(this.provider.connection, this.program, fleetPubkey, Fleet, "confirmed");
    // Same AS :
    // readAllFromRPC(this.provider.connection, this.program, Fleet, "confirmed", [{
    //   memcmp:  {
    //     bytes: "",
    //     offset: 8
    //   }
    // }]);
    return fleet;
  }
  /**
   * Parse fleet accounts from the Sage program.
   * @param connection
   * @param accounts
   * @returns
   */

  getMineItemAddress(mint: PublicKey) {
    if (!this.gameId) {
      throw "this.gameId not set";
    }

    const [mineItem] = MineItem.findAddress(this.program, this.gameId, mint);

    return mineItem;
  }

  getResourceAddress(mineItem: PublicKey, planet: PublicKey) {
    const [resource] = SageResource.findAddress(this.program, mineItem, planet);

    return resource;
  }

  getSectorAddress(coordinates: [BN, BN]) {
    if (!this.gameId) {
      throw "this.gameId not set";
    }
    const [sector] = Sector.findAddress(this.program, this.gameId, coordinates);

    return sector;
  }

  getStarbaseAddress(coordinates: [BN, BN]) {
    if (!this.gameId) {
      throw "this.gameId not set";
    }

    const [starbase] = Starbase.findAddress(this.program, this.gameId, coordinates);

    return starbase;
  }

  /**
   * Get All SageStarbasePlayer accounts owned by the provided PlayerProfile
   * @param playerProfile - the player profile
   * @returns array of Sage Player Profile
   */
  async getSagePlayerProfileAddress(playerProfile: PublicKey) {
    if (!this.gameId) {
      throw "this.gameId not set";
    }
    const [sagePLayerProfile] = SagePlayerProfile.findAddress(this.program, playerProfile, this.gameId);
    return sagePLayerProfile;
  }
  // async getSagePlayerProfileAddress(playerProfile: PublicKey) {
  //   let d = await readAllFromRPC(this.connection, this.program, SagePlayerProfile, "processed", [
  //     {
  //       memcmp: {
  //         offset: 8 + 1,
  //         bytes: playerProfile.toBase58(),
  //       },
  //     },
  //     // {
  //     //   memcmp: {
  //     //     offset: 8 + 1 + 32,
  //     //     bytes: this.gameId?.toBase58() || "",
  //     //   },
  //     // },
  //   ]).then((d) => d.filter((d) => d.type == "ok").map((d) => d.data));
  //   if (d.length == 0) {
  //     throw "Sage Player Profile not found for profile " + playerProfile.toBase58();
  //   }
  //   log({ game_id: this.gameId?.toBase58(), playerProfile: playerProfile.toBase58(), found: d.length });
  //   return d[0].key;
  // }

  /**
   * Get Starbase player profile Address ( Public Key )
   * @param starbase
   * @param sagePlayerProfile
   * @param starbaseSeqId
   * @returns
   */
  getStarbasePlayerAddress(starbase: PublicKey, sagePlayerProfile: PublicKey, starbaseSeqId: number) {
    if (!this.gameId) {
      throw "this.gameId not set";
    }
    // ! Same DATA As: import { getStarbasePlayersByProfile } from "@staratlas/sage-main";
    const [starbasePlayer] = StarbasePlayer.findAddress(this.program, starbase, sagePlayerProfile, starbaseSeqId);

    return starbasePlayer;
  }

  /**
   * ! Same As: import { getStarbasePlayersByProfile } from "@staratlas/sage-main";
   * Get All StarbasePlayer accounts owned by the provided PlayerProfile
   * @param playerProfile - the player profile
   * @returns array of Starbase players
   */
  async getAllStarbasePlayerByProfile(playerProfile: PublicKey) {
    return readAllFromRPC(this.connection, this.program, StarbasePlayer, "processed", [
      {
        memcmp: {
          offset: 8 + 1,
          bytes: playerProfile.toBase58(),
        },
      },
      {
        memcmp: {
          offset: 8 + 1 + 32,
          bytes: this.gameId?.toBase58() || "",
        },
      },
    ]);
  }

  /**
   * Get StarbasePlayer accounts owned by the provided PlayerProfile and Starbase key
   * @param playerProfile - the player profile
   * @returns array of Starbase players
   */
  async getStarbasePlayerAccount(playerProfile: PublicKey, starbasePubkey: PublicKey): Promise<StarbasePlayer> {
    let account = (
      await readAllFromRPC(this.connection, this.program, StarbasePlayer, "processed", [
        {
          memcmp: {
            offset: 8 + 1,
            bytes: playerProfile.toBase58(),
          },
        },
        {
          memcmp: {
            offset: 8 + 1 + 32,
            bytes: this.gameId?.toBase58() || "",
          },
        },
        {
          memcmp: {
            offset: 8 + 1 + 32 + 32,
            bytes: starbasePubkey.toBase58(),
          },
        },
      ])
    )[0];

    if (account.type == "error") {
      throw account.error;
    }

    return account.data;
  }

  /**
   * @deprecated - Do not provide fleetState Data - getPlayerProfileFleetsAccounts should be used instead
   * @see getPlayerProfileFleetsAccounts
   * Fetch Profile fleets with, borrowed fleets
   * @param playerProfile
   * @returns
   */
  async loadPlayerProfileFleets(playerProfile: PublicKey): Promise<{ publicKey: PublicKey; account: FleetAccount }[]> {
    if (!this.gameId) {
      throw "this.gameId not set";
    }

    const program = await sageProgram(this.provider);
    const fleets = ((await program.account.fleet.all([
      {
        memcmp: {
          offset: 41,
          bytes: playerProfile.toBase58(),
        },
      },
    ])) || []) as unknown as { publicKey: PublicKey; account: FleetAccount }[];

    const borrowedFleets = ((await program.account.fleet.all([
      {
        memcmp: {
          offset: 105,
          bytes: playerProfile.toBase58(),
        },
      },
    ])) || []) as unknown as { publicKey: PublicKey; account: FleetAccount }[];
    let allFleets = fleets.concat(borrowedFleets);

    return allFleets;
  }

  /**
   * Provide all player fleetAccounts Filtered by PlayerProfile
   * @param playerProfile
   * @returns
   */
  async getPlayerProfileFleetsAccounts(playerProfile: PublicKey): Promise<Fleet[]> {
    const accounts = await this.connection.getProgramAccounts(new PublicKey(this.asStatic().SAGE_PROGRAM_ID), {
      filters: [
        {
          memcmp: {
            offset: 41,
            bytes: playerProfile.toBase58(),
          },
        },
      ],
    });
    let rented = await this.connection.getProgramAccounts(new PublicKey(this.asStatic().SAGE_PROGRAM_ID), {
      filters: [
        {
          memcmp: {
            offset: 105,
            bytes: playerProfile.toBase58(),
          },
        },
      ],
    });

    // Parse the account data as Fleet
    return accounts
      .concat(rented)
      .map((acc) => Fleet.decodeData({ accountId: acc.pubkey, accountInfo: acc.account }, this.program))
      .filter((d) => {
        return d.type == "ok";
      })
      .map((d) => d.data);
  }

  /**
   *
   * @param starbasePlayer - PublicKey of StarbasePlayers
   * @returns [ publicKey, publicKey[]] -
   *  biggest cargoPods , all cargoPods accounts
   */
  async getStarbasePlayerCargoPods(starbasePlayer: PublicKey) {
    console.error("<<getStarbasePlayerCargoPods>>");
    //@ts-ignore
    const spbCargoHolds = await this.cargoProgram.account.cargoPod.all([
      {
        memcmp: {
          offset: 41,
          bytes: starbasePlayer.toBase58(),
        },
      },
    ]);
    log(spbCargoHolds);
    console.error(spbCargoHolds.length, " StarbasePlayer: ", starbasePlayer.toBase58());

    // getCleanPodsByStarbasePlayerAccounts( );
    // cleanUpStarbaseCargoPods();
    let starbasePlayerCargoHolds = spbCargoHolds[0];
    let cargoPodToKey = starbasePlayerCargoHolds.publicKey as PublicKey;

    if (spbCargoHolds.length !== 1) {
      // Find the biggest cargo pod and use it
      let cleanups = await getCleanPodsByStarbasePlayerAccounts(this.connection, this.cargoProgram, starbasePlayer);
      if (cleanups) cargoPodToKey = cleanups.mainPod;
      this.logger.crit(`StarbasePlayer ${starbasePlayer.toBase58()} has more than one: {${spbCargoHolds.length}} cargo pod!`);
      // If Debug Mode is on
      if (this.logger.verbose == -1) {
        for (let i = 0; i < spbCargoHolds.length; i++) {
          let v = spbCargoHolds[i];
          this.logger.warn(v.account, `CargoPod: [${i}]:{${v.publicKey}} cargo pod!`);
        }
      }
      // throw "expected to find one cargo pod for the starbase player";
    }
    console.error("<<getStarbasePlayerCargoPods>>");

    return { mainCargoPod: cargoPodToKey, allCargoPods: spbCargoHolds.map((c: any) => c.publicKey as PublicKey) as PublicKey[] };
  }

  /**
   *
   * @returns all Ships
   */
  async getAllShips(filter: GetProgramAccountsFilter[] = []): Promise<Ship[]> {
    return (
      await readAllFromRPC(this.provider.connection, this.program, Ship, "confirmed", [
        { memcmp: { offset: 8 + 1, bytes: this.gameId?.toBase58() || "" } }, // Game id filter
        ...filter,
      ])
    )
      .filter((s) => s.type == "ok")
      .map((s) => s.data);
  }

  /**
   * List Ship Account by Mint
   */
  async getShipAccountByMint(mint: PublicKey): Promise<Ship[]> {
    let ship = this.getAllShips([
      // { memcmp: { offset: 8 + 1, bytes: this.gameId?.toBase58() || "" } },  // is automatic On Game id filter
      { memcmp: { offset: 8 + 1 + 32, bytes: mint.toBase58() } }, // Mint filter
    ]);

    return ship;
  }

  async loadGame() {
    if (!this.gameId) {
      throw "this.gameId not set";
    }

    this.game = await readFromRPCOrError(this.connection, this.program, this.gameId, Game, "confirmed");

    return this.game;
  }

  async loadGameState() {
    if (!this.gameState) {
      throw "this.gameState not set";
    }
    return await readFromRPCOrError(this.connection, this.program, this.gameState, GameState, "confirmed");
  }

  /**
   *
   * @param filter
   * @returns
   * @deprecated - loot accounts does not exist in SAGE YET
   */
  async findAllLoot(filter: GetProgramAccountsFilter[] = []): Promise<any[]> {
    throw "findAllLoot is deprecated in SAGE yet until implemented in the program ";
    // let loots = await readAllFromRPC(this.connection, this.program, Loot, "confirmed", filter);

    // return loots.filter((l) => l.type == "ok").map((l) => l.data);
  }

  /**
   * Provide Sector loots
   * @param x
   * @param y
   * @returns
   */
  async listSectorLoot(x: number, y: number) {
    return this.findAllLoot([
      {
        memcmp: { offset: 9, bytes: bs58.encode(Uint8Array.from([x])) },
      },
      {
        memcmp: { offset: 9 + 8, bytes: bs58.encode(Uint8Array.from([y])) },
      },
    ]);
  }

  /**
   *
   * @param lootAccountPubkey
   * @returns
   * @deprecated - loot accounts does not exist in SAGE YET
   */
  async getTokensInLootAccount(lootAccountPubkey: PublicKey): Promise<any | null> {
    throw "getTokensInLootAccount is deprecated in SAGE";
    // const acc = await this.connection.getParsedAccountInfo(lootAccountPubkey);
    // if (!acc.value) return null;

    // // очакваме SPL token account
    // const data = acc.value.data as ParsedAccountData;
    // if (data.program !== "spl-token" && acc.value.owner?.toBase58() !== "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") {
    //   return null; // не е SPL token account
    // }

    // const info = (data as any).parsed.info;
    // const mint = new PublicKey(info.mint);
    // const amount = BigInt(info.tokenAmount.amount); // string -> bigint

    // return { mint, amount };
  }

  /**
   *
   * @param lootInfo
   * @returns
   * @deprecated - loot accounts does not exist in SAGE YET
   */
  async getTokensFromLootInfo(lootInfo: { loot: PublicKey }): Promise<any | null> {
    return this.getTokensInLootAccount(lootInfo.loot);
  }
}
