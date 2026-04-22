import { KeyedAccountInfo, PublicKey, SystemProgram } from "@solana/web3.js";
import { BN } from "@staratlas/anchor";
import {
  Account,
  AccountStatic,
  AsyncSigner,
  DecodedAccountData,
  InstructionReturn,
  arrayDeepEquals,
  decodeAccountWithRemaining,
  staticImplements,
  stringToByteArray,
} from "@staratlas/data-source";
import { SageIDL, SageIDLProgram, SectorAccount } from "../IDL/constants";

/**
 * Calculate the distance between two coordinates
 * @param coordinates1 - the 1st set of coordinates
 * @param coordinates2 - the 2nd set of coordinates
 * @returns distance
 */
export const calculateDistance = (coordinates1: [BN, BN], coordinates2: [BN, BN]) => {
  return Math.sqrt(coordinates2[0].sub(coordinates1[0]).sqr().add(coordinates2[1].sub(coordinates1[1]).sqr()).toNumber());
};

/**
 * Check if two `SectorAccount` instances are equal
 * @param sector1 - first SectorAccount
 * @param sector2 - second SectorAccount
 * @returns a boolean
 */
export function sectorDataEquals(sector1: SectorAccount, sector2: SectorAccount): boolean {
  return (
    sector1.version === sector2.version &&
    sector1.gameId.equals(sector2.gameId) &&
    arrayDeepEquals(sector1.coordinates, sector2.coordinates, (a, b) => a.eq(b)) &&
    sector1.discoverer.equals(sector2.discoverer) &&
    arrayDeepEquals(sector1.name, sector2.name, (name1, name2) => name1 === name2) &&
    sector1.numStars === sector2.numStars &&
    sector1.numPlanets === sector2.numPlanets &&
    sector1.numMoons === sector2.numMoons &&
    sector1.numAsteroidBelts === sector2.numAsteroidBelts &&
    sector1.numConnections === sector2.numConnections &&
    sector1.lastScanTime.eq(sector2.lastScanTime) &&
    sector1.lastScanChance === sector2.lastScanChance &&
    sector1.bump === sector2.bump
  );
}

export type SectorConnection = {
  connectionSector: PublicKey;
  subCoordinates: [BN, BN];
  flags: number;
};

/**
 * Check if two `SectorConnection` instances are equal
 * @param sectorConnection1 - first SectorConnection
 * @param sectorConnection2 - second SectorConnection
 * @returns a boolean
 */
export function sectorConnectionEquals(sectorConnection1: SectorConnection, sectorConnection2: SectorConnection): boolean {
  return (
    sectorConnection1.connectionSector.equals(sectorConnection2.connectionSector) &&
    sectorConnection1.subCoordinates[0].eq(sectorConnection2.subCoordinates[0]) &&
    sectorConnection1.subCoordinates[1].eq(sectorConnection2.subCoordinates[1]) &&
    sectorConnection1.flags === sectorConnection2.flags
  );
}

export const SECTOR_CONNECTION_MIN_DATA_SIZE =
  32 + // connectionSector
  8 * 2 + // subCoordinates
  1; // flags

export type ConnectionFlags = {
  isJumpPoint: boolean;
};

/**
 * Check if two `ConnectionFlags` instances are equal
 * @param connectionFlags1 - first ConnectionFlags
 * @param connectionFlags2 - second ConnectionFlags
 * @returns a boolean
 */
export function connectionFlagsEquals(connectionFlags1: ConnectionFlags, connectionFlags2: ConnectionFlags): boolean {
  return connectionFlags1.isJumpPoint === connectionFlags2.isJumpPoint;
}

/**
 * Convert a connection flag to a byte
 * @param connectionFlags - the connection flag
 * @returns a byte
 */
export function connectionFlagsToByte(connectionFlags: ConnectionFlags): number {
  return connectionFlags.isJumpPoint ? 1 << 0 : 0;
}

/**
 * Convert a byte to a connection flag
 * @param flags - a byte
 * @returns a ConnectionFlags instance
 */
