import { BN, BorshAccountsCoder, Program } from "@project-serum/anchor";
import { Connection, PublicKey, ParsedAccountData, GetProgramAccountsFilter } from "@solana/web3.js";
import { AccountState, Account as TokenAccount } from "@solana/spl-token";

import {
  readFromRPCOrError,
  InstructionReturn,
  createAssociatedTokenAccountIdempotent,
  getParsedTokenAccountsByOwner,
  DecodedAccountData,
  readAllFromRPC,
} from "@staratlas/data-source";
import { CARGO_IDL } from "@staratlas/cargo";
import {
  CraftingInstance,
  CraftingInstanceType,
  gameDataEquals,
  SagePlayerProfile,
  Starbase,
  StarbasePlayer,
  StarbasePlayerAccount,
} from "@staratlas/sage-main";

import { SageGameHandler } from "./GameHandler";
import {} from "../Error/ErrorHandlers";
import { Logger, toFilterBytes, u8aToString } from "../utils";
import base58 from "bs58";
import {
  CRAFTING_IDL,
  CraftingIDL,
  CraftingIDLProgram,
  CraftingProcess,
  Recipe,
  RecipeAccount,
  RecipeCategoryAccount,
} from "@staratlas/crafting";
import { Crafting } from "@staratlas/crafting/dist/src/idl/crafting";
import { InsufficientAmountOfError, CantFindRecipeError } from "../Error/ErrorHandlers";

/***
 * [WIP] - Starbase Handler
 */

/**
 * 
 * @param ms 
 * @returns 
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// import { readAndParseJsonFile } from "../FileUtils";
export interface ResourceDescription {
  mint: PublicKey;
  amount: number;
  weight: number;
  totalWeight: number;
}

export type CraftCategoryTypes = "Upgrade" | "Craft";
/**
 * Support for Starbase Player Accounts
 *  - Starbase Cargos
 *  - Starbase Player Inventory
 *  - Starbase Crafting Processes
 */
export class StarbaseHandler {
  static readonly CRAFTING_PROGRAM_ID = "CRAFT2RPXPJWCEix4WpJST3E7NLf79GTqZUL75wngXo5";

  ready;
  logger: Logger;
  starbaseKeys: { [key: string]: PublicKey } = {};
  craftingProgram: Program<CraftingIDL>;
  static rawRecipes: {
    publicKey: PublicKey;
    account: RecipeAccount;
  }[] = [];
  static rawRecipeCategories: {
    publicKey: PublicKey;
    account: RecipeCategoryAccount;
  }[] = [];
  constructor(private _gameHandler: SageGameHandler) {
    this.logger = this._gameHandler.logger;
    Object.keys(SageGameHandler.starbaseMap).forEach((baseKey) => {
      try {
        this.starbaseKeys[baseKey] = new PublicKey(SageGameHandler.starbaseMap[baseKey].starbasePublicKey!);
      } catch (e) {
        // Skip base load on publickey error
      }
    });
    this.craftingProgram = new Program(CRAFTING_IDL, new PublicKey(StarbaseHandler.CRAFTING_PROGRAM_ID), this._gameHandler.provider);
    this.ready = this.init(_gameHandler);
  }

  async init(gameHandler: SageGameHandler) {
    let promises: any[] = [];
    // TODO: Fix loading force error
    // if (!Array.isArray(StarbaseHandler.rawRecipes) || StarbaseHandler.rawRecipes.length == 0)
    //   promises.push(StarbaseHandler.fetchCraftRecipes(this.craftingProgram));
    // if (!Array.isArray(StarbaseHandler.rawRecipes) || StarbaseHandler.rawRecipes.length == 0)
    //   promises.push(StarbaseHandler.fetchCraftRecipesCategories(this.craftingProgram));

    // Wait all building promises
    (await gameHandler.ready) && (await Promise.all(promises));

    return true;
  }

  fetchAllBaseKeys() {
    let r: { [key: string]: PublicKey } = {};
    for (let baseKey of Object.keys(SageGameHandler.starbaseMap)) {
      let base = SageGameHandler.starbaseMap[baseKey];
      let bnCoord = [new BN(base.location.x), new BN(base.location.y)] as [BN, BN];
      let address = this._gameHandler.getStarbaseAddress(bnCoord);
      r[baseKey] = address;
    }
    return r;
  }

  async getSagePlayerProfileAddress(playerProfileKey: PublicKey) {
    return this._gameHandler.getSagePlayerProfileAddress(playerProfileKey);
  }

