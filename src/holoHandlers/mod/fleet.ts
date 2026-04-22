import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { AccountMeta, KeyedAccountInfo, Keypair, PublicKey, SystemProgram, SYSVAR_INSTRUCTIONS_PUBKEY, SYSVAR_SLOT_HASHES_PUBKEY } from "@solana/web3.js";
import { BN } from "@staratlas/anchor";
import { CargoIDLProgram, CargoPod } from "@staratlas/cargo";
import {
  Account,
  AccountStatic,
  AsyncSigner,
  CUnion,
  DecodedAccountData,
  InstructionReturn,
  arrayDeepEquals,
  decodeAccountWithRemaining,
  keypairToAsyncSigner,
  staticImplements,
} from "@staratlas/data-source";
import { PointsIDLProgram } from "@staratlas/points";
import { ProfileFactionAccount, ProfileFactionIDLProgram } from "@staratlas/profile-faction";
// import {
//   AdminCreateFleetInput,
//   AdminRemoveFleetInput,
//   AdminDepositCargoToFleetInput,
//   AdminDepositCargoToStarbaseInput,
// } from "../IDL/constants";
import { AdminCreateFleetInput, AdminDepositCargoToFleetInput, AdminDepositCargoToStarbaseInput, AdminRemoveFleetInput } from "@staratlas/holosim";
import {
  SHIP_STATS_MIN_DATA_SIZE,
  ShipStats,
  SizeClass,
  shipStatsEquals,
  calculateDistance,
  Resource,
  FleetShips,
  DisbandedFleet,
  MineItem,
  ProgressionConfig,
  CombatConfig,
} from "./../mod";

import {
  AddShipToFleetInput,
  BaseAttackFleetInput,
  BaseRepairDockedFleetInput,
  BaseRepairIdleFleetInput,
  CargoStats,
  CloseFleetCargoPodTokenAccountInput,
  CombatStats,
  DepositCargoToFleetInput,
  DisbandFleetInput,
  FleetAccount,
  ForceDisbandFleetInput,
  Idle,
  IdleToRespawnInput,
  LoadFleetCrewInput,
  LoadingBayToIdleInput,
  MineAsteroid,
  MineAsteroidToRespawnInput,
  MineItemAccount,
  MiscStats,
  MoveSubwarp,
  MoveWarp,
  MovementStats,
  ReloadFleetAbilityPowerInput,
  ResourceAccount,
  Respawn,
  BaseRetrieveLootInput,
  //   SageIDL,
  //   SageIDLProgram,
  ShipCounts,
  StarbaseLoadingBay,
  StartMiningAsteroidInput,
  StartSubwarpInput,
  StopMiningAsteroidInput,
  StopSubwarpInput,
  TransferCargoWithinFleetInput,
  UnloadFleetCrewInput,
  UpdateShipInFleetInput,
  WarpLaneInput,
  WarpToCoordinateInput,
  WithdrawCargoFromFleetInput,
} from "../IDL/constants";
import { SageIDL, SageIDLProgram } from "../IDL/constants";
export const MIN_WARP_DISTANCE = 0;
export const MAX_WARP_DISTANCE = 20 * 100;
export const MAX_CARGO_CAPACITY = 100_000_000;
export const MAX_CONSUMPTION_CAPACITY = 50_000_000;
export const MAX_AP = 100_000_000;
export const MAX_HIT_POINTS = 500_000_000;

export enum PointsCategoryEnum {
  XP = 1,
  LP = 2,
}

/** extends CreateFleetInput to remove cargo pod seeds */
export interface CustomCreateFleetInput {
  shipAmount: number;
  fleetLabel: number[];
  shipEscrowIndex: number;
  keyIndex: number;
}

export type FleetStateData = CUnion<{
  StarbaseLoadingBay: StarbaseLoadingBay;
  Idle: Idle;
  MineAsteroid: MineAsteroid;
  MoveWarp: MoveWarp;
  MoveSubwarp: MoveSubwarp;
  Respawn: Respawn;
}>;

export interface AttackFleetInput extends Omit<BaseAttackFleetInput, "newAttackerCargoHoldSeeds" | "newDefenderCargoHoldSeeds"> {
  anyFleetDies?: boolean;
  asteroid?: PublicKey /** must only be provided if defending fleet is mining */;
}

export interface RepairIdleFleetInput extends Omit<BaseRepairIdleFleetInput, "amount"> {
  amount?: number;
}

export interface RepairDockedFleetInput extends Omit<BaseRepairDockedFleetInput, "amount"> {
  amount?: number;
}

export interface LootRetrievalAccounts {
  cargoType: PublicKey;
  tokenFrom: PublicKey;
  tokenTo: PublicKey;
  tokenMint: PublicKey;
}

export interface RetrieveLootInput extends BaseRetrieveLootInput {
  lootRetrieval: LootRetrievalAccounts[];
  fundsTo?: PublicKey | "funder" /** only required if loot account will be closed */;
}

export interface AttackStarbaseInput {
  keyIndex: number;
}

export interface RepairStarbaseInput {
  keyIndex: number;
  toolkitAmount: BN;
}

export const FLEET_MIN_DATA_SIZE =
  8 + // discriminator
  1 + // version
  32 + // gameId
  32 + // ownerProfile
  32 + // subProfile
  32 + // subProfileInvalidator
  32 + // fleetLabel
  (2 * 8 + 4 * 2) + // shipCounts
  8 + // warpCooldownExpiresAt
  8 + // scanCooldownExpiresAt
  SHIP_STATS_MIN_DATA_SIZE + // stats
  32 + // cargoHold
  32 + // fuelTank
  32 + // ammoBank
  4 + // AP
  4 + // SP
  4 + // HP
  4 + // pendingHP
  8 + // apReloadExpiresAt
  8 + // shieldBreakDelayExpiresAt
  8 + // lastCombatUpdate
  8 + // updateId
  32 + // Fleet Ships key
  1 + // Faction
  1; // bump

export const GLOBAL_SCALE_DECIMALS_2 = 100;
export const GLOBAL_SCALE_DECIMALS_4 = 10000;
export const GLOBAL_SCALE_DECIMALS_6 = 1000000;

/**
 * Check if two `FleetAccount` instances are equal
 * @param data1 - first FleetAccount
 * @param data2 - second FleetAccount
 * @returns boolean
 */
export function fleetDataEquals(data1: FleetAccount, data2: FleetAccount): boolean {
  return (
    data1.version === data2.version &&
    data1.gameId.equals(data2.gameId) &&
    data1.ownerProfile.equals(data2.ownerProfile) &&
    data1.subProfile.key.equals(data2.subProfile.key) &&
    data1.subProfileInvalidator.equals(data2.subProfileInvalidator) &&
    arrayDeepEquals(data1.fleetLabel, data2.fleetLabel, (a, b) => a === b) &&
    arrayDeepEquals(Object.values(data1.shipCounts), Object.values(data2.shipCounts), (a, b) => a === b) &&
    shipStatsEquals(data1.stats, data2.stats) &&
    data1.cargoHold.equals(data2.cargoHold) &&
    data1.ammoBank.equals(data2.ammoBank) &&
    data1.fuelTank.equals(data2.fuelTank) &&
    data1.updateId.eq(data2.updateId) &&
    data1.ap === data2.ap &&
    data1.sp === data2.sp &&
    data1.hp === data2.hp &&
    data1.pendingHp === data2.pendingHp &&
    data1.apReloadExpiresAt.eq(data2.apReloadExpiresAt) &&
    data1.shieldBreakDelayExpiresAt.eq(data2.shieldBreakDelayExpiresAt) &&
    data1.lastCombatUpdate.eq(data2.lastCombatUpdate) &&
    data1.warpCooldownExpiresAt.eq(data2.warpCooldownExpiresAt) &&
    data1.fleetShips.equals(data2.fleetShips) &&
    data1.faction === data2.faction &&
    data1.bump === data2.bump
  );
}

@staticImplements<AccountStatic<Fleet, SageIDL>>()
export class Fleet implements Account {
  static readonly ACCOUNT_NAME: NonNullable<SageIDL["accounts"]>[number]["name"] = "Fleet";
  static readonly MIN_DATA_SIZE: number = FLEET_MIN_DATA_SIZE;

  constructor(
    private _data: FleetAccount,
    private _key: PublicKey,
    private _state: FleetStateData,
  ) {}

  get data(): Readonly<FleetAccount> {
    return this._data;
  }

  get key(): Readonly<PublicKey> {
    return this._key;
  }

  get state(): Readonly<FleetStateData> {
    return this._state;
  }

