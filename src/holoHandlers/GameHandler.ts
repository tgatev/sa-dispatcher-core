import { prompt } from "../Common/prompt";
import { AnchorProvider, BN, BorshAccountsCoder, Program, Wallet } from "@project-serum/anchor";
import { Connection, GetProgramAccountsFilter, GetProgramAccountsResponse, KeyedAccountInfo, Keypair, ParsedAccountData, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { CARGO_IDL, CargoIDLProgram, CargoType } from "@staratlas/cargo";
// import { CARGO_IDL, CargoIDL, CargoIDLProgram, cargoPodDataEquals, CargoType } from "./mod/Cargo";
// import { CRAFTING_IDL, CraftingIDLProgram, CraftingProgram } from "@staratlas/crafting"; // @staratlas\crafting\src\constants.ts
import { DecodedAccountData, readAllFromRPC, readFromRPCOrError, byteArrayToString, stringToByteArray, readFromRPC } from "@staratlas/data-source";
import { PlayerProfileIDL, PLAYER_PROFILE_IDL } from "@staratlas/player-profile";
import { ProfileFactionIDL, PROFILE_FACTION_IDL } from "@staratlas/profile-faction";
import {
  // SAGE_IDL,
  // SageIDLProgram,
  // Game,
  // Fleet,
  // Resource as SageResource,
  GameState,
  // MineItem,
  PlanetType,
  SagePlayerProfile,
  // Sector,
  // Starbase,
  // StarbasePlayer,
  FLEET_MIN_DATA_SIZE,
  FleetAccount,
  getCleanPodsByStarbasePlayerAccounts,
  LootInfo,
  // Ship,
} from "@staratlas/holosim";
// import { POINTS_IDL, PointsIDLProgram, UserPoints } from "@staratlas/points";
import { UserPoints } from "./mod/userPoints";
import { POINTS_IDL, PointsIDLProgram } from "./IDL/points_constants";

import { Coordinates } from "../Model/Coordinates";
import { GALACTIC_MARKETPLACE_IDL, GalacticMarketplaceIDL } from "@staratlas/galactic-marketplace";
// import { Sage } from "@staratlas/sage-main/dist/src/idl/sage";
import { SageFleetHandler } from "./FleetHandler";
import { GalacticMarketplaceHandler } from "./GalacticMarketplaceHandler";
import { StarbaseHandler } from "./StarbaseHandler";
import { ProfileHandler } from "./ProfileHandler";

import { Resource as SageResource } from "./mod/resource";
import { MineItem } from "./mod/mineItem";
import { Planet } from "./mod/planet";
import { Ship } from "./mod/ship";
import { StarbasePlayer } from "./mod/starbasePlayer";
import { Sector } from "./mod/sector";
/**
 * HOLOSIM Game Data
 */

import { SageIDLProgram, SAGE_IDL, SageIDL } from "./IDL/constants";
import { Sage } from "./IDL/sage-holo";
import { Game } from "./mod/game";
import { Fleet } from "./mod/fleet";
import { Starbase } from "./mod/starbase";
import { log } from "../Common/PatchConsoleLog";

/**
 * Read Input parameters and export them for other classes, scripts and etc
 */
export const argv = require("yargs").argv;
const DEBUG = true;

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
import _ from "lodash";
import { FleetAccountListener } from "../Common/FleetAccountListener";
import { LootDetails } from "../Common/types";
import { Loot } from "./mod/loot";

export const factionToSymbol = ["Unknown", "MUD", "ONI", "USTUR"];
const findGame = async (provider: AnchorProvider, program?: Program<Sage> | SageIDLProgram) => {
  //@ts-ignore - compatible types
  if (!program) program = await sageProgram(provider);
  // @ts-ignore
  const game = await program.account.game.all();

  return game;
};

const findAllPlanets = async (provider: AnchorProvider, program?: Program<Sage> | SageIDLProgram) => {
  // @ts-ignore
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
  // @ts-ignore
  return new Program(SAGE_IDL, new PublicKey(SageGameHandler.SAGE_PROGRAM_ID), provider);
};

// export type AssociativeArray<T = unknown> = { [key: string]: T | undefined } | T[];

export class SageGameHandler extends GameHandler<SageIDLProgram, Fleet> {
  static readonly TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
  static readonly SAGE_PROGRAM_ID = process.env["SAGE_PROGRAM_ID"] || "SAgEeT8u14TE69JXtanGSgNkEdoPUcLabeyZD2uw8x9"; // <- current holosim Program
  static readonly PLAYER_PROFILE_PROGRAM_ID = "PprofUW1pURCnMW2si88GWPXEEK3Bvh9Tksy8WtnoYJ"; // !not Checked
  static readonly PROFILE_FACTION_PROGRAM_ID = "pFACzkX2eSpAjDyEohD6i3VRJvREtH9ynbtM1DwVFsj"; // old HOLO: "pFACSRuobDmvfMKq1bAzwj27t6d2GJhSCHb1VcfnRmq"

  static readonly CARGO_PROGRAM_ID = "CArGoi989iv3VL3xArrJXmYYDNhjwCX5ey5sY5KKwMG"; // old HOLO:  "Cargo2VNTPPTi9c1vq1Jw5d3BWUNr18MjRtSupAghKEk"
  static readonly POINTS_PROGRAM_ID = "PointJfvuHi8DgGsPCy97EaZkQ6NvpghAAVkuquLf3w"; // old HOLLO "Point2iBvz7j5TMVef8nEgpmz4pDr7tU7v3RjAfkQbM";
  static readonly POINTS_STORE_PROGRAM_ID = "PsToRxhEPScGt1Bxpm7zNDRzaMk31t8Aox7fyewoVse"; // old HOLO: "PsToR2iBvz7j5TMVef8nEgpmz4pDr7tU7v3RjAfkQbM";
  static readonly GALAXY_MARKETPLACE_PROGRAM_ID = "traderDnaR5w6Tcoi3NFm53i48FTDNbGjBSZwWXDRrg"; // <- sage marketplace program id
  static SAGE_RESOURCES_MINTS: SageResourcesMints = { ...SAGE_RESOURCES_MINTS };
  static resourceHardness: ResourceHardnessMap = { ...resourceHardness };
  static starbaseMap: StarbaseMap = starbaseMapInstance;

  async exportStarbaseDataAsConfig(path: string): Promise<void> {}
  async exportUserKeysForLUT(): Promise<PublicKey[]> {
    // get player profile and SagePLayerProfile [2]
    // get user xp account keys for all categories [7],f
    // get starbase player profile keys 17-> 30 x [ 1 + 1 ]
    // + Starbase Main Cargo Pod
    // get Fleet Keys [ 1 + 3 ]
    //  + all fleet cargo accounts

    return [];
  }

  static async readStarbaseByName(sbName = "", label = "Starbase") {
    if (!sbName) sbName = ((await prompt(label + " name[ustN|mrzN]: ")) || "").toString().trim();
    let sbData = this.starbaseMap[sbName];
    if (!sbData) {
      this.Logger.crit("Wrong starbase name :", `[${sbName}]`);
      this.Logger.crit("Available star-bases: ", _.sortBy(this.getStarbaseMapKeys()));
      throw "Can't find starbase by Name!";
    }

    return sbData;
  }

  async getStarbaseDataByKey(publicKey: string): Promise<StarbaseMapItem | undefined> {
    let baseName = Object.keys(this.asStatic().starbaseMap).find((key) => this.asStatic().starbaseMap[key].starbasePublicKey === publicKey);
    if (!baseName) {
      let a = await this.getStarbaseAccount(new PublicKey(publicKey));
      if (!a) {
        throw "Cant find starbase account by key " + publicKey;
      }
      let location = new Coordinates(Number(a.data.sector[0]), Number(a.data.sector[1]));
      baseName = Object.keys(this.asStatic().starbaseMap).find((key) => this.asStatic().starbaseMap[key].location.equals(location));

      if (!baseName) {
        throw "Cant find starbase name by location " + location.toSectorKey();
      }
      // TODO : -- refactor Map SageGameHandler - actually update only key
      this.asStatic().starbaseMap[baseName].starbasePublicKey = a.key.toBase58();
    }
    return this.asStatic().starbaseMap[baseName];
  }

  /**
   * XP Categories Taken from
   * * < this.listAllPointsCategories( ...) & listProfilePointsAccounts( ...) >
   * - prefetched - NOT Often changeable
   *  todo - add export to config file and load from there
   */
  lpXpCategory = new PublicKey("LPpdwMuXRuGMz298EMbNcUioaARN8CUU6dA2qyq46g8");
  dataRunningXpCategory = new PublicKey("DXPsKQPMyaDtunxDWqiKTGWbQga3Wihck8zb8iSLATJQ");
  councilRankXpCategory = new PublicKey("CRXPW3csNpkEYU5U4DUp6Ln6aEEWq4PSUAwV8v6Ygcqg");
  pilotingXpCategory = new PublicKey("PXPfCZwu5Vuuj6aFdEUAXbxudDGeXVktTo6imwhZ5nC");
  miningXpCategory = new PublicKey("MXPkuZz7yXvqdEB8pGtyNknqhxbCzJNQzqixoEiW4Q7");
  craftingXpCategory = new PublicKey("CXPukKpixXCFPrfQmEUGR9VqnDvkUsKfPPLfdd4sKSH8");
  combatXpCategory = new PublicKey("coXptoc2GdykGZpPu4EKHoJXHuWE4GsbkiPiuVH5CB2");
  // ! [ council ] CRXPW3csNpkEYU5U4DUp6Ln6aEEWq4PSUAwV8v6Ygcqg  ->
  // ! [ craft ] CXPukKpixXCFPrfQmEUGR9VqnDvkUsKfPPLfdd4sKSH8

  // Provide Game XP Modifiers - key is category public key as string
  xpModifiers: Map<string, PublicKey> = new Map<string, PublicKey>();
  // Provide Game XP user accounts - key is category public key as string
  xpUserAccounts: Map<string, PublicKey> = new Map<string, PublicKey>();

  ready: Promise<string>;
  marketplaceProgram: Program<GalacticMarketplaceIDL>;
  protected provider: AnchorProvider;
  program: SageIDLProgram;
  playerProfileProgram: Program<PlayerProfileIDL>;
  profileFactionProgram: Program<ProfileFactionIDL>;
  cargoProgram: CargoIDLProgram; //  Program<CargoIDL>;
  pointsProgram: PointsIDLProgram;
  connection: Connection;
  // keypair: Keypair;
  // funder: AsyncSigner;
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

  static fleetAccountListener: FleetAccountListener<Fleet, SageIDLProgram> | null = new FleetAccountListener<Fleet, SageIDLProgram>(
    new Connection("https://api.mainnet-beta.solana.com"), // <- dummy, will be replaced on listen
    {} as SageIDLProgram, // <- dummy, will be replaced on listen
    new PublicKey(SageGameHandler.SAGE_PROGRAM_ID),
    SageGameHandler.parseFleetAccounts,
  );

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
    // Create Programs with Provider
    //@ts-ignore  - program type is compatible
    this.program = new Program(SAGE_IDL, new PublicKey(this.asStatic().SAGE_PROGRAM_ID), this.provider);
    // log(`SageGameHandler: Program created with ID: ${this.asStatic().SAGE_PROGRAM_ID}`);
    // log(
    //   `Sage Program account names: `,
    //   SAGE_IDL.accounts.map((a) => a.name)
    // );
    // log(`Sage has accounts? `, Object.keys(this.program.account));

    this.playerProfileProgram = new Program(PLAYER_PROFILE_IDL, new PublicKey(this.asStatic().PLAYER_PROFILE_PROGRAM_ID), this.provider);

    // @ts-ignore - program type is compatible
    this.cargoProgram = new Program(CARGO_IDL, new PublicKey(this.asStatic().CARGO_PROGRAM_ID), this.provider);
    this.profileFactionProgram = new Program(PROFILE_FACTION_IDL, new PublicKey(this.asStatic().PROFILE_FACTION_PROGRAM_ID), this.provider);

    //@ts-ignore - program type is compatible
    this.pointsProgram = new Program(POINTS_IDL, new PublicKey(this.asStatic().POINTS_PROGRAM_ID), this.provider);

    this.marketplaceProgram = {} as Program<GalacticMarketplaceIDL>;
    // new Program(
    //   GALACTIC_MARKETPLACE_IDL,
    //   new PublicKey(this.asStatic().GALAXY_MARKETPLACE_PROGRAM_ID),
    //   this.provider
    // );

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
      Promise.all([findGame(this.provider, this.program), findAllPlanets(this.provider, this.program), this.getShipsAccounts()]) // <- pre-load ships accounts
        .then((result) => {
          const [game] = result[0];
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
          // log("HOLOSIM Game Data", game.account);

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
  }

  protected async listAllFleetAccountsForGameMap(): Promise<Fleet[]> {
    const [subwarp, warp, mining, starbaseLoadingBay, idle, respawn] = await Promise.all([
      // Subwarp - read all fleets with Game ID filter
      readAllFromRPC(this.provider.connection, this.program, Fleet, "confirmed", [
        { memcmp: { offset: 8 + 1, bytes: this.gameId?.toBase58() || "" } }, // Game id filter // Split by state type
        { memcmp: { offset: FLEET_MIN_DATA_SIZE, bytes: bs58.encode(Uint8Array.from([this.sageFleetHandler.asStatic().stateDiscriminatorsMap.MoveSubwarp])) } }, // FleetState: Subwarp State Filter
      ]),
      readAllFromRPC(this.provider.connection, this.program, Fleet, "confirmed", [
        { memcmp: { offset: 8 + 1, bytes: this.gameId?.toBase58() || "" } }, // Game id filter // Split by state type
        { memcmp: { offset: FLEET_MIN_DATA_SIZE, bytes: bs58.encode(Uint8Array.from([this.sageFleetHandler.asStatic().stateDiscriminatorsMap.MoveWarp])) } }, // FleetState: Warp State Filter
      ]),
      readAllFromRPC(this.provider.connection, this.program, Fleet, "confirmed", [
        { memcmp: { offset: 8 + 1, bytes: this.gameId?.toBase58() || "" } }, // Game id filter // Split by state type
        {
          memcmp: { offset: FLEET_MIN_DATA_SIZE, bytes: bs58.encode(Uint8Array.from([this.sageFleetHandler.asStatic().stateDiscriminatorsMap.MineAsteroid])) },
        }, // FleetState: Mining State Filter
      ]),
      readAllFromRPC(this.provider.connection, this.program, Fleet, "confirmed", [
        { memcmp: { offset: 8 + 1, bytes: this.gameId?.toBase58() || "" } }, // Game id filter // Split by state type
        {
          memcmp: {
            offset: FLEET_MIN_DATA_SIZE,
            bytes: bs58.encode(Uint8Array.from([this.sageFleetHandler.asStatic().stateDiscriminatorsMap.StarbaseLoadingBay])),
          },
        }, // FleetState: Starbase Loading Bay State Filter
      ]),
      readAllFromRPC(this.provider.connection, this.program, Fleet, "confirmed", [
        { memcmp: { offset: 8 + 1, bytes: this.gameId?.toBase58() || "" } }, // Game id filter // Split by state type
        { memcmp: { offset: FLEET_MIN_DATA_SIZE, bytes: bs58.encode(Uint8Array.from([this.sageFleetHandler.asStatic().stateDiscriminatorsMap.Idle])) } }, // FleetState: Idle State Filter
      ]),
      readAllFromRPC(this.provider.connection, this.program, Fleet, "confirmed", [
        { memcmp: { offset: 8 + 1, bytes: this.gameId?.toBase58() || "" } }, // Game id filter // Split by state type
        { memcmp: { offset: FLEET_MIN_DATA_SIZE, bytes: bs58.encode(Uint8Array.from([this.sageFleetHandler.asStatic().stateDiscriminatorsMap.Respawn])) } }, // FleetState: Respawn State Filter
      ]),
    ]);

    return [...subwarp, ...warp, ...mining, ...starbaseLoadingBay, ...idle, ...respawn].filter((d) => d.type === "ok").map((d) => d.data);
  }

  /**
   * Init Resource Weights for calculation cargo space used
   * ! could be extended to load from config file or SAGE Onchain
   */
  initResourceWeights() {
    this.setResourceWeights(
      [
        // "council_rfr",
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
        "survey_data_unit",
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
    // this.setResourceWeights(["mic", "oic", "uic"], 50);

    this.setResourceWeights(
      [
        "mud_infrastructure_contract",
        "mud_infrastructure_contract_gottis_favor",
        "oni_infrastructure_contract",
        "oni_infrastructure_contract_vaors_order",
        "ustur_infrastructure_contract",
        "ustur_infrastructure_contract_opos_request",
      ],
      50,
    );
    // Contracts:
    this.setResourceWeights(["data_contract"], 1);
    this.setResourceWeights(["food_contract", "metals_contract", "plastics_contract", "water_contract"], 10);
    this.setResourceWeights(["aerogel_contract"], 40);
    this.setResourceWeights(["precious_metals_contract"], 80);
    this.setResourceWeights(["arco_contract", "crystals_contract", "diamond_contract", "rochinol_contract"], 160);
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

  /**
   *
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

  async getFleetAccount(fleetPubkey: PublicKey): Promise<Fleet> {
    try {
      const fleet = readFromRPCOrError(this.provider.connection, this.program, fleetPubkey, Fleet, "confirmed");
      // readAllFromRPC(this.provider.connection, this.program, Fleet, "confirmed", [{
      //   memcmp:  {
      //     bytes: "",
      //     offset: 8
      //   }
      // }]);
      return fleet;
    } catch (error) {
      const msg = (error as any)?.message ? String((error as any).message) : String(error);
      throw new Error(`getFleetAccount(${fleetPubkey.toBase58()}) failed: ${msg}`);
    }
  }

  async getMineItemAccount(mineItemPubkey: PublicKey): Promise<MineItem> {
    const mineItem = readFromRPCOrError(this.provider.connection, this.program, mineItemPubkey, MineItem, "confirmed");

    return mineItem;
  }

  async findAllPlanets(filter: GetProgramAccountsFilter[] = []): Promise<Planet[]> {
    let planets = await readAllFromRPC(this.provider.connection, this.program, Planet, "confirmed", filter);

    return planets.filter((p) => p.type == "ok").map((p) => p.data);
  }

  async getAllMineItems(gameId: PublicKey | undefined = undefined) {
    if (!gameId) {
      gameId = this.gameId!;
    }

    return readAllFromRPC(this.provider.connection, this.program, MineItem, "confirmed", [
      {
        memcmp: {
          offset: 8 + 1, // Game id offset
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
  async getLootsInOnSector(x: number, y: number): Promise<Loot[]> {
    let loots = await readAllFromRPC(this.provider.connection, this.program, Loot, "confirmed", [
      { memcmp: { offset: 73, bytes: this.gameId?.toBase58() || "" } }, // Game id filter
      { memcmp: { offset: 105, bytes: bs58.encode(Uint8Array.from([x])) } },
      { memcmp: { offset: 105 + 8, bytes: bs58.encode(Uint8Array.from([y])) } },
    ]);
    return loots.filter((l) => l.type == "ok").map((l) => l.data);
  }

  getFleetPlayerProfile(fleetAccount: Fleet): PublicKey {
    if (!fleetAccount.data.ownerProfile) {
      throw new Error("Fleet account does not have an owner profile");
    }

    if (fleetAccount.data.subProfile.key.toBase58() === "11111111111111111111111111111111") {
      return fleetAccount.data.ownerProfile;
    } else {
      return fleetAccount.data.subProfile.key;
    }
  }

  async getSectorFleets(x: number, y: number, exclude: { idle?: boolean; mining?: boolean; traveling?: boolean } = {}) {
    const travelingFrom = exclude.traveling ? [] : await this.getFleetsTravelingFrom(x, y, true);
    const idle = exclude.idle ? [] : await this.getFleetsIdle(x, y);
    const mining = exclude.mining ? [] : await this.getFleetsMiningOn(x, y);
    const travelingTo = exclude.traveling ? [] : await this.getFleetsTravelingTo(x, y, true);

    const flat = [...travelingFrom, ...idle, ...mining, ...travelingTo];
    const unique = Array.from(new Map(flat.map((f) => [f.key.toBase58(), f])).values());
    const duplicates = flat.length - unique.length;

    log(
      `getSectorFleets(${x}, ${y}) - raw: ${flat.length}, unique: ${unique.length}, duplicates: ${duplicates} ` +
        `(idle: ${idle.length}, mining: ${mining.length}, travelingFrom: ${travelingFrom.length}, travelingTo: ${travelingTo.length})`,
    );

    return unique;
  }

  /**
   * Provide list of Idle fleets in sector - based on Idle state of fleets on planets in sector
   * @param x
   * @param y
   * @returns
   */
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
        //   {
        //     memcmp: { offset: FLEET_MIN_DATA_SIZE, bytes: bs58.encode(Uint8Array.from([warpDiscriminator])) }, // filter by discriminator of MineAsteroid state
        //   },
        {
          memcmp: { offset: FLEET_MIN_DATA_SIZE + 1, bytes: bs58.encode(Uint8Array.from([x])) }, // filter by coordinates x_from
        },
        {
          memcmp: { offset: FLEET_MIN_DATA_SIZE + 1 + 8, bytes: bs58.encode(Uint8Array.from([y])) }, // filter by  coordinates y_from
        },
        // ]),
        // await readAllFromRPC(this.provider.connection, this.program, Fleet, "confirmed", [
        //   {
        //     memcmp: { offset: FLEET_MIN_DATA_SIZE, bytes: bs58.encode(Uint8Array.from([subwarpDiscriminator])) }, // filter by discriminator of MineAsteroid state
        //   },
        //   {
        //     memcmp: { offset: FLEET_MIN_DATA_SIZE + 1, bytes: bs58.encode(Uint8Array.from([x])) }, // filter by coordinates x_to
        //   },
        //   {
        //     memcmp: { offset: FLEET_MIN_DATA_SIZE + 1 + 8, bytes: bs58.encode(Uint8Array.from([y])) }, // filter by coordinates y_to
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
          memcmp: { offset: FLEET_MIN_DATA_SIZE + 1 + 16, bytes: bs58.encode(Uint8Array.from([x])) }, // filter by  x
        },
        {
          memcmp: { offset: FLEET_MIN_DATA_SIZE + 1 + 16 + 8, bytes: bs58.encode(Uint8Array.from([y])) }, // filter by  y
        },
        // ]),
        // await readAllFromRPC(this.provider.connection, this.program, Fleet, "confirmed", [
        //   {
        //     memcmp: { offset: FLEET_MIN_DATA_SIZE, bytes: bs58.encode(Uint8Array.from([subwarpDiscriminator])) }, // filter by discriminator
        //   },
        // {
        //   memcmp: { offset: FLEET_MIN_DATA_SIZE + 1 + 16, bytes: bs58.encode(Uint8Array.from([x])) }, // filter by x
        // },
        // {
        //   memcmp: { offset: FLEET_MIN_DATA_SIZE + 1 + 16 + 8, bytes: bs58.encode(Uint8Array.from([y])) }, // filter by y
        // },
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
  }

  /**
   *  ! ## HOLOSIM [Checked]
   * @param playerPubkeyOwner
   * @returns
   */
  async getPlayerProfileAddress(playerPubkeyOwner: PublicKey) {
    // todo: cache in class property to reduce rpc calls if method is used only for own profile data - for now is used only on dispatcher initialization
    // otherwise could search profiles be wallet public key
    const [accountInfo] = await this.connection.getProgramAccounts(new PublicKey(this.asStatic().PLAYER_PROFILE_PROGRAM_ID), {
      filters: [
        {
          memcmp: {
            offset: 30,
            bytes: playerPubkeyOwner.toBase58(),
          },
        },
      ],
    });

    return accountInfo.pubkey;
  }

  /**
   *
   * @param starbasePubkey
   * @returns
   *
   */
  // @ts-ignore - Property 'account' does not exist on type incompatible _data types
  async getStarbaseAccount(starbasePubkey: PublicKey): Promise<Starbase> {
    const starbase = await readFromRPCOrError(this.provider.connection, this.program, starbasePubkey, Starbase, "confirmed");

    return starbase;
  }

  async getAllStarbaseAccounts(gameId: PublicKey | undefined = undefined): Promise<DecodedAccountData<Starbase>[]> {
    return readAllFromRPC(this.provider.connection, this.program, Starbase, "confirmed", [
      {
        memcmp: {
          offset: 8 + +1,
          bytes: gameId?.toBase58() || "",
        },
      },
    ]);
  }
  /**
   * Provide XP User Points Addresses per category
   *   Addresses are constants per Game and Profile combined
   *  cache them in map to reduce rpc calls
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
  /**
   * List all XP Categories from Points Program
   *
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

  async listProfilePointsAccounts(playerProfile: PublicKey, category?: PublicKey): Promise<UserPoints[]> {
    // log(Object.keys(this.pointsProgram.account));
    const filters = [
      {
        memcmp: {
          offset: 9, // profile offset in UserPointsAccount
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

  getCargoTypeAddress(mint: PublicKey) {
    if (!this.cargoStatsDefinition || this.cargoStatsDefinitionSeqId == undefined) {
      throw "this.cargoStatsDefinition not set (or missing SeqId)";
    }

    const [cargoType] = CargoType.findAddress(this.cargoProgram, this.cargoStatsDefinition, mint, this.cargoStatsDefinitionSeqId);

    return cargoType;
  }

  async getFleetAddress(playerProfile: PublicKey, fleetName: string) {
    if (!this.gameId) {
      throw "this.gameId not set";
    }

    // ! Old way to get fleet address - search by fleet name in player profile fleets list
    // let fleetsList = await this.loadPlayerProfileFleets(playerProfile);
    // let f = fleetsList.find((fleet) => {
    //   return byteArrayToString(fleet.account.fleetLabel) == fleetName;
    // });
    // if (!f) {
    //   throw "Fleet not found " + fleetName + " for profile " + playerProfile.toBase58();
    // }
    // return f.publicKey;

    // ! Other way to get fleet address
    const fleetLabel = stringToByteArray(fleetName, 32);
    const [fleet] = Fleet.findAddress(this.program, this.gameId, playerProfile, fleetLabel);
    return fleet;
  }

  getMineItemAddress(mint: PublicKey) {
    if (!this.gameId) {
      throw "this.gameId not set";
    }

    const [mineItem] = MineItem.findAddress(this.program as any, this.gameId, mint);

    return mineItem;
  }

  getResourceAddress(mineItem: PublicKey, planet: PublicKey) {
    const [resource] = SageResource.findAddress(this.program as any, mineItem, planet);

    return resource;
  }

  getSectorAddress(coordinates: [BN, BN]) {
    if (!this.gameId) {
      throw "this.gameId not set";
    }
    const [sector] = Sector.findAddress(this.program as any, this.gameId, coordinates);

    return sector;
  }

  getStarbaseAddress(coordinates: [BN, BN]) {
    if (!this.gameId) {
      throw "this.gameId not set";
    }

    const [starbase] = Starbase.findAddress(this.program as any, this.gameId, coordinates);
    if (DEBUG) log(" for coordinates: ", coordinates, "Starbase Address: ", starbase.toBase58());

    return starbase;
  }

  /**
   *
   * @param playerProfile
   *
   * @returns
   */
  // Property 'getSagePlayerProfileAddress' in type 'SageGameHandler' is not assignable to the same property in base type 'GameHandler<AnySageIDLProgram>'.
  // Type '(playerProfile: PublicKey) => PublicKey' is not assignable to type '(playerProfileKey: PublicKey) => Promise<PublicKey>'.
  // Type 'PublicKey' is missing the following properties from type 'Promise<PublicKey>': then, catch, finallyts(2416)
  // @ts-ignore - TODO: fix type error
  async getSagePlayerProfileAddress(playerProfile: PublicKey) {
    if (!this.gameId) {
      throw "this.gameId not set";
    }
    const [sagePLayerProfile] = SagePlayerProfile.findAddress(this.program as any, playerProfile, this.gameId);
    return sagePLayerProfile;
  }

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
    const [starbasePlayer] = StarbasePlayer.findAddress(this.program as any, starbase, sagePlayerProfile, starbaseSeqId);

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
    let [account] = await readAllFromRPC(this.connection, this.program, StarbasePlayer, "processed", [
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
    ]);

    if (account.type == "error") {
      throw account.error;
    }

    return account.data;
  }

  /**
   * @deprecated - Do not provide fleetState Data - getPlayerProfileFleetsAccounts should be used instead
   * @see getPlayerProfileFleetsAccounts
   * @param playerProfile
   * @returns
   */
  async loadPlayerProfileFleets(playerProfile: PublicKey): Promise<{ publicKey: PublicKey; account: FleetAccount }[]> {
    if (!this.gameId) {
      throw "this.gameId not set";
    }

    const program = await sageProgram(this.provider);
    // @ts-expect-error - Property 'account' does not exist on type [fleet vs Fleet]
    const fleets = ((await program.account.fleet.all([
      {
        memcmp: {
          offset: 41,
          bytes: playerProfile.toBase58(),
        },
      },
    ])) || []) as unknown as { publicKey: PublicKey; account: FleetAccount }[];

    // @ts-expect-error - Property 'account' does not exist on type [fleet vs Fleet]
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
   *
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
    //@ts-ignore
    const spbCargoHolds = await this.cargoProgram.account.cargoPod.all([
      {
        memcmp: {
          offset: 41,
          bytes: starbasePlayer.toBase58(),
        },
      },
    ]);

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

    return {
      mainCargoPod: cargoPodToKey as PublicKey,
      allCargoPods: spbCargoHolds.map((c: any) => c.publicKey as PublicKey) as PublicKey[],
    };
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

  /**
   * List Ship Account by StarbasePlayer - to get all ships owned by StarbasePlayer
   * @param starbasePlayer
   * @returns
   */
  async getShipsOnStabasePlayer(starbasePlayer: PublicKey): Promise<Ship[]> {
    let shipAccs = await readAllFromRPC(this.provider.connection, this.program, Ship, "confirmed", [
      // { memcmp: { offset: 8 + 1, bytes: this.gameId?.toBase58() || "" } },  // is automatic On Game id filter
      { memcmp: { offset: 8 + 1 + 32, bytes: starbasePlayer.toBase58() } }, // StarbasePlayer filter
    ]);

    let ships = shipAccs.filter((s) => s.type == "ok").map((s) => s.data);
    return ships;
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
    //@ts-ignore
    return await readFromRPCOrError(this.connection, this.program, this.gameState, GameState, "confirmed");
  }

  async findAllLoot(filter: GetProgramAccountsFilter[] = []): Promise<Loot[]> {
    let loots = await readAllFromRPC(this.connection, this.program, Loot, "confirmed", filter);

    return loots.filter((l) => l.type == "ok").map((l) => l.data);
  }

  /**
   * Provide Traveling [warp/subwarp] fleets to sector
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
   * Provide retrievable loot in sector [x,y] with display of time until unlock and loot content
   *
   * @param x
   * @param y
   * @returns
   */
  async listRetrievableLoot(
    x: number,
    y: number,
    limit = 1,
    profile: PublicKey | undefined = undefined,
  ): Promise<{ retrievableByOwner: LootDetails[]; retrievableByAnyone: LootDetails[] }> {
    // const unlockTimeLimit = 20 * 60; // ! META CONST - 20 minutes after creation - loot is retrievable only by destroyer, after that - anyone can retrieve its
    const now = Math.floor(Date.now() / 1000); // Time in seconds comparable with on chain data
    let lootsBook = {
      retrievableByOwner: [] as LootDetails[], // AKA retrievable by destroyer only - loot created less than 20 minutes ago
      retrievableByAnyone: [] as LootDetails[],
    };

    let loots = await this.listSectorLoot(x, y);

    loots: for (let l of loots) {
      let lootKey = l.data.items.filter((i) => i.loot.toBase58() != "11111111111111111111111111111111");
      // Skip empty loot
      if (lootKey.length == 0) continue;
      for (let item of lootKey) {
        let unlockTime = Number(item.exclusivityUnlockTime) - now;
        // let treasuryTokens = await this.getParsedTokenAccountsByOwner(item.loot); // RPC CALL
        let lootDetails: LootDetails = {
          lootAccount: l,
          activeItem: item,
          lootCargoKey: item.loot, // item.loot or l.key - WE DON'T KNOW  which is the proper one
          // lootTokens: treasuryTokens,
        };
        if (unlockTime < 0) {
          lootsBook.retrievableByAnyone.push(lootDetails);
        } else {
          if (profile) {
            if (lootDetails.activeItem.destroyer.toBase58() != profile.toBase58()) {
              // If profile provided - skip loot that is not owned by profile even if unlock time is not passed yet
              continue loots;
            }
          }
          lootsBook.retrievableByOwner.push(lootDetails);
        }
      }
      limit--;
      if (limit <= 0) break;
    }

    return lootsBook;
  }
}
