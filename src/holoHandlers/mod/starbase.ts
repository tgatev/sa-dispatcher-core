import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { AccountMeta, KeyedAccountInfo, PublicKey, SystemProgram } from "@solana/web3.js";
import { BN } from "@staratlas/anchor";
import { CargoIDLProgram } from "@staratlas/cargo";
import { CraftingIDLProgram, CraftingProcess, KeyIndexInput } from "@staratlas/crafting";
import {
  Account,
  AccountStatic,
  arrayDeepEquals,
  AsyncSigner,
  decodeAccountWithRemaining,
  DecodedAccountData,
  InstructionReturn,
  isAsyncSigner,
  staticImplements,
} from "@staratlas/data-source";
import { PointsIDLProgram } from "@staratlas/points";
import { PointsStoreIDLProgram } from "@staratlas/points-store";
import {
  EMPTY_CRAFTING_SPEED_PER_TIER,
  RegisterStarbaseInput,
  // SageIDL,
  // SageIDLProgram,
  StarbaseAccount,
  StarbaseCancelCraftingProcessInput,
  StarbaseCloseCraftingProcessInput,
  StarbaseCreateCraftingProcessInput,
  StarbaseDepositCraftingIngredientInput,
  StarbaseStartCraftingProcessInput,
  StarbaseUpkeepInfo,
  StarbaseUpkeepLevels,
  SubmitStarbaseUpgradeResourceInput,
} from "@staratlas/holosim/src/constants";
import { CraftingInstance } from "@staratlas/holosim/src/craftingInstance";
import { GLOBAL_SCALE_DECIMALS_2 } from "./fleet";
import { GameState } from "@staratlas/sage-main/src/gameState";
import { CombatConfig } from "@staratlas/holosim/src/combatConfig";
import { ProgressionConfig } from "@staratlas/holosim/src/progressionConfig";
import { findExtraAccountMetaListAddress } from "@staratlas/holosim/src/utils";
import { SageIDLProgram as HoloSageProgram, SAGE_IDL, SageIDL } from "../IDL/constants";
import type { SageIDLProgram as MainSageProgram } from "@staratlas/sage-main";

// !!! MOKS IDL MISSING METHODS

// ВЗИМАМЕ *ЛИПСВАЩИТЕ* от MAIN спрямо HOLO, за да не чупим общите ключове
type MainExtraInstructions = Omit<MainSageProgram["instruction"], keyof HoloSageProgram["instruction"]>;
type MainExtraTransactions = Omit<MainSageProgram["transaction"], keyof HoloSageProgram["transaction"]>;

// Това е локалният тип, който ще ползваме в този файл като „разширен Holo IDL“
type SageIDLProgram = HoloSageProgram & {
  instruction: HoloSageProgram["instruction"] & MainExtraInstructions;
  transaction: HoloSageProgram["transaction"] & MainExtraTransactions;
};
// !!! Mock end

export enum StarbaseFaction {
  Unaligned = 0,
  MUD = 1,
  ONI = 2,
  Ustur = 3,
}

export enum StarbaseState {
  // `Starbase` is active
  Active = 1,
  // `Starbase` is destroyed
  Destroyed = 2,
}

export enum StarbaseUpgradeState {
  // Upgrade not started
  NotStarted = 1,
  // Upgrade in progress
  Started = 2,
  // Upgrade in progress
  Completed = 3,
}

export enum UpkeepResourceType {
  // Ammo
  Ammo = 1,
  // Food
  Food = 2,
  // Toolkit
  Toolkit = 3,
}

export interface ExtendedRegisterStarbaseInput extends RegisterStarbaseInput {
  sectorCoordinates: [BN, BN];
}

export interface UpdateStarbaseInput {
  name?: number[];
  keyIndex: number;
  subCoordinates?: [BN, BN];
}

export interface DepositStarbaseUpkeepResourceInput {
  pointsProgramPermissionsKeyIndex: number;
  sagePermissionsKeyIndex: number;
  resourceIndex: number /** index of the resource in the resource recipe ingredient list */;
  amount: BN;
  resourceType: UpkeepResourceType;
  epochIndex: number /** the index of the epoch in the `RedemptionConfig` account, used when auto-submitting earned loyalty points for redemption  */;
}

/// The minimum `Starbase` level that is a central space station
export const MIN_CSS_LEVEL = 6;

/**
 * Check if two `StarbaseAccount` instances are equal
 * @param data1 - first StarbaseAccount
 * @param data2 - second StarbaseAccount
 * @param printOnFalse - whether or not log values if instances are not equal
 * @returns a boolean
 */
export function starbaseDataEquals(data1: StarbaseAccount, data2: StarbaseAccount, printOnFalse?: "printOnFalse"): boolean {
  const out =
    data1.version === data2.version &&
    data1.gameId.equals(data2.gameId) &&
    arrayDeepEquals(data1.sector, data2.sector, (a, b) => a.eq(b)) &&
    data1.craftingFacility.equals(data2.craftingFacility) &&
    data1.upgradeFacility.equals(data2.upgradeFacility) &&
    arrayDeepEquals(data1.name, data2.name, (name1, name2) => name1 === name2) &&
    arrayDeepEquals(data1.subCoordinates, data2.subCoordinates, (a, b) => a.eq(b)) &&
    data1.faction === data2.faction &&
    data1.bump === data2.bump &&
    data1.seqId === data2.seqId &&
    data1.state === data2.state &&
    data1.upgradeState === data2.upgradeState &&
    data1.level === data2.level &&
    data1.hp.eq(data2.hp) &&
    data1.sp.eq(data2.sp) &&
    data1.sectorRingAvailable === data2.sectorRingAvailable &&
    arrayDeepEquals(data1.upgradeIngredientsChecksum, data2.upgradeIngredientsChecksum, (a, b) => a === b) &&
    data1.numUpgradeIngredients === data2.numUpgradeIngredients &&
    data1.upkeepAmmoBalance.eq(data2.upkeepAmmoBalance) &&
    data1.upkeepAmmoLastUpdate.eq(data2.upkeepAmmoLastUpdate) &&
    data1.upkeepAmmoGlobalLastUpdate.eq(data2.upkeepAmmoGlobalLastUpdate) &&
    data1.upkeepFoodBalance.eq(data2.upkeepFoodBalance) &&
    data1.upkeepFoodLastUpdate.eq(data2.upkeepFoodLastUpdate) &&
    data1.upkeepFoodGlobalLastUpdate.eq(data2.upkeepFoodGlobalLastUpdate) &&
    data1.upkeepToolkitBalance.eq(data2.upkeepToolkitBalance) &&
    data1.upkeepToolkitLastUpdate.eq(data2.upkeepToolkitLastUpdate) &&
    data1.upkeepToolkitGlobalLastUpdate.eq(data2.upkeepToolkitGlobalLastUpdate) &&
    data1.shieldBreakDelayExpiresAt.eq(data2.shieldBreakDelayExpiresAt) &&
    data1.builtDestroyedTimestamp.eq(data2.builtDestroyedTimestamp);
  if (!out && printOnFalse === "printOnFalse") {
    console.log(`data1: ${JSON.stringify(data1, null, 2)}`);
    console.log(`data2: ${JSON.stringify(data2, null, 2)}`);
  }
  return out;
}