  async getStarbasePlayerAddress(starbaseKey: PublicKey, playerProfileKey: PublicKey) {
    let seqId: number = (await this._gameHandler.getStarbaseAccount(starbaseKey)).data.seqId;

    return this._gameHandler.getStarbasePlayerAddress(starbaseKey, playerProfileKey, seqId);
  }

  async getAllStarbasePlayerByProfile(playerProfileKey: PublicKey) {
    return this._gameHandler.getAllStarbasePlayerByProfile(playerProfileKey);
  }

  /**
   * Get All Cargo Pods for a StarbasePlayer
   * @param starbasePlayerKey
   * @returns
   */
  async getCargoPod(starbasePlayerKey: PublicKey) {
    // const cargo = new Program(CARGO_IDL, new PublicKey(SageGameHandler.CARGO_PROGRAM_ID), this._gameHandler.provider);
    let cargo = this._gameHandler.cargoProgram as unknown as Program<typeof CARGO_IDL>;

    const spbCargoHolds = await cargo.account.cargoPod.all([
      {
        memcmp: {
          offset: 41,
          bytes: starbasePlayerKey.toBase58(),
        },
      },
    ]);

    return spbCargoHolds;
  }

  async getStarbaseInventory(cargo: PublicKey) {
    // const tokenAccounts = await this._gameHandler.getParsedTokenAccountsByOwner(cargo);
    // await this._gameHandler.getParsedTokenAccountsByOwner(cargo);
    return this._gameHandler.getAmountsByMints(cargo);
  }
  /**
   * Provide decoded account data for all StarbasePlayer accounts on starbase
   * @param starbaseKey 
   * 
   * @returns
  32 + // playerProfile
  32 + // gameId
  32 + // starbase
  32 + // sagePlayerProfile
 */
  async getAllStarbasePlayers(starbaseKey: PublicKey) {
    return readAllFromRPC(this._gameHandler.connection, this._gameHandler.program, StarbasePlayer, "processed", [
      // {
      //   memcmp: {
      //     offset: 8 + 1,
      //     bytes: playerProfile.toBase58(),
      //   },
      // },
      {
        memcmp: {
          offset: 8 + 1 + 32,
          bytes: this._gameHandler.gameId?.toBase58() || "",
        },
      },
      {
        memcmp: {
          offset: 8 + 1 + 32 + 32,
          bytes: starbaseKey.toBase58(),
        },
      },
    ]);
  }

  /**
   * Return all starbase accounts for the current game
   * @returns
   */
  async getAllStarbaseAccounts() {
    let starbases = await readAllFromRPC(this._gameHandler.connection, this._gameHandler.program, Starbase, "processed", [
      {
        memcmp: {
          offset: 8 + 1 + 32 + 32,
          bytes: this._gameHandler.gameId?.toBase58() || "",
        },
      },
    ]);

    return starbases.filter((s) => s.type == "ok");
  }
  /**
   * Get All Starbase Players Data
   * @param starbaseKey
   * @returns {
   *  playerInventory: { [key: player]: { [key: string]: number }
   * };
   */
  async getAllStarbaseInventories(starbaseKey: PublicKey) {
    let starbasePlayers = await this.getAllStarbasePlayers(starbaseKey);
    let aggregations: { [key: string]: number } = {};
    let playerData: { [key: string]: { [key: string]: number } } = {};
    for (let i = 0; i < starbasePlayers.length; i++) {
      let starbasePlayer = starbasePlayers[i] as DecodedAccountData<StarbasePlayer>;

      //@ts-ignore
      let sbpData = starbasePlayer.data.data as StarbasePlayerAccount;
      let playerProfileKey = sbpData.playerProfile.toBase58();
      this._gameHandler.logger.dbg(i, "/", starbasePlayers.length, "< PP >", playerProfileKey, "< SBP >", starbasePlayer.key.toBase58());
      let cargoPods = await this.getCargoPod(starbasePlayer.key);
      // Each player can have more then one cargo pods on the starbase - we aggregate all the pods data per playerProfile related to the cargo pod
      for (let cargo of cargoPods) {
        if (cargo.account.openTokenAccounts > 0) {
          let i = await this.getStarbaseInventory(cargo.publicKey);
          sleep(1001);
          // Player Starbase Data
          if (!playerData[playerProfileKey]) playerData[playerProfileKey] = {};
          i.keys().forEach((resourceMint) => {
            if (!playerData[playerProfileKey][resourceMint]) playerData[playerProfileKey][resourceMint] = 0;
            playerData[playerProfileKey][resourceMint] += i.get(resourceMint) || 0;
            aggregations[resourceMint] = (aggregations[resourceMint] || 0) + (i.get(resourceMint) || 0);
          });
        }
      }
    }

    this._gameHandler.logger.dbg(starbaseKey.toBase58(), "players:", Object.keys(playerData).length, "/", starbasePlayers.length);
    return { playerInventory: playerData, baseAggregations: aggregations };
  }

