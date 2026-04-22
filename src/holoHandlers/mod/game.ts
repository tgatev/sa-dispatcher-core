import { AccountMeta, KeyedAccountInfo, PublicKey, SystemProgram } from "@solana/web3.js";
import { BN } from "@staratlas/anchor";
import {
  Account,
  AccountStatic,
  AsyncSigner,
  DecodedAccountData,
  FixedSizeArray,
  InstructionReturn,
  arrayDeepEquals,
  decodeAccount,
  staticImplements,
} from "@staratlas/data-source";
import { PointsIDLProgram } from "@staratlas/points";
import {
  Cargo,
  Crafting,
  GameAccount,
  Mints,
  Points,
  RiskZoneData,
  RiskZonesData,
  SagePointsCategory,
  StarbaseLevelInfo,
  StarbaseUpkeepInfo,
  StarbaseUpkeepLevels,
  UpdateGameInput,
  Vaults,
} from "@staratlas/holosim/src/constants";
import { SageIDLProgram, SageIDL } from "../IDL/constants";
import { SectorRing } from "@staratlas/holosim/src/planet";

/**
 * Check if two `Cargo` instances are equal
 * @param data1 - first Cargo
 * @param data2 - second Cargo
 * @returns boolean
 */
export function cargoEquals(data1: Cargo, data2: Cargo): boolean {
  return data1.statsDefinition.equals(data2.statsDefinition);
}

/**
 * Check if two `Crafting` instances are equal
 * @param data1 - first Crafting
 * @param data2 - second Crafting
 * @returns boolean
 */
export function craftingEquals(data1: Crafting, data2: Crafting): boolean {
  return data1.domain.equals(data2.domain);
}

/**
 * Check if two `SagePointsCategory` instances are equal
 * @param data1 - first SagePointsCategory
 * @param data2 - second SagePointsCategory
 * @returns boolean
 */
export function sagePointsCategoryEquals(data1: SagePointsCategory, data2: SagePointsCategory): boolean {
  return data1.modifierBump === data2.modifierBump && data1.modifier.equals(data2.modifier) && data1.category.equals(data2.category);
}

/**
 * Check if two `Points` instances are equal
 * @param points1 - first Points
 * @param points2 - second Points
 * @returns boolean
 */
export function pointsEquals(points1: Points, points2: Points): boolean {
  return (
    sagePointsCategoryEquals(points1.lpCategory, points2.lpCategory) &&
    sagePointsCategoryEquals(points1.councilRankXpCategory, points2.councilRankXpCategory) &&
    sagePointsCategoryEquals(points1.pilotXpCategory, points2.pilotXpCategory) &&
    sagePointsCategoryEquals(points1.dataRunningXpCategory, points2.dataRunningXpCategory) &&
    sagePointsCategoryEquals(points1.miningXpCategory, points2.miningXpCategory) &&
    sagePointsCategoryEquals(points1.craftingXpCategory, points2.craftingXpCategory)
  );
}

/**
 * Check if two `Mints` instances are equal
 * @param mints1 - first Mints
 * @param mints2 - second Mints
 * @returns boolean
 */
export function mintsEquals(mints1: Mints, mints2: Mints): boolean {
  return (
    mints1.atlas.equals(mints2.atlas) &&
    mints1.polis.equals(mints2.polis) &&
    mints1.ammo.equals(mints2.ammo) &&
    mints1.food.equals(mints2.food) &&
    mints1.fuel.equals(mints2.fuel) &&
    mints1.repairKit.equals(mints2.repairKit)
  );
}

/**
 * Check if two `Vaults` instances are equal
 * @param vaults1 - first Vaults
 * @param vaults2 - second Vaults
 * @returns boolean
 */
export function vaultsEquals(vaults1: Vaults, vaults2: Vaults): boolean {
  return vaults1.atlas.equals(vaults2.atlas) && vaults1.polis.equals(vaults2.polis);
}

export enum PointsCategoryType {
  /// Loyalty Points (LP)
  LP = 1,
  /// Council Rank Experience Points (CRXP)
  CRXP = 2,
  /// Pilot License Experience Points (PXP)
  PXP = 3,
  /// Data Running Experience Points (DRXP)
  DRXP = 4,
  /// Mining Experience Points (MXP)
  MXP = 5,
  /// Crafting Experience Points (CXP)
  CXP = 6,
  /// Combat Experience Points (COXP)
  COXP = 7,
}