/**
 * Calculate upkeep resource exhaustion time
 * @param lastUpdate - the last time the resource was updated
 * @param balance - the current balance of the upkeep resource
 * @param depletionRate - the resource depletion rate
 * @returns resource exhaustion time
 */
export const calculateResourceExhaustionTime = (lastUpdate: BN, balance: BN, depletionRate: number) => {
  return depletionRate > 0 ? lastUpdate.add(balance.div(new BN(depletionRate))) : lastUpdate;
};

/**
 * Calculate the current time and balance for an upkeep resource, timer slows on resource exhaustion
 * @param currentTime - the current time on-chain
 * @param lastUpdate - the last time the resource was updated (local time)
 * @param lastGlobalUpdate - the last time the resource was updated (global time)
 * @param balance - the current balance of the upkeep resource
 * @param depletionRate - the resource depletion rate
 * @param starbaseLevel - the starbase's current level
 * @returns current resource time
 */
export const calculateCurrentResourceTimeSlow = (
  currentTime: BN,
  lastUpdate: BN,
  lastGlobalUpdate: BN,
  balance: BN,
  depletionRate: number,
  starbaseLevel: number,
) => {
  const { globalElapsedTime, adjustedLocalElapsedTime, maxElapsedTime, finalBalance } = calculateResourceTime(
    currentTime,
    lastUpdate,
    lastGlobalUpdate,
    balance,
    depletionRate,
  );

  const keptTime = BN.min(adjustedLocalElapsedTime, maxElapsedTime);

  const remainingUnkeptTime = keptTime.eq(maxElapsedTime)
    ? globalElapsedTime
        .mul(new BN(100))
        .sub(keptTime.mul(new BN(100)))
        .mul(new BN(EMPTY_CRAFTING_SPEED_PER_TIER[starbaseLevel] * 100))
        .div(new BN(100))
    : new BN(0);

  const adjustedLocalTime =
    lastUpdate
      .mul(new BN(100))
      .add(adjustedLocalElapsedTime.mul(new BN(100)))
      .add(remainingUnkeptTime)
      .toNumber() / 100;

  return {
    localTime: adjustedLocalTime,
    newBalance: finalBalance.toNumber(),
  };
};

/**
 * Calculate the current time and balance for an upkeep resource, timer stops on depletion
 * @param currentTime - the current time on-chain
 * @param lastUpdate - the last time the resource was updated (local time)
 * @param lastGlobalUpdate - the last time the resource was updated (global time)
 * @param balance - the current balance of the upkeep resource
 * @param depletionRate - the resource depletion rate
 * @returns current resource time
 */
export const calculateCurrentResourceTimeStop = (
  currentTime: BN,
  lastUpdate: BN,
  lastGlobalUpdate: BN,
  balance: BN,
  depletionRate: number,
) => {
  const { adjustedLocalElapsedTime, finalBalance } = calculateResourceTime(
    currentTime,
    lastUpdate,
    lastGlobalUpdate,
    balance,
    depletionRate,
  );

  const adjustedLocalTime = lastUpdate.add(adjustedLocalElapsedTime);

  return {
    localTime: adjustedLocalTime,
    newBalance: finalBalance,
  };
};

const calculateResourceTime = (currentTime: BN, lastUpdate: BN, lastGlobalUpdate: BN, balance: BN, depletionRate: number) => {
  const globalElapsedTime = currentTime.gt(lastGlobalUpdate) ? currentTime.sub(lastGlobalUpdate) : new BN(0);
  const maxElapsedTime = depletionRate > 0 ? balance.div(new BN(depletionRate)) : new BN(0);

  const potentialLocalElapsedTime = BN.min(maxElapsedTime, globalElapsedTime);
  const potentialLocalTime = lastUpdate.add(potentialLocalElapsedTime);
  const adjustedLocalElapsedTime = potentialLocalTime.gt(currentTime) ? currentTime.sub(lastUpdate) : potentialLocalElapsedTime;

  // Calculate the resource consumption based on the adjusted elapsed time
  const resourceConsumed = adjustedLocalElapsedTime.mul(new BN(depletionRate));
  // Update the resource balance
  const updatedBalance = balance.sub(resourceConsumed);

  // Ensure updated_balance does not drop below zero
  const finalBalance = updatedBalance.lt(new BN(0)) ? new BN(0) : updatedBalance;

  return {
    globalElapsedTime,
    adjustedLocalElapsedTime,
    maxElapsedTime,
    finalBalance,
  };
};

@staticImplements<AccountStatic<Starbase, SageIDL>>()
export class Starbase implements Account {
  static readonly ACCOUNT_NAME: NonNullable<SageIDL["accounts"]>[number]["name"] = "Starbase";
  static readonly MIN_DATA_SIZE: number =
    8 + // discriminator
    1 + // version
    32 + // gameId
    8 * 2 + // sector coordinates
    32 + // craftingFacility
    32 + // upgradeFacility
    64 + // name
    8 * 2 + // subCoordinates
    1 + // faction
    1 + // bump
    2 + // seqId
    1 + // state
    1 + // level
    8 + // hp
    8 + // sp
    1 + // sectorRingAvailable
    1 + // upgradeState
    1 + // numUpgradeIngredients
    16 + // upgradeIngredientsChecksum
    8 + // upkeepAmmoBalance
    8 + // upkeepAmmoLastUpdate
    8 + // upkeepAmmoGlobalLastUpdate
    8 + // upkeepFoodBalance
    8 + // upkeepFoodLastUpdate
    8 + // upkeepFoodGlobalLastUpdate
    8 + // upkeepToolkitBalance
    8 + // upkeepToolkitLastUpdate
    8 + // upkeepToolkitGlobalLastUpdate
    8 + // shieldBreakDelayExpiresAt
    8; // builtDestroyedTimestamp