  /**
   * [WIP]
   * Prepare Data Fetching With Less RPC Calls
   * @param starbaseKey
   * @returns
   */
  async getAllStarbaseInventoriesV2(starbaseKey: PublicKey) {
    // Get All Starbase Players
    let starbasePlayers = await this.getAllStarbasePlayers(starbaseKey);
    let cargo = this._gameHandler.cargoProgram as unknown as Program<typeof CARGO_IDL>;

    const spbCargoHolds = await cargo.account.cargoPod.all([
      // {
      //   memcmp: {
      //     offset: 41,
      //     bytes: starbasePlayerKey.toBase58(),
      //   },
      // },
    ]);
    console.log(spbCargoHolds.length);
    // All Associated token accounts for all players By MINT
    // TODO:
    // 1. Get all ATAs for all resources
    // 2. Get all Player Profiles, starbasePlayers and cargo pods
    // 2. map (Create Relations):  player profile <-> Starbase <-> StarbasePlayer <-> CargoPod
    let atas = await fetchATAsForOwnersAndMint(
      this._gameHandler.connection,
      starbasePlayers.map((i) => i.key),
      new PublicKey(SageGameHandler.SAGE_RESOURCES_MINTS["food"])
    );
    console.log("Food: atas<size>: ", atas.size);
    throw "Testing";
    // Pods to remove/merge/clean
    // let cargoPods = await getCleanPodsByStarbasePlayerAccounts(this._gameHandler.connection, starbasePlayers);
    let aggregations: { [key: string]: number } = {};
    let playerData: { [key: string]: { [key: string]: number } } = {};
    for (let i = 0; i < starbasePlayers.length; i++) {
      let starbasePlayer = starbasePlayers[i];
      console.log("starBasePlayer: ", i, "/", starbasePlayers.length, starbasePlayer.key.toBase58());

      let cargoPods = await this.getCargoPod(starbasePlayer.key);

      for (let cargo of cargoPods) {
        if (cargo.account.openTokenAccounts > 0) {
          let i = await this.getStarbaseInventory(cargo.publicKey);
          sleep(150);
          if (!playerData[starbasePlayer.key.toBase58()]) playerData[starbasePlayer.key.toBase58()] = {};
          i.keys().forEach((key) => {
            if (!playerData[starbasePlayer.key.toBase58()][key]) playerData[starbasePlayer.key.toBase58()][key] = 0;
            playerData[starbasePlayer.key.toBase58()][key] += i.get(key) || 0;
            aggregations[key] = (aggregations[key] || 0) + (i.get(key) || 0);
          });
        }
      }
    }
    console.log("players:", Object.keys(playerData).length, "/", starbasePlayers.length);
    return { playerInventory: playerData, baseAggregations: aggregations };
  }
  /**
   * ! CRAFTING PART
   *
   */
  /**
   * List active craft/upgrade recipes
   * @param craftingProgram
   * @returns Array<{ PublicKey: PublicKey; account: RecipeAccount; }>
   */
  static async fetchCraftRecipes(craftingProgram: Program<CraftingIDL>): Promise<
    {
      publicKey: PublicKey;
      account: RecipeAccount;
    }[]
  > {
    if (Array.isArray(StarbaseHandler.rawRecipes) && StarbaseHandler.rawRecipes.length > 0) {
      return StarbaseHandler.rawRecipes;
    }

    StarbaseHandler.rawRecipes = (await craftingProgram.account.recipe.all([
      {
        memcmp: {
          offset: 153, // 153 = RecipeStatus look RecipeAccount definitions in IDL
          bytes: toFilterBytes(2, 1), // 2 = RecipeStatus.Active , 1 is byte length
          //
        },
      },
      {
        memcmp: {
          offset: 0,
          bytes: SageGameHandler.getDiscriminator("recipe"),
        },
      },
    ])) as {
      publicKey: PublicKey;
      account: RecipeAccount;
    }[]; //as RecipeAccount[]; RecipeAccount
    // let ppr2 = new Program(CRAFTING_IDL, new PublicKey(StarbaseHandler.CRAFTING_PROGRAM_ID), provider);
    return StarbaseHandler.rawRecipes; //allRecipes.map((r) => Recipe.decodeData({ accountId: r.publicKey, accountInfo: r.account }, ppr2));
  }

