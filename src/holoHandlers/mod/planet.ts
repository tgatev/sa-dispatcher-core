import { KeyedAccountInfo, PublicKey, SystemProgram } from "@solana/web3.js";
import { BN } from "@staratlas/anchor";
import {
  Account,
  AccountStatic,
  AsyncSigner,
  DecodedAccountData,
  FixedSizeArray,
  InstructionReturn,
  arrayDeepEquals,
  byteArrayToString,
  decodeAccount,
  staticImplements,
  stringToByteArray,
} from "@staratlas/data-source";
import { PlanetAccount, SageIDL, SageIDLProgram } from "../IDL/constants";

export enum SectorRing {
  Inner = 1,
  Mid = 2,
  Outer = 3,
}

export enum PlanetType {
  Terrestrial = 0,
  Volcanic = 1,
  Barren = 2,
  AsteroidBelt = 3,
  GasGiant = 4,
  IceGiant = 5,
  Dark = 6,
}

export interface RegisterPlanetInput {
  name: string;
  keyIndex: number;
  size: BN;
  subCoordinates: FixedSizeArray<BN, 2>;
  planetType: PlanetType;
  position: SectorRing;
  maxHp: BN;
}

export interface UpdatePlanetInput {
  name?: string;
  size?: BN;
  maxHp?: BN;
  subCoordinates?: FixedSizeArray<BN, 2>;
  keyIndex: number;
}

/**
 * Check if two `PlanetAccount` instances are equal
 * @param data1 - first PlanetAccount
 * @param data2 - second PlanetAccount
 * @returns boolean
 */
export function planetDataEquals(data1: PlanetAccount, data2: PlanetAccount): boolean {
  return (
    data1.version === data2.version &&
    arrayDeepEquals(data1.sector, data2.sector, (a, b) => a.eq(b)) &&
    data1.gameId.equals(data2.gameId) &&
    data1.size.eq(data2.size) &&
    arrayDeepEquals(data1.name, data2.name, (a, b) => a === b) &&
    arrayDeepEquals(data1.subCoordinates, data2.subCoordinates, (a, b) => a.eq(b)) &&
    data1.planetType === data2.planetType &&
    data1.position === data2.position &&
    data1.maxHp.eq(data2.maxHp) &&
    data1.currentHealth.eq(data2.currentHealth) &&
    data1.amountMined.eq(data2.amountMined) &&
    data1.numResources === data2.numResources &&
    data1.numMiners.eq(data2.numMiners)
  );
}

@staticImplements<AccountStatic<Planet, SageIDL>>()
export class Planet implements Account {
  static readonly ACCOUNT_NAME: NonNullable<SageIDL["accounts"]>[number]["name"] = "Planet";
  static readonly MIN_DATA_SIZE =
    8 + // discriminator
    1 + // version
    64 + // name
    32 + // gameId
    8 * 2 + // sector
    8 * 2 + // subCoordinates
    1 + // planetType
    1 + // position
    8 + // size
    8 + // maxHp
    8 + // currentHealth
    8 + // amountMined
    1 + // position
    8; // numMiners

  constructor(private _data: PlanetAccount, private _key: PublicKey) {}

  get data(): Readonly<PlanetAccount> {
    return this._data;
  }

  get key(): PublicKey {
    return this._key;
  }

  get prettyName(): string {
    return byteArrayToString(this.data.name);
  }

  /**
   * Register a planet
   * @param program - SAGE program
   * @param key - the key authorized to run this instruction
   * @param profile - the profile with the required permissions for the instruction
   * @param planet - the planet being registered
   * @param sector - the sector in which the planet is located
   * @param gameId - the SAGE game id
   * @param input - input params
   * @returns InstructionReturn
   */
  static registerPlanet(
    program: SageIDLProgram,
    key: AsyncSigner,
    profile: PublicKey,
    planet: AsyncSigner,
    sector: PublicKey,
    gameId: PublicKey,
    input: RegisterPlanetInput
  ): InstructionReturn {
    return async (funder) => [
      {
        instruction: await program.methods
          .registerPlanet({
            ...input,
            name: stringToByteArray(input.name, 64),
          })
          .accountsStrict({
            gameAndProfile: {
              key: key.publicKey(),
              profile,
              gameId,
            },
            funder: funder.publicKey(),
            planet: planet.publicKey(),
            sector,
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
        signers: [key, funder, planet],
      },
    ];
  }

  /**
   * Update a planet
   * @param program - SAGE program
   * @param key - the key authorized to run this instruction
   * @param profile - the profile with the required permissions for the instruction
   * @param planet - the planet being updated
   * @param gameId - the SAGE game id
   * @param input - input params
   * @returns InstructionReturn
   */
  static updatePlanet(
    program: SageIDLProgram,
    key: AsyncSigner,
    profile: PublicKey,
    planet: PublicKey,
    gameId: PublicKey,
    input: UpdatePlanetInput
  ): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .updatePlanet({
            ...input,
            name: input.name == null ? null : stringToByteArray(input.name, 64),
            size: input.size == null ? null : input.size,
            maxHp: input.maxHp == null ? null : input.maxHp,
            subCoordinates: input.subCoordinates == null ? null : input.subCoordinates,
          })
          .accountsStrict({
            gameAndProfile: {
              key: key.publicKey(),
              profile,
              gameId,
            },
            planet,
          })
          .instruction(),
        signers: [key],
      },
    ];
  }

  static decodeData(account: KeyedAccountInfo, program: SageIDLProgram): DecodedAccountData<Planet> {
    return decodeAccount(account, program, Planet);
  }
}