  constructor(
    private _data: StarbaseAccount,
    private _key: PublicKey,
    private _upgradeIngredientAmounts: BN[],
  ) {}

  get data(): Readonly<StarbaseAccount> {
    return this._data;
  }

  get key(): Readonly<PublicKey> {
    return this._key;
  }

  get upgradeIngredientAmounts(): Readonly<BN[]> {
    return this._upgradeIngredientAmounts || [];
  }

  /**
   * Check if a Starbase is a central space station
   * @returns boolean
   */
  isCentralSpaceStation(): boolean {
    return this.data.level >= MIN_CSS_LEVEL;
  }

  /**
   * Get upkeep info for `Starbase` account
   * @param gameState - the game state account
   * @returns the upkeep information for the given Starbase
   */
  getUpkeepInfo(gameState: GameState): StarbaseUpkeepInfo {
    const upkeepLevels = gameState.data.fleet.upkeep as StarbaseUpkeepLevels;
    let upkeepInfo: StarbaseUpkeepInfo;
    switch (this.data.level) {
      case 0:
        upkeepInfo = upkeepLevels.level0;
        break;
      case 1:
        upkeepInfo = upkeepLevels.level1;
        break;
      case 2:
        upkeepInfo = upkeepLevels.level2;
        break;
      case 3:
        upkeepInfo = upkeepLevels.level3;
        break;
      case 4:
        upkeepInfo = upkeepLevels.level4;
        break;
      case 5:
        upkeepInfo = upkeepLevels.level5;
        break;
      case 6:
        upkeepInfo = upkeepLevels.level6;
        break;
      default:
        throw "Invalid Starbase level.";
    }
    return upkeepInfo;
  }

  /**
   * Get Starbase local time
   * @param resourceType - the upkeep resource type
   * @param currentGlobalTime - the current time on-chain
   * @param gameState - the game state account
   * @returns the local time at the Starbase for the given resource type
   */
  getStarbaseTime(resourceType: UpkeepResourceType, currentGlobalTime: BN, gameState: GameState) {
    const upkeepInfo = this.getUpkeepInfo(gameState);
    let reserve: BN, depletionRate: number, balance: BN, lastUpdate: BN, lastGlobalUpdate: BN;

    switch (resourceType) {
      case UpkeepResourceType.Ammo:
        reserve = upkeepInfo.ammoReserve;
        depletionRate = upkeepInfo.ammoDepletionRate;
        balance = this.data.upkeepAmmoBalance;
        lastUpdate = this.data.upkeepAmmoLastUpdate;
        lastGlobalUpdate = this.data.upkeepAmmoGlobalLastUpdate;
        break;
      case UpkeepResourceType.Food:
        reserve = upkeepInfo.foodReserve;
        depletionRate = upkeepInfo.foodDepletionRate;
        balance = this.data.upkeepFoodBalance;
        lastUpdate = this.data.upkeepFoodLastUpdate;
        lastGlobalUpdate = this.data.upkeepFoodGlobalLastUpdate;
        break;
      case UpkeepResourceType.Toolkit:
        reserve = upkeepInfo.toolkitReserve;
        depletionRate = upkeepInfo.toolkitDepletionRate;
        balance = this.data.upkeepToolkitBalance;
        lastUpdate = this.data.upkeepToolkitLastUpdate;
        lastGlobalUpdate = this.data.upkeepToolkitGlobalLastUpdate;
        break;
      default:
        throw "Invalid resource type.";
    }

    // depletionRate is saved in hundredths
    depletionRate = depletionRate / GLOBAL_SCALE_DECIMALS_2;

    // reserve of 0 disables upkeep
    if (reserve.eq(new BN(0))) {
      return currentGlobalTime;
    }

    return new BN(
      calculateCurrentResourceTimeSlow(currentGlobalTime, lastUpdate, lastGlobalUpdate, balance, depletionRate, this.data.level).localTime,
    );
  }

