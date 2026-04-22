import { AccountMeta, KeyedAccountInfo, PublicKey, SystemProgram } from "@solana/web3.js";
import { BN } from "@staratlas/anchor";
import {
  Account,
  AccountStatic,
  AsyncSigner,
  DecodedAccountData,
  InstructionReturn,
  assertNever,
  decodeAccountWithRemaining,
  staticImplements,
} from "@staratlas/data-source";
import { ProfileKeyInput, findKeyInProfile, profileKeyInputToFindKeyInput } from "@staratlas/player-profile";
import {
  CreatePointCategoryInput,
  LicenseTypeIDL,
  PointsCategoryData,
  PointsIDL,
  PointsIDLProgram,
  PointsLevel,
  UpdatePointCategoryInput,
} from "../IDL/points_constants";

import { PointsPermissions } from "@staratlas/points/src/permissions";

/**
 * Check that two `PointsCategoryData` instances are equal
 * @param data1 - first instance
 * @param data2 - second instance
 * @param printOnFalse - whether or not log values if instances are not equal
 * @returns boolean
 */
export function pointsCategoryDataEquals(data1: PointsCategoryData, data2: PointsCategoryData, printOnFalse?: "printOnFalse"): boolean {
  const out =
    data1.version === data2.version &&
    data1.profile.equals(data2.profile) &&
    data1.tokenRequired === data2.tokenRequired &&
    data1.tokenMint.equals(data2.tokenMint) &&
    data1.tokenQty.eq(data2.tokenQty) &&
    data1.transferTokensToVault === data2.transferTokensToVault &&
    data1.tokenVault.equals(data2.tokenVault) &&
    data1.pointLimit.eq(data2.pointLimit) &&
    data1.postLevelsUpgradeThreshold.eq(data2.postLevelsUpgradeThreshold) &&
    data1.isSpendable === data2.isSpendable;
  if (!out && printOnFalse === "printOnFalse") {
    console.log(`data1: ${JSON.stringify(data1, null, 2)}`);
    console.log(`data2: ${JSON.stringify(data2, null, 2)}`);
  }
  return out;
}

export type LicenseType =
  | {
      type: "none";
    }
  | {
      type: "burn";
      quantity: BN;
      mint: PublicKey;
    }
  | {
      type: "vault";
      quantity: BN;
      mint: PublicKey;
      vault: PublicKey;
    };

/**
 * The license type required for an individual points level
 * Can be:
 *     1. None: no license
 *     2. Burn: requires a license and burns tokens
 *     3. Vault: requires a license and transfers tokens to vault
 */
export enum PointsLevelLicenseType {
  /// No license required
  None = 1,
  /// Requires burning tokens
  Burn = 2,
  /// Requires transferring tokens to a vault
  Vault = 3,
}

@staticImplements<AccountStatic<PointsCategory, PointsIDL>>()
export class PointsCategory implements Account {
  static readonly ACCOUNT_NAME: NonNullable<PointsIDL["accounts"]>[number]["name"] = "PointCategory";
  static readonly MIN_DATA_SIZE =
    8 + // Anchor discriminant
    1 + // version
    32 + // profile
    1 + // token_required
    32 + // token_mint
    8 + // token_qty
    1 + // transfer_tokens_to_vault
    32 + // token_vault
    8 + // point_limit
    1 + // is_spendable
    8; // postLevelsUpgradeThreshold

  constructor(private _data: PointsCategoryData, private _key: PublicKey, private _levels: PointsLevel[]) {}

  get data(): Readonly<PointsCategoryData> {
    return this._data;
  }

  get key(): Readonly<PublicKey> {
    return this._key;
  }

  get levels(): Readonly<PointsLevel[]> {
    return this._levels || [];
  }