export function connectionFlagsFromByte(flags: number): ConnectionFlags {
  return {
    isJumpPoint: (flags & (1 << 0)) > 0,
  };
}

@staticImplements<AccountStatic<Sector, SageIDL>>()
export class Sector implements Account {
  static readonly ACCOUNT_NAME: NonNullable<SageIDL["accounts"]>[number]["name"] = "Sector";
  static readonly MIN_DATA_SIZE =
    8 + // discriminator
    1 + // version
    32 + // gameId
    8 * 2 + // coordinates
    32 + // discoverer
    64 + // name
    2 + // numStars
    2 + // numPlanets
    2 + // numMoons
    2 + // numAsteroidBelts
    2 + // numConnections
    8 + // lastScanTime
    4 + // lastScanChance
    1; // bump;

  constructor(private _data: SectorAccount, private _key: PublicKey, private _connections: SectorConnection[]) {}

  get data(): Readonly<SectorAccount> {
    return this._data;
  }

  get key(): PublicKey {
    return this._key;
  }

  get connections(): Readonly<SectorConnection[]> {
    return this._connections;
  }

  /**
   * Finds the Sector PDA
   * @param program - The SAGE Program IDL
   * @param gameId - The Game PublicKey
   * @param coordinates - The Sector Coordinates
   * @returns - The PDA address and bump respectively
   */
  static findAddress(program: SageIDLProgram, gameId: PublicKey, coordinates: [BN, BN]): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("Sector"),
        gameId.toBuffer(),
        coordinates[0].toTwos(64).toArrayLike(Buffer, "le", 8),
        coordinates[1].toTwos(64).toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
  }

  static decodeData(account: KeyedAccountInfo, program: SageIDLProgram): DecodedAccountData<Sector> {
    return decodeAccountWithRemaining(account, program, Sector, (remainingData, data) =>
      Array(data.numConnections)
        .fill(0)
        .map((_, index) => {
          return program.coder.types.decode<SectorConnection>(
            "SectorConnection",
            remainingData.subarray(SECTOR_CONNECTION_MIN_DATA_SIZE * index).subarray(0, SECTOR_CONNECTION_MIN_DATA_SIZE)
          );
        })
    );
  }

  /**
   * Register a Sector with SAGE
   * @param program - The SAGE program IDL
   * @param key - The key authorized for this instruction
   * @param profile - The Profile with required Permissions
   * @param discoverer - The `discoverer` of this sector
   * @param gameId - The Game PublicKey
   * @param coordinates - The coordinates for the sector
   * @param name - Name of the sector
   * @param keyIndex - The Index of the `key` in the permission list
   * @returns Returns an object with 2 fields: sectorKey and instructions. sectorKey is the PDA for the registered Sector.
   */
  static registerSector(
    program: SageIDLProgram,
    key: AsyncSigner,
    profile: PublicKey,
    discoverer: PublicKey,
    gameId: PublicKey,
    coordinates: [BN, BN],
    name: string,
    keyIndex: number
  ): {
    sectorKey: [PublicKey, number];
    instructions: InstructionReturn;
  } {
    const sectorKey = Sector.findAddress(program, gameId, coordinates);
    return {
      sectorKey,
      instructions: async (funder) => [
        {
          instruction: await program.methods
            .registerSector(coordinates, stringToByteArray(name, 64), keyIndex)
            .accountsStrict({
              gameAndProfile: {
                key: key.publicKey(),
                profile,
                gameId,
              },
              funder: funder.publicKey(),
              discoverer,
              sector: sectorKey[0],
              systemProgram: SystemProgram.programId,
            })
            .instruction(),
          signers: [key, funder],
        },
      ],
    };
  }

  /**
   * Discover a Sector
   * This is meant to be called by players and results in the creation of un-discovered sectors
   * @param program - The SAGE program IDL
   * @param key - the key authorized to run this instruction
   * @param playerProfile - the profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param fleet - the fleet
   * @param gameId - The Game PublicKey
   * @param gameState - the game state
   * @param coordinates - The coordinates for the sector
   * @param keyIndex - The Index of the `key` in the permission list
   * @returns Returns an object with 2 fields: sectorKey and instructions. sectorKey is the PDA for the registered Sector.
   */
  static discoverSector(
    program: SageIDLProgram,
    key: AsyncSigner,
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    fleet: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    coordinates: [BN, BN],
    keyIndex: number
  ): {
    sectorKey: [PublicKey, number];
    instructions: InstructionReturn;
  } {
    const sectorKey = Sector.findAddress(program, gameId, coordinates);
    return {
      sectorKey,
      instructions: async (funder) => [
        {
          instruction: await program.methods
            .discoverSector({ coordinates, keyIndex })
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
              sector: sectorKey[0],
              systemProgram: SystemProgram.programId,
            })
            .instruction(),
          signers: [key, funder],
        },
      ],
    };
  }

  /**
   * Add connection between 2 sectors for warping
   * @param program - The SAGE IDL program
   * @param key - The key authorized to use this instruction
   * @param profile - The Profile with permissions required
   * @param sector1 - The first sector
   * @param sector2 - The second sector
   * @param gameId - The Game PublicKey
   * @param subCoordinates1 - The sub coordinate for warp gate within sector 1
   * @param flags1 - The flags for warp gate 1.
   * @see {@link ConnectionFlags} for more details on flags
   * @param subCoordinates2 - The sub coordinate for warp gate within sector 2
   * @param flags2 - The flags for warp gate 2
   * @see {@link ConnectionFlags} for more details on flags
   * @param keyIndex - The Index of the `key` in the permission list
   * @returns InstructionReturn
   */
  static addConnection(
    program: SageIDLProgram,
    key: AsyncSigner,
    profile: PublicKey,
    sector1: PublicKey,
    sector2: PublicKey,
    gameId: PublicKey,
    subCoordinates1: [BN, BN],
    flags1: ConnectionFlags,
    subCoordinates2: [BN, BN],
    flags2: ConnectionFlags,
    keyIndex: number
  ): InstructionReturn {
    return async (funder) => [
      {
        instruction: await program.methods
          .addConnection(subCoordinates1, connectionFlagsToByte(flags1), subCoordinates2, connectionFlagsToByte(flags2), keyIndex)
          .accountsStrict({
            gameAndProfile: {
              key: key.publicKey(),
              profile,
              gameId,
            },
            funder: funder.publicKey(),
            sector1,
            sector2,
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
        signers: [key, funder],
      },
    ];
  }

  /**
   * Remove an existing connection between 2 sectors for warping
   * @param program - The SAGE IDL program
   * @param key - The key authorized to use this instruction
   * @param profile - The Profile with permissions required
   * @param fundsTo - Account where rent fees go
   * @param sector1 - The first sector
   * @param sector2 - The second sector
   * @param keyIndex - The Index of the `key` in the permission list
   * @param gameId - The Game PublicKey
   * @returns InstructionReturn
   */
  static removeConnection(
    program: SageIDLProgram,
    key: AsyncSigner,
    profile: PublicKey,
    fundsTo: PublicKey | "funder",
    sector1: Sector,
    sector2: Sector,
    keyIndex: number,
    gameId: PublicKey
  ): InstructionReturn {
    const sector1Index = sector1.connections.findIndex((connection) => connection.connectionSector.equals(sector2.key));
    const sector2Index = sector2.connections.findIndex((connection) => connection.connectionSector.equals(sector1.key));
    if (sector1Index === -1 || sector2Index === -1) {
      throw new Error("Connection not found");
    }
    return async (funder) => [
      {
        instruction: await program.methods
          .removeConnection(sector1Index, sector2Index, keyIndex)
          .accountsStrict({
            gameAndProfile: {
              key: key.publicKey(),
              profile,
              gameId,
            },
            fundsTo: fundsTo === "funder" ? funder.publicKey() : fundsTo,
            sector1: sector1.key,
            sector2: sector2.key,
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
        signers: [key],
      },
    ];
  }
}
