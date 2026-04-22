import { KeyedAccountInfo, PublicKey, SystemProgram } from "@solana/web3.js";
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
import { BaseShipStats, CargoStats, CombatStats, MiscStats, MovementStats, SageIDL, SageIDLProgram, ShipAccount } from "../IDL/constants";

export enum SizeClass {
  /// Very, very small
  XxSmall = 1,
  /// Very Small
  XSmall = 2,
  /// Small
  Small = 3,
  /// Medium
  Medium = 4,
  /// Large
  Large = 5,
  /// Capital
  Capital = 6,
  /// Commander
  Commander = 7,
  /// Titan
  Titan = 9,
}

/** Ship sizes */
export interface ShipSizes {
  /// The size of xx small ships
  xxSmall: number;
  /// The size of x small ships
  xSmall: number;
  /// The size of small ships
  small: number;
  /// The size of medium ships
  medium: number;
  /// The size of large ships
  large: number;
  /// The size of capital ships
  capital: number;
  /// The size of commander ships
  commander: number;
  /// The size of titan ships
  titan: number;
}

/// Ship sizes
export const SHIP_SIZES: ShipSizes = {
  xxSmall: 1,
  xSmall: 4,
  small: 9,
  medium: 16,
  large: 25,
  capital: 36,
  commander: 49,
  titan: 81,
};

// (2 * u32) + (2 * u16) + (3 * 32) = 8 + 4 + 12 = 24
const MOVEMENT_STATS_MIN_DATA_SIZE = 24;

// (9 * u32) = (9 * 4) = 36
const CARGO_STATS_MIN_DATA_SIZE = 36;

// (10 * u32) + (2 * u16) = (10 * 4) + (2 * 2) = 44
const COMBAT_STATS_MIN_DATA_SIZE = 44;

// (6 * u16) + (5 * u32) = (6 * 2) + (5 * 4) = 32
const MISC_STATS_MIN_DATA_SIZE = 32;

// size = 184 bytes
export const SHIP_STATS_MIN_DATA_SIZE =
  MOVEMENT_STATS_MIN_DATA_SIZE + CARGO_STATS_MIN_DATA_SIZE + COMBAT_STATS_MIN_DATA_SIZE + MISC_STATS_MIN_DATA_SIZE;

export interface ShipStats extends Omit<BaseShipStats, "movementStats" | "cargoStats" | "combatStats" | "miscStats"> {
  /// Movement stats for the fleet
  movementStats: MovementStats;
  /// Cargo stats for the fleet
  cargoStats: CargoStats;
  /// Combat stats for the fleet
  combatStats: CombatStats;
  /// Module stats for the fleet
  miscStats: MiscStats;
}

/**
 * Convert the `SizeClass` Typescript Enum to an Anchor enum
 * @param sizeClassInput - the `SizeClass` value that needs to be converted
 * @returns the `SizeClass` as an anchor enum
 */
export const getSizeClassAnchorEnum = (sizeClassInput: SizeClass) => {
  const element = SizeClass[sizeClassInput];
  if (element) {
    const isAllCaps = element.toUpperCase() === element;
    const key = isAllCaps ? element.toLowerCase() : element.charAt(0).toLowerCase() + element.slice(1);
    return { [key]: {} } as never;
  }
  throw new Error(`${sizeClassInput} is not found in the "SizeClass" enum`);
};

/**
 * Get default fleet stats
 * @returns the default fleet stats
 */
export function shipStatsDefault(): ShipStats {
  return {
    movementStats: {
      warpSpeed: 0,
      subwarpSpeed: 0,
      maxWarpDistance: 0,
      warpCoolDown: 0,
      subwarpFuelConsumptionRate: 0,
      warpFuelConsumptionRate: 0,
      planetExitFuelAmount: 0,
    },
    cargoStats: {
      cargoCapacity: 0,
      fuelCapacity: 0,
      ammoCapacity: 0,
      ammoConsumptionRate: 0,
      foodConsumptionRate: 0,
      miningRate: 0,
      upgradeRate: 0,
      cargoTransferRate: 0,
      tractorBeamGatherRate: 0,
    },
    combatStats: {
      ammoConsumptionRate: 0,
      ap: 0,
      hp: 0,
      sp: 0,
      apRegenRate: 0,
      shieldRechargeRate: 0,
      repairRate: 0,
      lootRate: 0,
      shieldBreakDelay: 0,
      warpSpoolDuration: 0,
      repairAbility: 0,
      repairEfficiency: 0,
    },
    miscStats: {
      requiredCrew: 0,
      passengerCapacity: 0,
      crewCount: 0,
      rentedCrew: 0,
      respawnTime: 0,
      scanCoolDown: 0,
      sduPerScan: 0,
      scanCost: 0,
      placeholder: 0,
      placeholder2: 0,
      placeholder3: 0,
    },
  };
}