  /**
   * Find the Starbase account address
   * @param program - SAGE program
   * @param gameId - the SAGE game id
   * @param sectorCoordinates - the sector's coordinates
   * @returns The PDA and bump respectively
   */
  static findAddress(program: SageIDLProgram, gameId: PublicKey, sectorCoordinates: [BN, BN]): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("Starbase"),
        gameId.toBuffer(),
        sectorCoordinates[0].toTwos(64).toArrayLike(Buffer, "le", 8),
        sectorCoordinates[1].toTwos(64).toArrayLike(Buffer, "le", 8),
      ],
      program.programId,
    );
  }

  /**
   * Register `Starbase`
   * @param program - SAGE program
   * @param key - the key authorized to run this instruction
   * @param profile - the profile with the required permissions for the instruction
   * @param sector - the sector in which the Starbase exists
   * @param gameId - the SAGE game id
   * @param gameState - the game state
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static registerStarbase(
    program: SageIDLProgram,
    key: AsyncSigner,
    profile: PublicKey,
    sector: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    input: ExtendedRegisterStarbaseInput,
  ): InstructionReturn {
    return async (funder) => [
      {
        instruction: await program.methods
          .registerStarbase(input)
          .accountsStrict({
            funder: funder.publicKey(),
            starbase: this.findAddress(program as any, gameId, input.sectorCoordinates)[0],
            sector,
            gameStateAndProfile: {
              gameAndProfile: {
                key: key.publicKey(),
                profile,
                gameId,
              },
              gameState,
            },
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
        signers: [key, funder],
      },
    ];
  }

  /**
   * Update `Starbase`
   * @param program - SAGE program
   * @param starbase - the Starbase
   * @param key - the key authorized to run this instruction
   * @param profile - the profile with the required permissions for the instruction
   * @param gameId - the SAGE game id
   * @param input - the instruction input params
   * @param craftingDomain - the crafting domain
   * @param craftingFacility - the facility used fo crafting at the Starbase
   * @param upgradeFacility - the facility used for upgrade jobs at the Starbase
   * @returns InstructionReturn
   */
  static updateStarbase(
    program: SageIDLProgram,
    starbase: PublicKey,
    key: AsyncSigner,
    profile: PublicKey,
    gameId: PublicKey,
    input: UpdateStarbaseInput,
    craftingDomain?: PublicKey,
    craftingFacility?: PublicKey,
    upgradeFacility?: PublicKey,
  ): InstructionReturn {
    const remainingAccounts: AccountMeta[] = [];
    [craftingDomain, craftingFacility, upgradeFacility].forEach(
      (it) =>
        it &&
        remainingAccounts.push({
          pubkey: it,
          isSigner: false,
          isWritable: false,
        }),
    );

    return async (funder) => [
      {
        instruction: await program.methods
          .updateStarbase({
            name: input.name ?? null,
            subCoordinates: input.subCoordinates ?? null,
            keyIndex: input.keyIndex,
          })
          .accountsStrict({
            gameAndProfile: {
              key: key.publicKey(),
              profile,
              gameId,
            },
            funder: funder.publicKey(),
            starbase,
            systemProgram: SystemProgram.programId,
          })
          .remainingAccounts(remainingAccounts)
          .instruction(),
        signers: [key, funder],
      },
    ];
  }

  /**
   * Create Starbase Upgrade Resource Crafting Process
   * @param program - SAGE program
   * @param craftingProgram - crafting program
   * @param key - the key authorized to run this instruction
   * @param playerProfile - the player's profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param starbasePlayer - the Starbase player
   * @param starbase - the Starbase
   * @param gameId - the SAGE game id
   * @param gameState - the game state  account
   * @param upgradeFacility - the upgrade facility
   * @param craftingRecipe - the crafting recipe
   * @param craftingDomain - the crafting domain
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static createStarbaseUpgradeResourceProcess(
    program: SageIDLProgram,
    craftingProgram: CraftingIDLProgram,
    key: AsyncSigner,
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    starbasePlayer: PublicKey,
    starbase: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    upgradeFacility: PublicKey,
    craftingRecipe: PublicKey,
    craftingDomain: PublicKey,
    input: StarbaseCreateCraftingProcessInput,
  ): {
    craftingProcessKey: [PublicKey, number];
    craftingInstanceKey: [PublicKey, number];
    instructions: InstructionReturn;
  } {
    const craftingProcessKey = CraftingProcess.findAddress(craftingProgram, upgradeFacility, craftingRecipe, input.craftingId);
    const craftingInstanceKey = CraftingInstance.findAddress(program as any, starbasePlayer, craftingProcessKey[0]);
    return {
      craftingProcessKey,
      craftingInstanceKey,
      instructions: async (funder) => [
        {
          instruction: await program.methods
            .createStarbaseUpgradeResourceProcess(input)
            .accountsStrict({
              funder: funder.publicKey(),
              starbaseAndStarbasePlayer: {
                starbase,
                starbasePlayer,
              },
              gameAccountsAndProfile: {
                gameAndProfileAndFaction: {
                  gameId,
                  key: key.publicKey(),
                  profile: playerProfile,
                  profileFaction,
                },
                gameState,
              },
              craftingInstance: craftingInstanceKey[0],
              craftingProcess: craftingProcessKey[0],
              upgradeFacility,
              craftingRecipe,
              craftingDomain,
              craftingProgram: craftingProgram.programId,
              systemProgram: SystemProgram.programId,
            })
            .instruction(),
          signers: [key, funder],
        },
      ],
    };
  }

  /**
   * Deposit Starbase Upgrade Recipe Ingredient
   * @param program - SAGE program
   * @param cargoProgram - cargo program
   * @param craftingProgram - crafting program
   * @param key - the key authorized to run this instruction
   * @param playerProfile - the player's profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param starbasePlayer - the Starbase player
   * @param starbase - the Starbase
   * @param craftingInstance - the crafting instance
   * @param craftingProcess - the crafting process
   * @param craftingFacility - the upgrade facility
   * @param craftingRecipe - the crafting recipe
   * @param cargoPodFrom - the source cargo pod
   * @param cargoType - the cargo type
   * @param cargoStatsDefinition - the cargo stats definition
   * @param tokenFrom - the source account of the tokens - owner should be `cargoPodFrom`
   * @param tokenTo - the destination account of the tokens - owner should be `craftingProcess`
   * @param gameId - the SAGE game id
   * @param gameState - the game state  account
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static depositStarbaseUpgradeResourceIngredient(
    program: SageIDLProgram,
    cargoProgram: CargoIDLProgram,
    craftingProgram: CraftingIDLProgram,
    key: AsyncSigner,
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    starbasePlayer: PublicKey,
    starbase: PublicKey,
    craftingInstance: PublicKey,
    craftingProcess: PublicKey,
    craftingFacility: PublicKey,
    craftingRecipe: PublicKey,
    cargoPodFrom: PublicKey,
    cargoType: PublicKey,
    cargoStatsDefinition: PublicKey,
    tokenFrom: PublicKey,
    tokenTo: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    input: StarbaseDepositCraftingIngredientInput,
  ): InstructionReturn {
    return CraftingInstance.depositCraftingIngredient(
      program as any,
      cargoProgram,
      craftingProgram,
      key,
      playerProfile,
      profileFaction,
      starbasePlayer,
      starbase,
      craftingInstance,
      craftingProcess,
      craftingFacility,
      craftingRecipe,
      cargoPodFrom,
      cargoType,
      cargoStatsDefinition,
      tokenFrom,
      tokenTo,
      gameId,
      gameState,
      input,
    );
  }

  /**
   * Withdraw Starbase Upgrade Recipe Ingredient
   * @param program - SAGE program
   * @param cargoProgram - cargo program
   * @param craftingProgram - crafting program
   * @param key - the key authorized to run this instruction
   * @param playerProfile - the player's profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param starbasePlayer - the Starbase player
   * @param starbase - the Starbase
   * @param craftingInstance - the crafting instance
   * @param craftingProcess - the crafting process
   * @param craftingFacility - the upgrade facility
   * @param craftingRecipe - the crafting recipe
   * @param cargoPodTo - the destination cargo pod
   * @param cargoType - the cargo type
   * @param cargoStatsDefinition - the cargo stats definition
   * @param tokenFrom - the source token account - owner should be `craftingProcess`
   * @param tokenTo - the destination token account - owner should be `cargoPodTo`
   * @param tokenMint - the token mint
   * @param gameId - the SAGE game id
   * @param gameState - the game state  account
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static withdrawStarbaseUpgradeResourceIngredient(
    program: SageIDLProgram,
    cargoProgram: CargoIDLProgram,
    craftingProgram: CraftingIDLProgram,
    key: AsyncSigner,
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    starbasePlayer: PublicKey,
    starbase: PublicKey,
    craftingInstance: PublicKey,
    craftingProcess: PublicKey,
    craftingFacility: PublicKey,
    craftingRecipe: PublicKey,
    cargoPodTo: PublicKey,
    cargoType: PublicKey,
    cargoStatsDefinition: PublicKey,
    tokenFrom: PublicKey,
    tokenTo: PublicKey,
    tokenMint: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    input: StarbaseDepositCraftingIngredientInput,
  ): InstructionReturn {
    return CraftingInstance.withdrawCraftingIngredient(
      program as any,
      cargoProgram,
      craftingProgram,
      key,
      playerProfile,
      profileFaction,
      starbasePlayer,
      starbase,
      craftingInstance,
      craftingProcess,
      craftingFacility,
      craftingRecipe,
      cargoPodTo,
      cargoType,
      cargoStatsDefinition,
      tokenFrom,
      tokenTo,
      tokenMint,
      gameId,
      gameState,
      input,
    );
  }

  /**
   * Start Starbase Upgrade Crafting Process
   * @param program - SAGE program
   * @param craftingProgram - crafting program
   * @param key - the key authorized to run this instruction
   * @param playerProfile - the player's profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param starbasePlayer - the Starbase player
   * @param starbase - the Starbase
   * @param craftingInstance - the crafting instance
   * @param craftingProcess - the crafting process
   * @param craftingFacility - the upgrade facility
   * @param craftingRecipe - the crafting recipe
   * @param gameId - the SAGE game id
   * @param gameState - the game state  account
   * @param input - the instruction input params
   * @param recipeFeeRecipient - the recipe fee recipient`, should be as defined in `craftingRecipe` account
   * @param tokenFromAuthority - the transfer authority of `tokenFrom`
   * @param tokenFrom - the source token account for crafting fees
   * @param tokenTo - the destination token account for crafting fees, should be as defined in `craftingRecipe` account
   * @returns InstructionReturn
   */
  static startStarbaseUpgradeCraftingProcess(
    program: SageIDLProgram,
    craftingProgram: CraftingIDLProgram,
    key: AsyncSigner,
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    starbasePlayer: PublicKey,
    starbase: PublicKey,
    craftingInstance: PublicKey,
    craftingProcess: PublicKey,
    craftingFacility: PublicKey,
    craftingRecipe: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    input: StarbaseStartCraftingProcessInput,
    recipeFeeRecipient?: PublicKey,
    tokenFromAuthority?: AsyncSigner,
    tokenFrom?: PublicKey,
    tokenTo?: PublicKey,
  ): InstructionReturn {
    return CraftingInstance.startCraftingProcess(
      program as any,
      craftingProgram,
      key,
      playerProfile,
      profileFaction,
      starbasePlayer,
      starbase,
      craftingInstance,
      craftingProcess,
      craftingFacility,
      craftingRecipe,
      gameId,
      gameState,
      input,
      recipeFeeRecipient,
      tokenFromAuthority,
      tokenFrom,
      tokenTo,
    );
  }

  /**
   * Cancel Starbase Upgrade Crafting Process
   * Meant to be used for processes that have not yet been started
   * @param program - SAGE program
   * @param craftingProgram - crafting program
   * @param key - the key authorized to run this instruction
   * @param playerProfile - the player's profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param fundsTo - recipient of the rent refund
   * @param starbasePlayer - the Starbase player
   * @param starbase - the Starbase
   * @param craftingInstance - the crafting instance
   * @param craftingProcess - the crafting process
   * @param craftingFacility - the upgrade facility
   * @param gameId - the SAGE game id
   * @param gameState - the game state  account
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static cancelStarbaseUpgradeCraftingProcess(
    program: SageIDLProgram,
    craftingProgram: CraftingIDLProgram,
    key: AsyncSigner,
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    fundsTo: PublicKey | "funder",
    starbasePlayer: PublicKey,
    starbase: PublicKey,
    craftingInstance: PublicKey,
    craftingProcess: PublicKey,
    craftingFacility: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    input: StarbaseCancelCraftingProcessInput,
  ): InstructionReturn {
    return CraftingInstance.cancelCraftingProcess(
      program as any,
      craftingProgram,
      key,
      playerProfile,
      profileFaction,
      fundsTo,
      starbasePlayer,
      starbase,
      craftingInstance,
      craftingProcess,
      craftingFacility,
      gameId,
      gameState,
      input,
    );
  }

  /**
   * Stop Starbase Upgrade Crafting Process
   *
   * Meant to be used for processes already started but not yet complete.
   * @param program - SAGE program
   * @param craftingProgram - crafting program
   * @param key - the key authorized to run this instruction
   * @param playerProfile - the player's profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param starbasePlayer - the Starbase player
   * @param starbase - the Starbase
   * @param craftingInstance - the crafting instance
   * @param craftingProcess - the crafting process
   * @param craftingFacility - the upgrade facility
   * @param craftingRecipe - the crafting recipe
   * @param gameId - the SAGE game id
   * @param gameState - the game state  account
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static stopStarbaseUpgradeCraftingProcess(
    program: SageIDLProgram,
    craftingProgram: CraftingIDLProgram,
    key: AsyncSigner,
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    starbasePlayer: PublicKey,
    starbase: PublicKey,
    craftingInstance: PublicKey,
    craftingProcess: PublicKey,
    craftingFacility: PublicKey,
    craftingRecipe: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    input: StarbaseCancelCraftingProcessInput,
  ): InstructionReturn {
    return CraftingInstance.stopCraftingProcess(
      program as any,
      craftingProgram,
      key,
      playerProfile,
      profileFaction,
      starbasePlayer,
      starbase,
      craftingInstance,
      craftingProcess,
      craftingFacility,
      craftingRecipe,
      gameId,
      gameState,
      input,
    );
  }

  /**
   * Submit a resource for a Starbase upgrade
   *
   * Be warned that this instruction requires a lot of accounts and if auto-redemption of points
   * is required then you must use a lookup table to fit all of them into the transaction.
   * @param program - SAGE program
   * @param cargoProgram - cargo program
   * @param craftingProgram - crafting program
   * @param pointsProgram - points program
   * @param key - the key authorized to run this instruction
   * @param playerProfile - the player's profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param fundsTo - recipient of the rent refund
   * @param starbasePlayer - the Starbase player
   * @param starbase - the Starbase
   * @param gameId - the SAGE game id
   * @param gameState - the game state  account
   * @param resourceCraftingProcess - the crafting process for the resource submission
   * @param resourceCraftingFacility - the crafting facility for the resource submission
   * @param upgradeProcessRecipe - the crafting recipe for the submission of resources used in the upgrade process
   * @param starbaseUpgradeRecipe - the crafting recipe for the Starbase upgrade
   * @param resourceRecipe - the crafting recipe for the resource being submitted i.e. the recipe for crafting (producing) the resource whose mint would be `token_mint`
   * @param cargoPodTo - the destination cargo pod
   * @param cargoType - the cargo type
   * @param cargoStatsDefinition - the cargo stats definition
   * @param tokenFrom - the source token account - owner should be `craftingProcess`
   * @param tokenTo - the destination token account - owner should be `cargoPodTo`
   * @param tokenMint - the token mint
   * @param loyaltyPointsUserAccount - the user account for Loyalty Points
   * @param loyaltyPointsCategory - the Loyalty Points Category Account
   * @param loyaltyPointsModifier - the Loyalty Points modifier
   * @param userRedemptionAccount - the user redemption account; used when auto-redeeming loyalty points
   * @param redemptionConfig - the RedemptionConfig; used when auto-redeeming loyalty points
   * @param pointsStoreProgram - the points store program; used when auto-redeeming loyalty points
   * @param input - the instruction input params
   * @param input.keyIndex - the index of the key in the player profile permissions
   * @param input.starbaseUpgradeRecipeInputIndex - the index of the resource in the upgrade recipe; The resource is a consumable in this recipe
   * @param input.upgradeProcessRecipeInputIndex - the index of the resource in the upgrade_process_recipe ingredients list; The resource is a consumable in this recipe
   * @param input.resourceRecipeOutputIndex - the index of the resource represented by `token_mint` in the `resource_recipe` ingredients list; The resource is an output in this recipe
   * @returns InstructionReturn
   */
  static submitStarbaseUpgradeResource(
    program: SageIDLProgram,
    cargoProgram: CargoIDLProgram,
    craftingProgram: CraftingIDLProgram,
    pointsProgram: PointsIDLProgram,
    key: AsyncSigner,
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    fundsTo: PublicKey | "funder",
    starbasePlayer: PublicKey,
    starbase: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    resourceCraftingProcess: PublicKey,
    resourceCraftingFacility: PublicKey,
    upgradeProcessRecipe: PublicKey,
    starbaseUpgradeRecipe: PublicKey,
    resourceRecipe: PublicKey,
    cargoPodTo: PublicKey,
    cargoType: PublicKey,
    cargoStatsDefinition: PublicKey,
    tokenFrom: PublicKey,
    tokenTo: PublicKey,
    tokenMint: PublicKey,
    loyaltyPointsUserAccount: PublicKey,
    loyaltyPointsCategory: PublicKey,
    loyaltyPointsModifier: PublicKey,
    userRedemptionAccount: AsyncSigner | PublicKey,
    redemptionConfig: PublicKey,
    pointsStoreProgram: PointsStoreIDLProgram,
    input: SubmitStarbaseUpgradeResourceInput,
  ): InstructionReturn {
    const signers = [key];
    const remainingAccounts: AccountMeta[] = [];
    let startingRedemption = false;

    const userRedemptionIsSigner = isAsyncSigner(userRedemptionAccount);
    const userRedemptionKey = userRedemptionIsSigner ? userRedemptionAccount.publicKey() : userRedemptionAccount;
    remainingAccounts.push(
      ...[
        {
          pubkey: userRedemptionKey,
          isSigner: userRedemptionIsSigner,
          isWritable: true,
        },
        {
          pubkey: redemptionConfig,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: pointsStoreProgram.programId,
          isSigner: false,
          isWritable: false,
        },
      ],
    );
    if (userRedemptionIsSigner) {
      signers.push(userRedemptionAccount);
      remainingAccounts.push(
        ...[
          {
            pubkey: SystemProgram.programId,
            isSigner: false,
            isWritable: false,
          },
        ],
      );
    }
    startingRedemption = userRedemptionIsSigner;

    return async (funder) => [
      {
        instruction: await program.methods
          .submitStarbaseUpgradeResource(input)
          .accountsStrict({
            fundsTo: fundsTo === "funder" ? funder.publicKey() : fundsTo,
            starbaseAndStarbasePlayer: {
              starbase,
              starbasePlayer,
            },
            gameAccountsAndProfile: {
              gameAndProfileAndFaction: {
                gameId,
                key: key.publicKey(),
                profile: playerProfile,
                profileFaction,
              },
              gameState,
            },
            resourceCraftingInstance: CraftingInstance.findAddress(program as any, starbasePlayer, resourceCraftingProcess)[0],
            resourceCraftingProcess,
            resourceCraftingFacility,
            upgradeProcessRecipe,
            starbaseUpgradeRecipe,
            resourceRecipe,
            cargoPodTo,
            cargoType,
            cargoStatsDefinition,
            tokenFrom,
            tokenTo,
            tokenMint,
            loyaltyPointsAccounts: {
              userPointsAccount: loyaltyPointsUserAccount,
              pointsCategory: loyaltyPointsCategory,
              pointsModifierAccount: loyaltyPointsModifier,
            },
            progressionConfig: ProgressionConfig.findAddress(program as any, gameId)[0],
            pointsProgram: pointsProgram.programId,
            craftingProgram: craftingProgram.programId,
            cargoProgram: cargoProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .remainingAccounts([
            ...remainingAccounts,
            ...(startingRedemption
              ? [
                  {
                    pubkey: funder.publicKey(),
                    isSigner: true,
                    isWritable: true,
                  },
                ]
              : []),
          ])
          .instruction(),
        signers: [...signers, ...(startingRedemption ? [funder] : [])],
      },
    ];
  }

  /**
   * Start a Starbase upgrade process
   * @param program - SAGE program
   * @param key - the key authorized to run this instruction
   * @param playerProfile - the player's profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param starbasePlayer - the Starbase player
   * @param starbase - the Starbase
   * @param gameId - the SAGE game id
   * @param gameState - the game state  account
   * @param upgradeFacility - the upgrade facility used for Starbase upgrade processes
   * @param upgradeRecipe - the crafting recipe for the Starbase upgrade
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static startStarbaseUpgrade(
    program: SageIDLProgram,
    key: AsyncSigner,
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    starbasePlayer: PublicKey,
    starbase: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    upgradeFacility: PublicKey,
    upgradeRecipe: PublicKey,
    input: KeyIndexInput,
  ): InstructionReturn {
    return async (funder) => [
      {
        instruction: await program.methods
          .startStarbaseUpgrade(input)
          .accountsStrict({
            funder: funder.publicKey(),
            starbaseAndStarbasePlayer: {
              starbase,
              starbasePlayer,
            },
            gameAccountsAndProfile: {
              gameAndProfileAndFaction: {
                gameId,
                key: key.publicKey(),
                profile: playerProfile,
                profileFaction,
              },
              gameState,
            },
            upgradeFacility,
            upgradeRecipe,
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
        signers: [key, funder],
      },
    ];
  }

  /**
   * Close Starbase Upgrade Crafting Process
   * @param program - SAGE program
   * @param craftingProgram - crafting program
   * @param key - the key authorized to run this instruction
   * @param playerProfile - the player's profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param fundsTo - recipient of the rent refund
   * @param starbasePlayer - the Starbase player
   * @param starbase - the Starbase
   * @param resourceCraftingInstance - the crafting instance for the upgrade resource
   * @param resourceCraftingProcess - the crafting process for the upgrade resource
   * @param resourceCraftingFacility - the crafting facility for the upgrade resource
   * @param resourceRecipe - the crafting recipe for the upgrade resource
   * @param gameId - the SAGE game id
   * @param gameState - the game state  account
   * @param input - the instruction input params
   * @param tokenFrom - the source token account for crafting fees, ATA owned by crafting process
   * @param tokenTo - the recipe fee recipient`, should be as defined in `craftingRecipe` account
   * @returns InstructionReturn
   */
  static closeStarbaseUpgradeCraftingProcess(
    program: SageIDLProgram,
    craftingProgram: CraftingIDLProgram,
    key: AsyncSigner,
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    fundsTo: PublicKey | "funder",
    starbasePlayer: PublicKey,
    starbase: PublicKey,
    resourceCraftingInstance: PublicKey,
    resourceCraftingProcess: PublicKey,
    resourceCraftingFacility: PublicKey,
    resourceRecipe: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    input: StarbaseCloseCraftingProcessInput,
    tokenFrom?: PublicKey,
    tokenTo?: PublicKey,
  ): InstructionReturn {
    const remainingAccounts: AccountMeta[] = [];
    if (tokenFrom && tokenTo) {
      remainingAccounts.push(
        ...[
          {
            pubkey: tokenFrom,
            isSigner: false,
            isWritable: true,
          },
          {
            pubkey: tokenTo,
            isSigner: false,
            isWritable: true,
          },
          {
            pubkey: TOKEN_PROGRAM_ID,
            isSigner: false,
            isWritable: false,
          },
        ],
      );
    }
    return async (funder) => [
      {
        instruction: await program.methods
          .closeUpgradeProcess(input)
          .accountsStrict({
            fundsTo: fundsTo === "funder" ? funder.publicKey() : fundsTo,
            starbaseAndStarbasePlayer: {
              starbase,
              starbasePlayer,
            },
            gameAccountsAndProfile: {
              gameAndProfileAndFaction: {
                gameId,
                key: key.publicKey(),
                profile: playerProfile,
                profileFaction,
              },
              gameState,
            },
            resourceCraftingInstance,
            resourceCraftingProcess,
            resourceRecipe,
            resourceCraftingFacility,
            craftingProgram: craftingProgram.programId,
          })
          .remainingAccounts(remainingAccounts)
          .instruction(),
        signers: [key],
      },
    ];
  }

  /**
   * Complete a Starbase upgrade process
   * @param program - SAGE program
   * @param craftingProgram - crafting program
   * @param key - the key authorized to run this instruction
   * @param playerProfile - the player's profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param starbasePlayer - the Starbase player
   * @param starbase - the Starbase
   * @param gameId - the SAGE game id
   * @param gameState - the game state  account
   * @param craftingFacility - the upgrade facility used for crafting at the Starbase
   * @param upgradeFacility - the upgrade facility used for Starbase upgrade processes
   * @param newRecipeCategory - the new recipe category to be enabled after the upgrade process is complete
   * @param upgradeRecipe - the crafting recipe for the Starbase upgrade
   * @param craftingDomain - the crafting domain
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static completeStarbaseUpgrade(
    program: SageIDLProgram,
    craftingProgram: CraftingIDLProgram,
    key: AsyncSigner,
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    starbasePlayer: PublicKey,
    starbase: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    craftingFacility: PublicKey,
    upgradeFacility: PublicKey,
    newRecipeCategory: PublicKey,
    upgradeRecipe: PublicKey,
    craftingDomain: PublicKey,
    input: KeyIndexInput,
  ): InstructionReturn {
    return async (funder) => [
      {
        instruction: await program.methods
          .completeStarbaseUpgrade(input)
          .accountsStrict({
            funder: funder.publicKey(),
            starbaseAndStarbasePlayer: {
              starbase,
              starbasePlayer,
            },
            gameAccountsAndProfile: {
              gameAndProfileAndFaction: {
                gameId,
                key: key.publicKey(),
                profile: playerProfile,
                profileFaction,
              },
              gameState,
            },
            craftingFacility,
            upgradeFacility,
            upgradeRecipe,
            newRecipeCategory,
            craftingDomain,
            craftingProgram: craftingProgram.programId,
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
        signers: [key, funder],
      },
    ];
  }

  /**
   * Sync starbase upgrade ingredients
   * Syncs the starbase list of received upgrade ingredients with the list of ingredients defined in the upgrade
   * recipe.  This is ideally meant to be used when the upgrade recipe has been updated and thus calling this
   * instruction updates the starbase data regarding expected upgrade ingredients and their receipt.
   * @param program - SAGE program
   * @param key - the key authorized to run this instruction
   * @param playerProfile - the player's profile with the required permissions for the instruction
   * @param starbase - the Starbase
   * @param gameId - the SAGE game id
   * @param gameState - the game state  account
   * @param starbaseUpgradeRecipe - the crafting recipe for the Starbase upgrade
   * @param input - the instruction input params
   * @param input.keyIndex - the index of the key in the player profile permissions
   * @returns InstructionReturn
   */
  static syncStarbaseUpgradeIngredients(
    program: SageIDLProgram,
    key: AsyncSigner,
    playerProfile: PublicKey,
    starbase: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    starbaseUpgradeRecipe: PublicKey,
    input: KeyIndexInput,
  ): InstructionReturn {
    return async (funder) => [
      {
        instruction: await program.methods
          .syncStarbaseUpgradeIngredients(input)
          .accountsStrict({
            funder: funder.publicKey(),
            starbase,
            gameAccountsAndProfile: {
              gameAndProfile: {
                gameId,
                key: key.publicKey(),
                profile: playerProfile,
              },
              gameState,
            },
            upgradeRecipe: starbaseUpgradeRecipe,
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
        signers: [key, funder],
      },
    ];
  }

  /**
   * Deposit a resource for a Starbase upkeep
   * @param program - SAGE program
   * @param cargoProgram - cargo program
   * @param pointsProgram - points program
   * @param key - the key authorized to run this instruction
   * @param playerProfile - the player's profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param fundsTo - recipient of the rent refund
   * @param starbasePlayer - the Starbase player
   * @param starbase - the Starbase
   * @param gameId - the SAGE game id
   * @param gameState - the game state  account
   * @param cargoPodFrom - the source cargo pod
   * @param cargoType - the cargo type
   * @param cargoStatsDefinition - the cargo stats definition
   * @param resourceRecipe - the crafting recipe for the resource being deposited
   * @param tokenFrom - the source token account - owner should be `cargoPodFrom`
   * @param tokenMint - the token mint
   * @param loyaltyPointsUserAccount - the user account for Loyalty Points
   * @param loyaltyPointsCategory - the Loyalty Points Category Account
   * @param loyaltyPointsModifier - the Loyalty Points modifier
   * @param userRedemptionAccount - the user redemption account; used when auto-redeeming loyalty points
   * @param redemptionConfig - the RedemptionConfig; used when auto-redeeming loyalty points
   * @param pointsStoreProgram - the points store program; used when auto-redeeming loyalty points
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static depositStarbaseUpkeepResource(
    program: SageIDLProgram,
    cargoProgram: CargoIDLProgram,
    pointsProgram: PointsIDLProgram,
    key: AsyncSigner,
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    fundsTo: PublicKey | "funder",
    starbasePlayer: PublicKey,
    starbase: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    cargoPodFrom: PublicKey,
    cargoType: PublicKey,
    cargoStatsDefinition: PublicKey,
    resourceRecipe: PublicKey,
    tokenFrom: PublicKey,
    tokenMint: PublicKey,
    loyaltyPointsUserAccount: PublicKey,
    loyaltyPointsCategory: PublicKey,
    loyaltyPointsModifier: PublicKey,
    userRedemptionAccount: AsyncSigner | PublicKey,
    redemptionConfig: PublicKey,
    pointsStoreProgram: PointsStoreIDLProgram,
    input: DepositStarbaseUpkeepResourceInput,
  ): InstructionReturn {
    const signers = [key];
    const remainingAccounts: AccountMeta[] = [];
    let startingRedemption = false;
    const userRedemptionIsSigner = isAsyncSigner(userRedemptionAccount);
    const userRedemptionKey = userRedemptionIsSigner ? userRedemptionAccount.publicKey() : userRedemptionAccount;
    remainingAccounts.push(
      ...[
        {
          pubkey: userRedemptionKey,
          isSigner: userRedemptionIsSigner,
          isWritable: true,
        },
        {
          pubkey: redemptionConfig,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: pointsStoreProgram.programId,
          isSigner: false,
          isWritable: false,
        },
      ],
    );
    if (userRedemptionIsSigner) {
      signers.push(userRedemptionAccount);
      remainingAccounts.push(
        ...[
          {
            pubkey: SystemProgram.programId,
            isSigner: false,
            isWritable: false,
          },
        ],
      );
    }
    startingRedemption = userRedemptionIsSigner;
    // }
    return async (funder) => [
      {
        instruction: await program.methods
          .depositStarbaseUpkeepResource(input)
          .accountsStrict({
            fundsTo: fundsTo === "funder" ? funder.publicKey() : fundsTo,
            starbaseAndStarbasePlayer: {
              starbase,
              starbasePlayer,
            },
            gameAccountsAndProfile: {
              gameAndProfileAndFaction: {
                gameId,
                key: key.publicKey(),
                profile: playerProfile,
                profileFaction,
              },
              gameState,
            },
            cargoPodFrom,
            cargoType,
            cargoStatsDefinition,
            resourceRecipe,
            tokenFrom,
            tokenMint,
            loyaltyPointsAccounts: {
              userPointsAccount: loyaltyPointsUserAccount,
              pointsCategory: loyaltyPointsCategory,
              pointsModifierAccount: loyaltyPointsModifier,
            },
            progressionConfig: ProgressionConfig.findAddress(program as any, gameId)[0],
            pointsProgram: pointsProgram.programId,
            cargoProgram: cargoProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .remainingAccounts([
            ...remainingAccounts,
            ...(startingRedemption
              ? [
                  {
                    pubkey: funder.publicKey(),
                    isSigner: true,
                    isWritable: true,
                  },
                ]
              : []),
          ])
          .instruction(),
        signers: [...signers, ...(startingRedemption ? [funder] : [])],
      },
    ];
  }

  /**
   * Creates a new certificate mint for a given cargo type at a `Starbase`
   * @param program - SAGE program
   * @param transferHookProgram - the transfer hook program
   * @param starbase - the Starbase to create a certificate mint for
   * @param cargoMint - the mint to create a certificate mint for
   * @param certificateMint - the new certificate mint
   * @param cargoType - the cargo type to associated with the `cargo_mint`
   * @param gameId - the SAGE game id
   * @returns InstructionReturn
   */
  static createCertificateMint(
    program: SageIDLProgram,
    transferHookProgram: PublicKey,
    starbase: PublicKey,
    cargoMint: PublicKey,
    certificateMint: PublicKey,
    cargoType: PublicKey,
    gameId: PublicKey,
  ): InstructionReturn {
    return async (funder) => [
      {
        instruction: await program.methods
          .createCertificateMint()
          .accountsStrict({
            funder: funder.publicKey(),
            starbase,
            cargoMint,
            cargoType,
            certificateMint,
            gameId,
            transferHookProgram,
            transferHookExtraAccountMetaList: findExtraAccountMetaListAddress(transferHookProgram, certificateMint)[0],
            token2022Program: TOKEN_2022_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
        signers: [funder],
      },
    ];
  }

  static decodeData(account: KeyedAccountInfo, program: SageIDLProgram): DecodedAccountData<Starbase> {
    return decodeAccountWithRemaining(account, program as any, Starbase, (remainingData, data) =>
      Array(data.numUpgradeIngredients)
        .fill(0)
        .map((_, index) => new BN(remainingData.subarray(8 * index).subarray(0, 8), 10, "le")),
    );
  }
}