  /**
   * fetch all active craft/upgrade recipes by categories
   * @param craftingProgram
   * @returns
   */
  static async fetchCraftRecipesCategories(
    craftingProgram: Program<CraftingIDL>,
    filter?: CraftCategoryTypes
  ): Promise<
    {
      publicKey: PublicKey;
      account: RecipeAccount;
    }[]
  > {
    if (!(Array.isArray(StarbaseHandler.rawRecipeCategories) && StarbaseHandler.rawRecipeCategories.length > 0)) {
      StarbaseHandler.rawRecipeCategories = await craftingProgram.account.recipeCategory.all(); //as RecipeAccount[]; RecipeAccount
    }

    if (filter) {
      return StarbaseHandler.rawRecipeCategories.filter((item) => {
        // console.log("item.account.namespace", item.account.namespace);
        //@ts-ignore
        return new TextDecoder().decode(new Uint8Array(item.account.namespace)).replace(/\0/g, "") === filter;
      });
    }

    return StarbaseHandler.rawRecipeCategories;
  }

  /**
   *
   * @param craftingProcess
   * @returns
   */
  async getCraftProcess(craftingProcess: PublicKey) {
    let process = await readFromRPCOrError(
      this._gameHandler.connection,
      this.craftingProgram as any,
      craftingProcess,
      CraftingProcess,
      "confirmed"
    );

    return process;
  }
  async getCraftingInstance(craftingInstance: PublicKey) {
    let instance = await readFromRPCOrError(
      this._gameHandler.connection,
      this.craftingProgram as any,
      craftingInstance,
      CraftingInstance,
      "confirmed"
    );

    return instance;
  }
  async getCraftingInstanceFilter(opts: { type?: CraftingInstanceType } = {}): Promise<GetProgramAccountsFilter[]> {
    let filters: GetProgramAccountsFilter[] = [];

    if (opts.type) {
      let offset = 8 + 1 + 2 + 8 + 32 + 32;
      filters.push({
        memcmp: {
          offset: offset, // Discriminator + version
          bytes:
            opts.type === CraftingInstanceType.StarbaseCrafting
              ? toFilterBytes(CraftingInstanceType.StarbaseCrafting, 1)
              : toFilterBytes(CraftingInstanceType.StarbaseUpgradeMaterial, 1), // 1 = Crafting , 2 = Upgrade
        },
      });
    }

    return filters;
  }

  async getAllCraftingProcesses(filter: GetProgramAccountsFilter[] = []) {
    let list = await readAllFromRPC(this._gameHandler.connection, this._gameHandler.program, CraftingInstance, "confirmed", filter);

    return list;
  }

  async getAllCraftingInstances(filter: GetProgramAccountsFilter[] = []) {
    let craftInst = await readAllFromRPC(
      this._gameHandler.connection,
      this._gameHandler.program,
      CraftingInstance,
      "confirmed",
      filter
      //  [
      // { memcmp: { offset: 8 + 1, bytes: this.gameId?.toBase58() || "" } }, // Game id filter
      // ]
    );

    return craftInst;
  }

  // execStartCrafting(starbase, starbasePlayer, starbasePlayerCargoHoldsAndTokens, craftingRecipe, craftAmount, userCraft);
  static async startCrafting(
    starbase: any, //! Most Useful is Starbase Name -> to be matched to StarbaseKey
    craftRecipeName: string,
    craftAmount: number,
    crew: number,
    starbaseData: // todo Types to be idealized
    | { starbasePlayer: any; starbasePlayerCargoHoldsAndTokens: any; connection: Connection; craftingProgram: Program<CraftingIDL> } // ! Static Anonymous Call
      | { gameHandler: SageGameHandler; starbaseHandler: StarbaseHandler } // ! Authorized Dispatcher Call
  ) {
    // ! Pre validations
    // Exclude 0 value too
    if (!Number(crew) || crew < 1) {
      throw new InsufficientAmountOfError("crew", crew, { min: 1 });
    }
    // Exclude 0 value too
    if (!Number(craftAmount) || craftAmount < 1) {
      throw new InsufficientAmountOfError("Craft Amount: " + craftRecipeName, crew, { min: 1 });
    }

    let recipe = StarbaseHandler.rawRecipes.find(
      (recipe) => u8aToString(recipe.account.namespace as unknown as Uint8Array, true) === craftRecipeName
    );
    if (recipe === undefined) {
      throw new CantFindRecipeError(craftRecipeName);
    }

    // todo Starbase Validation

    // ! Prepare transaction Instructions here
    if (
      (starbaseData as { gameHandler?: SageGameHandler; starbaseHandler?: StarbaseHandler }).gameHandler &&
      (starbaseData as { starbaseHandler?: StarbaseHandler }).starbaseHandler instanceof StarbaseHandler
    ) {
      // When Dispatcher is passed should find needed keys
      // Authorized Dispatcher Call
      // return (starbaseData as { gameHandler: SageGameHandler; starbaseHandler: StarbaseHandler }).starbaseHandler._gameHandler.execStartCrafting(
      //   starbase,
      //   (starbaseData as { gameHandler: SageGameHandler; starbaseHandler: StarbaseHandler }).gameHandler.playerProfile!,
      //   (starbaseData as { gameHandler: SageGameHandler; starbaseHandler: StarbaseHandler }).starbaseHandler,
      //   craftingRecipe,
      //   craftAmount
      // );
    } else {
      // Static Anonymous Call
      // Starbase Player Should be valid Public Key as string found in Starbase panel
      //
    }
  }
  static async checkAtlasNeeded() {
    // let enoughAtlas = true;
    // if (activityType == "Crafting") {
    //   const atlasNeeded = Number((craftAmount * targetRecipe.craftRecipe.feeAmount).toFixed(10));
    //   const atlasParsedBalance = await solanaReadConnection.getParsedTokenAccountsByOwner(userPublicKey, {
    //     mint: new solanaWeb3.PublicKey("ATLASXmbPQxBUYbxPsV97usA3fPQYEqzQBUHgiFCUsXx"),
    //   });
    //   const atlasBalance = atlasParsedBalance.value[0].account.data.parsed.info.tokenAmount.uiAmount;
    //   cLog(3, FleetTimeStamp(userCraft.label), "atlas needed: ", atlasNeeded, ", atlas available: ", atlasBalance);
    //   if (atlasBalance < atlasNeeded) {
    //     enoughAtlas = false;
    //   }
    // }
  }
}