export interface UpdateShipInput {
  // The Ship's name/label
  name: FixedSizeArray<number, 64>;
  // The Ship's Size Class
  sizeClass: SizeClass;
  // The stats for the ship
  stats: ShipStats;
  // the index of the key in the sector permissions profile
  keyIndex: number;
}

export interface RegisterShipInput extends UpdateShipInput {
  // Whether the ship is initialized to active (`update_id == current_update_id`)
  isActive: boolean;
}

export const SHIP_MIN_DATA_SIZE =
  8 + // discriminator
  1 + // version
  32 + // gameId
  32 + // mint
  1 + // sizeClass
  8 + // updateId
  8 + // maxUpdateId
  32 + // next
  64 + // name
  SHIP_STATS_MIN_DATA_SIZE; // stats

/**
 * Check if two `MovementStats` instances are equal
 * @param stats1 - first MovementStats
 * @param stats2 - second MovementStats
 * @returns a boolean
 */
export function movementStatsEquals(stats1: MovementStats, stats2: MovementStats): boolean {
  return (
    stats1.subwarpSpeed === stats2.subwarpSpeed &&
    stats1.maxWarpDistance === stats2.maxWarpDistance &&
    stats1.warpCoolDown === stats2.warpCoolDown &&
    stats1.warpCoolDown === stats2.warpCoolDown &&
    stats1.subwarpFuelConsumptionRate === stats2.subwarpFuelConsumptionRate &&
    stats1.warpFuelConsumptionRate === stats2.warpFuelConsumptionRate &&
    stats1.planetExitFuelAmount === stats2.planetExitFuelAmount
  );
}

/**
 * Check if two `CargoStats` instances are equal
 * @param stats1 - first CargoStats
 * @param stats2 - second CargoStats
 * @returns a boolean
 */
export function cargoStatsEquals(stats1: CargoStats, stats2: CargoStats): boolean {
  return (
    stats1.cargoCapacity === stats2.cargoCapacity &&
    stats1.fuelCapacity === stats2.fuelCapacity &&
    stats1.ammoCapacity === stats2.ammoCapacity &&
    stats1.ammoConsumptionRate === stats2.ammoConsumptionRate &&
    stats1.foodConsumptionRate === stats2.foodConsumptionRate &&
    stats1.miningRate === stats2.miningRate &&
    stats1.tractorBeamGatherRate === stats2.tractorBeamGatherRate &&
    stats1.cargoTransferRate === stats2.cargoTransferRate &&
    stats1.upgradeRate === stats2.upgradeRate
  );
}

/**
 * Check if two `MiscStats` instances are equal
 * @param stats1 - first MiscStats
 * @param stats2 - second MiscStats
 * @returns a boolean
 */
export function miscStatsEquals(stats1: MiscStats, stats2: MiscStats): boolean {
  return (
    stats1.requiredCrew === stats2.requiredCrew &&
    stats1.passengerCapacity === stats2.passengerCapacity &&
    stats1.crewCount === stats2.crewCount &&
    stats1.scanCoolDown === stats2.scanCoolDown &&
    stats1.respawnTime === stats2.respawnTime &&
    stats1.sduPerScan === stats2.sduPerScan &&
    stats1.scanCost === stats2.scanCost &&
    stats1.placeholder === stats2.placeholder &&
    stats1.placeholder2 === stats2.placeholder2 &&
    stats1.placeholder3 === stats2.placeholder3
  );
}

/**
 * Check if two `ShipStats` instances are equal
 * @param stats1 - first ShipStats
 * @param stats2 - second ShipStats
 * @returns a boolean
 */
export function shipStatsEquals(stats1: ShipStats, stats2: ShipStats): boolean {
  return (
    movementStatsEquals(stats1.movementStats, stats2.movementStats) &&
    cargoStatsEquals(stats1.cargoStats, stats2.cargoStats) &&
    miscStatsEquals(stats1.miscStats, stats2.miscStats)
  );
}

/**
 * Check if two `ShipAccount` instances are equal
 * @param ship1 - first ShipAccount
 * @param ship2 - second ShipAccount
 * @returns a boolean
 */