  /**
   * Register Point Category Account
   * @param program - the points program
   * @param profile - the profile that will own the new points category
   * @param category - the points category
   * @param dataParams - input params
   * @param dataParams.licenseType - the type of license desired
   * @param dataParams.pointLimit - max points limit
   * @param dataParams.isSpendable - whether the points are spendable
   * @returns InstructionReturn
   */
  static registerPointCategory(
    program: PointsIDLProgram,
    profile: PublicKey,
    category: AsyncSigner,
    dataParams: {
      licenseType: LicenseType;
      pointLimit?: BN;
      isSpendable: boolean;
    }
  ): InstructionReturn {
    const remainingAccounts: AccountMeta[] = [];

    let license: LicenseTypeIDL;
    switch (dataParams.licenseType.type) {
      case "none":
        license = { none: {} };
        break;
      case "burn":
        license = { burn: { quantity: dataParams.licenseType.quantity } };
        remainingAccounts.push({
          pubkey: dataParams.licenseType.mint,
          isSigner: false,
          isWritable: false,
        });
        break;
      case "vault":
        license = { vault: { quantity: dataParams.licenseType.quantity } };
        remainingAccounts.push({
          pubkey: dataParams.licenseType.mint,
          isSigner: false,
          isWritable: false,
        });
        remainingAccounts.push({
          pubkey: dataParams.licenseType.vault,
          isSigner: false,
          isWritable: false,
        });
        break;
      default:
        assertNever(dataParams.licenseType);
    }

    const create: CreatePointCategoryInput = {
      // TODO: Why anchor... Why...
      license: license as never,
      pointLimit: dataParams.pointLimit ?? null,
      isSpendable: dataParams.isSpendable,
      keyIndex: 0,
    };

    return async (funder) => [
      {
        instruction: await program.methods
          .createPointCategory(create)
          .accountsStrict({
            profile,
            funder: funder.publicKey(),
            category: category.publicKey(),
            systemProgram: SystemProgram.programId,
          })
          .remainingAccounts(remainingAccounts)
          .instruction(),
        signers: [funder, category],
      },
    ];
  }

  /**
   * Update Point Category Account
   * @param program - the points program
   * @param key - the key authorized to run this instruction
   * @param profile - the profile with the required permissions for the instruction
   * @param pointsCategory - the points category
   * @param newData - input params
   * @param newData.pointLimit - max points limit
   * @param newData.newLicense - the type of license desired
   * @param newData.isSpendable - whether the points are spendable
   * @param newData.postLevelsUpgradeThreshold - the number of points required to upgrade a level after a user gets to the last level as set in the levels array.
   * @param newData.keyIndex - the index of the `key` in the `profile` permissions list
   * @returns InstructionReturn
   */
  static updatePointCategoryBareBones(
    program: PointsIDLProgram,
    key: AsyncSigner,
    profile: PublicKey,
    pointsCategory: PublicKey,
    newData: {
      pointLimit?: BN;
      newLicense?: LicenseType;
      isSpendable?: boolean;
      postLevelsUpgradeThreshold?: BN;
      keyIndex: number;
    }
  ): InstructionReturn {
    const remainingAccounts: AccountMeta[] = [];
    const data: UpdatePointCategoryInput = {
      pointLimit: newData.pointLimit === undefined ? null : newData.pointLimit,
      isSpendable: newData.isSpendable === undefined ? null : newData.isSpendable,
      postLevelsUpgradeThreshold: newData.postLevelsUpgradeThreshold === undefined ? null : newData.postLevelsUpgradeThreshold,
      keyIndex: newData.keyIndex,
      newLicense: ((): LicenseTypeIDL | null => {
        if (newData.newLicense === undefined) {
          return null;
        }
        switch (newData.newLicense.type) {
          case "none":
            return { none: {} };
          case "burn":
            remainingAccounts.push({
              pubkey: newData.newLicense.mint,
              isWritable: false,
              isSigner: false,
            });
            return { burn: { quantity: newData.newLicense.quantity } };
          case "vault":
            remainingAccounts.push({
              pubkey: newData.newLicense.mint,
              isWritable: false,
              isSigner: false,
            });
            remainingAccounts.push({
              pubkey: newData.newLicense.vault,
              isWritable: false,
              isSigner: false,
            });
            return { vault: { quantity: newData.newLicense.quantity } };
          default:
            assertNever(newData.newLicense);
        }
        // TODO: Fix this never cast from anchor...
      })() as never,
    };

    return async (funder) => [
      {
        instruction: await program.methods
          .updatePointCategory(data)
          .accountsStrict({
            key: key.publicKey(),
            profile,
            category: pointsCategory,
            systemProgram: SystemProgram.programId,
          })
          .remainingAccounts(remainingAccounts)
          .instruction(),
        signers: [key],
      },
    ];
  }

