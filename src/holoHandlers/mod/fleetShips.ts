import { KeyedAccountInfo, PublicKey } from "@solana/web3.js";
import { Account, AccountStatic, DecodedAccountData, decodeAccountWithRemaining, staticImplements } from "@staratlas/data-source";
import { FleetShipsAccount, FleetShipsInfo, SageIDL, SageIDLProgram } from "./../IDL/constants";

export const FLEET_SHIPS_MIN_DATA_SIZE =
  8 + // discriminator
  1 + // version
  1 + // bump
  32 + // Fleet key
  4; // fleetShipsInfoCount

/**
 * Check if two `FleetShipsAccount` instances are equal
 * @param data1 - first FleetShipsAccount
 * @param data2 - second FleetShipsAccount
 * @returns boolean
 */
export function fleetShipsEquals(data1: FleetShipsAccount, data2: FleetShipsAccount): boolean {
  return (
    data1.version === data2.version &&
    data1.bump === data2.bump &&
    data1.fleet.equals(data2.fleet) &&
    data1.fleetShipsInfoCount == data2.fleetShipsInfoCount
  );
}

@staticImplements<AccountStatic<FleetShips, SageIDL>>()
export class FleetShips implements Account {
  static readonly ACCOUNT_NAME: NonNullable<SageIDL["accounts"]>[number]["name"] = "FleetShips";
  static readonly MIN_DATA_SIZE: number = FLEET_SHIPS_MIN_DATA_SIZE;

  constructor(
    private _data: FleetShipsAccount,
    private _key: PublicKey,
    private _fleetShips: FleetShipsInfo[],
  ) {}

  get data(): Readonly<FleetShipsAccount> {
    return this._data;
  }

  get key(): Readonly<PublicKey> {
    return this._key;
  }

  get fleetShips(): Readonly<FleetShipsInfo[]> {
    return this._fleetShips || [];
  }

  /**
   * Finds the address of a `FleetShips` account
   * @param program - the SAGE program
   * @param fleet - the fleet
   * @returns - The PDA and bump respectively
   */
  static findAddress(program: SageIDLProgram, fleet: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from("FleetShips"), fleet.toBuffer()], program.programId);
  }

  static decodeData(account: KeyedAccountInfo, program: SageIDLProgram): DecodedAccountData<FleetShips> {
    const FLEET_SHIPS_INFO_SIZE = 32 + 8 + 8; // Pubkey + u64 + u64
    return decodeAccountWithRemaining(account, program, FleetShips, (remainingData, data) =>
      Array(data.fleetShipsInfoCount)
        .fill(0)
        .map((_, index) =>
          program.coder.types.decode<FleetShipsInfo>(
            "FleetShipsInfo",
            remainingData.subarray(FLEET_SHIPS_INFO_SIZE * index).subarray(0, FLEET_SHIPS_INFO_SIZE),
          ),
        ),
    );
  }
}
