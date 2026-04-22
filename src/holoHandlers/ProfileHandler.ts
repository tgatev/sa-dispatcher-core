import { GetProgramAccountsFilter, PublicKey } from "@solana/web3.js";
import { readAllFromRPC, readFromRPCOrError } from "@staratlas/data-source";
import { PlayerName, PlayerProfile } from "@staratlas/player-profile";

import { SageGameHandler } from "./GameHandler";
import { PlayerProfileNotFoundError } from "../Error/ErrorHandlers";
import { ProfileHandler as BaseProfileHandler, type ProfilePermittedWalletsData } from "../Common/ProfileHandler";
import { FleetPreview, FleetShortPreview, ProfileExpandedData } from "../Common/types";
import { getFleetExtendedViewState, getFleetShortViewState } from "../Common/Helper";

export class ProfileHandler extends BaseProfileHandler<SageGameHandler> {
  constructor(_gameHandler: SageGameHandler) {
    super(_gameHandler);
  }

  /**
   * Provide PlayerProfile data by profile public key
   * @param playerProfilePubkey
   * @returns
   */
  async getPlayerProfile(playerProfilePubkey: PublicKey): Promise<PlayerProfile> {
    const playerProfile = await readFromRPCOrError(
      this._gameHandler.getConnection(),
      //@ts-ignore
      this._gameHandler.playerProfileProgram,
      playerProfilePubkey,
      PlayerProfile,
      "confirmed",
    );

    if (!playerProfile) {
      throw new PlayerProfileNotFoundError(playerProfilePubkey.toBase58());
    }

    return playerProfile;
  }

  async findAllProfiles(filter: GetProgramAccountsFilter[] = []): Promise<PlayerProfile[]> {
    let profiles = await readAllFromRPC(
      this._gameHandler.getConnection(),
      this._gameHandler.playerProfileProgram as any,
      PlayerProfile,
      "confirmed",
      filter,
    );

    return profiles.filter((p) => p.type == "ok").map((p) => p.data);
  }

  /**
   *
   * @param name
   * @returns
   */
  async findPlayerProfileByName(names: string[]) {
    let allNames = await this._gameHandler.sagePlayerProfileHandler.getPlayerName();
    this._gameHandler.logger.dbg("All NAMES:", allNames.length);
    let normalizedNames = names.map((name) => name.trim().toLowerCase());
    let profiles = allNames.filter((p) => {
      let profileName = p.name.trim().toLowerCase();
      return normalizedNames.some((name) => profileName.includes(name));
    });

    return profiles;
  }

  async getPlayerProfileAddress(playerPubkeyOwner: PublicKey) {
    // todo: cache in class property to reduce rpc calls if method is used only for own profile data - for now is used only on dispatcher initialization
    // otherwise could search profiles be wallet public key
    const [accountInfo] = await this._gameHandler
      .getConnection()
      .getProgramAccounts(new PublicKey(this._gameHandler.asStatic().PLAYER_PROFILE_PROGRAM_ID), {
        filters: [
          {
            memcmp: {
              offset: 30,
              bytes: playerPubkeyOwner.toBase58(),
            },
          },
        ],
      });
    if (!accountInfo) {
      throw new PlayerProfileNotFoundError(playerPubkeyOwner.toBase58());
    }
    return accountInfo?.pubkey;
  }
  /**
   * If there is no filter it will return all PlayerName accounts which are used to link Player Profiles to Wallets with granted permissions
   * @param filter
   * @returns
   * 
   * fields: 
   *   static readonly MIN_DATA_SIZE: number =
    8 + // discriminator
    1 + // version
    32 + // profile
    1; // bump
   */
  async getPlayerName(filter: GetProgramAccountsFilter[] = []): Promise<PlayerName[]> {
    // Find the Player Name associated with the account which has been granted access
    let profiles = await readAllFromRPC(
      this._gameHandler.getConnection(),
      this._gameHandler.playerProfileProgram as any,
      PlayerName,
      "confirmed",
      filter,
    );

    // let fdata = profiles.filter((p) => p.type == "ok").map((p) => p);
    // PlayerName.decodeData(fdata[0]., this._gameHandler.playerProfileProgram as any);

    return profiles.filter((p) => p.type == "ok").map((p) => p.data);
  }

  /**
   * Provide Indexed Permitted Wallets for any Profile ordered by index
   *
   * @param id - Player Profile PublicKey | Owner Wallet PublicKey
   * @param isPlayerProfile [default: true] - set to false if id is Owner Wallet PublicKey
   * @returns
   */
  async getPermittedWalletsPerProfile(id: PublicKey, isPlayerProfile = true): Promise<ProfilePermittedWalletsData[]> {
    if (!isPlayerProfile) {
      id = await this.getPlayerProfileAddress(id);
      isPlayerProfile = true;
    }

    /** Get Indexes in Single Call */
    let sagePlayerProfileAccount = await this.getPlayerProfile(id);
    let accountData: ProfilePermittedWalletsData[] = sagePlayerProfileAccount.profileKeys.map((keysIndexes, index) => {
      let scopeLabel = "";

      switch (keysIndexes.scope.toBase58()) {
        case this._gameHandler.asStatic().SAGE_PROGRAM_ID:
          scopeLabel = "sage";
          break;
        case this._gameHandler.asStatic().POINTS_PROGRAM_ID:
          scopeLabel = "points";
          break;
        case this._gameHandler.asStatic().POINTS_STORE_PROGRAM_ID:
          scopeLabel = "points_store";
          break;
        case this._gameHandler.asStatic().PLAYER_PROFILE_PROGRAM_ID:
          scopeLabel = "default";
          break;
      }

      return {
        idx: index, // !Most important
        expireTime: Number(keysIndexes.expireTime),
        account: keysIndexes.key.toBase58(), // Wallet Public key
        name: "", // Player Profile Name // !Skip For now
        scope: scopeLabel, // public keys for: "sage" | "points" | "points_store" | "default"
        scopeKey: keysIndexes.scope.toBase58(),
        permissions: ProfileHandler.decodePermissions(keysIndexes.permissions),
      };
    });

    // console.table(accountData);
    return accountData;
  }

  async getPlayerProfileName(playerProfile: PublicKey): Promise<string> {
    let allNames = await this.getPlayerName([
      {
        memcmp: {
          offset: 9, // 8 + 1 +32
          bytes: playerProfile.toBase58(),
        },
      },
    ]);

    return allNames.length > 0 ? allNames[0].name : "<Unknown Name>";
  }
  async getPlayerDataSnapshot(playerProfile: PublicKey): Promise<ProfileExpandedData> {
    let fleets = await this._gameHandler.getPlayerProfileFleetsAccounts(playerProfile); // getPlayerProfileFleetsAccounts should be used instead
    let now = new Date().getTime() / 1000; // Time of data being fetched

    let fleetsTableView: { [key: string]: FleetShortPreview } = {};
    let fleetsExtendedView: { [key: string]: FleetPreview } = {};
    for (let f of fleets) {
      let key = f.key.toBase58();
      fleetsExtendedView[key] = await getFleetExtendedViewState(f as any, this._gameHandler as any, now);
      fleetsTableView[key] = await getFleetShortViewState(fleetsExtendedView[key], 60);
    }

    return {
      fleets: { expandDetails: fleetsExtendedView, shortDetails: fleetsTableView },
    } as ProfileExpandedData;
  }
}