  /**
   * Update Point Category Account
   * @param program - the points program
   * @param keyInput - key permitted to sign the instruction bundled with the profile that holds permissions and the key's index in the profile
   * @param pointsCategory - the points category
   * @param newData - input params
   * @param newData.pointLimit - max points limit
   * @param newData.newLicense - the type of license desired
   * @param newData.isSpendable - whether the points are spendable
   * @param newData.postLevelsUpgradeThreshold - the number of points required to upgrade a level after a user gets to the last level as set in the levels array.
   * @returns InstructionReturn
   */
  static updatePointCategory(
    program: PointsIDLProgram,
    keyInput: ProfileKeyInput<PointsPermissions, AsyncSigner>,
    pointsCategory: PublicKey,
    newData: {
      pointLimit?: BN;
      newLicense?: LicenseType;
      isSpendable?: boolean;
      postLevelsUpgradeThreshold?: BN;
    }
  ): InstructionReturn {
    const foundKey = findKeyInProfile(
      profileKeyInputToFindKeyInput(keyInput, [program.programId, pointsCategory], PointsPermissions.categoryPermissions()),
      PointsPermissions
    );
    if ("error" in foundKey) {
      throw foundKey.error;
    }

    return PointsCategory.updatePointCategoryBareBones(program, foundKey.key, foundKey.profileKey, pointsCategory, {
      ...newData,
      keyIndex: foundKey.keyIndex,
    });
  }

  /**
   * Add Point Category level (minimal bare bones version)
   * @param program - the points program
   * @param key - the key authorized to run this instruction
   * @param profile - the profile with the required permissions for the instruction
   * @param pointsCategory - the points category
   * @param input - input params
   * @param input.level - the level
   * @param input.points - the amount of points required for this level i.e. the amount needed to upgrade to
   * this level from level 0
   * @param input.licenseType - the type of license required for this level
   * @param input.tokenQty - the quantity of tokens required for this level
   * @param input.tokenVault - if token vault to be used if `input.tokenQty` > 0 and `input.licenseType` === PointsLevelLicenseType.Vault
   * @param input.keyIndex - the index of the `key` in the `profile` permissions list
   * @returns InstructionReturn
   */
  static addPointCategoryLevelBareBones(
    program: PointsIDLProgram,
    key: AsyncSigner,
    profile: PublicKey,
    pointsCategory: PublicKey,
    input: {
      level: number;
      points: BN;
      licenseType: PointsLevelLicenseType;
      tokenQty?: BN;
      tokenVault?: PublicKey;
      keyIndex: number;
    }
  ): InstructionReturn {
    const remainingAccounts: AccountMeta[] = [];
    if (input.licenseType !== PointsLevelLicenseType.None) {
      if (!input.tokenQty || !input.tokenQty.gt(new BN(0))) {
        throw "token quantity is required";
      }
      if (input.licenseType === PointsLevelLicenseType.Vault) {
        if (!input.tokenVault) {
          throw "token vault is required";
        }
        remainingAccounts.push({
          pubkey: input.tokenVault,
          isWritable: false,
          isSigner: false,
        });
      }
    }
    return async (funder) => [
      {
        instruction: await program.methods
          .addPointCategoryLevel({
            level: input.level,
            points: input.points,
            license: input.licenseType,
            tokenQty: input.tokenQty ? input.tokenQty : null,
            keyIndex: input.keyIndex,
          })
          .accountsStrict({
            key: key.publicKey(),
            funder: funder.publicKey(),
            profile,
            category: pointsCategory,
            systemProgram: SystemProgram.programId,
          })
          .remainingAccounts(remainingAccounts)
          .instruction(),
        signers: [key, funder],
      },
    ];
  }