  /**
   * Find the Fleet account address
   * @param program - SAGE program
   * @param game - the SAGE game id
   * @param playerProfile - the profile with the required permissions for the instruction
   * @param fleetLabel - the fleet label
   * @returns The PDA and bump respectively
   */
  static findAddress(program: SageIDLProgram, game: PublicKey, playerProfile: PublicKey, fleetLabel: number[]): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from("Fleet"), game.toBuffer(), playerProfile.toBuffer(), Buffer.from(fleetLabel)], program.programId);
  }

  /**
   * Get the fleet size
   * @param counts - ShipCounts
   * @returns The ship counts
   */
  static getFleetSize(counts: ShipCounts): number {
    return (
      counts.xxSmall * SizeClass.XxSmall +
      counts.xSmall * SizeClass.XSmall +
      counts.small * SizeClass.Small +
      counts.medium * SizeClass.Medium +
      counts.large * SizeClass.Large +
      counts.capital * SizeClass.Capital +
      counts.commander * SizeClass.Commander +
      counts.titan * SizeClass.Titan
    );
  }

  /**
   * Calculate the time take to warp
   * @param fleetStats - the fleet's stats
   * @param distance - the distance
   * @returns the time taken to warp
   */
  static calculateWarpTime(fleetStats: ShipStats, distance: number): number {
    if (fleetStats.movementStats.warpSpeed > 0) {
      return distance / (fleetStats.movementStats.warpSpeed / GLOBAL_SCALE_DECIMALS_6);
    }
    return 0;
  }

  /**
   * Calculate the time take to warp given coordinates
   * @param fleetStats - the fleet's stats
   * @param coordinates1 - the 1st set of coordinates
   * @param coordinates2 - the 2nd set of coordinates
   * @returns the time taken to warp
   */
  static calculateWarpTimeWithCoords(fleetStats: ShipStats, coordinates1: [BN, BN], coordinates2: [BN, BN]): number {
    return this.calculateWarpTime(fleetStats, calculateDistance(coordinates1, coordinates2));
  }

  /**
   * Calculate the amount of fuel to burn for warp movement given the distance
   * @param fleetStats - the fleet's stats
   * @param distance - the distance
   * @returns the amount fo fuel spent for moving
   */
  static calculateWarpFuelBurnWithDistance(fleetStats: ShipStats, distance: number): number {
    return distance * (fleetStats.movementStats.warpFuelConsumptionRate / GLOBAL_SCALE_DECIMALS_2);
  }

  /**
   * Calculate the amount of fuel to burn for warp movement given the coordinates
   * @param fleetStats - the fleet's stats
   * @param coordinates1 - the 1st set of coordinates
   * @param coordinates2 - the 2nd set of coordinates
   * @returns the amount fo fuel spent for moving
   */
  static calculateWarpFuelBurnWithCoords(fleetStats: ShipStats, coordinates1: [BN, BN], coordinates2: [BN, BN]): number {
    return this.calculateWarpFuelBurnWithDistance(fleetStats, calculateDistance(coordinates1, coordinates2));
  }

  /**
   * Calculate the time take to subwarp
   * @param fleetStats - the fleet's stats
   * @param distance - the distance
   * @returns the time taken to subwarp
   */
  static calculateSubwarpTime(fleetStats: ShipStats, distance: number): number {
    if (fleetStats.movementStats.subwarpSpeed > 0) {
      return distance / (fleetStats.movementStats.subwarpSpeed / GLOBAL_SCALE_DECIMALS_6);
    }
    return 0;
  }

  /**
   * Calculate the time take to subwarp given coordinates
   * @param fleetStats - the fleet's stats
   * @param coordinates1 - the 1st set of coordinates
   * @param coordinates2 - the 2nd set of coordinates
   * @returns the time taken to subwarp
   */
  static calculateSubwarpTimeWithCoords(fleetStats: ShipStats, coordinates1: [BN, BN], coordinates2: [BN, BN]): number {
    return this.calculateSubwarpTime(fleetStats, calculateDistance(coordinates1, coordinates2));
  }

  /**
   * Calculate the amount of fuel to burn for subwarp movement given the distance
   * @param fleetStats - the fleet's stats
   * @param distance - the distance
   * @returns the amount fo fuel spent for moving
   */
  static calculateSubwarpFuelBurnWithDistance(fleetStats: ShipStats, distance: number): number {
    return distance * (fleetStats.movementStats.subwarpFuelConsumptionRate / GLOBAL_SCALE_DECIMALS_2);
  }

  /**
   * Calculate the amount of fuel to burn for subwarp movement given the coordinates
   * @param fleetStats - the fleet's stats
   * @param coordinates1 - the 1st set of coordinates
   * @param coordinates2 - the 2nd set of coordinates
   * @returns the amount fo fuel spent for moving
   */
  static calculateSubwarpFuelBurnWithCoords(fleetStats: ShipStats, coordinates1: [BN, BN], coordinates2: [BN, BN]): number {
    return this.calculateSubwarpFuelBurnWithDistance(fleetStats, calculateDistance(coordinates1, coordinates2));
  }

  /**
   * Calculate the time it would take for food to run out during mining
   * @param fleetStats - the fleet's stats
   * @param foodAvailable - the food available
   * @returns time it would take for food to run out during mining
   */
  static calculateAsteroidMiningFoodDuration(fleetStats: ShipStats, foodAvailable: number) {
    if (fleetStats.cargoStats.foodConsumptionRate > 0) {
      return foodAvailable / (fleetStats.cargoStats.foodConsumptionRate / GLOBAL_SCALE_DECIMALS_4);
    }

    return 0;
  }

  /**
   * Calculate the amount of food to consume
   * @param fleetStats - the fleet's stats
   * @param foodAvailable - the food available
   * @param duration - the duration
   * @returns amount of food to consume
   */
  static calculateAsteroidMiningFoodToConsume(fleetStats: ShipStats, foodAvailable: number, duration: number) {
    const maxDuration = Fleet.calculateAsteroidMiningFoodDuration(fleetStats, foodAvailable);
    const actualDuration = Math.min(duration, maxDuration);

    const foodForDuration = actualDuration * (fleetStats.cargoStats.foodConsumptionRate / GLOBAL_SCALE_DECIMALS_4);

    if (foodForDuration > 0) {
      if (foodAvailable > foodForDuration) {
        return foodForDuration;
      } else {
        return foodAvailable;
      }
    }

    return 0;
  }

  /**
   * Calculate the time it would take for ammo to run out during mining
   * @param fleetStats - the fleet's stats
   * @param ammoAvailable - the ammo available
   * @returns time it would take for food to run out during mining
   */
  static calculateAsteroidMiningAmmoDuration(fleetStats: ShipStats, ammoAvailable: number) {
    if (fleetStats.cargoStats.ammoConsumptionRate > 0) {
      return ammoAvailable / (fleetStats.cargoStats.ammoConsumptionRate / GLOBAL_SCALE_DECIMALS_4);
    }

    return 0;
  }

  /**
   * Calculate the amount of ammo to consume
   * @param fleetStats - the fleet's stats
   * @param ammoAvailable - the ammo available
   * @param duration - the duration
   * @returns amount of ammo to consume
   */
  static calculateAsteroidMiningAmmoToConsume(fleetStats: ShipStats, ammoAvailable: number, duration: number) {
    const maxDuration = Fleet.calculateAsteroidMiningAmmoDuration(fleetStats, ammoAvailable);
    const actualDuration = Math.min(duration, maxDuration);

    const ammoForDuration = actualDuration * (fleetStats.cargoStats.ammoConsumptionRate / GLOBAL_SCALE_DECIMALS_4);

    if (ammoForDuration > 0) {
      if (ammoAvailable > ammoForDuration) {
        return ammoForDuration;
      } else {
        return ammoAvailable;
      }
    }

    return 0;
  }

  /**
   * Apply the mining rate penalty
   * @param baseRate - the base mining emissions rate
   * @param penalty - the penalty as a percentage (.e.g 0.5 to mean 50%)
   * @returns  the mining emission rate with penalty applied
   */
  static applyAsteroidMiningRatePenalty(baseRate: number, penalty: number) {
    if (penalty >= 1.0) {
      // If the penalty is greater than or equal to 100%, return 0.0
      return 0;
    } else {
      return (1.0 - penalty) * baseRate;
    }
  }

  /**
   * Calculate the mining emission rate using raw numbers
   * @param fleetStats - the fleet's stats
   * @param resourceHardnessInput - the resource hardness of the mine item
   * @param systemRichnessInput - the system richness associated with the mine item
   * @param penalty - the percentage by which to reduce the asteroid mining rate (e.g. 0.5 to represent 50%)
   * @returns the mining emission rate
   */
  static calculateAsteroidMiningEmissionRateBareBones(fleetStats: ShipStats, resourceHardnessInput: number, systemRichnessInput: number, penalty = 0) {
    const resourceHardness = resourceHardnessInput / MineItem.RESOURCE_HARDNESS_DECIMALS;
    if (resourceHardness > 0) {
      const systemRichness = systemRichnessInput / Resource.SYSTEM_RICHNESS_DECIMALS;
      const baseRate = ((fleetStats.cargoStats.miningRate / GLOBAL_SCALE_DECIMALS_4) * systemRichness) / resourceHardness;

      return Fleet.applyAsteroidMiningRatePenalty(baseRate, penalty);
    }

    return 0;
  }

  /**
   * Calculate the mining emission rate
   * @param fleetStats - the fleet's stats
   * @param mineItem - the mine item
   * @param resource - the resource associated with the mine item
   * @param penalty - the percentage by which to reduce the asteroid mining rate (e.g. 0.5 to represent 50%)
   * @returns the mining emission rate
   */
  static calculateAsteroidMiningEmissionRate(fleetStats: ShipStats, mineItem: MineItemAccount, resource: ResourceAccount, penalty = 0) {
    return Fleet.calculateAsteroidMiningEmissionRateBareBones(fleetStats, mineItem.resourceHardness, resource.systemRichness, penalty);
  }

  /**
   * Calculate the time it would take to mine the resourceAmount with raw numbers
   * @param fleetStats - the fleet's stats
   * @param resourceHardnessInput - the resource hardness of the mine item
   * @param systemRichnessInput - the system richness associated with the mine item
   * @param resourceAmount - the amount of resource
   * @param penalty - the percentage by which to reduce the asteroid mining rate (e.g. 0.5 to represent 50%)
   * @returns the time it would take to mine the resourceAmount
   */
  static calculateAsteroidMiningResourceExtractionDurationBareBones(
    fleetStats: ShipStats,
    resourceHardnessInput: number,
    systemRichnessInput: number,
    resourceAmount: number,
    penalty = 0,
  ) {
    const emissionRate = Fleet.calculateAsteroidMiningEmissionRateBareBones(fleetStats, resourceHardnessInput, systemRichnessInput, penalty);
    if (emissionRate > 0) {
      return resourceAmount / emissionRate;
    }

    return 0;
  }

  /**
   * Calculate the time it would take to mine the resourceAmount
   * @param fleetStats - the fleet's stats
   * @param mineItem - the mine item
   * @param resource - the resource associated with the mine item
   * @param resourceAmount - the amount of resource
   * @returns the time it would take to mine the resourceAmount
   */
  static calculateAsteroidMiningResourceExtractionDuration(
    fleetStats: ShipStats,
    mineItem: MineItemAccount,
    resource: ResourceAccount,
    resourceAmount: number,
  ) {
    return Fleet.calculateAsteroidMiningResourceExtractionDurationBareBones(fleetStats, mineItem.resourceHardness, resource.systemRichness, resourceAmount);
  }

  /**
   * Calculate the the amount of resource to extract with raw numbers
   * @param fleetStats - the fleet's stats
   * @param resourceHardnessInput - the resource hardness of the mine item
   * @param systemRichnessInput - the system richness associated with the mine item
   * @param duration - the time elapsed in seconds
   * @param maxResourceAmount - the max amount of resource
   * @param penalty - the percentage by which to reduce the asteroid mining rate (e.g. 0.5 to represent 50%)
   * @returns the amount of resource to extract
   */
  static calculateAsteroidMiningResourceToExtractBareBones(
    fleetStats: ShipStats,
    resourceHardnessInput: number,
    systemRichnessInput: number,
    duration: number,
    maxResourceAmount: number,
    penalty = 0,
  ) {
    const emissionRate = Fleet.calculateAsteroidMiningEmissionRateBareBones(fleetStats, resourceHardnessInput, systemRichnessInput, penalty);

    return Math.min(maxResourceAmount, emissionRate * duration);
  }

  /**
   * Calculate the the amount of resource to extract
   * @param fleetStats - the fleet's stats
   * @param mineItem - the mine item
   * @param resource - the resource associated with the mine item
   * @param duration - the time elapsed in seconds
   * @param maxResourceAmount - the max amount of resource
   * @param penalty - the percentage by which to reduce the asteroid mining rate (e.g. 0.5 to represent 50%)
   * @returns the amount of resource to extract
   */
  static calculateAsteroidMiningResourceToExtract(
    fleetStats: ShipStats,
    mineItem: MineItemAccount,
    resource: ResourceAccount,
    duration: number,
    maxResourceAmount: number,
    penalty = 0,
  ) {
    return Fleet.calculateAsteroidMiningResourceToExtractBareBones(
      fleetStats,
      mineItem.resourceHardness,
      resource.systemRichness,
      duration,
      maxResourceAmount,
      penalty,
    );
  }

  /**
   * Check if the fleet's crew is normalized
   * @returns boolean representing whether or not the crew is normalized
   */
  normalizedCrew() {
    return (<ShipStats>this.data.stats).miscStats.crewCount >= (<ShipStats>this.data.stats).miscStats.requiredCrew;
  }

  /**
   * Create a new `Fleet`
   * @param program - SAGE program
   * @param cargoProgram - cargo program
   * @param key - the key authorized to run this instruction
   * @param playerProfile - the profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param ship - the first ship to add to the fleet
   * @param starbasePlayer - the Starbase player
   * @param starbase - the Starbase
   * @param gameId - the SAGE game id
   * @param gameState - the game state
   * @param cargoStatsDefinition - the cargo stats definition
   * @param input - the instruction input params
   * @returns the fleet address, the addresses of fleet cargo pods & InstructionReturn
   */
  static createFleet(
    program: SageIDLProgram,
    cargoProgram: CargoIDLProgram,
    key: AsyncSigner,
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    ship: PublicKey,
    starbasePlayer: PublicKey,
    starbase: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    cargoStatsDefinition: PublicKey,
    input: CustomCreateFleetInput,
  ): {
    fleetKey: [PublicKey, number];
    cargoHoldKey: [PublicKey, number];
    fuelTankKey: [PublicKey, number];
    ammoBankKey: [PublicKey, number];
    instructions: InstructionReturn;
  } {
    const fleet = Fleet.findAddress(program, gameId, playerProfile, input.fleetLabel);
    const fleetShips = FleetShips.findAddress(program, fleet[0]);
    const cargoHoldSeeds = Keypair.generate().publicKey.toBuffer();
    const fuelTankSeeds = Keypair.generate().publicKey.toBuffer();
    const ammoBankSeeds = Keypair.generate().publicKey.toBuffer();
    const cargoHold = CargoPod.findAddress(cargoProgram, cargoHoldSeeds);
    const fuelTank = CargoPod.findAddress(cargoProgram, fuelTankSeeds);
    const ammoBank = CargoPod.findAddress(cargoProgram, ammoBankSeeds);

    return {
      fleetKey: fleet,
      cargoHoldKey: cargoHold,
      fuelTankKey: fuelTank,
      ammoBankKey: ammoBank,
      instructions: async (funder) => [
        {
          instruction: await program.methods
            .createFleet({
              ...input,
              cargoHoldSeeds: Array.from(cargoHoldSeeds),
              fuelTankSeeds: Array.from(fuelTankSeeds),
              ammoBankSeeds: Array.from(ammoBankSeeds),
            })
            .accountsStrict({
              gameAccountsAndProfile: {
                gameAndProfileAndFaction: {
                  key: key.publicKey(),
                  profile: playerProfile,
                  profileFaction,
                  gameId,
                },
                gameState,
              },
              funder: funder.publicKey(),
              fleet: fleet[0],
              fleetShips: fleetShips[0],
              ship,
              starbaseAndStarbasePlayer: {
                starbase,
                starbasePlayer,
              },
              cargoHold: cargoHold[0],
              fuelTank: fuelTank[0],
              ammoBank: ammoBank[0],
              cargoStatsDefinition,
              cargoProgram: cargoProgram.programId,
              systemProgram: SystemProgram.programId,
            })
            .instruction(),
          signers: [key, funder],
        },
      ],
    };
  }

  /**
   * Create a new `Fleet` (admin only)
   *
   * NOTE: This method returns multiple instructions that MUST be executed in order:
   * 1. Initialize 3 cargo pods (cargo_hold, fuel_tank, ammo_bank)
   * 2. Initialize Fleet account
   * 3. Initialize FleetShips account and add ships
   * 4. (Optional) Transfer cargo pod authority to fleet PDA
   *
   * Due to Solana restrictions, PDAs cannot be initialized with other PDAs in the same
   * instruction if they reference each other in their seeds.
   *
   * @param program - SAGE program
   * @param cargoProgram - cargo program
   * @param key - the key authorized to run this instruction (game admin)
   * @param playerProfile - the game's admin profile
   * @param profileFaction - the profile's faction
   * @param ship - the first ship to add to the fleet
   * @param gameId - the SAGE game id
   * @param gameState - the game state
   * @param cargoStatsDefinition - the cargo stats definition
   * @param input - the instruction input params
   * @param transferAuthority - whether to transfer cargo authority to fleet PDA (default: true)
   * @returns the fleet address, the addresses of fleet cargo pods & InstructionReturn
   */
  static adminCreateFleet(
    program: SageIDLProgram,
    cargoProgram: CargoIDLProgram,
    key: AsyncSigner,
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    ship: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    cargoStatsDefinition: PublicKey,
    input: AdminCreateFleetInput,
    transferAuthority = true,
  ): {
    fleetKey: [PublicKey, number];
    cargoHoldKey: [PublicKey, number];
    fuelTankKey: [PublicKey, number];
    ammoBankKey: [PublicKey, number];
    instructions: InstructionReturn;
  } {
    const fleet = Fleet.findAddress(program, gameId, playerProfile, input.fleetLabel);
    const fleetShips = FleetShips.findAddress(program, fleet[0]);
    const cargoHoldSeeds = Keypair.generate().publicKey.toBuffer();
    const fuelTankSeeds = Keypair.generate().publicKey.toBuffer();
    const ammoBankSeeds = Keypair.generate().publicKey.toBuffer();
    const cargoHold = CargoPod.findAddress(cargoProgram, cargoHoldSeeds);
    const fuelTank = CargoPod.findAddress(cargoProgram, fuelTankSeeds);
    const ammoBank = CargoPod.findAddress(cargoProgram, ammoBankSeeds);

    return {
      fleetKey: fleet,
      cargoHoldKey: cargoHold,
      fuelTankKey: fuelTank,
      ammoBankKey: ammoBank,
      instructions: async (funder) => {
        const instructions = [];

        // Step 1: Initialize cargo pods with admin as authority
        // CRITICAL: Must be done BEFORE creating fleet due to Solana CPI restrictions
        for (const { pda, seeds } of [
          { pda: cargoHold[0], seeds: cargoHoldSeeds },
          { pda: fuelTank[0], seeds: fuelTankSeeds },
          { pda: ammoBank[0], seeds: ammoBankSeeds },
        ]) {
          instructions.push({
            instruction: await cargoProgram.methods
              .initCargoPod(Array.from(seeds))
              .accountsStrict({
                funder: funder.publicKey(),
                authority: funder.publicKey(),
                cargoPod: pda,
                statsDefinition: cargoStatsDefinition,
                systemProgram: SystemProgram.programId,
              })
              .instruction(),
            signers: [funder],
          });
        }

        // Step 2: Create fleet (derives FleetShips PDA internally, doesn't init it)
        // instructions.push({
        //   instruction: await program.methods
        //     .adminCreateFleet(input)
        //     .accountsStrict({
        //       gameAccountsAndProfile: {
        //         gameAndProfileAndFaction: {
        //           key: key.publicKey(),
        //           profile: playerProfile,
        //           profileFaction,
        //           gameId,
        //         },
        //         gameState,
        //       },
        //       funder: funder.publicKey(),
        //       fleet: fleet[0],
        //       cargoHold: cargoHold[0],
        //       fuelTank: fuelTank[0],
        //       ammoBank: ammoBank[0],
        //       ship,
        //       systemProgram: SystemProgram.programId,
        //     })
        //     .instruction(),
        //   signers: [key, funder],
        // });

        // // Step 2.5: Initialize FleetShips and add ships (MUST be after fleet creation)
        // instructions.push({
        //   instruction: await program.methods
        //     .adminInitFleetShips({
        //       shipAmount: input.shipAmount,
        //       keyIndex: input.keyIndex,
        //     })
        //     .accountsStrict({
        //       gameAccountsAndProfile: {
        //         gameAndProfileAndFaction: {
        //           key: key.publicKey(),
        //           profile: playerProfile,
        //           profileFaction,
        //           gameId,
        //         },
        //         gameState,
        //       },
        //       funder: funder.publicKey(),
        //       fleet: fleet[0],
        //       fleetShips: fleetShips[0],
        //       ship,
        //       systemProgram: SystemProgram.programId,
        //     })
        //     .instruction(),
        //   signers: [key, funder],
        // });

        // // Step 3: Transfer cargo pod authority to fleet PDA (optional but recommended)
        // if (transferAuthority) {
        //   instructions.push({
        //     instruction: await program.methods
        //       .adminTransferFleetCargoAuthority({ keyIndex: input.keyIndex })
        //       .accountsStrict({
        //         gameAccountsAndProfile: {
        //           gameAndProfileAndFaction: {
        //             key: key.publicKey(),
        //             profile: playerProfile,
        //             profileFaction,
        //             gameId,
        //           },
        //           gameState,
        //         },
        //         funder: funder.publicKey(),
        //         fleet: fleet[0],
        //         cargoHold: cargoHold[0],
        //         fuelTank: fuelTank[0],
        //         ammoBank: ammoBank[0],
        //         cargoProgram: cargoProgram.programId,
        //       })
        //       .instruction(),
        //     signers: [key, funder],
        //   });
        // }

        return instructions;
      },
    };
  }

  /**
   * Remove a `Fleet` (admin only)
   * This instruction closes the fleet and all associated accounts
   * @param program - SAGE program
   * @param cargoProgram - cargo program
   * @param key - the key authorized to run this instruction (game admin)
   * @param playerProfile - the game's admin profile
   * @param profileFaction - the profile's faction
   * @param fleet - the fleet to remove
   * @param cargoHold - the fleet's cargo hold
   * @param fuelTank - the fleet's fuel tank
   * @param ammoBank - the fleet's ammo bank
   * @param gameId - the SAGE game id
   * @param gameState - the game state
   * @param cargoStatsDefinition - the cargo stats definition
   * @param input - the instruction input params
   * @param tokenAccountsToClose - Optional list of token accounts to close. Each entry requires { tokenAccount, cargoType, mint }
   * @returns InstructionReturn
   */
  static adminRemoveFleet(
    program: SageIDLProgram,
    cargoProgram: CargoIDLProgram,
    key: AsyncSigner,
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    fleet: PublicKey,
    cargoHold: PublicKey,
    fuelTank: PublicKey,
    ammoBank: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    cargoStatsDefinition: PublicKey,
    input: AdminRemoveFleetInput,
    tokenAccountsToClose: {
      tokenAccount: PublicKey;
      cargoType: PublicKey;
      mint: PublicKey;
    }[] = [],
  ): { instructions: InstructionReturn } {
    const fleetShips = FleetShips.findAddress(program, fleet);

    const remainingAccounts: AccountMeta[] = [];
    tokenAccountsToClose.forEach(({ tokenAccount, cargoType, mint }) => {
      remainingAccounts.push(
        { pubkey: tokenAccount, isSigner: false, isWritable: true },
        { pubkey: cargoType, isSigner: false, isWritable: false },
        { pubkey: mint, isSigner: false, isWritable: true },
      );
    });

    return {
      instructions: async (funder) => [
        // {
        //   instruction: await program.methods
        //     .adminRemoveFleet(input)
        //     .accountsStrict({
        //       gameAccountsAndProfile: {
        //         gameAndProfileAndFaction: {
        //           key: key.publicKey(),
        //           profile: playerProfile,
        //           profileFaction,
        //           gameId,
        //         },
        //         gameState,
        //       },
        //       funder: funder.publicKey(),
        //       fleet,
        //       fleetShips: fleetShips[0],
        //       cargoHold,
        //       fuelTank,
        //       ammoBank,
        //       cargoStatsDefinition,
        //       cargoProgram: cargoProgram.programId,
        //       systemProgram: SystemProgram.programId,
        //       tokenProgram: TOKEN_PROGRAM_ID,
        //     })
        //     .remainingAccounts(remainingAccounts)
        //     .instruction(),
        //   signers: [key, funder],
        // },
      ],
    };
  }

  /**
   * Add a `Ship` to a `Fleet`
   * @param program - SAGE program
   * @param key - the key authorized to run this instruction
   * @param playerProfile - the profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param fleet - the fleet
   * @param ship - the ship being added to the fleet
   * @param starbasePlayer - the Starbase player
   * @param starbase - the Starbase where the fleet is docked
   * @param gameId - the SAGE game id
   * @param gameState - the game state
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static addShipToFleet(
    program: SageIDLProgram,
    key: AsyncSigner,
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    fleet: PublicKey,
    ship: PublicKey,
    starbasePlayer: PublicKey,
    starbase: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    input: AddShipToFleetInput,
  ): InstructionReturn {
    return async (funder) => [
      {
        instruction: await program.methods
          .addShipToFleet(input)
          .accountsStrict({
            gameAccountsFleetAndOwner: {
              gameFleetAndOwner: {
                fleetAndOwner: {
                  fleet,
                  owningProfile: playerProfile,
                  owningProfileFaction: profileFaction,
                  key: key.publicKey(),
                },
                gameId,
              },
              gameState,
            },
            funder: funder.publicKey(),
            fleetShips: FleetShips.findAddress(program, fleet)[0],
            ship,
            starbaseAndStarbasePlayer: {
              starbase,
              starbasePlayer,
            },
            systemProgram: SystemProgram.programId,
          })
          .remainingAccounts([
            {
              pubkey: starbase,
              isSigner: false,
              isWritable: false,
            },
          ])
          .instruction(),
        signers: [key, funder],
      },
    ];
  }

  /**
   * Update a `Ship` in a `Fleet`
   * @param program - SAGE program
   * @param fleet - the fleet
   * @param oldShip - the old ship being updated
   * @param next - the value of the next field on the old ship account
   * @param gameId - the SAGE game id
   * @param gameState - the game state
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static updateShipInFleet(
    program: SageIDLProgram,
    fleet: PublicKey,
    oldShip: PublicKey,
    next: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    input: UpdateShipInFleetInput,
  ): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .updateShipInFleet(input)
          .accountsStrict({
            fleet,
            fleetShips: FleetShips.findAddress(program, fleet)[0],
            oldShip,
            next,
            gameAccounts: {
              gameState,
              gameId,
            },
          })
          .instruction(),
        signers: [],
      },
    ];
  }

  /**
   * Disbands a `Fleet`
   * @param program - SAGE program
   * @param cargoProgram - cargo program
   * @param key - the key authorized to run this instruction
   * @param playerProfile - the profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param fleet - the fleet
   * @param starbasePlayer - the Starbase player
   * @param starbase - the Starbase where the fleet is docked
   * @param gameId - the SAGE game id
   * @param gameState - the game state
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static disbandFleet(
    program: SageIDLProgram,
    cargoProgram: CargoIDLProgram,
    key: AsyncSigner,
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    fleet: Fleet,
    starbasePlayer: PublicKey,
    starbase: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    input: DisbandFleetInput,
  ): {
    disbandedFleetKey: [PublicKey, number];
    instructions: InstructionReturn;
  } {
    return Fleet.disbandFleetBareBones(
      program,
      cargoProgram,
      key,
      playerProfile,
      profileFaction,
      fleet.key,
      fleet.data.fleetLabel,
      fleet.data.ammoBank,
      fleet.data.cargoHold,
      fleet.data.fuelTank,
      starbasePlayer,
      starbase,
      gameId,
      gameState,
      input,
    );
  }

  /**
   * Disbands a `Fleet` without requiring a fleet account
   * @param program - SAGE program
   * @param cargoProgram - cargo program
   * @param key - the key authorized to run this instruction
   * @param playerProfile - the profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param fleet - the fleet
   * @param fleetLabel - the fleet's label (name)
   * @param ammoBank - the fleet's ammo bank
   * @param cargoHold - the fleet's cargo hold
   * @param fuelTank - the fleet's fuel tank
   * @param starbasePlayer - the Starbase player
   * @param starbase - the Starbase where the fleet is docked
   * @param gameId - the SAGE game id
   * @param gameState - the game state
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static disbandFleetBareBones(
    program: SageIDLProgram,
    cargoProgram: CargoIDLProgram,
    key: AsyncSigner,
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    fleet: PublicKey,
    fleetLabel: number[],
    ammoBank: PublicKey,
    cargoHold: PublicKey,
    fuelTank: PublicKey,
    starbasePlayer: PublicKey,
    starbase: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    input: DisbandFleetInput,
  ): {
    disbandedFleetKey: [PublicKey, number];
    instructions: InstructionReturn;
  } {
    const disbandedFleetResult = DisbandedFleet.findAddress(program, gameId, playerProfile, fleetLabel);
    return {
      disbandedFleetKey: disbandedFleetResult,
      instructions: async (funder) => [
        {
          instruction: await program.methods
            .disbandFleet(input)
            .accountsStrict({
              gameAccountsAndProfile: {
                gameAndProfileAndFaction: {
                  key: key.publicKey(),
                  profile: playerProfile,
                  profileFaction,
                  gameId,
                },
                gameState,
              },
              funder: funder.publicKey(),
              fleet,
              fleetShips: FleetShips.findAddress(program, fleet)[0],
              disbandedFleet: disbandedFleetResult[0],
              cargoHold,
              fuelTank,
              ammoBank,
              starbaseAndStarbasePlayer: {
                starbase,
                starbasePlayer,
              },
              cargoProgram: cargoProgram.programId,
              systemProgram: SystemProgram.programId,
            })
            .remainingAccounts([
              {
                pubkey: starbase,
                isSigner: false,
                isWritable: false,
              },
            ])
            .instruction(),
          signers: [key, funder],
        },
      ],
    };
  }

  /**
   * Forcefully disbands a `Fleet`
   * This is only necessary after a `Ship` that is part of the fleet is invalidated
   * @param program - SAGE program
   * @param cargoProgram - cargo program
   * @param fleet - the fleet
   * @param starbasePlayer - the Starbase player
   * @param starbase - the Starbase
   * @param ship - the ship
   * @param gameId - the SAGE game id
   * @param gameState - the game state
   * @param input - the instruction input params
   * @param resource - if the fleet is mining, this is the resource being mined
   * @param planet - if the fleet is mining, this is the location being mined
   * @returns the disbanded fleet address & InstructionReturn
   */
  static forceDisbandFleet(
    program: SageIDLProgram,
    cargoProgram: CargoIDLProgram,
    fleet: Fleet,
    starbasePlayer: PublicKey,
    starbase: PublicKey,
    ship: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    input: ForceDisbandFleetInput,
    resource?: PublicKey,
    planet?: PublicKey,
  ): {
    disbandedFleetKey: [PublicKey, number];
    instructions: InstructionReturn;
  } {
    return Fleet.forceDisbandFleetBareBones(
      program,
      cargoProgram,
      fleet.key,
      fleet.data.ownerProfile,
      fleet.data.fleetLabel,
      fleet.data.ammoBank,
      fleet.data.cargoHold,
      fleet.data.fuelTank,
      starbasePlayer,
      starbase,
      ship,
      gameId,
      gameState,
      input,
      resource,
      planet,
    );
  }

  /**
   * Forcefully disbands a `Fleet` without requiring a fleet account
   * This is only necessary after a `Ship` that is part of the fleet is invalidated
   * @param program - SAGE program
   * @param cargoProgram - cargo program
   * @param fleet - the fleet
   * @param fleetOwnerProfile - the player profile that owns the fleet
   * @param fleetLabel - the fleet's label (name)
   * @param ammoBank - the fleet's ammo bank
   * @param cargoHold - the fleet's cargo hold
   * @param fuelTank - the fleet's fuel tank
   * @param starbasePlayer - the Starbase player
   * @param starbase - the Starbase
   * @param ship - the ship
   * @param gameId - the SAGE game id
   * @param gameState - the game state
   * @param input - the instruction input params
   * @param resource - if the fleet is mining, this is the resource being mined
   * @param planet - if the fleet is mining, this is the location being mined
   * @returns the disbanded fleet address & InstructionReturn
   */
  static forceDisbandFleetBareBones(
    program: SageIDLProgram,
    cargoProgram: CargoIDLProgram,
    fleet: PublicKey,
    fleetOwnerProfile: PublicKey,
    fleetLabel: number[],
    ammoBank: PublicKey,
    cargoHold: PublicKey,
    fuelTank: PublicKey,
    starbasePlayer: PublicKey,
    starbase: PublicKey,
    ship: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    input: ForceDisbandFleetInput,
    resource?: PublicKey,
    planet?: PublicKey,
  ): {
    disbandedFleetKey: [PublicKey, number];
    instructions: InstructionReturn;
  } {
    const disbandedFleetResult = DisbandedFleet.findAddress(program, gameId, fleetOwnerProfile, fleetLabel);
    const remainingAccounts: AccountMeta[] =
      resource && planet
        ? [
            {
              pubkey: resource,
              isSigner: false,
              isWritable: true,
            },
            {
              pubkey: planet,
              isSigner: false,
              isWritable: true,
            },
          ]
        : [];
    return {
      disbandedFleetKey: disbandedFleetResult,
      instructions: async (funder) => [
        {
          instruction: await program.methods
            .forceDisbandFleet(input)
            .accountsStrict({
              funder: funder.publicKey(),
              fleet,
              fleetShips: FleetShips.findAddress(program, fleet)[0],
              disbandedFleet: disbandedFleetResult[0],
              cargoHold,
              fuelTank,
              ammoBank,
              starbaseAndStarbasePlayer: {
                starbase,
                starbasePlayer,
              },
              ship,
              gameAccounts: {
                gameId,
                gameState,
              },
              cargoProgram: cargoProgram.programId,
              systemProgram: SystemProgram.programId,
            })
            .remainingAccounts(remainingAccounts)
            .instruction(),
          signers: [funder],
        },
      ],
    };
  }

  /**
   * Deposits cargo to a `Fleet` from a `Starbase`
   * @param program - SAGE program
   * @param cargoProgram - cargo program
   * @param key - the key authorized to run this instruction
   * @param playerProfile - the profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param fundsTo - recipient of the rent refund
   * @param starbase - the Starbase
   * @param starbasePlayer - the Starbase player
   * @param fleet - the fleet
   * @param cargoPodFrom - the source cargo pod, owned by `starbasePlayer`
   * @param cargoPodTo - the destination cargo pod, owned by fleet
   * @param cargoType - the cargo type
   * @param cargoStatsDefinition - the cargo stats definition
   * @param tokenFrom - the source token account, owned by `cargoPodFrom`
   * @param tokenTo - the destination token account, owned by `cargoPodTo`
   * @param tokenMint - the token mint
   * @param gameId - the SAGE game id
   * @param gameState - the game state
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static depositCargoToFleet(
    program: SageIDLProgram,
    cargoProgram: CargoIDLProgram,
    key: AsyncSigner,
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    fundsTo: PublicKey | "funder",
    starbase: PublicKey,
    starbasePlayer: PublicKey,
    fleet: PublicKey,
    cargoPodFrom: PublicKey,
    cargoPodTo: PublicKey,
    cargoType: PublicKey,
    cargoStatsDefinition: PublicKey,
    tokenFrom: PublicKey,
    tokenTo: PublicKey,
    tokenMint: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    input: DepositCargoToFleetInput,
  ): InstructionReturn {
    return async (funder) => [
      {
        instruction: await program.methods
          .depositCargoToFleet(input)
          .accountsStrict({
            gameAccountsFleetAndOwner: {
              gameFleetAndOwner: {
                fleetAndOwner: {
                  fleet,
                  owningProfile: playerProfile,
                  owningProfileFaction: profileFaction,
                  key: key.publicKey(),
                },
                gameId,
              },
              gameState,
            },
            fundsTo: fundsTo === "funder" ? funder.publicKey() : fundsTo,
            starbaseAndStarbasePlayer: {
              starbase,
              starbasePlayer,
            },
            cargoPodFrom,
            cargoPodTo,
            cargoType,
            cargoStatsDefinition,
            tokenFrom,
            tokenTo,
            tokenMint,
            cargoProgram: cargoProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .remainingAccounts([
            {
              pubkey: starbase,
              isSigner: false,
              isWritable: false,
            },
          ])
          .instruction(),
        signers: [key],
      },
    ];
  }

  /**
   * Deposits cargo to a `Fleet` from any token account (admin only)
   * @param program - SAGE program
   * @param cargoProgram - cargo program
   * @param key - the key authorized to run this instruction (game admin)
   * @param playerProfile - the game's admin profile
   * @param profileFaction - the profile's faction
   * @param fleet - the fleet
   * @param cargoPodTo - the destination cargo pod, owned by fleet
   * @param cargoType - the cargo type
   * @param cargoStatsDefinition - the cargo stats definition
   * @param tokenFrom - the source token account
   * @param tokenTo - the destination token account, owned by `cargoPodTo`
   * @param tokenMint - the token mint
   * @param gameId - the SAGE game id
   * @param gameState - the game state
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static adminDepositCargoToFleet(
    program: SageIDLProgram,
    cargoProgram: CargoIDLProgram,
    key: AsyncSigner,
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    fleet: PublicKey,
    cargoPodTo: PublicKey,
    cargoType: PublicKey,
    cargoStatsDefinition: PublicKey,
    tokenFrom: PublicKey,
    tokenTo: PublicKey,
    tokenMint: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    input: AdminDepositCargoToFleetInput,
  ): InstructionReturn {
    return async (funder) => [
      // {
      //   instruction: await program.methods
      //     .adminDepositCargoToFleet(input)
      //     .accountsStrict({
      //       gameAccountsFleetAndOwner: {
      //         gameFleetAndOwner: {
      //           fleetAndOwner: {
      //             fleet,
      //             owningProfile: playerProfile,
      //             owningProfileFaction: profileFaction,
      //             key: key.publicKey(),
      //           },
      //           gameId,
      //         },
      //         gameState,
      //       },
      //       funder: funder.publicKey(),
      //       cargoPodTo,
      //       cargoType,
      //       cargoStatsDefinition,
      //       tokenFrom,
      //       tokenTo,
      //       tokenMint,
      //       cargoProgram: cargoProgram.programId,
      //       tokenProgram: TOKEN_PROGRAM_ID,
      //     })
      //     .instruction(),
      //   signers: [key, funder],
      // },
    ];
  }

  /**
   * Deposits cargo to a `Starbase` from any token account (admin only)
   * @param program - SAGE program
   * @param cargoProgram - cargo program
   * @param key - the key authorized to run this instruction (game admin)
   * @param playerProfile - the game's admin profile
   * @param starbase - the Starbase
   * @param starbasePlayer - the Starbase player
   * @param cargoPod - the destination cargo pod, owned by `starbasePlayer`
   * @param cargoType - the cargo type
   * @param cargoStatsDefinition - the cargo stats definition
   * @param tokenFrom - the source token account
   * @param tokenTo - the destination token account, owned by `cargoPod`
   * @param gameId - the SAGE game id
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static adminDepositCargoToStarbase(
    program: SageIDLProgram,
    cargoProgram: CargoIDLProgram,
    key: AsyncSigner,
    playerProfile: PublicKey,
    starbase: PublicKey,
    starbasePlayer: PublicKey,
    cargoPod: PublicKey,
    cargoType: PublicKey,
    cargoStatsDefinition: PublicKey,
    tokenFrom: PublicKey,
    tokenTo: PublicKey,
    gameId: PublicKey,
    input: AdminDepositCargoToStarbaseInput,
  ): InstructionReturn {
    return async (funder) => [
      // {
      //   instruction: await program.methods
      //     .adminDepositCargoToStarbase(input)
      //     .accountsStrict({
      //       starbaseAndStarbasePlayer: {
      //         starbase,
      //         starbasePlayer,
      //       },
      //       cargoPod,
      //       cargoType,
      //       cargoStatsDefinition,
      //       gameAndProfile: {
      //         key: key.publicKey(),
      //         profile: playerProfile,
      //         gameId,
      //       },
      //       tokenFrom,
      //       tokenTo,
      //       cargoProgram: cargoProgram.programId,
      //       tokenProgram: TOKEN_PROGRAM_ID,
      //     })
      //     .instruction(),
      //   signers: [key],
      // },
    ];
  }

  /**
   * Transfers cargo within a `Fleet`
   * @param program - SAGE program
   * @param cargoProgram - cargo program
   * @param key - the key authorized to run this instruction
   * @param fundsTo - recipient of the rent refund
   * @param playerProfile - the profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param fleet - the fleet
   * @param cargoPodFrom - the source cargo pod, owned by fleet
   * @param cargoPodTo - the destination cargo pod, owned by fleet
   * @param cargoType - the cargo type
   * @param cargoStatsDefinition - the cargo stats definition
   * @param tokenFrom - the source token account, owned by `cargoPodFrom`
   * @param tokenTo - the destination token account, owned by `cargoPodTo`
   * @param tokenMint - the token mint
   * @param gameId - the SAGE game id
   * @param gameState - the game state
   * @param input - the instruction input params
   * @param starbase - the Starbase
   * @returns InstructionReturn
   */
  static transferCargoWithinFleet(
    program: SageIDLProgram,
    cargoProgram: CargoIDLProgram,
    key: AsyncSigner,
    fundsTo: PublicKey | "funder",
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    fleet: PublicKey,
    cargoPodFrom: PublicKey,
    cargoPodTo: PublicKey,
    cargoType: PublicKey,
    cargoStatsDefinition: PublicKey,
    tokenFrom: PublicKey,
    tokenTo: PublicKey,
    tokenMint: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    input: TransferCargoWithinFleetInput,
    starbase?: PublicKey,
  ): InstructionReturn {
    const remainingAccounts = starbase
      ? [
          {
            pubkey: starbase,
            isSigner: false,
            isWritable: false,
          },
        ]
      : [];
    return async (funder) => [
      {
        instruction: await program.methods
          .transferCargoWithinFleet(input)
          .accountsStrict({
            gameAccountsFleetAndOwner: {
              gameFleetAndOwner: {
                fleetAndOwner: {
                  fleet,
                  owningProfile: playerProfile,
                  owningProfileFaction: profileFaction,
                  key: key.publicKey(),
                },
                gameId,
              },
              gameState,
            },
            cargoPodFrom,
            cargoPodTo,
            cargoType,
            cargoStatsDefinition,
            tokenFrom,
            tokenTo,
            tokenMint,
            fundsTo: fundsTo === "funder" ? funder.publicKey() : fundsTo,
            cargoProgram: cargoProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .remainingAccounts(remainingAccounts)
          .instruction(),
        signers: [key],
      },
    ];
  }

  /**
   * Withdraws cargo from a `Fleet` to a `Starbase`
   * @param program - SAGE program
   * @param cargoProgram - cargo program
   * @param key - the key authorized to run this instruction
   * @param fundsTo - recipient of the rent refund
   * @param playerProfile - the profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param starbase - the Starbase
   * @param starbasePlayer - the Starbase player
   * @param fleet - the fleet
   * @param cargoPodFrom - the source cargo pod, owned by the fleet
   * @param cargoPodTo - the destination cargo pod, owned by `starbasePlayer`
   * @param cargoType - the cargo type
   * @param cargoStatsDefinition - the cargo stats definition
   * @param tokenFrom - the source token account, owned by `cargoPodFrom`
   * @param tokenTo - the destination token account, owned by `cargoPodTo`
   * @param tokenMint - the token mint
   * @param gameId - the SAGE game id
   * @param gameState - the game state
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static withdrawCargoFromFleet(
    program: SageIDLProgram,
    cargoProgram: CargoIDLProgram,
    key: AsyncSigner,
    fundsTo: PublicKey | "funder",
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    starbase: PublicKey,
    starbasePlayer: PublicKey,
    fleet: PublicKey,
    cargoPodFrom: PublicKey,
    cargoPodTo: PublicKey,
    cargoType: PublicKey,
    cargoStatsDefinition: PublicKey,
    tokenFrom: PublicKey,
    tokenTo: PublicKey,
    tokenMint: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    input: WithdrawCargoFromFleetInput,
  ): InstructionReturn {
    return async (funder) => [
      {
        instruction: await program.methods
          .withdrawCargoFromFleet(input)
          .accountsStrict({
            gameAccountsFleetAndOwner: {
              gameFleetAndOwner: {
                fleetAndOwner: {
                  fleet,
                  owningProfile: playerProfile,
                  owningProfileFaction: profileFaction,
                  key: key.publicKey(),
                },
                gameId,
              },
              gameState,
            },
            starbaseAndStarbasePlayer: {
              starbase,
              starbasePlayer,
            },
            cargoPodFrom,
            cargoPodTo,
            cargoType,
            cargoStatsDefinition,
            tokenFrom,
            tokenTo,
            tokenMint,
            fundsTo: fundsTo === "funder" ? funder.publicKey() : fundsTo,
            cargoProgram: cargoProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .remainingAccounts([
            {
              pubkey: starbase,
              isSigner: false,
              isWritable: false,
            },
          ])
          .instruction(),
        signers: [key],
      },
    ];
  }

  /**
   * Closes a token account that is owned by the Fleet cargo pod (burns any token balance)
   * @param program - SAGE program
   * @param cargoProgram - cargo program
   * @param key - the key authorized to run this instruction
   * @param fundsTo - recipient of the rent refund
   * @param playerProfile - the profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param fleet - the fleet
   * @param cargoPod - the cargo pod, owned by the fleet
   * @param cargoType - the cargo type
   * @param cargoStatsDefinition - the cargo stats definition
   * @param token - the token account, owned by `cargoPod`
   * @param tokenMint - the token mint
   * @param gameId - the SAGE game id
   * @param gameState - the game state
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static closeFleetCargoPodTokenAccount(
    program: SageIDLProgram,
    cargoProgram: CargoIDLProgram,
    key: AsyncSigner,
    fundsTo: PublicKey | "funder",
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    fleet: PublicKey,
    cargoPod: PublicKey,
    cargoType: PublicKey,
    cargoStatsDefinition: PublicKey,
    token: PublicKey,
    tokenMint: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    input: CloseFleetCargoPodTokenAccountInput,
  ): InstructionReturn {
    return async (funder) => [
      {
        instruction: await program.methods
          .closeFleetCargoPodTokenAccount(input)
          .accountsStrict({
            gameAccountsFleetAndOwner: {
              gameFleetAndOwner: {
                fleetAndOwner: {
                  fleet,
                  owningProfile: playerProfile,
                  owningProfileFaction: profileFaction,
                  key: key.publicKey(),
                },
                gameId,
              },
              gameState,
            },
            cargoPod,
            cargoType,
            cargoStatsDefinition,
            token,
            tokenMint,
            fundsTo: fundsTo === "funder" ? funder.publicKey() : fundsTo,
            cargoProgram: cargoProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction(),
        signers: [key],
      },
    ];
  }

  /**
   * Transition a fleet from the Idle state to the Docked state
   * @param program - SAGE program
   * @param key - the key authorized to run this instruction
   * @param playerProfile - the profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param fleet - the fleet
   * @param starbase - the Starbase to dock into
   * @param starbasePlayer - the Starbase player
   * @param gameId - the SAGE game id
   * @param gameState - the game state
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static idleToLoadingBay(
    program: SageIDLProgram,
    key: AsyncSigner,
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    fleet: PublicKey,
    starbase: PublicKey,
    starbasePlayer: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    input: LoadingBayToIdleInput,
  ): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .idleToLoadingBay(input)
          .accountsStrict({
            gameAccountsFleetAndOwner: {
              gameFleetAndOwner: {
                fleetAndOwner: {
                  fleet,
                  owningProfile: playerProfile,
                  owningProfileFaction: profileFaction,
                  key: key.publicKey(),
                },
                gameId,
              },
              gameState,
            },
            starbaseAndStarbasePlayer: {
              starbase,
              starbasePlayer,
            },
          })
          .instruction(),
        signers: [key],
      },
    ];
  }

  /**
   * Transition a `Fleet`s state from `Idle` to `Respawn`
   * @param program - SAGE program
   * @param key - the key authorized to run this instruction
   * @param playerProfile - the profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param fleet - the fleet
   * @param atlasTokenFrom - ATLAS token account owned by player
   * @param atlasTokenTo - the vault ATLAS token account (as defined in GameState)
   * @param gameState - the game state
   * @param gameId - the SAGE game id
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static idleToRespawn(
    program: SageIDLProgram,
    key: AsyncSigner,
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    fleet: PublicKey,
    atlasTokenFrom: PublicKey,
    atlasTokenTo: PublicKey,
    gameState: PublicKey,
    gameId: PublicKey,
    input: IdleToRespawnInput,
  ): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .idleToRespawn(input)
          .accountsStrict({
            gameAccountsFleetAndOwner: {
              gameFleetAndOwner: {
                fleetAndOwner: {
                  fleet,
                  owningProfile: playerProfile,
                  owningProfileFaction: profileFaction,
                  key: key.publicKey(),
                },
                gameId,
              },
              gameState,
            },
            atlasTokenFrom,
            atlasTokenTo,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction(),
        signers: [key],
      },
    ];
  }

  /**
   * Transition a fleet from the docked state to the idle state
   * @param program - SAGE program
   * @param key - the key authorized to run this instruction
   * @param profile - the player's profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param fleet - the fleet
   * @param starbase - the Starbase that the fleet is currently docked at
   * @param starbasePlayer - the Starbase player
   * @param gameId - the SAGE game id
   * @param gameState - the game state
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static loadingBayToIdle(
    program: SageIDLProgram,
    key: AsyncSigner,
    profile: PublicKey,
    profileFaction: PublicKey,
    fleet: PublicKey,
    starbase: PublicKey,
    starbasePlayer: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    input: LoadingBayToIdleInput,
  ): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .loadingBayToIdle(input)
          .accountsStrict({
            gameAccountsFleetAndOwner: {
              gameFleetAndOwner: {
                fleetAndOwner: {
                  fleet,
                  owningProfile: profile,
                  owningProfileFaction: profileFaction,
                  key: key.publicKey(),
                },
                gameId,
              },
              gameState,
            },
            starbaseAndStarbasePlayer: {
              starbase,
              starbasePlayer,
            },
          })
          .remainingAccounts([
            {
              pubkey: starbase,
              isSigner: false,
              isWritable: false,
            },
          ])
          .instruction(),
        signers: [key],
      },
    ];
  }

  /**
   * Warp movement handler function
   * @param program - SAGE program
   * @param pointsProgram - points program
   * @param profile - the player's profile
   * @param fleet - the fleet
   * @param pilotXpUserAccount - the user account for Pilot XP
   * @param pilotXpCategory - the Pilot XP Points Category Account
   * @param pilotXpModifier - the Pilot XP modifier
   * @param councilRankXpUserAccount - the user account for Council Rank XP
   * @param councilRankXpCategory - the Council Rank XP Points Category Account
   * @param councilRankXpModifier - the Council Rank XP modifier
   * @param game - the SAGE game id
   * @returns InstructionReturn
   */
  static moveWarpHandler(
    program: SageIDLProgram,
    pointsProgram: PointsIDLProgram,
    profile: PublicKey,
    fleet: PublicKey,
    pilotXpUserAccount: PublicKey,
    pilotXpCategory: PublicKey,
    pilotXpModifier: PublicKey,
    councilRankXpUserAccount: PublicKey,
    councilRankXpCategory: PublicKey,
    councilRankXpModifier: PublicKey,
    game: PublicKey,
  ): InstructionReturn {
    const remainingAccounts: AccountMeta[] = [
      {
        pubkey: pilotXpUserAccount,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: pilotXpCategory,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: pilotXpModifier,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: councilRankXpUserAccount,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: councilRankXpCategory,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: councilRankXpModifier,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: profile,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: ProgressionConfig.findAddress(program, game)[0],
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: game,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: pointsProgram.programId,
        isSigner: false,
        isWritable: false,
      },
    ];
    return this.fleetStateHandler(program, fleet, remainingAccounts);
  }

  /**
   * Subwarp movement handler function
   * @param program - SAGE program
   * @param cargoProgram - cargo program
   * @param pointsProgram - points program
   * @param profile - the player's profile with the required permissions for the instruction
   * @param fleet - the fleet
   * @param fuelTank - the fuel tank cargo pod
   * @param fuelCargoType - the fuel cargo type
   * @param cargoStatsDefinition - the cargo stats definition
   * @param fuelTokenAccount - the fuel token account
   * @param fuelTokenMint - the fuel token mint
   * @param pilotXpUserAccount - the user account for Pilot XP
   * @param pilotXpCategory - the Pilot XP Points Category Account
   * @param pilotXpModifier - the Pilot XP modifier
   * @param councilRankXpUserAccount - the user account for Council Rank XP
   * @param councilRankXpCategory - the Council Rank XP Points Category Account
   * @param councilRankXpModifier - the Council Rank XP modifier
   * @param gameId - the SAGE game id
   * @returns InstructionReturn
   */
  static movementSubwarpHandler(
    program: SageIDLProgram,
    cargoProgram: CargoIDLProgram,
    pointsProgram: PointsIDLProgram,
    profile: PublicKey,
    fleet: PublicKey,
    fuelTank: PublicKey,
    fuelCargoType: PublicKey,
    cargoStatsDefinition: PublicKey,
    fuelTokenAccount: PublicKey,
    fuelTokenMint: PublicKey,
    pilotXpUserAccount: PublicKey,
    pilotXpCategory: PublicKey,
    pilotXpModifier: PublicKey,
    councilRankXpUserAccount: PublicKey,
    councilRankXpCategory: PublicKey,
    councilRankXpModifier: PublicKey,
    gameId: PublicKey,
  ): InstructionReturn {
    const remainingAccounts = Fleet.getSubwarpRemainingAccounts(
      program,
      cargoProgram,
      pointsProgram,
      profile,
      fuelTank,
      fuelCargoType,
      cargoStatsDefinition,
      fuelTokenAccount,
      fuelTokenMint,
      pilotXpUserAccount,
      pilotXpCategory,
      pilotXpModifier,
      councilRankXpUserAccount,
      councilRankXpCategory,
      councilRankXpModifier,
      gameId,
    );
    return this.fleetStateHandler(program, fleet, remainingAccounts);
  }

  /**
   * Generic fleet state handler
   * This is meant to be used when you want to run the fleet state handler and can provide your own remaining accounts
   * @param program - SAGE program
   * @param fleet - the fleet
   * @param remainingAccounts - the remaining accounts (an array of `AccountMeta`)
   * @returns InstructionReturn
   */
  static fleetStateHandler(program: SageIDLProgram, fleet: PublicKey, remainingAccounts: AccountMeta[] = []): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .fleetStateHandler()
          .accountsStrict({
            fleet,
          })
          .remainingAccounts(remainingAccounts)
          .instruction(),

        signers: [],
      },
    ];
  }

  /**
   * Warp to coordinate
   * @param program - SAGE program
   * @param key - the key authorized to run this instruction
   * @param profile - the player's profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param fleet - the fleet
   * @param fuelTank - the fleet's fuel tank cargo pod
   * @param cargoType - the cargo type
   * @param statsDefinition - the cargo stats definition
   * @param tokenFrom - the fuel source token account, owned by `fuelTank`
   * @param tokenMint - the fuel token mint
   * @param gameState - the game state
   * @param gameId - the SAGE game id
   * @param cargoProgram - cargo program
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static warpToCoordinate(
    program: SageIDLProgram,
    key: AsyncSigner,
    profile: PublicKey,
    profileFaction: PublicKey,
    fleet: PublicKey,
    fuelTank: PublicKey,
    cargoType: PublicKey,
    statsDefinition: PublicKey,
    tokenFrom: PublicKey,
    tokenMint: PublicKey,
    gameState: PublicKey,
    gameId: PublicKey,
    cargoProgram: CargoIDLProgram,
    input: WarpToCoordinateInput,
  ): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .warpToCoordinate(input)
          .accountsStrict({
            gameAccountsFleetAndOwner: {
              gameFleetAndOwner: {
                fleetAndOwner: {
                  fleet,
                  owningProfile: profile,
                  owningProfileFaction: profileFaction,
                  key: key.publicKey(),
                },
                gameId,
              },
              gameState,
            },
            fuelTank,
            cargoType,
            statsDefinition,
            tokenFrom,
            tokenMint,
            cargoProgram: cargoProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction(),
        signers: [key],
      },
    ];
  }

  /**
   * Warp to new `Sector` using the warp lane
   * @param program - SAGE program
   * @param key - the key authorized to run this instruction
   * @param profile - the player's profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param fleet - the fleet
   * @param fromStarbase - the Starbase that the fleet is moving from
   * @param toStarbase - the Starbase that the fleet is moving to
   * @param fromSector - the sector that fleet is moving from
   * @param toSector - the sector that the fleet is moving to
   * @param fuelTank - the fleet's fuel tank cargo pod
   * @param cargoType - the cargo type
   * @param statsDefinition - the cargo stats definition
   * @param fuelTokenFrom - the source token account for fuel
   * @param fuelMint - the fuel token mint
   * @param feeTokenFrom - the source token account for the fee
   * @param feeTokenTo - the destination token account for the fee
   * @param feeMint - the fee token mint
   * @param gameState - the game state
   * @param gameId - the SAGE game id
   * @param cargoProgram - cargo program
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static warpLane(
    program: SageIDLProgram,
    key: AsyncSigner,
    profile: PublicKey,
    profileFaction: PublicKey,
    fleet: PublicKey,
    fromStarbase: PublicKey,
    toStarbase: PublicKey,
    fromSector: PublicKey,
    toSector: PublicKey,
    fuelTank: PublicKey,
    cargoType: PublicKey,
    statsDefinition: PublicKey,
    fuelTokenFrom: PublicKey,
    fuelMint: PublicKey,
    feeTokenFrom: PublicKey,
    feeTokenTo: PublicKey,
    feeMint: PublicKey,
    gameState: PublicKey,
    gameId: PublicKey,
    cargoProgram: CargoIDLProgram,
    input: WarpLaneInput,
  ): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .warpLane(input)
          .accountsStrict({
            gameAccountsFleetAndOwner: {
              gameFleetAndOwner: {
                fleetAndOwner: {
                  fleet,
                  owningProfile: profile,
                  owningProfileFaction: profileFaction,
                  key: key.publicKey(),
                },
                gameId,
              },
              gameState,
            },
            fromStarbase,
            toStarbase,
            fromSector,
            toSector,
            fuelTank,
            cargoType,
            statsDefinition,
            fuelTokenFrom,
            fuelMint,
            feeTokenFrom,
            feeTokenTo,
            feeMint,
            cargoProgram: cargoProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction(),
        signers: [key],
      },
    ];
  }

  /**
   * Start subwarp movement
   * @param program - SAGE program
   * @param key - the key authorized to run this instruction
   * @param profile - the player's profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param fleet - the fleet
   * @param gameId - the SAGE game id
   * @param gameState - the game state
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static startSubwarp(
    program: SageIDLProgram,
    key: AsyncSigner,
    profile: PublicKey,
    profileFaction: PublicKey,
    fleet: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    input: StartSubwarpInput,
  ): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .startSubwarp(input)
          .accountsStrict({
            gameAccountsFleetAndOwner: {
              gameFleetAndOwner: {
                fleetAndOwner: {
                  fleet,
                  owningProfile: profile,
                  owningProfileFaction: profileFaction,
                  key: key.publicKey(),
                },
                gameId,
              },
              gameState,
            },
          })
          .instruction(),
        signers: [key],
      },
    ];
  }

  /**
   * Get remaining accounts for Subwarp movement
   * @param program - SAGE program
   * @param cargoProgram - cargo program
   * @param pointsProgram - points program
   * @param profile - the player's profile with the required permissions for the instruction
   * @param fuelTank - the fuel tank cargo pod
   * @param fuelCargoType - the fuel cargo type
   * @param cargoStatsDefinition - the cargo stats definition
   * @param fuelTokenAccount - the fuel token account
   * @param fuelTokenMint - the fuel token mint
   * @param pilotXpUserAccount - the user account for Pilot XP
   * @param pilotXpCategory - the Pilot XP Points Category Account
   * @param pilotXpModifier - the Pilot XP modifier
   * @param councilRankXpUserAccount - the user account for Council Rank XP
   * @param councilRankXpCategory - the Council Rank XP Points Category Account
   * @param councilRankXpModifier - the Council Rank XP modifier
   * @param gameId - the SAGE game id
   * @returns array of AccountMeta
   */
  static getSubwarpRemainingAccounts = (
    program: SageIDLProgram,
    cargoProgram: CargoIDLProgram,
    pointsProgram: PointsIDLProgram,
    profile: PublicKey,
    fuelTank: PublicKey,
    fuelCargoType: PublicKey,
    cargoStatsDefinition: PublicKey,
    fuelTokenAccount: PublicKey,
    fuelTokenMint: PublicKey,
    pilotXpUserAccount: PublicKey,
    pilotXpCategory: PublicKey,
    pilotXpModifier: PublicKey,
    councilRankXpUserAccount: PublicKey,
    councilRankXpCategory: PublicKey,
    councilRankXpModifier: PublicKey,
    gameId: PublicKey,
  ): AccountMeta[] => {
    return [
      {
        pubkey: profile,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: fuelTank,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: fuelCargoType,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: cargoStatsDefinition,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: fuelTokenAccount,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: fuelTokenMint,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: pilotXpUserAccount,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: pilotXpCategory,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: pilotXpModifier,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: councilRankXpUserAccount,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: councilRankXpCategory,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: councilRankXpModifier,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: ProgressionConfig.findAddress(program, gameId)[0],
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: gameId,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: pointsProgram.programId,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: cargoProgram.programId,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      },
    ];
  };

  /**
   * Stop an Subwarp movement in progress
   * @param program - SAGE program
   * @param cargoProgram - cargo program
   * @param pointsProgram - points program
   * @param key - the key authorized to run this instruction
   * @param profile - the player's profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param fleet - the fleet
   * @param fuelTank - the fuel tank cargo pod
   * @param fuelCargoType - the fuel cargo type
   * @param cargoStatsDefinition - the cargo stats definition
   * @param fuelTokenAccount - the fuel token account
   * @param fuelTokenMint - the fuel token mint
   * @param pilotXpUserAccount - the user account for Pilot XP
   * @param pilotXpCategory - the Pilot XP Points Category Account
   * @param pilotXpModifier - the Pilot XP modifier
   * @param councilRankXpUserAccount - the user account for Council Rank XP
   * @param councilRankXpCategory - the Council Rank XP Points Category Account
   * @param councilRankXpModifier - the Council Rank XP modifier
   * @param gameId - the SAGE game id
   * @param gameState - the game state
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static stopSubwarp(
    program: SageIDLProgram,
    cargoProgram: CargoIDLProgram,
    pointsProgram: PointsIDLProgram,
    key: AsyncSigner,
    profile: PublicKey,
    profileFaction: PublicKey,
    fleet: PublicKey,
    fuelTank: PublicKey,
    fuelCargoType: PublicKey,
    cargoStatsDefinition: PublicKey,
    fuelTokenAccount: PublicKey,
    fuelTokenMint: PublicKey,
    pilotXpUserAccount: PublicKey,
    pilotXpCategory: PublicKey,
    pilotXpModifier: PublicKey,
    councilRankXpUserAccount: PublicKey,
    councilRankXpCategory: PublicKey,
    councilRankXpModifier: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    input: StopSubwarpInput,
  ): InstructionReturn {
    const remainingAccounts = Fleet.getSubwarpRemainingAccounts(
      program,
      cargoProgram,
      pointsProgram,
      profile,
      fuelTank,
      fuelCargoType,
      cargoStatsDefinition,
      fuelTokenAccount,
      fuelTokenMint,
      pilotXpUserAccount,
      pilotXpCategory,
      pilotXpModifier,
      councilRankXpUserAccount,
      councilRankXpCategory,
      councilRankXpModifier,
      gameId,
    );
    return async () => [
      {
        instruction: await program.methods
          .stopSubwarp(input)
          .accountsStrict({
            gameAccountsFleetAndOwner: {
              gameFleetAndOwner: {
                fleetAndOwner: {
                  fleet,
                  owningProfile: profile,
                  owningProfileFaction: profileFaction,
                  key: key.publicKey(),
                },
                gameId,
              },
              gameState,
            },
          })
          .remainingAccounts(remainingAccounts)
          .instruction(),
        signers: [key],
      },
    ];
  }

  /**
   * Start mining an asteroid
   * @param program - SAGE program
   * @param key - the key authorized to run this instruction
   * @param playerProfile - the profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param fleet - the fleet
   * @param starbase - the Starbase
   * @param starbasePlayer - the Starbase player
   * @param mineItem - the mine item
   * @param resource - the resource
   * @param planet - the planet (Planet Type has to be asteroid)
   * @param gameState - the game state
   * @param gameId - the SAGE game id
   * @param fleetFuelTokenAccount - the fleet's fuel token account
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static startMiningAsteroid(
    program: SageIDLProgram,
    key: AsyncSigner,
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    fleet: PublicKey,
    starbase: PublicKey,
    starbasePlayer: PublicKey,
    mineItem: PublicKey,
    resource: PublicKey,
    planet: PublicKey,
    gameState: PublicKey,
    gameId: PublicKey,
    fleetFuelTokenAccount: PublicKey,
    input: StartMiningAsteroidInput,
  ): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .startMiningAsteroid(input)
          .accountsStrict({
            gameAccountsFleetAndOwner: {
              gameFleetAndOwner: {
                fleetAndOwner: {
                  fleet,
                  owningProfile: playerProfile,
                  owningProfileFaction: profileFaction,
                  key: key.publicKey(),
                },
                gameId,
              },
              gameState,
            },
            starbaseAndStarbasePlayer: {
              starbase,
              starbasePlayer,
            },
            mineItem,
            resource,
            planet,
            fleetFuelTokenAccount,
          })
          .instruction(),
        signers: [key],
      },
    ];
  }

  /**
   * Generic asteroid mining handler
   * @param program - SAGE program
   * @param cargoProgram - cargo program
   * @param fleet - the fleet
   * @param starbase - the Starbase
   * @param mineItem - the mine item
   * @param resource - the resource
   * @param planet - the planet
   * @param cargoHold - the fleet cargo hold cargo pod
   * @param ammoBank - the fleet ammo bank cargo pod
   * @param foodCargoType - the food cargo type
   * @param ammoCargoType - the ammo cargo type
   * @param resourceCargoType - the cargo type for the resource being mined
   * @param cargoStatsDefinition - the cargo stats definition
   * @param gameState - the game state
   * @param gameId - the SAGE game id
   * @param foodTokenFrom - the source token account for food
   * @param ammoTokenFrom - the source token account for ammo
   * @param resourceTokenFrom - the source token account for the resource
   * @param resourceTokenTo - the destination token account for the resource
   * @param foodMint - the food token mint
   * @param ammoMint - the ammo token mint
   * @returns InstructionReturn
   */
  static asteroidMiningHandler(
    program: SageIDLProgram,
    cargoProgram: CargoIDLProgram,
    fleet: PublicKey,
    starbase: PublicKey,
    mineItem: PublicKey,
    resource: PublicKey,
    planet: PublicKey,
    cargoHold: PublicKey,
    ammoBank: PublicKey,
    foodCargoType: PublicKey,
    ammoCargoType: PublicKey,
    resourceCargoType: PublicKey,
    cargoStatsDefinition: PublicKey,
    gameState: PublicKey,
    gameId: PublicKey,
    foodTokenFrom: PublicKey,
    ammoTokenFrom: PublicKey,
    resourceTokenFrom: PublicKey,
    resourceTokenTo: PublicKey,
    foodMint: PublicKey,
    ammoMint: PublicKey,
  ): InstructionReturn {
    return this.fleetStateHandler(program, fleet, [
      { pubkey: cargoHold, isSigner: false, isWritable: true },
      { pubkey: ammoBank, isSigner: false, isWritable: true },
      { pubkey: mineItem, isSigner: false, isWritable: false },
      { pubkey: resource, isSigner: false, isWritable: true },
      { pubkey: planet, isSigner: false, isWritable: true },
      { pubkey: starbase, isSigner: false, isWritable: false },
      { pubkey: foodTokenFrom, isSigner: false, isWritable: true },
      { pubkey: ammoTokenFrom, isSigner: false, isWritable: true },
      { pubkey: resourceTokenFrom, isSigner: false, isWritable: true },
      { pubkey: resourceTokenTo, isSigner: false, isWritable: true },
      { pubkey: foodMint, isSigner: false, isWritable: true },
      { pubkey: ammoMint, isSigner: false, isWritable: true },
      { pubkey: foodCargoType, isSigner: false, isWritable: false },
      { pubkey: ammoCargoType, isSigner: false, isWritable: false },
      { pubkey: resourceCargoType, isSigner: false, isWritable: false },
      {
        pubkey: cargoStatsDefinition,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: gameState, isSigner: false, isWritable: false },
      { pubkey: gameId, isSigner: false, isWritable: false },
      {
        pubkey: cargoProgram.programId,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ]);
  }

  /**
   * Stop mining an asteroid
   * @param program - SAGE program
   * @param cargoProgram - cargo program
   * @param pointsProgram - points program
   * @param key - the key authorized to run this instruction
   * @param playerProfile - the profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param fleet - the fleet
   * @param mineItem - the mine item
   * @param resource - the resource
   * @param planet - the planet
   * @param fuelTank - the fleet's fuel tank cargo pod
   * @param fuelCargoType - the fuel cargo type
   * @param cargoStatsDefinition - the cargo stats definition
   * @param miningXpUserAccount - the user account for Mining XP
   * @param miningXpCategory - the Mining XP Points Category Account
   * @param miningXpModifier - the Mining XP modifier
   * @param pilotXpUserAccount - the user account for Pilot XP
   * @param pilotXpCategory - the Pilot XP Points Category Account
   * @param pilotXpModifier - the Pilot XP modifier
   * @param councilRankXpUserAccount - the user account for Council Rank XP
   * @param councilRankXpCategory - the Council Rank XP Points Category Account
   * @param councilRankXpModifier - the Council Rank XP modifier
   * @param gameState - the game state
   * @param gameId - the SAGE game id
   * @param fuelTokenFrom - the source token account for fuel
   * @param fuelMint - the fuel token mint
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static stopMiningAsteroid(
    program: SageIDLProgram,
    cargoProgram: CargoIDLProgram,
    pointsProgram: PointsIDLProgram,
    key: AsyncSigner,
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    fleet: PublicKey,
    mineItem: PublicKey,
    resource: PublicKey,
    planet: PublicKey,
    fuelTank: PublicKey,
    fuelCargoType: PublicKey,
    cargoStatsDefinition: PublicKey,
    miningXpUserAccount: PublicKey,
    miningXpCategory: PublicKey,
    miningXpModifier: PublicKey,
    pilotXpUserAccount: PublicKey,
    pilotXpCategory: PublicKey,
    pilotXpModifier: PublicKey,
    councilRankXpUserAccount: PublicKey,
    councilRankXpCategory: PublicKey,
    councilRankXpModifier: PublicKey,
    gameState: PublicKey,
    gameId: PublicKey,
    fuelTokenFrom: PublicKey,
    fuelMint: PublicKey,
    input: StopMiningAsteroidInput,
  ): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .stopMiningAsteroid(input)
          .accountsStrict({
            gameAccountsFleetAndOwner: {
              gameFleetAndOwner: {
                fleetAndOwner: {
                  fleet,
                  owningProfile: playerProfile,
                  owningProfileFaction: profileFaction,
                  key: key.publicKey(),
                },
                gameId,
              },
              gameState,
            },
            mineItem,
            resource,
            planet,
            fuelTank,
            cargoType: fuelCargoType,
            cargoStatsDefinition,
            tokenFrom: fuelTokenFrom,
            tokenMint: fuelMint,
            miningXpAccounts: {
              userPointsAccount: miningXpUserAccount,
              pointsCategory: miningXpCategory,
              pointsModifierAccount: miningXpModifier,
            },
            pilotXpAccounts: {
              userPointsAccount: pilotXpUserAccount,
              pointsCategory: pilotXpCategory,
              pointsModifierAccount: pilotXpModifier,
            },
            councilRankXpAccounts: {
              userPointsAccount: councilRankXpUserAccount,
              pointsCategory: councilRankXpCategory,
              pointsModifierAccount: councilRankXpModifier,
            },
            progressionConfig: ProgressionConfig.findAddress(program, gameId)[0],
            cargoProgram: cargoProgram.programId,
            pointsProgram: pointsProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction(),
        signers: [key],
      },
    ];
  }

  /**
   * Get into the `Respawn` state from `MineAsteroid`
   * @param program - SAGE program
   * @param key - the key authorized to run this instruction
   * @param playerProfile - the profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param fleet - the fleet
   * @param resource - the resource
   * @param planet - the planet
   * @param gameState - the game state
   * @param gameId - the SAGE game id
   * @param atlasTokenFrom - ATLAS token account owned by player
   * @param atlasTokenTo - the vault ATLAS token account (as defined in GameState)
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static mineAsteroidToRespawn(
    program: SageIDLProgram,
    key: AsyncSigner,
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    fleet: PublicKey,
    resource: PublicKey,
    planet: PublicKey,
    gameState: PublicKey,
    gameId: PublicKey,
    atlasTokenFrom: PublicKey,
    atlasTokenTo: PublicKey,
    input: MineAsteroidToRespawnInput,
  ): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .mineAsteroidToRespawn(input)
          .accountsStrict({
            gameAccountsFleetAndOwner: {
              gameFleetAndOwner: {
                fleetAndOwner: {
                  fleet,
                  owningProfile: playerProfile,
                  owningProfileFaction: profileFaction,
                  key: key.publicKey(),
                },
                gameId,
              },
              gameState,
            },
            resource,
            planet,
            atlasTokenFrom,
            atlasTokenTo,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction(),
        signers: [key],
      },
    ];
  }

  /**
   * Drops cargo from a `Fleet` that is in the  `Respawn` state
   * @param program - SAGE program
   * @param cargoProgram - cargo program
   * @param fleet - the fleet
   * @param cargoPod - the cargo pod
   * @param cargoType - the cargo type
   * @param cargoStatsDefinition - the cargo stats definition
   * @param gameId - the SAGE game id
   * @param tokenFrom - the source token account
   * @param tokenMint - the token mint
   * @returns InstructionReturn
   */
  static forceDropFleetCargo(
    program: SageIDLProgram,
    cargoProgram: CargoIDLProgram,
    fleet: PublicKey,
    cargoPod: PublicKey,
    cargoType: PublicKey,
    cargoStatsDefinition: PublicKey,
    gameId: PublicKey,
    tokenFrom: PublicKey,
    tokenMint: PublicKey,
  ): InstructionReturn {
    const fleetShips = FleetShips.findAddress(program, fleet);
    return async () => [
      {
        instruction: await program.methods
          .forceDropFleetCargo()
          .accountsStrict({
            fleet,
            fleetShips: fleetShips[0],
            cargoPod,
            cargoType,
            cargoStatsDefinition,
            gameId,
            tokenFrom,
            tokenMint,
            cargoProgram: cargoProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction(),
        signers: [],
      },
    ];
  }

  /**
   * Transition a fleet from `Respawn` to docked
   * @param program - SAGE program
   * @param key - the key authorized to run this instruction
   * @param playerProfile - the profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param fleet - the fleet
   * @param starbase - the Starbase
   * @param starbasePlayer - the Starbase player
   * @param cargoHold - the fleet cargo hold cargo pod
   * @param fuelTank - the fleet's fuel tank cargo pod
   * @param ammoBank - the fleet ammo bank cargo pod
   * @param gameId - the SAGE game id
   * @param gameState - the game state
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static respawnToLoadingBay(
    program: SageIDLProgram,
    key: AsyncSigner,
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    fleet: PublicKey,
    starbase: PublicKey,
    starbasePlayer: PublicKey,
    cargoHold: PublicKey,
    fuelTank: PublicKey,
    ammoBank: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    input: MineAsteroidToRespawnInput,
  ): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .respawnToLoadingBay(input)
          .accountsStrict({
            gameFleetAndOwner: {
              fleetAndOwner: {
                fleet,
                owningProfile: playerProfile,
                owningProfileFaction: profileFaction,
                key: key.publicKey(),
              },
              gameId,
            },
            starbaseAndStarbasePlayer: {
              starbase,
              starbasePlayer,
            },
            cargoHold,
            fuelTank,
            ammoBank,
          })
          .instruction(),
        signers: [key],
      },
    ];
  }

  /**
   * Adds crew to a `Fleet` while docked at a `Starbase`
   * @param program - SAGE program
   * @param key - the key authorized to run this instruction
   * @param playerProfile - the profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param fleet - the fleet
   * @param starbase - the Starbase
   * @param starbasePlayer - the Starbase player
   * @param gameId - the SAGE game id
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static loadFleetCrew(
    program: SageIDLProgram,
    key: AsyncSigner,
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    fleet: PublicKey,
    starbase: PublicKey,
    starbasePlayer: PublicKey,
    gameId: PublicKey,
    input: LoadFleetCrewInput,
  ): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .loadFleetCrew(input)
          .accountsStrict({
            fleetAndOwner: {
              fleet,
              key: key.publicKey(),
              owningProfile: playerProfile,
              owningProfileFaction: profileFaction,
            },
            starbaseAndStarbasePlayer: {
              starbase,
              starbasePlayer,
            },
            gameId,
          })
          .remainingAccounts([
            {
              pubkey: starbase,
              isSigner: false,
              isWritable: false,
            },
          ])
          .instruction(),
        signers: [key],
      },
    ];
  }

  /**
   * Removes crew from a `Fleet` while docked at a `Starbase`
   * @param program - SAGE program
   * @param key - the key authorized to run this instruction
   * @param playerProfile - the profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param fleet - the fleet
   * @param starbase - the Starbase
   * @param starbasePlayer - the Starbase player
   * @param gameId - the SAGE game id
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static unloadFleetCrew(
    program: SageIDLProgram,
    key: AsyncSigner,
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    fleet: PublicKey,
    starbase: PublicKey,
    starbasePlayer: PublicKey,
    gameId: PublicKey,
    input: UnloadFleetCrewInput,
  ): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .unloadFleetCrew(input)
          .accountsStrict({
            fleetAndOwner: {
              fleet,
              key: key.publicKey(),
              owningProfile: playerProfile,
              owningProfileFaction: profileFaction,
            },
            starbaseAndStarbasePlayer: {
              starbase,
              starbasePlayer,
            },
            gameId,
          })
          .remainingAccounts([
            {
              pubkey: starbase,
              isSigner: false,
              isWritable: false,
            },
          ])
          .instruction(),
        signers: [key],
      },
    ];
  }

  /**
   * Add a rental to a fleet. Sets the subprofile invalidator allowing a fleet
   * to be rented out with `changeRental`
   * @param program - SAGE program
   * @param key - the key authorized to run this instruction
   * @param invalidator - the key authorized to manage the fleet's rental
   * @param playerProfile - the profile that owns the fleet
   * @param fleet - the fleet
   * @param gameId - the SAGE game id
   * @param ownerKeyIndex - the index of the `key` in the `playerProfile` permissions
   * @returns InstructionReturn
   */
  static addRental(
    program: SageIDLProgram,
    key: AsyncSigner,
    invalidator: AsyncSigner,
    playerProfile: PublicKey,
    fleet: PublicKey,
    gameId: PublicKey,
    ownerKeyIndex: number,
  ): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .addRental(ownerKeyIndex)
          .accountsStrict({
            ownerKey: key.publicKey(),
            ownerProfile: playerProfile,
            invalidator: invalidator.publicKey(),
            fleet,
            gameId,
          })
          .instruction(),
        signers: [key, invalidator],
      },
    ];
  }

  /**
   * Change fleet rental - change the profile that is renting out a fleet
   * @param program - SAGE program
   * @param profileFactionProgram - Profile Faction program
   * @param invalidator - the key authorized to manage the fleet's rental
   * @param newSubProfile - the new profile that is renting the fleet
   * @param fleet - the fleet
   * @param gameId - the SAGE game id
   * @returns InstructionReturn
   */
  static changeRental(
    program: SageIDLProgram,
    profileFactionProgram: ProfileFactionIDLProgram,
    invalidator: AsyncSigner,
    newSubProfile: PublicKey,
    fleet: PublicKey,
    gameId: PublicKey,
  ): InstructionReturn {
    const subProfileFaction = ProfileFactionAccount.findAddress(profileFactionProgram, newSubProfile)[0];
    return async () => [
      {
        instruction: await program.methods
          .changeRental()
          .accountsStrict({
            subProfileInvalidator: invalidator.publicKey(),
            newSubProfile,
            subProfileFaction,
            fleet,
            gameId,
          })
          .instruction(),
        signers: [invalidator],
      },
    ];
  }

  /**
   * Invalidate the fleet rental. If `removeInvalidator` is false, the sub profile will be reset and the fleet is
   * available to be rented again immediately. If `removeInvalidator` is true, this resets rented crew, sub profile,
   * and the invalidator, returning the fleet to the owner's control
   * @param program - SAGE program
   * @param invalidator - the key authorized to manage the fleet's rental
   * @param fleet - the fleet
   * @param removeInvalidator - Boolean representing whether or not to remove the subprofile invalidator from the fleet
   * @param gameId - the SAGE game id; Only required if the fleet crew count is greater than number of rented crew
   * @param starbase - the starbase tied to the `starbasePlayer` (must be a central space station); Only required if the fleet crew count is greater than number of rented crew
   * @param starbasePlayer - the starbase player account belonging to the fleet sub-profile (renter); Only required if the fleet crew count is greater than number of rented crew
   * @returns InstructionReturn
   */
  static invalidateRental(
    program: SageIDLProgram,
    invalidator: AsyncSigner,
    fleet: PublicKey,
    removeInvalidator: boolean,
    gameId?: PublicKey,
    starbase?: PublicKey,
    starbasePlayer?: PublicKey,
  ): InstructionReturn {
    const remainingAccounts =
      gameId && starbase && starbasePlayer
        ? [
            {
              pubkey: gameId,
              isSigner: false,
              isWritable: false,
            },
            {
              pubkey: starbase,
              isSigner: false,
              isWritable: false,
            },
            {
              pubkey: starbasePlayer,
              isSigner: false,
              isWritable: true,
            },
          ]
        : [];

    return async () => [
      {
        instruction: await program.methods
          .invalidateRental(removeInvalidator)
          .accountsStrict({
            subProfileInvalidator: invalidator.publicKey(),
            fleet,
          })
          .remainingAccounts(remainingAccounts)
          .instruction(),
        signers: [invalidator],
      },
    ];
  }

  // Helper function to generate cargo hold accounts
  static addCargoHoldAccounts(fleetCargoHold: PublicKey, seeds: number[], program: CargoIDLProgram): AccountMeta[] {
    const [newCargoHold] = CargoPod.findAddress(program, Buffer.from(seeds));
    return [
      {
        pubkey: fleetCargoHold,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: newCargoHold,
        isSigner: false,
        isWritable: true,
      },
    ];
  }

  static getLootPodSeeds(loot: PublicKey) {
    const base = Array.from(loot.toBuffer());
    const seed0 = [...base];
    const seed1 = [...base];
    seed0[31] = 0;
    seed1[31] = 1;
    return [seed0, seed1];
  }

  /**
   * Attack a fleet
   * @param program - SAGE program
   * @param cargoProgram - cargo program
   * @param pointsProgram - points program
   * @param key - the key authorized to run this instruction
   * @param profile - the player's profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param attackingFleet - the attacking fleet
   * @param defendingFleet - the defending fleet
   * @param attackingFleetAmmoBank - the attacking fleet's ammo bank
   * @param defendingFleetAmmoBank - the defending fleet's ammo bank
   * @param attackingFleetCargoHold - the attacking fleet's cargo hold
   * @param defendingFleetCargoHold - the defending fleet's cargo hold
   * @param attackingFleetAmmoToken - the attacking fleet's ammo token account; owned by `attackingFleetAmmoBank`
   * @param defendingFleetAmmoToken - the defending fleet's ammo token account; owned by `defendingFleetAmmoBank`
   * @param cargoType - the ammo cargo type
   * @param cargoStatsDefinition - the cargo stats definition
   * @param ammoMint - the ammo token mint
   * @param attackerCombatXpUserAccount - the attacker account for Combat XP
   * @param attackerCouncilRankXpUserAccount - the attacker account for Council Rank XP
   * @param defenderCombatXpUserAccount - the defender account for Combat XP
   * @param defenderCouncilRankXpUserAccount - the defender account for Council Rank XP
   * @param combatXpCategory - the Combat XP Points Category Account
   * @param combatXpModifier - the Combat XP modifier
   * @param councilRankXpCategory - the Council Rank XP Points Category Account
   * @param councilRankXpModifier - the Council Rank XP modifier
   * @param sector - the sector of the location of both fleets
   * @param gameId - the SAGE game id
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static attackFleet(
    program: SageIDLProgram,
    cargoProgram: CargoIDLProgram,
    pointsProgram: PointsIDLProgram,
    key: AsyncSigner,
    profile: PublicKey,
    profileFaction: PublicKey,
    attackingFleet: PublicKey,
    defendingFleet: PublicKey,
    attackingFleetAmmoBank: PublicKey,
    defendingFleetAmmoBank: PublicKey,
    attackingFleetCargoHold: PublicKey,
    defendingFleetCargoHold: PublicKey,
    attackingFleetAmmoToken: PublicKey,
    defendingFleetAmmoToken: PublicKey,
    cargoType: PublicKey,
    cargoStatsDefinition: PublicKey,
    ammoMint: PublicKey,
    attackerCombatXpUserAccount: PublicKey,
    attackerCouncilRankXpUserAccount: PublicKey,
    defenderCombatXpUserAccount: PublicKey,
    defenderCouncilRankXpUserAccount: PublicKey,
    combatXpCategory: PublicKey,
    combatXpModifier: PublicKey,
    councilRankXpCategory: PublicKey,
    councilRankXpModifier: PublicKey,
    sector: PublicKey,
    gameId: PublicKey,
    input: AttackFleetInput,
  ): {
    instructions: InstructionReturn;
    lootAccountKey: PublicKey | undefined;
  } {
    const signers = [key];
    const remainingAccounts: AccountMeta[] = [
      { pubkey: cargoProgram.programId, isSigner: false, isWritable: false },
      { pubkey: pointsProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      {
        pubkey: SYSVAR_INSTRUCTIONS_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: SYSVAR_SLOT_HASHES_PUBKEY, isSigner: false, isWritable: false },
    ];
    // Add asteroid account if provided
    if (input.asteroid) {
      remainingAccounts.push({
        pubkey: input.asteroid,
        isSigner: false,
        isWritable: false,
      });
    }
    const lootAccount = Keypair.generate();
    let lootAccountKey = input.anyFleetDies ? lootAccount.publicKey : undefined;

    return {
      instructions: async (funder: AsyncSigner) => {
        // Handle loot account if either attacker or defender dies
        if (input.anyFleetDies) {
          lootAccountKey = lootAccount.publicKey;
          signers.push(keypairToAsyncSigner(lootAccount));
          signers.push(funder);
          remainingAccounts.push(
            {
              pubkey: lootAccount.publicKey,
              isSigner: true,
              isWritable: true,
            },
            {
              pubkey: sector,
              isSigner: false,
              isWritable: false,
            },
            {
              pubkey: SystemProgram.programId,
              isSigner: false,
              isWritable: false,
            },
            {
              pubkey: funder.publicKey(),
              isSigner: true,
              isWritable: true,
            },
          );
          const lootPodSeeds = Fleet.getLootPodSeeds(lootAccount.publicKey);
          // Add cargo hold accounts for attacker if they die
          remainingAccounts.push(...Fleet.addCargoHoldAccounts(attackingFleetCargoHold, lootPodSeeds[0], cargoProgram));
          // Add cargo hold accounts for defender if they die
          remainingAccounts.push(...Fleet.addCargoHoldAccounts(defendingFleetCargoHold, lootPodSeeds[1], cargoProgram));
        }
        return [
          {
            instruction: await program.methods
              .attackFleet({
                keyIndex: input.keyIndex,
              })
              .accountsStrict({
                gameAndFleetAndOwner: {
                  fleetAndOwner: {
                    fleet: attackingFleet,
                    owningProfile: profile,
                    owningProfileFaction: profileFaction,
                    key: key.publicKey(),
                  },
                  gameId,
                },
                defendingFleet,
                attackingCargoPod: attackingFleetAmmoBank,
                defendingCargoPod: defendingFleetAmmoBank,
                cargoType,
                cargoStatsDefinition,
                attackingFleetAmmoToken,
                defendingFleetAmmoToken,
                tokenMint: ammoMint,
                attackerCombatXp: attackerCombatXpUserAccount,
                attackerCouncilRankXp: attackerCouncilRankXpUserAccount,
                defenderCombatXp: defenderCombatXpUserAccount,
                defenderCouncilRankXp: defenderCouncilRankXpUserAccount,
                combatXpCategory,
                combatXpModifier,
                councilRankXpCategory,
                councilRankXpModifier,
                progressionConfig: ProgressionConfig.findAddress(program, gameId)[0],
                combatConfig: CombatConfig.findAddress(program, gameId)[0],
              })
              .remainingAccounts(remainingAccounts)
              .instruction(),
            signers,
          },
        ];
      },
      lootAccountKey,
    };
  }

  /**
   * Attack a starbase
   * @param program - SAGE program
   * @param cargoProgram - cargo program
   * @param pointsProgram - points program
   * @param key - the key authorized to run this instruction
   * @param profile - the player's profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param attackingFleet - the attacking fleet
   * @param starbase - the starbase being attacked
   * @param attackingFleetAmmoBank - the attacking fleet's ammo bank
   * @param attackingFleetAmmoToken - the attacking fleet's ammo token account; owned by `attackingFleetAmmoBank`
   * @param cargoType - the ammo cargo type
   * @param cargoStatsDefinition - the cargo stats definition
   * @param ammoMint - the ammo token mint
   * @param attackerCombatXpUserAccount - the attacker account for Combat XP
   * @param attackerCouncilRankXpUserAccount - the attacker account for Council Rank XP
   * @param combatXpCategory - the Combat XP Points Category Account
   * @param combatXpModifier - the Combat XP modifier
   * @param councilRankXpCategory - the Council Rank XP Points Category Account
   * @param councilRankXpModifier - the Council Rank XP modifier
   * @param sector - the sector of the starbase
   * @param gameId - the SAGE game id
   * @param gameState - the game state account
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static attackStarbase(
    program: SageIDLProgram,
    cargoProgram: CargoIDLProgram,
    pointsProgram: PointsIDLProgram,
    key: AsyncSigner,
    profile: PublicKey,
    profileFaction: PublicKey,
    attackingFleet: PublicKey,
    starbase: PublicKey,
    attackingFleetAmmoBank: PublicKey,
    attackingFleetAmmoToken: PublicKey,
    cargoType: PublicKey,
    cargoStatsDefinition: PublicKey,
    ammoMint: PublicKey,
    attackerCombatXpUserAccount: PublicKey,
    attackerCouncilRankXpUserAccount: PublicKey,
    combatXpCategory: PublicKey,
    combatXpModifier: PublicKey,
    councilRankXpCategory: PublicKey,
    councilRankXpModifier: PublicKey,
    sector: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    input: AttackStarbaseInput,
  ): InstructionReturn {
    const signers = [key];
    const remainingAccounts: AccountMeta[] = [
      { pubkey: cargoProgram.programId, isSigner: false, isWritable: false },
      { pubkey: pointsProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: gameState, isSigner: false, isWritable: false },
    ];

    return async () => [
      {
        instruction: await program.methods
          .attackStarbase({
            keyIndex: input.keyIndex,
          })
          .accounts({
            gameAndFleetAndOwner: {
              fleetAndOwner: {
                fleet: attackingFleet,
                owningProfile: profile,
                owningProfileFaction: profileFaction,
                key: key.publicKey(),
              },
              gameId,
            },
            combatConfig: CombatConfig.findAddress(program, gameId)[0],
            starbase,
            attackingCargoPod: attackingFleetAmmoBank,
            attackingFleetAmmoBank,
            attackingFleetAmmoToken,
            cargoType,
            cargoStatsDefinition,
            tokenMint: ammoMint,
            progressionConfig: ProgressionConfig.findAddress(program, gameId)[0],
            attackerCombatXp: attackerCombatXpUserAccount,
            attackerCouncilRankXp: attackerCouncilRankXpUserAccount,
            combatXpCategory,
            combatXpModifier,
            councilRankXpCategory,
            councilRankXpModifier,
            sector,
            systemProgram: SystemProgram.programId,
          })
          .remainingAccounts(remainingAccounts)
          .instruction(),
        signers,
      },
    ];
  }

  // /**
  //  * Repair a starbase using toolkits from the fleet's cargo hold
  //  * @param program - SAGE program
  //  * @param cargoProgram - cargo program
  //  * @param key - the key authorized to run this instruction
  //  * @param owningProfile - the profile that owns the fleet
  //  * @param owningProfileFaction - the faction that the profile belongs to
  //  * @param fleet - the fleet providing toolkits for repair
  //  * @param starbase - the starbase being repaired
  //  * @param sagePlayerProfile - the SAGE player profile
  //  * @param profileFaction - the profile's faction
  //  * @param cargoHold - the fleet's cargo hold containing toolkits
  //  * @param tokenFrom - the fleet's toolkit token account
  //  * @param cargoType - the toolkit cargo type
  //  * @param statsDefinition - the cargo stats definition
  //  * @param toolkitMint - the toolkit token mint
  //  * @param gameId - the SAGE game id
  //  * @param gameState - the game state account
  //  * @param input - the instruction input params
  //  * @returns InstructionReturn
  //  */
  // static repairStarbase(
  //   program: SageIDLProgram,
  //   cargoProgram: CargoIDLProgram,
  //   key: AsyncSigner,
  //   owningProfile: PublicKey,
  //   owningProfileFaction: PublicKey,
  //   fleet: PublicKey,
  //   starbase: PublicKey,
  //   sagePlayerProfile: PublicKey,
  //   profileFaction: PublicKey,
  //   cargoHold: PublicKey,
  //   tokenFrom: PublicKey,
  //   cargoType: PublicKey,
  //   statsDefinition: PublicKey,
  //   toolkitMint: PublicKey,
  //   gameId: PublicKey,
  //   gameState: PublicKey,
  //   input: RepairStarbaseInput,
  // ): InstructionReturn {
  //   const signers = [key];

  //   return async () => [
  //     {
  //       instruction: await program.methods
  //         .repairStarbase({
  //           keyIndex: input.keyIndex,
  //           toolkitAmount: input.toolkitAmount,
  //         })
  //         .accountsStrict({
  //           gameAndFleetAndOwner: {
  //             fleetAndOwner: {
  //               key: key.publicKey(),
  //               owningProfile,
  //               owningProfileFaction,
  //               fleet,
  //             },
  //             gameId,
  //           },
  //           gameState,
  //           sagePlayerProfile,
  //           profileFaction,
  //           starbase,
  //           cargoHold,
  //           tokenFrom,
  //           cargoType,
  //           statsDefinition,
  //           tokenMint: toolkitMint,
  //           cargoProgram: cargoProgram.programId,
  //           tokenProgram: TOKEN_PROGRAM_ID,
  //         })
  //         .instruction(),
  //       signers,
  //     },
  //   ];
  // }

  // /**
  //  * Reloads ability power (AP) for a `Fleet`
  //  * @param program - SAGE program
  //  * @param key - the key authorized to run this instruction
  //  * @param playerProfile - the profile with the required permissions for the instruction
  //  * @param profileFaction - the profile's faction
  //  * @param fleet - the fleet
  //  * @param gameId - the SAGE game id
  //  * @param input - the instruction input params
  //  * @returns InstructionReturn
  //  */
  // static reloadFleetAbilityPower(
  //   program: SageIDLProgram,
  //   key: AsyncSigner,
  //   playerProfile: PublicKey,
  //   profileFaction: PublicKey,
  //   fleet: PublicKey,
  //   gameId: PublicKey,
  //   input: ReloadFleetAbilityPowerInput,
  // ): InstructionReturn {
  //   return async () => [
  //     {
  //       instruction: await program.methods
  //         .reloadFleetAbilityPower(input)
  //         .accountsStrict({
  //           gameAndFleetAndOwner: {
  //             fleetAndOwner: {
  //               fleet,
  //               owningProfile: playerProfile,
  //               owningProfileFaction: profileFaction,
  //               key: key.publicKey(),
  //             },
  //             gameId,
  //           },
  //         })
  //         .instruction(),
  //       signers: [key],
  //     },
  //   ];
  // }

  /**
   * Repairs a `Fleet` that is idle
   * @param program - SAGE program
   * @param cargoProgram - cargo program
   * @param key - the key authorized to run this instruction
   * @param playerProfile - the profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param fleetA - the fleet initiating the repairs
   * @param fleetB - the fleet being repaired
   * @param cargoHold - the fleet's cargo hold
   * @param cargoType - the repair kit cargo type
   * @param statsDefinition - the cargo stats definition
   * @param tokenFrom - the source token account, owned by `cargoHold`
   * @param tokenMint - the token mint for repair kits
   * @param gameId - the SAGE game id
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static repairIdleFleet(
    program: SageIDLProgram,
    cargoProgram: CargoIDLProgram,
    key: AsyncSigner,
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    fleetA: PublicKey,
    fleetB: PublicKey,
    cargoHold: PublicKey,
    cargoType: PublicKey,
    statsDefinition: PublicKey,
    tokenFrom: PublicKey,
    tokenMint: PublicKey,
    gameId: PublicKey,
    input: RepairIdleFleetInput,
  ): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .repairIdleFleet({
            ...input,
            amount: input.amount ?? null,
          })
          .accountsStrict({
            gameAndFleetAndOwner: {
              fleetAndOwner: {
                fleet: fleetA,
                owningProfile: playerProfile,
                owningProfileFaction: profileFaction,
                key: key.publicKey(),
              },
              gameId,
            },
            repairedFleet: fleetB,
            cargoHold,
            cargoType,
            statsDefinition,
            tokenFrom,
            tokenMint,
            cargoProgram: cargoProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction(),
        signers: [key],
      },
    ];
  }

  /**
   * Repairs a `Fleet` that is docked at a `Starbase`
   * @param program - SAGE program
   * @param cargoProgram - cargo program
   * @param key - the key authorized to run this instruction
   * @param playerProfile - the profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param starbase - the Starbase
   * @param starbasePlayer - the Starbase player
   * @param fleet - the fleet
   * @param cargoPodFrom - the source cargo pod, owned by `starbasePlayer`
   * @param cargoType - the repair kit cargo type
   * @param cargoStatsDefinition - the cargo stats definition
   * @param tokenFrom - the source token account, owned by `cargoPodFrom`
   * @param tokenMint - the repair kit token mint
   * @param feeTokenFrom - the source token account for the fee
   * @param feeTokenTo - the destination token account for the fee
   * @param feeMint - the fee token mint
   * @param gameId - the SAGE game id
   * @param gameState - the game state
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static repairDockedFleet(
    program: SageIDLProgram,
    cargoProgram: CargoIDLProgram,
    key: AsyncSigner,
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    starbase: PublicKey,
    starbasePlayer: PublicKey,
    fleet: PublicKey,
    cargoPodFrom: PublicKey,
    cargoType: PublicKey,
    cargoStatsDefinition: PublicKey,
    tokenFrom: PublicKey,
    tokenMint: PublicKey,
    feeTokenFrom: PublicKey,
    feeTokenTo: PublicKey,
    feeMint: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    input: RepairDockedFleetInput,
  ): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .repairDockedFleet({
            ...input,
            amount: input.amount ?? null,
          })
          .accountsStrict({
            gameAccountsFleetAndOwner: {
              gameFleetAndOwner: {
                fleetAndOwner: {
                  fleet,
                  owningProfile: playerProfile,
                  owningProfileFaction: profileFaction,
                  key: key.publicKey(),
                },
                gameId,
              },
              gameState,
            },
            starbaseAndStarbasePlayer: {
              starbase,
              starbasePlayer,
            },
            cargoPodFrom,
            cargoType,
            cargoStatsDefinition,
            tokenFrom,
            tokenMint,
            feeTokenFrom,
            feeTokenTo,
            feeMint,
            cargoProgram: cargoProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .remainingAccounts([
            {
              pubkey: starbase,
              isSigner: false,
              isWritable: false,
            },
          ])
          .instruction(),
        signers: [key],
      },
    ];
  }

  /**
   * Repairs a `Starbase` using toolkits from a `Fleet`'s cargo hold
   * @param program - SAGE program
   * @param cargoProgram - cargo program
   * @param key - the key authorized to run this instruction
   * @param playerProfile - the profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param fleet - the fleet providing toolkits
   * @param starbase - the Starbase being repaired
   * @param sagePlayerProfile - the SAGE player profile
   * @param fleetProfileFaction - the profile's faction account
   * @param cargoHold - the fleet's cargo hold
   * @param tokenFrom - the fleet's toolkit token account, owned by `cargoHold`
   * @param cargoType - the toolkit cargo type
   * @param statsDefinition - the cargo stats definition
   * @param tokenMint - the toolkit token mint
   * @param gameId - the SAGE game id
   * @param gameState - the game state account
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static repairStarbase(
    program: SageIDLProgram,
    cargoProgram: CargoIDLProgram,
    key: AsyncSigner,
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    fleet: PublicKey,
    starbase: PublicKey,
    sagePlayerProfile: PublicKey,
    fleetProfileFaction: PublicKey,
    cargoHold: PublicKey,
    tokenFrom: PublicKey,
    cargoType: PublicKey,
    statsDefinition: PublicKey,
    tokenMint: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    input: RepairStarbaseInput,
  ): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .repairStarbase(input)
          .accountsStrict({
            gameAndFleetAndOwner: {
              fleetAndOwner: {
                fleet,
                owningProfile: playerProfile,
                owningProfileFaction: profileFaction,
                key: key.publicKey(),
              },
              gameId,
            },
            gameState,
            sagePlayerProfile,
            profileFaction: fleetProfileFaction,
            starbase,
            cargoHold,
            tokenFrom,
            cargoType,
            statsDefinition,
            tokenMint,
            cargoProgram: cargoProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction(),
        signers: [key],
      },
    ];
  }

  /**
   * Retrieve loot
   * @param program - SAGE program
   * @param cargoProgram - cargo program
   * @param key - the key authorized to run this instruction
   * @param profile - the player's profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param fleet - the fleet
   * @param loot - the loot account
   * @param cargoHold - the fleet's cargo hold
   * @param lootCargoPod - the loot account's cargo hold
   * @param cargoStatsDefinition - the cargo stats definition
   * @param sector - the sector of the location of both fleets
   * @param gameId - the SAGE game id
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static retrieveLoot(
    program: SageIDLProgram,
    cargoProgram: CargoIDLProgram,
    key: AsyncSigner,
    profile: PublicKey,
    profileFaction: PublicKey,
    fleet: PublicKey,
    loot: PublicKey,
    cargoHold: PublicKey,
    lootCargoPod: PublicKey,
    cargoStatsDefinition: PublicKey,
    sector: PublicKey,
    gameId: PublicKey,
    input: RetrieveLootInput,
  ): InstructionReturn {
    const signers = [key];
    const remainingAccounts: AccountMeta[] = [
      {
        pubkey: lootCargoPod,
        isSigner: false,
        isWritable: !lootCargoPod.equals(PublicKey.default),
      },
    ];

    for (let index = 0; index < input.lootRetrieval.length; index++) {
      const element = input.lootRetrieval[index];
      remainingAccounts.push(
        {
          pubkey: element.cargoType,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: element.tokenFrom,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: element.tokenTo,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: element.tokenMint,
          isSigner: false,
          isWritable: true,
        },
      );
    }

    return async (funder) => {
      remainingAccounts.push({
        pubkey: SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      });
      if (input.fundsTo) {
        remainingAccounts.push({
          pubkey: input.fundsTo === "funder" ? funder.publicKey() : input.fundsTo,
          isSigner: false,
          isWritable: true,
        });
      }
      return [
        {
          instruction: await program.methods
            .retrieveLoot({
              keyIndex: input.keyIndex,
            })
            .accountsStrict({
              gameAndFleetAndOwner: {
                fleetAndOwner: {
                  fleet,
                  owningProfile: profile,
                  owningProfileFaction: profileFaction,
                  key: key.publicKey(),
                },
                gameId,
              },
              sector,
              loot,
              cargoHold,
              cargoStatsDefinition,
              cargoProgram: cargoProgram.programId,
              tokenProgram: TOKEN_PROGRAM_ID,
            })
            .remainingAccounts(remainingAccounts)
            .instruction(),
          signers,
        },
      ];
    };
  }

  static decodeData(account: KeyedAccountInfo, program: SageIDLProgram): DecodedAccountData<Fleet> {
    return decodeAccountWithRemaining(account, program, Fleet, (remainingData, _data) => {
      const discriminator = remainingData[0];
      let remaining: FleetStateData;
      switch (discriminator) {
        case 0: {
          remaining = {
            StarbaseLoadingBay: program.coder.types.decode<StarbaseLoadingBay>("StarbaseLoadingBay", remainingData.subarray(1)),
          };
          break;
        }
        case 1: {
          remaining = {
            Idle: program.coder.types.decode<Idle>("Idle", remainingData.subarray(1)),
          };
          break;
        }
        case 2: {
          remaining = {
            MineAsteroid: program.coder.types.decode<MineAsteroid>("MineAsteroid", remainingData.subarray(1)),
          };
          break;
        }
        case 3: {
          remaining = {
            MoveWarp: program.coder.types.decode<MoveWarp>("MoveWarp", remainingData.subarray(1)),
          };
          break;
        }
        case 4: {
          remaining = {
            MoveSubwarp: program.coder.types.decode<MoveSubwarp>("MoveSubwarp", remainingData.subarray(1)),
          };
          break;
        }
        case 5: {
          remaining = {
            Respawn: program.coder.types.decode<Respawn>("Respawn", remainingData.subarray(1)),
          };
          break;
        }
        default:
          throw new Error("Unknown fleet state: " + discriminator);
      }
      return remaining;
    });
  }

  /**
   * Calculate combined fleet stats
   * @param currentFleetStats - previous fleet stats
   * @param shipStats - ship stats
   * @param shipAmount - the number of ships
   * @returns ShipStats
   */
  static calculateCombinedStats(currentFleetStats: ShipStats, shipStats: ShipStats, shipAmount: number): ShipStats {
    const newShipStats = currentFleetStats;

    newShipStats.cargoStats = Fleet.calculateCombinedCargoStats(currentFleetStats.cargoStats, this.multiplyCargoStats(shipStats.cargoStats, shipAmount));
    newShipStats.combatStats = Fleet.calculateCombinedCombatStats(currentFleetStats.combatStats, this.multiplyCombatStats(shipStats.combatStats, shipAmount));
    newShipStats.miscStats = Fleet.calculateCombinedMiscStats(currentFleetStats.miscStats, this.multiplyMiscStats(shipStats.miscStats, shipAmount));
    newShipStats.movementStats = Fleet.calculateCombinedMovementStats(
      currentFleetStats.movementStats,
      this.multiplyMovementStats(shipStats.movementStats, shipAmount),
    );

    return newShipStats;
  }

  /**
   * Multiply combined fleet stats
   * @param shipStats - ship stats
   * @param shipAmount - the number of ships
   * @returns ShipStats
   */
  static multiplyShipStats(shipStats: ShipStats, shipAmount: number): ShipStats {
    const newShipStats = shipStats;

    newShipStats.cargoStats = Fleet.multiplyCargoStats(shipStats.cargoStats, shipAmount);
    newShipStats.combatStats = Fleet.multiplyCombatStats(shipStats.combatStats, shipAmount);
    newShipStats.miscStats = Fleet.multiplyMiscStats(shipStats.miscStats, shipAmount);
    newShipStats.movementStats = Fleet.multiplyMovementStats(shipStats.movementStats, shipAmount);

    return newShipStats;
  }

  /**
   * Calculate Combined Cargo Stats
   * @param fleetStats - current fleet CargoStats
   * @param shipStats - ship CargoStats
   * @returns CargoStats
   */
  static calculateCombinedCargoStats(fleetStats: CargoStats, shipStats: CargoStats): CargoStats {
    return {
      cargoCapacity: Math.min(MAX_CARGO_CAPACITY, fleetStats.cargoCapacity + shipStats.cargoCapacity),
      fuelCapacity: Math.min(MAX_CARGO_CAPACITY, fleetStats.fuelCapacity + shipStats.fuelCapacity),
      ammoCapacity: Math.min(MAX_CARGO_CAPACITY, fleetStats.ammoCapacity + shipStats.ammoCapacity),
      ammoConsumptionRate: Math.min(MAX_CONSUMPTION_CAPACITY, fleetStats.ammoConsumptionRate + shipStats.ammoConsumptionRate),
      foodConsumptionRate: Math.min(MAX_CONSUMPTION_CAPACITY, fleetStats.foodConsumptionRate + shipStats.foodConsumptionRate),
      miningRate: Math.min(MAX_CONSUMPTION_CAPACITY, fleetStats.miningRate + shipStats.miningRate),
      upgradeRate: Math.min(MAX_CONSUMPTION_CAPACITY, fleetStats.upgradeRate + shipStats.upgradeRate),
      cargoTransferRate: Math.min(MAX_CONSUMPTION_CAPACITY, fleetStats.cargoTransferRate + shipStats.cargoTransferRate),
      tractorBeamGatherRate: Math.min(MAX_CONSUMPTION_CAPACITY, fleetStats.tractorBeamGatherRate + shipStats.tractorBeamGatherRate),
    };
  }

  /**
   * Multiply Cargo Stats
   * @param shipStats - ship CargoStats
   * @param shipAmount - the number of ships
   * @returns CargoStats
   */
  static multiplyCargoStats(shipStats: CargoStats, shipAmount: number): CargoStats {
    return {
      cargoCapacity: Math.min(MAX_CARGO_CAPACITY, shipAmount * shipStats.cargoCapacity),
      fuelCapacity: Math.min(MAX_CARGO_CAPACITY, shipAmount * shipStats.fuelCapacity),
      ammoCapacity: Math.min(MAX_CARGO_CAPACITY, shipAmount * shipStats.ammoCapacity),
      ammoConsumptionRate: Math.min(MAX_CONSUMPTION_CAPACITY, shipAmount * shipStats.ammoConsumptionRate),
      foodConsumptionRate: Math.min(MAX_CONSUMPTION_CAPACITY, shipAmount * shipStats.foodConsumptionRate),
      miningRate: Math.min(MAX_CONSUMPTION_CAPACITY, shipAmount * shipStats.miningRate),
      upgradeRate: Math.min(MAX_CONSUMPTION_CAPACITY, shipAmount * shipStats.upgradeRate),
      cargoTransferRate: Math.min(MAX_CONSUMPTION_CAPACITY, shipAmount * shipStats.cargoTransferRate),
      tractorBeamGatherRate: Math.min(MAX_CONSUMPTION_CAPACITY, shipAmount * shipStats.tractorBeamGatherRate),
    };
  }

  /**
   * Calculate Combined Misc Stats
   * @param fleetStats - current fleet MiscStats
   * @param shipStats - ship MiscStats
   * @returns MiscStats
   */
  static calculateCombinedMiscStats(fleetStats: MiscStats, shipStats: MiscStats): MiscStats {
    return {
      requiredCrew: fleetStats.requiredCrew + shipStats.requiredCrew,
      passengerCapacity: fleetStats.passengerCapacity + shipStats.passengerCapacity,
      crewCount: fleetStats.crewCount + shipStats.crewCount,
      rentedCrew: fleetStats.rentedCrew + shipStats.rentedCrew,
      respawnTime: Math.max(fleetStats.respawnTime, shipStats.respawnTime),
      scanCoolDown: Math.max(fleetStats.scanCoolDown, shipStats.scanCoolDown),
      sduPerScan: fleetStats.sduPerScan + shipStats.sduPerScan,
      scanCost: Math.min(MAX_CONSUMPTION_CAPACITY, fleetStats.scanCost + shipStats.scanCost),
      placeholder: 0,
      placeholder2: 0,
      placeholder3: 0,
    };
  }

  /**
   * Multiply Misc Stats
   * @param miscStats - ship MiscStats
   * @param shipAmount - the number of ships
   * @returns MiscStats
   */
  static multiplyMiscStats(miscStats: MiscStats, shipAmount: number): MiscStats {
    return {
      requiredCrew: miscStats.requiredCrew * shipAmount,
      passengerCapacity: miscStats.passengerCapacity * shipAmount,
      crewCount: miscStats.crewCount * shipAmount,
      rentedCrew: miscStats.rentedCrew * shipAmount,
      respawnTime: miscStats.respawnTime,
      scanCoolDown: miscStats.scanCoolDown,
      sduPerScan: miscStats.sduPerScan * shipAmount,
      scanCost: Math.min(MAX_CONSUMPTION_CAPACITY, shipAmount * miscStats.scanCost),
      placeholder: 0,
      placeholder2: 0,
      placeholder3: 0,
    };
  }

  /**
   * Calculate Combined Movement Stats
   * @param fleetStats - current fleet MovementStats
   * @param shipStats - ship MovementStats
   * @returns MovementStats
   */
  static calculateCombinedMovementStats(fleetStats: MovementStats, shipStats: MovementStats): MovementStats {
    return {
      subwarpSpeed: Math.min(fleetStats.subwarpSpeed, shipStats.subwarpSpeed),
      warpSpeed: Math.min(fleetStats.warpSpeed, shipStats.warpSpeed),
      maxWarpDistance: Math.min(MAX_WARP_DISTANCE, Math.max(MIN_WARP_DISTANCE, Math.max(fleetStats.maxWarpDistance, shipStats.maxWarpDistance))),
      warpCoolDown: Math.max(fleetStats.warpCoolDown, shipStats.warpCoolDown),
      subwarpFuelConsumptionRate: Math.min(MAX_CONSUMPTION_CAPACITY, fleetStats.subwarpFuelConsumptionRate + shipStats.subwarpFuelConsumptionRate),
      warpFuelConsumptionRate: Math.min(MAX_CONSUMPTION_CAPACITY, fleetStats.warpFuelConsumptionRate + shipStats.warpFuelConsumptionRate),
      planetExitFuelAmount: Math.min(MAX_CONSUMPTION_CAPACITY, fleetStats.planetExitFuelAmount + shipStats.planetExitFuelAmount),
    };
  }

  /**
   * Multiply Movement Stats
   * @param shipStats - ship MovementStats
   * @param shipAmount - the number of ships
   * @returns MovementStats
   */
  static multiplyMovementStats(shipStats: MovementStats, shipAmount: number): MovementStats {
    return {
      subwarpSpeed: shipStats.subwarpSpeed,
      warpSpeed: shipStats.warpSpeed,
      maxWarpDistance: Math.min(MAX_WARP_DISTANCE, Math.max(MIN_WARP_DISTANCE, shipStats.maxWarpDistance)),
      warpCoolDown: shipStats.warpCoolDown,
      subwarpFuelConsumptionRate: Math.min(MAX_CONSUMPTION_CAPACITY, shipAmount * shipStats.subwarpFuelConsumptionRate),
      warpFuelConsumptionRate: Math.min(MAX_CONSUMPTION_CAPACITY, shipAmount * shipStats.warpFuelConsumptionRate),
      planetExitFuelAmount: Math.min(MAX_CONSUMPTION_CAPACITY, shipAmount * shipStats.planetExitFuelAmount),
    };
  }

  /**
   * Calculate Combined Combat Stats
   * @param fleetStats - current fleet CombatStats
   * @param shipStats - ship CombatStats
   * @returns CombatStats
   */
  static calculateCombinedCombatStats(fleetStats: CombatStats, shipStats: CombatStats): CombatStats {
    return {
      ap: Math.min(MAX_AP, fleetStats.ap + shipStats.ap),
      sp: Math.min(MAX_HIT_POINTS, fleetStats.sp + shipStats.sp),
      hp: Math.min(MAX_HIT_POINTS, fleetStats.hp + shipStats.hp),
      ammoConsumptionRate: Math.min(MAX_CONSUMPTION_CAPACITY, fleetStats.ammoConsumptionRate + shipStats.ammoConsumptionRate),
      apRegenRate: Math.min(MAX_CONSUMPTION_CAPACITY, fleetStats.apRegenRate + shipStats.apRegenRate),
      shieldRechargeRate: Math.min(MAX_CONSUMPTION_CAPACITY, fleetStats.shieldRechargeRate + shipStats.shieldRechargeRate),
      repairRate: Math.min(MAX_CONSUMPTION_CAPACITY, fleetStats.repairRate + shipStats.repairRate),
      repairAbility: Math.min(MAX_CONSUMPTION_CAPACITY, fleetStats.repairAbility + shipStats.repairAbility),
      repairEfficiency: Math.max(fleetStats.repairEfficiency, shipStats.repairEfficiency),
      lootRate: Math.min(MAX_CONSUMPTION_CAPACITY, fleetStats.lootRate + shipStats.lootRate),
      shieldBreakDelay: Math.max(fleetStats.shieldBreakDelay, shipStats.shieldBreakDelay),
      warpSpoolDuration: Math.max(fleetStats.warpSpoolDuration, shipStats.warpSpoolDuration),
    };
  }

  /**
   * Multiply Combat Stats
   * @param shipStats - ship CombatStats
   * @param shipAmount - the number of ships
   * @returns CombatStats
   */
  static multiplyCombatStats(shipStats: CombatStats, shipAmount: number): CombatStats {
    return {
      ap: Math.min(MAX_AP, shipAmount * shipStats.ap),
      sp: Math.min(MAX_HIT_POINTS, shipAmount * shipStats.sp),
      hp: Math.min(MAX_HIT_POINTS, shipAmount * shipStats.hp),
      ammoConsumptionRate: Math.min(MAX_CONSUMPTION_CAPACITY, shipAmount * shipStats.ammoConsumptionRate),
      apRegenRate: Math.min(MAX_CONSUMPTION_CAPACITY, shipAmount * shipStats.apRegenRate),
      shieldRechargeRate: Math.min(MAX_CONSUMPTION_CAPACITY, shipAmount * shipStats.shieldRechargeRate),
      repairRate: Math.min(MAX_CONSUMPTION_CAPACITY, shipAmount * shipStats.repairRate),
      repairAbility: Math.min(MAX_CONSUMPTION_CAPACITY, shipAmount * shipStats.repairAbility),
      repairEfficiency: shipStats.repairEfficiency,
      lootRate: Math.min(MAX_CONSUMPTION_CAPACITY, shipAmount * shipStats.lootRate),
      shieldBreakDelay: shipStats.shieldBreakDelay,
      warpSpoolDuration: shipStats.warpSpoolDuration,
    };
  }
}