export interface FleetInputItem {
  level: number;
  faction: number;
  hp: BN;
  sp: BN;
  sectorRingAvailable: SectorRing;
  warpLaneMovementFee: BN;
  repairFee: BN;
  repairEfficiency: number;
  shieldRechargeRate: number;
  shieldBreakDelay: number;
}

export interface StarbaseLevelInfoArrayInput extends FleetInputItem {
  starbaseLevelIndex?: number /** provide this to update a certain index */;
  recipeCategoryForLevel: PublicKey;
  oldRecipeForUpgrade: PublicKey;
  newRecipeForUpgrade: PublicKey;
}

export interface StarbaseUpkeepInfoArrayInput {
  level: number;
  info: StarbaseUpkeepInfo;
}

export interface FleetInput {
  starbaseLevelInfoArray: FleetInputItem[] | null;
  upkeepInfoArray: StarbaseUpkeepInfoArrayInput[] | null;
  maxFleetSize: number | null;
}

export interface FactionsStarbaseLevelInfo {
  mud: FixedSizeArray<StarbaseLevelInfo, 7>;
  oni: FixedSizeArray<StarbaseLevelInfo, 7>;
  ustur: FixedSizeArray<StarbaseLevelInfo, 7>;
}

/**
 * Check if two `StarbaseLevelInfo` instances are equal
 * @param data1 - first StarbaseLevelInfo
 * @param data2 - second StarbaseLevelInfo
 * @returns boolean
 */
export function starbaseLevelInfoEquals(data1: StarbaseLevelInfo, data2: StarbaseLevelInfo): boolean {
  return (
    data1.hp.eq(data2.hp) &&
    data1.sp.eq(data2.sp) &&
    data1.sectorRingAvailable === data2.sectorRingAvailable &&
    data1.warpLaneMovementFee.eq(data2.warpLaneMovementFee) &&
    data1.recipeCategoryForLevel.equals(data2.recipeCategoryForLevel) &&
    data1.recipeForUpgrade.equals(data2.recipeForUpgrade)
  );
}

/**
 * Check if two `StarbaseLevelInfo` arrays are equal
 * @param data1 - first StarbaseLevelInfo array
 * @param data2 - second StarbaseLevelInfo array
 * @returns boolean
 */
export function starbaseLevelInfoArraysEqual(data1: StarbaseLevelInfo[], data2: StarbaseLevelInfo[]): boolean {
  return arrayDeepEquals(data1, data2, starbaseLevelInfoEquals);
}

/**
 * Check if two `FactionsStarbaseLevelInfo` instances are equal
 * @param data1 - first FactionsStarbaseLevelInfo
 * @param data2 - second FactionsStarbaseLevelInfo
 * @returns boolean
 */
export function factionsStarbaseLevelInfoEqual(data1: FactionsStarbaseLevelInfo, data2: FactionsStarbaseLevelInfo): boolean {
  const mud = starbaseLevelInfoArraysEqual(data1.mud as StarbaseLevelInfo[], data2.mud as StarbaseLevelInfo[]);
  const oni = starbaseLevelInfoArraysEqual(data1.oni as StarbaseLevelInfo[], data2.oni as StarbaseLevelInfo[]);
  const ustur = starbaseLevelInfoArraysEqual(data1.ustur as StarbaseLevelInfo[], data2.ustur as StarbaseLevelInfo[]);
  return mud && oni && ustur;
}

/**
 * Check if two `StarbaseUpkeepInfo` instances are equal
 * @param data1 - first StarbaseUpkeepInfo
 * @param data2 - second StarbaseUpkeepInfo
 * @returns boolean
 */
export function starbaseUpkeepInfoEquals(data1: StarbaseUpkeepInfo, data2: StarbaseUpkeepInfo): boolean {
  return (
    data1.ammoReserve.eq(data2.ammoReserve) &&
    data1.foodReserve.eq(data2.foodReserve) &&
    data1.toolkitReserve.eq(data2.toolkitReserve) &&
    data1.ammoDepletionRate === data2.ammoDepletionRate &&
    data1.foodDepletionRate === data2.foodDepletionRate &&
    data1.toolkitDepletionRate === data2.toolkitDepletionRate
  );
}

