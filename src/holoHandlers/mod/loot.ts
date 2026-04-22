import { KeyedAccountInfo, PublicKey } from "@solana/web3.js";
import { Account, AccountStatic, DecodedAccountData, arrayDeepEquals, decodeAccount, staticImplements } from "@staratlas/data-source";
import { BaseLootAccount, LootInfo, SageIDL, SageIDLProgram } from "../IDL/constants";
import { BN } from "@staratlas/anchor";

export const LOOT_INFO_DATA_SIZE =
  8 + // exclusivityUnlockTime
  32 + // destroyer
  32; // loot

export const LOOT_ACCOUNT_MIN_DATA_SIZE =
  8 + // discriminator
  1 + // version
  8 * 2 + // sector
  32 + // gameId
  32 + // creator
  LOOT_INFO_DATA_SIZE * 2; // items

export interface LootAccount extends Omit<BaseLootAccount, "items"> {
  items: [LootInfo, LootInfo];
}

/**
 * Get default instance of LootInfo
 * @returns lootInfo
 */
export const defaultLootInfo = (): LootInfo => {
  return {
    exclusivityUnlockTime: new BN(0),
    destroyer: PublicKey.default,
    loot: PublicKey.default,
  };
};

/**
 * Check if two `LootInfo` instances are equal
 * @param a - first LootInfo
 * @param b - second LootInfo
 * @returns boolean
 */
export const lootInfoDataEquals = (a: LootInfo, b: LootInfo) =>
  a.destroyer.equals(b.destroyer) && a.exclusivityUnlockTime.eq(b.exclusivityUnlockTime) && a.loot.equals(b.loot);

/**
 * Check if two `LootAccount` instances are equal
 * @param data1 - first LootAccount
 * @param data2 - second LootAccount
 * @returns boolean
 */
export function lootDataEquals(data1: LootAccount, data2: LootAccount): boolean {
  return (
    data1.version === data2.version &&
    data1.gameId.equals(data2.gameId) &&
    data1.creator.equals(data2.creator) &&
    arrayDeepEquals(data1.items, data2.items, lootInfoDataEquals) &&
    arrayDeepEquals(data1.sector, data2.sector, (a, b) => a.eq(b))
  );
}

@staticImplements<AccountStatic<Loot, SageIDL>>()
export class Loot implements Account {
  static readonly ACCOUNT_NAME: NonNullable<SageIDL["accounts"]>[number]["name"] = "Loot";
  static readonly MIN_DATA_SIZE: number = LOOT_ACCOUNT_MIN_DATA_SIZE;

  constructor(
    private _data: LootAccount,
    private _key: PublicKey,
  ) {}

  get data(): Readonly<LootAccount> {
    return this._data;
  }

  get key(): Readonly<PublicKey> {
    return this._key;
  }

  static decodeData(account: KeyedAccountInfo, program: SageIDLProgram): DecodedAccountData<Loot> {
    return decodeAccount(account, program, Loot);
  }
}
