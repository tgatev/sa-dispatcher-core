import { KeyedAccountInfo, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  Account,
  AccountStatic,
  AsyncSigner,
  DecodedAccountData,
  InstructionReturn,
  arrayDeepEquals,
  decodeAccount,
  staticImplements,
} from "@staratlas/data-source";
import { CloseDisbandedFleetInput, DisbandedFleetAccount, DisbandedFleetToEscrowInput, SageIDL, SageIDLProgram } from "../IDL/constants";

/**
 * Check if two `DisbandedFleetAccount` instances are equal
 * @param data1 - first DisbandedFleetAccount
 * @param data2 - second DisbandedFleetAccount
 * @returns boolean
 */
export function disbandedFleetDataEquals(data1: DisbandedFleetAccount, data2: DisbandedFleetAccount): boolean {
  return (
    data1.version === data2.version &&
    data1.bump === data2.bump &&
    data1.gameId.equals(data2.gameId) &&
    data1.ownerProfile.equals(data2.ownerProfile) &&
    data1.fleetShips.equals(data2.fleetShips) &&
    data1.starbase.equals(data2.starbase) &&
    arrayDeepEquals(data1.fleetLabel, data2.fleetLabel, (a, b) => a === b)
  );
}

export const SHIP_COUNTS_SIZE = 9 * 2;

@staticImplements<AccountStatic<DisbandedFleet, SageIDL>>()
export class DisbandedFleet implements Account {
  static readonly ACCOUNT_NAME: NonNullable<SageIDL["accounts"]>[number]["name"] = "DisbandedFleet";
  static readonly MIN_DATA_SIZE: number =
    8 + // discriminator
    1 + // version
    32 + // gameId
    32 + // ownerProfile
    32 + // starbase
    32 + // fleetLabel
    SHIP_COUNTS_SIZE + //shipCounts
    1; // bump

  constructor(
    private _data: DisbandedFleetAccount,
    private _key: PublicKey,
  ) {}

  get data(): Readonly<DisbandedFleetAccount> {
    return this._data;
  }

  get key(): PublicKey {
    return this._key;
  }

  /**
   * Find the DisbandedFleet account address
   * @param program - SAGE program
   * @param game - the SAGE game id
   * @param playerProfile - the profile that owns the fleet
   * @param fleetLabel - the label/name of the fleet
   * @returns - The PDA and bump respectively
   */
  static findAddress(program: SageIDLProgram, game: PublicKey, playerProfile: PublicKey, fleetLabel: number[]): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("DisbandedFleet"), game.toBuffer(), playerProfile.toBuffer(), Buffer.from(fleetLabel)],
      program.programId,
    );
  }

  /**
   * Moves ships from a `DisbandedFleet` to `StarbasePlayer` ship escrow
   * @param program - SAGE program
   * @param key - the key authorized to run this instruction
   * @param playerProfile - the profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param disbandedFleet - the disbanded fleet
   * @param fleetShips - the fleet's ships account public key
   * @param ship - the ship account
   * @param starbasePlayer - the Starbase player account tied to the Starbase
   * @param starbase - the Starbase in which the ship is currently in
   * @param gameId - the SAGE game id
   * @param gameState - the game state  account
   * @param input - input params
   * @returns InstructionReturn
   */
  static disbandedFleetToEscrow(
    program: SageIDLProgram,
    key: AsyncSigner,
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    disbandedFleet: PublicKey,
    fleetShips: PublicKey,
    ship: PublicKey,
    starbasePlayer: PublicKey,
    starbase: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    input: DisbandedFleetToEscrowInput,
  ): InstructionReturn {
    return async (funder) => [
      {
        instruction: await program.methods
          .disbandedFleetToEscrow(input)
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
            disbandedFleet,
            fleetShips,
            ship,
            starbaseAndStarbasePlayer: {
              starbase,
              starbasePlayer,
            },
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
        signers: [key, funder],
      },
    ];
  }

  /**
   * Closes am empty `DisbandedFleet` account
   * @param program - SAGE program
   * @param key - the key authorized to run this instruction
   * @param playerProfile - the profile with the required permissions for the instruction
   * @param fundsTo - the entity that should receive rent refunds
   * @param disbandedFleet - the disbanded fleet
   * @param fleetShips - the fleet's ships account public key
   * @param input - input params
   * @returns InstructionReturn
   */
  static closeDisbandedFleet(
    program: SageIDLProgram,
    key: AsyncSigner,
    playerProfile: PublicKey,
    fundsTo: PublicKey | "funder",
    disbandedFleet: PublicKey,
    fleetShips: PublicKey,
    input: CloseDisbandedFleetInput,
  ): InstructionReturn {
    return async (funder) => [
      {
        instruction: await program.methods
          .closeDisbandedFleet(input)
          .accountsStrict({
            key: key.publicKey(),
            playerProfile,
            fundsTo: fundsTo === "funder" ? funder.publicKey() : fundsTo,
            disbandedFleet,
            fleetShips,
          })
          .instruction(),
        signers: [key],
      },
    ];
  }

  static decodeData(account: KeyedAccountInfo, program: SageIDLProgram): DecodedAccountData<DisbandedFleet> {
    return decodeAccount(account, program, DisbandedFleet);
  }
}
