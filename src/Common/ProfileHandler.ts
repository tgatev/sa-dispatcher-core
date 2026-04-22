import { GetProgramAccountsFilter, PublicKey } from "@solana/web3.js";
import { PlayerName, PlayerProfile } from "@staratlas/player-profile";

import { GameHandler } from "./GameHandler";
import { ProfileExpandedData } from "./types";

export type ProfilePermittedWalletsData = {
  account: string; // Wallet PublicKey < Can Own different SAGE player profile >
  name: string;
  idx: number; // Order Index used in Instructions to command fleets
  scope?: string; // "sage" | "points" | "points_store" | "default";
  permissions: boolean[][];
  expireTime: number;
  scopeKey?: string;
};

export const playerProfileFilters = {
  byPlayerPubkey: (playerPubkey: PublicKey): GetProgramAccountsFilter => ({
    memcmp: {
      offset: 30,
      bytes: playerPubkey.toBase58(),
    },
  }),
  byProfileName: (name: string): GetProgramAccountsFilter => ({
    memcmp: {
      offset: 1,
      bytes: name,
    },
  }),
};

export abstract class ProfileHandler<TSageGameHandler extends GameHandler<any, any>> {
  constructor(public _gameHandler: TSageGameHandler) {}

  /**
   * Provide PlayerProfile data by profile public key
   * @param playerProfilePubkey
   * @returns
   */
  abstract getPlayerProfile(playerProfilePubkey: PublicKey): Promise<PlayerProfile>;

  /**
   *
   * @param filter GetProgramAccountsFilter[] to filter PlayerName accounts, if empty all accounts will be returned
   * @returns
   */
  abstract getPlayerName(filter: GetProgramAccountsFilter[]): Promise<PlayerName[]>;

  /**
   * Provide Expanded Player Profile Data Snapshot by profile public key - including linked fleets and their details
   * @param playerProfile
   */
  abstract getPlayerDataSnapshot(playerProfile: PublicKey): Promise<ProfileExpandedData>;

  static decodePermissions(input: any) {
    const permissions = [];
    for (let section of input) {
      let sectionFlags = [];
      sectionFlags.push((section & (1 << 0)) === 1 << 0);
      sectionFlags.push((section & (1 << 1)) === 1 << 1);
      sectionFlags.push((section & (1 << 2)) === 1 << 2);
      sectionFlags.push((section & (1 << 3)) === 1 << 3);
      sectionFlags.push((section & (1 << 4)) === 1 << 4);
      sectionFlags.push((section & (1 << 5)) === 1 << 5);
      sectionFlags.push((section & (1 << 6)) === 1 << 6);
      sectionFlags.push((section & (1 << 7)) === 1 << 7);
      permissions.push(sectionFlags);
    }
    return permissions;
  }
}