/**
 * Check if two `StarbaseUpkeepLevels` instances are equal
 * @param data1 - first StarbaseUpkeepLevels
 * @param data2 - second StarbaseUpkeepLevels
 * @returns boolean
 */
export function starbaseUpkeepLevelsEquals(data1: StarbaseUpkeepLevels, data2: StarbaseUpkeepLevels): boolean {
  return (
    starbaseUpkeepInfoEquals(data1.level1, data2.level1) &&
    starbaseUpkeepInfoEquals(data1.level2, data2.level2) &&
    starbaseUpkeepInfoEquals(data1.level3, data2.level3) &&
    starbaseUpkeepInfoEquals(data1.level4, data2.level4) &&
    starbaseUpkeepInfoEquals(data1.level5, data2.level5)
  );
}

export const DEFAULT_RISK_ZONE: RiskZoneData = {
  center: [new BN(0), new BN(0)],
  radius: new BN(0),
};
export const DEFAULT_RISK_ZONES: RiskZonesData = {
  mudSecurityZone: DEFAULT_RISK_ZONE as never,
  oniSecurityZone: DEFAULT_RISK_ZONE as never,
  usturSecurityZone: DEFAULT_RISK_ZONE as never,
  highRiskZone: DEFAULT_RISK_ZONE as never,
  mediumRiskZone: DEFAULT_RISK_ZONE as never,
};

export enum RiskZones {
  MudSecurityZone,
  OniSecurityZone,
  UsturSecurityZone,
  HighRiskZone,
  MediumRiskZone,
}

/**
 * Check if two `RiskZoneData` instances are equal
 * @param data1 - first RiskZoneData
 * @param data2 - second RiskZoneData
 * @returns boolean
 */
export function riskZoneEquals(data1: RiskZoneData, data2: RiskZoneData): boolean {
  return data1.radius.eq(data2.radius) && data1.center[0].eq(data2.center[0]) && data1.center[1].eq(data2.center[1]);
}

/**
 * Check if two `RiskZonesData` instances are equal
 * @param data1 - first RiskZonesData
 * @param data2 - second RiskZonesData
 * @returns boolean
 */
export function riskZonesEquals(data1: RiskZonesData, data2: RiskZonesData): boolean {
  return (
    riskZoneEquals(data1.mudSecurityZone, data2.mudSecurityZone) &&
    riskZoneEquals(data1.oniSecurityZone, data2.oniSecurityZone) &&
    riskZoneEquals(data1.usturSecurityZone, data2.usturSecurityZone) &&
    riskZoneEquals(data1.highRiskZone, data2.highRiskZone) &&
    riskZoneEquals(data1.mediumRiskZone, data2.mediumRiskZone)
  );
}

/**
 * Check if two `GameAccount` instances are equal
 * @param gameData1 - first GameAccount
 * @param gameData2 - second GameAccount
 * @returns boolean
 */
export function gameDataEquals(gameData1: GameAccount, gameData2: GameAccount): boolean {
  return (
    gameData1.version === gameData2.version &&
    gameData1.profile.equals(gameData2.profile) &&
    gameData1.gameState.equals(gameData2.gameState) &&
    cargoEquals(gameData1.cargo, gameData2.cargo) &&
    craftingEquals(gameData1.crafting, gameData2.crafting) &&
    pointsEquals(gameData1.points, gameData2.points) &&
    mintsEquals(gameData1.mints, gameData2.mints) &&
    vaultsEquals(gameData1.vaults, gameData2.vaults) &&
    riskZonesEquals(gameData1.riskZones, gameData2.riskZones) &&
    gameData1.updateId.eq(gameData2.updateId)
  );
}

export const FLEET_POINT_MODIFIER_MIN_DATA_SIZE =
  32 + // pubkey
  32 + // pubkey
  1; // bump