async function getStarbasePlayerCargoHolds(starbasePlayer: PublicKey) {
  // let starbasePlayerCargoHolds = await cargoProgram.account.cargoPod.all([
  //   {
  //     memcmp: {
  //       offset: 41,
  //       bytes: starbasePlayer.toBase58(),
  //     },
  //   },
  // ]);
  // let starbasePlayerCargoHoldsAndTokens = [];
  // for (let cargoHold of starbasePlayerCargoHolds) {
  //   if (cargoHold.account && cargoHold.account.openTokenAccounts > 0) {
  //     let cargoHoldTokensRaw = await solanaReadConnection.getParsedTokenAccountsByOwner(cargoHold.publicKey, {
  //       programId: tokenProgramPK,
  //     });
  //     let cargoHoldTokens = cargoHoldTokensRaw.value.map((item) => ({
  //       cargoHoldToken: item.pubkey,
  //       mint: item.account.data.parsed.info.mint,
  //       amount: item.account.data.parsed.info.tokenAmount.uiAmount,
  //     }));
  //     starbasePlayerCargoHoldsAndTokens.push({ starbasePlayerCargoHold: cargoHold.publicKey, cargoHoldTokens: cargoHoldTokens });
  //   }
  // }
  // return starbasePlayerCargoHoldsAndTokens;
}

function getStarbasePlayerCargoMaxItem(starbasePlayerCargoHoldsAndTokens: any, mint: PublicKey) {
  // let cargoHold = starbasePlayerCargoHoldsAndTokens.reduce((prev, curr) => {
  //   let prevCargoHoldToken = prev && prev.cargoHoldTokens.find((item) => item.mint === mint);
  //   let prevAmount = prevCargoHoldToken ? prevCargoHoldToken.amount : -1;
  //   let currCargoHoldToken = curr.cargoHoldTokens.find((item) => item.mint === mint);
  //   let currAmount = currCargoHoldToken ? currCargoHoldToken.amount : -1;
  //   return prevAmount > currAmount ? prev : currAmount > -1 ? curr : null;
  // });
  // return cargoHold;
}