export function shipDataEquals(ship1: ShipAccount, ship2: ShipAccount): boolean {
  return (
    ship1.version === ship2.version &&
    ship1.gameId.equals(ship2.gameId) &&
    ship1.mint.equals(ship2.mint) &&
    ship1.sizeClass === ship2.sizeClass &&
    shipStatsEquals(ship1.stats, ship2.stats) &&
    ship1.updateId.eq(ship2.updateId) &&
    ship1.maxUpdateId.eq(ship2.maxUpdateId) &&
    ship1.next.key.equals(ship2.next.key) &&
    arrayDeepEquals(ship1.name, ship2.name, (a, b) => a === b)
  );
}

@staticImplements<AccountStatic<Ship, SageIDL>>()
export class Ship implements Account {
  static readonly ACCOUNT_NAME: NonNullable<SageIDL["accounts"]>[number]["name"] = "Ship";
  static readonly MIN_DATA_SIZE = SHIP_MIN_DATA_SIZE;

  constructor(private _data: ShipAccount, private _key: PublicKey) {}

  get data(): Readonly<ShipAccount> {
    return this._data;
  }

  get key(): PublicKey {
    return this._key;
  }

  /**
   * Register a new `Ship`
   * @param program - SAGE program
   * @param key - the key authorized to run this instruction
   * @param profile - the profile with the required permissions for the instruction
   * @param ship - the ship
   * @param mint - the ship's mint
   * @param gameId - the SAGE game id
   * @param input - input params
   * @returns InstructionReturn
   */
  static registerShip(
    program: SageIDLProgram,
    key: AsyncSigner,
    profile: PublicKey,
    ship: AsyncSigner,
    mint: PublicKey,
    gameId: PublicKey,
    input: RegisterShipInput
  ): InstructionReturn {
    return async (funder) => [
      {
        instruction: await program.methods
          .registerShip(input as never)
          .accountsStrict({
            gameAndProfile: {
              key: key.publicKey(),
              profile,
              gameId,
            },
            funder: funder.publicKey(),
            ship: ship.publicKey(),
            mint,
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
        signers: [key, funder, ship],
      },
    ];
  }

  /**
   * Update a `Ship`
   * @param program - SAGE program
   * @param key - the key authorized to run this instruction
   * @param profile - the profile with the required permissions for the instruction
   * @param ship - the ship
   * @param gameId - the SAGE game id
   * @param input - input params
   * @returns InstructionReturn
   */
  static updateShip(
    program: SageIDLProgram,
    key: AsyncSigner,
    profile: PublicKey,
    ship: PublicKey,
    gameId: PublicKey,
    input: UpdateShipInput
  ): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .updateShip(input as never)
          .accountsStrict({
            gameAndProfile: {
              key: key.publicKey(),
              profile,
              gameId,
            },
            ship,
          })
          .instruction(),
        signers: [key],
      },
    ];
  }

  /**
   * Makes a `Ship` unusable; effectively removes it from use
   * @param program - SAGE program
   * @param key - the key authorized to run this instruction
   * @param profile - the profile with the required permissions for the instruction
   * @param ship - the ship
   * @param gameId - the SAGE game id
   * @param keyIndex - the index of the key in the profile permissions
   * @returns InstructionReturn
   */
  static invalidateShip(
    program: SageIDLProgram,
    key: AsyncSigner,
    profile: PublicKey,
    ship: PublicKey,
    gameId: PublicKey,
    keyIndex: number
  ): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .invalidateShip(keyIndex)
          .accountsStrict({
            gameAndProfile: {
              key: key.publicKey(),
              profile,
              gameId,
            },
            ship,
          })
          .instruction(),
        signers: [key],
      },
    ];
  }

  /**
   * Set the next `Ship`
   * Essentially this invalidates the current `Ship` account and updates it to the next `Ship`
   * @param program - SAGE program
   * @param key - the key authorized to run this instruction
   * @param profile - the profile with the required permissions for the instruction
   * @param ship - the current ship
   * @param nextShip - the ship that will be replacing the current ship
   * @param gameId - the SAGE game id
   * @param keyIndex - the index of the key in the profile permissions
   * @returns InstructionReturn
   */
  static setNextShip(
    program: SageIDLProgram,
    key: AsyncSigner,
    profile: PublicKey,
    ship: PublicKey,
    nextShip: PublicKey,
    gameId: PublicKey,
    keyIndex: number
  ): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .setNextShip(keyIndex)
          .accountsStrict({
            gameAndProfile: {
              key: key.publicKey(),
              profile,
              gameId,
            },
            ship,
            nextShip,
          })
          .instruction(),
        signers: [key],
      },
    ];
  }

  static decodeData(account: KeyedAccountInfo, program: SageIDLProgram): DecodedAccountData<Ship> {
    return decodeAccount(account, program, Ship);
  }
}