export const POINTS_MIN_DATA_SIZE = 6 * FLEET_POINT_MODIFIER_MIN_DATA_SIZE;
export const CARGO_MIN_DATA_SIZE = 32; // statsDefinition
export const CRAFTING_MIN_DATA_SIZE = 32; // domain
export const STAR_BASE_LEVEL_INFO_MIN_DATA_SIZE =
  32 + // recipeForUpgrade
  32 + // recipeCategoryForLevel
  8 + // hp
  8 + // sp
  8 + // warpLaneMovementFee
  1; // sectorRingAvailable
export const STAR_BASE_UPKEEP_INFO_MIN_DATA_SIZE =
  8 + // ammoReserve
  4 + // ammoDepletionRate
  8 + // foodReserve
  4 + // foodDepletionRate
  8 + // toolkitReserve
  4; // toolkitDepletionRate
export const FLEET_INFO_MIN_DATA_SIZE =
  STAR_BASE_LEVEL_INFO_MIN_DATA_SIZE * 21 + // starbaseLevels
  STAR_BASE_UPKEEP_INFO_MIN_DATA_SIZE * 7 + // starbaseUpkeep
  4; // maxFleetSize
export const MINTS_MIN_DATA_SIZE =
  32 + // atlas
  32 + // polis
  32 + // ammo
  32 + // food
  32 + // fuel
  32; // repairKit
export const VAULTS_MIN_DATA_SIZE =
  32 + // atlas
  32; // polis
export const MISC_VARIABLES_MIN_DATA_SIZE =
  2 + // warpLaneFuelCostReduction
  2 + // upkeepMiningEmissionsPenalty
  8; // respawnFee
export const RISK_ZONES_MIN_DATA_SIZE =
  (8 * 2 + // risk zone center
    8) * // risk zone radius
  5; // risk zones qty

@staticImplements<AccountStatic<Game, SageIDL>>()
export class Game implements Account {
  static readonly ACCOUNT_NAME: NonNullable<SageIDL["accounts"]>[number]["name"] = "Game";
  static readonly MIN_DATA_SIZE =
    8 + // discriminator
    1 + // version
    8 + // update_id
    32 + // profile
    32 + // game_state
    POINTS_MIN_DATA_SIZE + // points
    CARGO_MIN_DATA_SIZE + // cargo
    CRAFTING_MIN_DATA_SIZE + // crafting
    MINTS_MIN_DATA_SIZE + // mints
    VAULTS_MIN_DATA_SIZE + // vaults
    RISK_ZONES_MIN_DATA_SIZE;

  constructor(
    private readonly _data: GameAccount,
    private readonly _key: PublicKey,
  ) {}

  static MIN_STAR_BASE_LEVEL = 0;
  static MAX_STAR_BASE_LEVEL = 6;

  get data(): Readonly<GameAccount> {
    return this._data;
  }

  get key(): PublicKey {
    return this._key;
  }