function getTargetRecipe(starbasePlayerCargoHoldsAndTokens: any, userCraft: PublicKey, targetAmount: number) {
  // let targetRecipe = null;
  // let outputExisting = 0;
  // let allRecipes = craftRecipes.concat(upgradeRecipes);
  // let craftRecipe = userCraft.name ? userCraft : allRecipes.find((item) => item.name === userCraft.item);
  // let starbasePlayerIngredientCargoHolds = [];
  // for (let input of craftRecipe.input) {
  //   let craftAmount = input.amount * targetAmount;
  //   let starbasePlayerCargoHold = getStarbasePlayerCargoMaxItem(starbasePlayerCargoHoldsAndTokens, input.mint.toString());
  //   if (starbasePlayerCargoHold && starbasePlayerCargoHold.cargoHoldTokens) {
  //     let cargoHoldToken = starbasePlayerCargoHold.cargoHoldTokens.find((item) => item.mint === input.mint.toString());
  //     cargoHoldToken = cargoHoldToken ? cargoHoldToken : { mint: input.mint.toString(), amount: 0 };
  //     let amountCraftable = cargoHoldToken.amount ? Math.floor(cargoHoldToken.amount / input.amount) : 0;
  //     craftAmount = craftAmount - cargoHoldToken.amount;
  //     starbasePlayerIngredientCargoHolds.push({
  //       starbasePlayerCargoHold: starbasePlayerCargoHold.starbasePlayerCargoHold,
  //       cargoHoldToken: cargoHoldToken,
  //       amountCraftable: amountCraftable,
  //       craftAmount: craftAmount,
  //     });
  //   } else {
  //     starbasePlayerIngredientCargoHolds.push({
  //       starbasePlayerCargoHold: null,
  //       cargoHoldToken: { mint: input.mint.toString() },
  //       amountCraftable: 0,
  //       craftAmount: craftAmount,
  //     });
  //   }
  // }
  // let limitingIngredient = starbasePlayerIngredientCargoHolds.reduce((prev, curr) =>
  //   prev && prev.amountCraftable < curr.amountCraftable ? prev : curr
  // );
  // console.log("DEBUG limitingIngredient: ", limitingIngredient);
  // console.log("DEBUG targetAmount: ", targetAmount);
  // if (limitingIngredient.amountCraftable < targetAmount) {
  //   for (let ingredient of starbasePlayerIngredientCargoHolds) {
  //     console.log("DEBUG ingredient: ", ingredient);
  //     if (ingredient.craftAmount > 0) {
  //       let filteredCraftRecipes = craftRecipes.filter(
  //         (item) => !["Framework 2", "Framework 3", "Toolkit 2", "Toolkit 3", "SDU"].includes(item.name)
  //       );
  //       let ingredientRecipes = filteredCraftRecipes.filter((item) => item.output.mint.toString() === ingredient.cargoHoldToken.mint);
  //       for (let ingredientRecipe of ingredientRecipes) {
  //         let checkRecipe = getTargetRecipe(starbasePlayerCargoHoldsAndTokens, ingredientRecipe, ingredient.craftAmount);
  //         if (checkRecipe) targetRecipe = checkRecipe;
  //       }
  //     }
  //   }
  // } else {
  //   targetRecipe = { craftRecipe: craftRecipe, amountCraftable: limitingIngredient.amountCraftable, craftAmount: targetAmount };
  // }
  // return targetRecipe;
}
//// TESTING

/**
 * Fetch all Associated Token Accounts (ATAs) for multiple owners and a specific mint.
 *
 * @param connection - Solana connection object.
 * @param owners - Array of owner public keys.
 * @param mint - The mint public key to filter by.
 * @returns A map of owner public keys to their associated token accounts.
 */
export async function fetchATAsForOwnersAndMint(
  connection: Connection,
  owners: PublicKey[],
  mint: PublicKey
): Promise<Map<string, PublicKey>> {
  const tokenProgramId = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

  // Fetch all token accounts for the specific mint
  const tokenAccounts = await connection.getParsedProgramAccounts(tokenProgramId, {
    commitment: "confirmed",
    filters: [
      {
        dataSize: 165, // Token account size
      },
      {
        memcmp: {
          offset: 0, // Offset for the mint field in the token account
          bytes: mint.toBase58(),
        },
      },
      {
        memcmp: {
          offset: 96 + 12,
          bytes: base58.encode(Uint8Array.from([AccountState.Initialized])),
        },
      },
    ],
  });

  console.log("tokenAccounts", tokenAccounts.length);
  tokenAccounts.forEach((tokenAccount) => {
    console.log(tokenAccount.account.data);
    throw "TESTING";
  });
  // Filter token accounts by owners
  const ownerToATA = new Map<string, PublicKey>();

  for (const tokenAccount of tokenAccounts) {
    const accountInfo = (tokenAccount.account.data as ParsedAccountData).parsed.info;
    const owner = accountInfo.owner;

    if (owners.some((ownerKey) => ownerKey.toBase58() === owner)) {
      ownerToATA.set(owner, new PublicKey(tokenAccount.pubkey));
    }
  }

  return ownerToATA;
}

// export function printRecipe(recipe: Recipe) {
//   console.log("Recipe:", recipe.name, "(", recipe.key.toBase58(), ")");
//   console.log("  Category:", recipe.category.toBase58());
//   console.log("  Description:", recipe.description);
//   console.log("  Ingredients:");
//   for (const ingredient of recipe.ingredients) {
//     console.log(`    - ${ingredient.amount}x ${ingredient.mint.toBase58()} (${ingredient.weight}g)`);
//   }
//   console.log("  Output:", recipe.outputAmount, "x", recipe.outputMint.toBase58());
// }