  /**
   * Add Point Category level
   * @param program - the points program
   * @param keyInput - key permitted to sign the instruction bundled with the profile that holds permissions
   * and the key's index in the profile
   * @param pointsCategory - the points category
   * @param input - input params
   * @param input.level - the level
   * @param input.points - the amount of points required for this level i.e. the amount needed to upgrade to
   * this level from level 0
   * @param input.licenseType - the type of license required for this level
   * @param input.tokenQty - the quantity of tokens required for this level
   * @param input.tokenVault - if token vault to be used if `input.tokenQty` > 0 and `input.licenseType` === PointsLevelLicenseType.Vault
   * @returns InstructionReturn
   */
  static addPointCategoryLevel(
    program: PointsIDLProgram,
    keyInput: ProfileKeyInput<PointsPermissions, AsyncSigner>,
    pointsCategory: PublicKey,
    input: {
      level: number;
      points: BN;
      licenseType: PointsLevelLicenseType;
      tokenQty?: BN;
      tokenVault?: PublicKey;
    }
  ): InstructionReturn {
    const foundKey = findKeyInProfile(
      profileKeyInputToFindKeyInput(keyInput, [program.programId, pointsCategory], PointsPermissions.categoryPermissions()),
      PointsPermissions
    );
    if ("error" in foundKey) {
      throw foundKey.error;
    }

    return PointsCategory.addPointCategoryLevelBareBones(program, foundKey.key, foundKey.profileKey, pointsCategory, {
      ...input,
      keyIndex: foundKey.keyIndex,
    });
  }

  /**
   * Remove Point Category level (minimal bare bones version)
   * @param program - the points program
   * @param key - the key authorized to run this instruction
   * @param profile - the profile with the required permissions for the instruction
   * @param fundsTo - recipient of rent refund
   * @param pointsCategory - the points category
   * @param input - input params
   * @param input.levelIndex - the index of the level to be removed
   * @param input.keyIndex - the index of the `key` in the `profile` permissions list
   * @returns InstructionReturn
   */
  static removePointCategoryLevelBareBones(
    program: PointsIDLProgram,
    key: AsyncSigner,
    profile: PublicKey,
    fundsTo: PublicKey | "funder",
    pointsCategory: PublicKey,
    input: {
      levelIndex: number;
      keyIndex: number;
    }
  ): InstructionReturn {
    return async (funder) => [
      {
        instruction: await program.methods
          .removePointCategoryLevel({
            levelIndex: input.levelIndex,
            keyIndex: input.keyIndex,
          })
          .accountsStrict({
            key: key.publicKey(),
            fundsTo: fundsTo === "funder" ? funder.publicKey() : fundsTo,
            profile,
            category: pointsCategory,
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
        signers: [key],
      },
    ];
  }

  /**
   * Remove Point Category level
   * @param program - the points program
   * @param keyInput - key permitted to sign the instruction bundled with the profile that holds permissions and the key's index in the profile
   * @param fundsTo - recipient of rent refund
   * @param pointsCategory - the points category
   * @param input - input params
   * @param input.levelIndex - the index of the level to be removed
   * @returns InstructionReturn
   */
  static removePointCategoryLevel(
    program: PointsIDLProgram,
    keyInput: ProfileKeyInput<PointsPermissions, AsyncSigner>,
    fundsTo: PublicKey | "funder",
    pointsCategory: PublicKey,
    input: {
      levelIndex: number;
    }
  ): InstructionReturn {
    const foundKey = findKeyInProfile(
      profileKeyInputToFindKeyInput(keyInput, [program.programId, pointsCategory], PointsPermissions.categoryPermissions()),
      PointsPermissions
    );
    if ("error" in foundKey) {
      throw foundKey.error;
    }

    return PointsCategory.removePointCategoryLevelBareBones(program, foundKey.key, foundKey.profileKey, fundsTo, pointsCategory, {
      ...input,
      keyIndex: foundKey.keyIndex,
    });
  }

  static decodeData(account: KeyedAccountInfo, program: PointsIDLProgram): DecodedAccountData<PointsCategory> {
    const LIST_COUNTER_LEN = 4; // u16
    const POINTS_LEVEL_SIZE = 2 + 8 + 32 + 8; // u16 + u64 + Pubkey + u64

    return decodeAccountWithRemaining(account, program, PointsCategory, (remainingData, _data) =>
      Array((account.accountInfo.data.length - (PointsCategory.MIN_DATA_SIZE + LIST_COUNTER_LEN)) / POINTS_LEVEL_SIZE)
        .fill(0)
        .map((_, index) =>
          program.coder.types.decode<PointsLevel>(
            "PointsLevel",
            remainingData.subarray(POINTS_LEVEL_SIZE * index + LIST_COUNTER_LEN).subarray(0, POINTS_LEVEL_SIZE)
          )
        )
    );
  }
}