  /**
   * Find the fleet PointsModifier account address
   * @param program - SAGE program
   * @param gameId - the SAGE game id
   * @param pointsCategory - the points category
   * @returns The PDA and bump respectively
   */
  static findPointsModifierAddress(program: SageIDLProgram, gameId: PublicKey, pointsCategory: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("PointsModifier"), gameId.toBuffer(), pointsCategory.toBuffer()],
      program.programId,
    );
  }

  /**
   * Create a new Game account
   * @param program - SAGE program
   * @param signer - the authority for the new game
   * @param profile - the profile with the required permissions for the instruction
   * @param gameId - the SAGE game id
   * @returns InstructionReturn
   */
  static initGame(program: SageIDLProgram, signer: AsyncSigner, profile: PublicKey, gameId: AsyncSigner): InstructionReturn {
    return async (funder) => [
      {
        instruction: await program.methods
          .initGame()
          .accountsStrict({
            signer: signer.publicKey(),
            gameId: gameId.publicKey(),
            funder: funder.publicKey(),
            profile,
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
        signers: [signer, funder, gameId],
      },
    ];
  }

  /**
   * Update a Game account
   * @param gameId - the SAGE game id
   * @param program - SAGE program
   * @param key - the key authorized to run this instruction
   * @param profile - the profile with the required permissions for the instruction
   * @param keyIndex - the index of the key in the profile permissions
   * @param pointCategories - point category settings
   * @param pointCategories.lpCategory - points category to use for Loyalty Points (LP)
   * @param pointCategories.councilRankXpCategory - points category to use for Council Rank Experience Points (CRXP)
   * @param pointCategories.pilotXpCategory - points category to use for Pilot License Experience Points (PXP)
   * @param pointCategories.dataRunningXpCategory - points category to use for Data Running Experience Points (DRXP)
   * @param pointCategories.miningXpCategory - points category to use for Mining Experience Points (MXP)
   * @param pointCategories.craftingXpCategory - points category to use for Crafting Experience Points (CXP)
   * @param pointCategories.combatXpCategory - points category to use for Combat Experience Points (CXP)
   * @param mints - mint settings
   * @param mints.atlas - atlas token mint
   * @param mints.polis - polis token mint
   * @param mints.ammo - ammo token mint
   * @param mints.food - food token mint
   * @param mints.fuel - fuel token mint
   * @param mints.repairKit - repair kit token mint
   * @param vaults - vault settings
   * @param vaults.atlas - atlas vault (token account)
   * @param vaults.polis - polis vault (token account)
   * @param crafting - crafting settings
   * @param crafting.domain - crafting domain
   * @param cargo - cargo settings
   * @param cargo.statsDefinition - cargo stats definition
   * @param riskZones - risk zone definitions
   * @returns InstructionReturn
   */
  static updateGame(
    gameId: PublicKey,
    program: SageIDLProgram,
    key: AsyncSigner,
    profile: PublicKey,
    keyIndex: number,
    pointCategories?: {
      lpCategory?: PublicKey;
      councilRankXpCategory?: PublicKey;
      pilotXpCategory?: PublicKey;
      dataRunningXpCategory?: PublicKey;
      miningXpCategory?: PublicKey;
      craftingXpCategory?: PublicKey;
      combatXpCategory?: PublicKey;
    },
    mints?: {
      atlas?: PublicKey;
      polis?: PublicKey;
      ammo?: PublicKey;
      food?: PublicKey;
      fuel?: PublicKey;
      repairKit?: PublicKey;
    },
    vaults?: {
      atlas?: PublicKey;
      polis?: PublicKey;
    },
    crafting?: {
      domain?: PublicKey;
    },
    cargo?: {
      statsDefinition?: PublicKey;
    },
    riskZones?: RiskZonesData,
  ): InstructionReturn {
    const remainingAccounts: AccountMeta[] = [];

    const data: UpdateGameInput = {
      mints: 0,
      vaults: 0,
      points: 0,
      crafting: 0,
      cargo: 0,
      riskZones: riskZones ? (riskZones as never) : null,
      keyIndex,
    };
    if (pointCategories) {
      if (pointCategories.lpCategory) {
        data.points |= 1 << 0;
        remainingAccounts.push({
          isSigner: false,
          isWritable: false,
          pubkey: pointCategories.lpCategory,
        });
      }
      if (pointCategories.councilRankXpCategory) {
        data.points |= 1 << 1;
        remainingAccounts.push({
          isSigner: false,
          isWritable: false,
          pubkey: pointCategories.councilRankXpCategory,
        });
      }
      if (pointCategories.pilotXpCategory) {
        data.points |= 1 << 2;
        remainingAccounts.push({
          isSigner: false,
          isWritable: false,
          pubkey: pointCategories.pilotXpCategory,
        });
      }
      if (pointCategories.dataRunningXpCategory) {
        data.points |= 1 << 3;
        remainingAccounts.push({
          isSigner: false,
          isWritable: false,
          pubkey: pointCategories.dataRunningXpCategory,
        });
      }
      if (pointCategories.miningXpCategory) {
        data.points |= 1 << 4;
        remainingAccounts.push({
          isSigner: false,
          isWritable: false,
          pubkey: pointCategories.miningXpCategory,
        });
      }
      if (pointCategories.craftingXpCategory) {
        data.points |= 1 << 5;
        remainingAccounts.push({
          isSigner: false,
          isWritable: false,
          pubkey: pointCategories.craftingXpCategory,
        });
      }
      if (pointCategories.combatXpCategory) {
        data.points |= 1 << 6;
        remainingAccounts.push({
          isSigner: false,
          isWritable: false,
          pubkey: pointCategories.combatXpCategory,
        });
      }
    }

    if (mints) {
      if (mints.atlas) {
        data.mints |= 1 << 0;
        remainingAccounts.push({
          isSigner: false,
          isWritable: false,
          pubkey: mints.atlas,
        });
      }
      if (mints.polis) {
        data.mints |= 1 << 1;
        remainingAccounts.push({
          isSigner: false,
          isWritable: false,
          pubkey: mints.polis,
        });
      }
      if (mints.ammo) {
        data.mints |= 1 << 2;
        remainingAccounts.push({
          isSigner: false,
          isWritable: false,
          pubkey: mints.ammo,
        });
      }
      if (mints.food) {
        data.mints |= 1 << 3;
        remainingAccounts.push({
          isSigner: false,
          isWritable: false,
          pubkey: mints.food,
        });
      }
      if (mints.fuel) {
        data.mints |= 1 << 4;
        remainingAccounts.push({
          isSigner: false,
          isWritable: false,
          pubkey: mints.fuel,
        });
      }
      if (mints.repairKit) {
        data.mints |= 1 << 5;
        remainingAccounts.push({
          isSigner: false,
          isWritable: false,
          pubkey: mints.repairKit,
        });
      }
    }

    if (vaults) {
      if (vaults.atlas) {
        data.vaults |= 1 << 0;
        remainingAccounts.push({
          isSigner: false,
          isWritable: false,
          pubkey: vaults.atlas,
        });
      }
      if (vaults.polis) {
        data.vaults |= 1 << 1;
        remainingAccounts.push({
          isSigner: false,
          isWritable: false,
          pubkey: vaults.polis,
        });
      }
    }

    if (crafting) {
      if (crafting.domain) {
        data.crafting |= 1 << 0;
        remainingAccounts.push({
          isSigner: false,
          isWritable: false,
          pubkey: crafting.domain,
        });
      }
    }

    if (cargo) {
      if (cargo.statsDefinition) {
        data.cargo |= 1 << 0;
        remainingAccounts.push({
          isSigner: false,
          isWritable: false,
          pubkey: cargo.statsDefinition,
        });
      }
    }

    return async () => [
      {
        instruction: await program.methods
          .updateGame(data)
          .accountsStrict({
            gameAndProfile: {
              key: key.publicKey(),
              profile,
              gameId,
            },
          })
          .remainingAccounts(remainingAccounts)
          .instruction(),
        signers: [key],
      },
    ];
  }

  /**
   * Register the SAGE points modifier for a points category account
   * @param program - SAGE program
   * @param pointsProgram - the Points program
   * @param key - the key authorized to run this instruction
   * @param profile - the profile with the required permissions for the instruction
   * @param gameId - the SAGE game id
   * @param pointsCategory - the points category whose modifier is being registered
   * @param pointsCategoryType - the category type
   * @param keyIndex - the SAGE game id
   * @returns InstructionReturn
   */
  static registerSagePointModifier(
    program: SageIDLProgram,
    pointsProgram: PointsIDLProgram,
    key: AsyncSigner,
    profile: PublicKey,
    gameId: PublicKey,
    pointsCategory: PublicKey,
    pointsCategoryType: PointsCategoryType,
    keyIndex: number,
  ): {
    modifierKey: [PublicKey, number];
    instructions: InstructionReturn;
  } {
    const modifierKey = Game.findPointsModifierAddress(program, gameId, pointsCategory);
    return {
      modifierKey,
      instructions: async (funder) => [
        {
          instruction: await program.methods
            .registerSagePointModifier({ pointsCategoryType, keyIndex })
            .accountsStrict({
              gameAndProfile: {
                key: key.publicKey(),
                profile,
                gameId,
              },
              funder: funder.publicKey(),
              pointsCategory,
              pointsModifier: modifierKey[0],
              pointsProgram: pointsProgram.programId,
              systemProgram: SystemProgram.programId,
            })
            .instruction(),
          signers: [key, funder],
        },
      ],
    };
  }

  static decodeData(account: KeyedAccountInfo, program: SageIDLProgram): DecodedAccountData<Game> {
    return decodeAccount(account, program, Game);
  }
}