async function execCompleteUpgrade(
  starbase: PublicKey,
  starbasePlayer: PublicKey,
  starbasePlayerCargoHoldsAndTokens: any,
  craftingProcess: PublicKey,
  userCraft: PublicKey,
  connection: Connection
) {
  return new Promise(async (resolve) => {
    // let transactions = [];
    // let craftingRecipe = upgradeRecipes.find((item) => item.publicKey.toString() === craftingProcess.recipe.toString());
    // let starbaseUpgradeRecipe = upgradeRecipes.find((item) => item.name === "SB Tier " + (starbase.account.level + 1));
    // let starbaseUpgradeRecipeInput = starbaseUpgradeRecipe.input.find(
    //   (item) => item.mint.toString() === craftingRecipe.input[0].mint.toString()
    // );
    // let itemRecipe = craftRecipes.find((item) => item.output.mint.toString() === craftingRecipe.input[0].mint.toString());
    // let starbasePlayerCargoHold = getStarbasePlayerCargoMaxItem(starbasePlayerCargoHoldsAndTokens, craftingRecipe.input[0].mint.toString());
    // starbasePlayerCargoHold = starbasePlayerCargoHold
    //   ? starbasePlayerCargoHold.starbasePlayerCargoHold
    //   : starbasePlayerCargoHoldsAndTokens.length > 0
    //   ? starbasePlayerCargoHoldsAndTokens[0].starbasePlayerCargoHold
    //   : await execCreateCargoPod(userCraft, userCraft.coordinates);
    // let cargoTypeAcct = cargoTypes.find((item) => item.account.mint.toString() == craftingRecipe.input[0].mint.toString());
    // let [starbaseCargoToken] = await connection.findProgramAddressSync(
    //   [starbasePlayerCargoHold.toBuffer(), tokenProgramPK.toBuffer(), craftingRecipe.input[0].mint.toBuffer()],
    //   programPK
    // );
    // /*const [craftableItem] = await craftingProgram.account.craftableItem.all([
    //             {
    //                 memcmp: {
    //                     offset: 9,
    //                     bytes: craftingRecipe.domain.toBase58(),
    //                 },
    //             },
    //             {
    //                 memcmp: {
    //                     offset: 41,
    //                     bytes: craftingRecipe.input[0].mint.toBase58(),
    //                 },
    //             }
    //         ]);*/
    // let craftableItem = craftableItems.find(
    //   (item) =>
    //     item.account.domain.toString() === craftingRecipe.domain.toBase58() &&
    //     item.account.mint.toString() === craftingRecipe.input[0].mint.toBase58()
    // );
    // let [outputFrom] = await BrowserAnchor.anchor.web3.PublicKey.findProgramAddressSync(
    //   [craftableItem.publicKey.toBuffer(), tokenProgramPK.toBuffer(), craftingRecipe.input[0].mint.toBuffer()],
    //   programPK
    // );
    // let [ingredientToken] = await BrowserAnchor.anchor.web3.PublicKey.findProgramAddressSync(
    //   [craftingProcess.craftingProcess.toBuffer(), tokenProgramPK.toBuffer(), craftingRecipe.input[0].mint.toBuffer()],
    //   programPK
    // );
    // let userRedemptionPubkey = await getUserRedemptionAccount();
    // let newRedemption = false;
    // let userRedemptionAcct;
    // if (!userRedemptionPubkey) {
    //   userRedemptionAcct = new solanaWeb3.Keypair();
    //   userRedemptionPubkey = userRedemptionAcct.publicKey;
    //   newRedemption = true;
    // }
    // let remainingAccounts = [
    //   {
    //     pubkey: userRedemptionPubkey,
    //     isSigner: newRedemption,
    //     isWritable: true,
    //   },
    //   {
    //     pubkey: userRedemptionConfigAcct,
    //     isSigner: false,
    //     isWritable: true,
    //   },
    //   {
    //     pubkey: pointsStoreProgramId,
    //     isSigner: false,
    //     isWritable: false,
    //   },
    // ];
    // let ixSigners = [userPublicKey];
    // if (newRedemption) {
    //   remainingAccounts.push({
    //     pubkey: solanaWeb3.SystemProgram.programId,
    //     isSigner: false,
    //     isWritable: false,
    //   });
    //   remainingAccounts.push({
    //     pubkey: userPublicKey,
    //     isSigner: true,
    //     isWritable: true,
    //   });
    //   ixSigners.push(userRedemptionAcct);
    // }
    // let currDayIndex = Math.floor(Date.now() / 86400000);
    // let redemptionConfig = await connection.getAccountInfo(userRedemptionConfigAcct);
    // let redemptionConfigData = redemptionConfig.data.subarray(112);
    // let epochIndex = 0;
    // while (redemptionConfigData.length >= 44) {
    //   let currEpoch = redemptionConfigData.subarray(0, 40);
    //   let epochDecoded = pointsStoreProgram.coder.types.decode("RedemptionEpoch", currEpoch);
    //   if (epochDecoded.dayIndex.toNumber() === currDayIndex) {
    //     break;
    //   }
    //   redemptionConfigData = redemptionConfigData.subarray(40);
    //   epochIndex += 1;
    // }
    // let tx1 = {
    //   instruction: await sageProgram.methods
    //     .submitStarbaseUpgradeResource({
    //       sagePermissionsKeyIndex: new BN(userProfileKeyIdx),
    //       pointsProgramPermissionsKeyIndex: new BN(pointsProfileKeyIdx),
    //       upgradeProcessRecipeInputIndex: craftingRecipe.input[0].idx,
    //       starbaseUpgradeRecipeInputIndex: starbaseUpgradeRecipeInput.idx,
    //       resourceRecipeOutputIndex: itemRecipe.output.idx,
    //       epochIndex: epochIndex,
    //     })
    //     .accountsStrict({
    //       fundsTo: userPublicKey,
    //       starbaseAndStarbasePlayer: {
    //         starbase: starbase.publicKey,
    //         starbasePlayer: starbasePlayer,
    //       },
    //       gameAccountsAndProfile: {
    //         gameAndProfileAndFaction: {
    //           gameId: sageGameAcct.publicKey,
    //           key: userPublicKey,
    //           profile: userProfileAcct,
    //           profileFaction: userProfileFactionAcct.publicKey,
    //         },
    //         gameState: sageGameAcct.account.gameState,
    //       },
    //       resourceCraftingInstance: craftingProcess.craftingInstance,
    //       resourceCraftingProcess: craftingProcess.craftingProcess,
    //       resourceCraftingFacility: starbase.account.upgradeFacility,
    //       upgradeProcessRecipe: craftingProcess.recipe,
    //       starbaseUpgradeRecipe: starbaseUpgradeRecipe.publicKey,
    //       resourceRecipe: itemRecipe.publicKey,
    //       cargoPodTo: starbasePlayerCargoHold,
    //       cargoType: cargoTypeAcct.publicKey,
    //       cargoStatsDefinition: sageGameAcct.account.cargo.statsDefinition,
    //       tokenFrom: ingredientToken,
    //       tokenTo: starbaseCargoToken,
    //       tokenMint: craftingRecipe.input[0].mint,
    //       loyaltyPointsAccounts: userXpAccounts.userLPAccounts,
    //       progressionConfig: progressionConfigAcct,
    //       pointsProgram: pointsProgramId,
    //       craftingProgram: craftingProgramPK,
    //       cargoProgram: cargoProgramPK,
    //       tokenProgram: tokenProgramPK,
    //     })
    //     .remainingAccounts(remainingAccounts)
    //     .instruction(),
    //   signers: ixSigners,
    // };
    // transactions.push(tx1);
    // let tx2 = {
    //   instruction: await sageProgram.methods
    //     .closeUpgradeProcess({
    //       keyIndex: new BrowserAnchor.anchor.BN(userProfileKeyIdx),
    //     })
    //     .accountsStrict({
    //       fundsTo: userPublicKey,
    //       starbaseAndStarbasePlayer: {
    //         starbase: starbase.publicKey,
    //         starbasePlayer: starbasePlayer,
    //       },
    //       gameAccountsAndProfile: {
    //         gameAndProfileAndFaction: {
    //           gameId: sageGameAcct.publicKey,
    //           key: userPublicKey,
    //           profile: userProfileAcct,
    //           profileFaction: userProfileFactionAcct.publicKey,
    //         },
    //         gameState: sageGameAcct.account.gameState,
    //       },
    //       resourceCraftingInstance: craftingProcess.craftingInstance,
    //       resourceCraftingProcess: craftingProcess.craftingProcess,
    //       resourceRecipe: craftingRecipe.publicKey,
    //       resourceCraftingFacility: starbase.account.upgradeFacility,
    //       craftingProgram: craftingProgramPK,
    //     })
    //     .instruction(),
    // };
    // transactions.push(tx2);
    // let txResult = await txSignAndSend(transactions, userCraft, "COMPLETING UPGRADE", 250, userRedemptionAcct);
    // resolve(txResult);
  });
}
