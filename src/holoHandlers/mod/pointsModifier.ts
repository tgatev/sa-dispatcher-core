import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { AccountMeta, KeyedAccountInfo, PublicKey, SystemProgram } from "@solana/web3.js";
import { BN } from "@staratlas/anchor";
import {
  Account,
  AccountStatic,
  AsyncSigner,
  DecodedAccountData,
  InstructionReturn,
  decodeAccount,
  staticImplements,
} from "@staratlas/data-source";
import { ProfileKeyInput, findKeyInProfile, profileKeyInputToFindKeyInput } from "@staratlas/player-profile";
import { PointsIDL, PointsIDLProgram, PointsModifierAccount } from "../IDL/points_constants";
import { PointsPermissions } from "@staratlas/points/src/permissions";
import { UserPoints } from "./userPoints";

export interface IncrementPointsInput {
  points: BN;
  dailyPointsLimit?: BN;
}

/**
 * Check that two `PointsModifierAccount` instances are equal
 * @param data1 - first instance
 * @param data2 - second instance
 * @returns boolean
 */
export function pointsModifierDataEquals(data1: PointsModifierAccount, data2: PointsModifierAccount): boolean {
  return (
    data1.version === data2.version &&
    data1.pointCategory.equals(data2.pointCategory) &&
    data1.canIncrement === data2.canIncrement &&
    data1.canDecrement === data2.canDecrement
  );
}

@staticImplements<AccountStatic<PointsModifier, PointsIDL>>()
export class PointsModifier implements Account {
  static readonly ACCOUNT_NAME: NonNullable<PointsIDL["accounts"]>[number]["name"] = "PointsModifier";
  static readonly MIN_DATA_SIZE =
    8 + // discriminator
    1 + // version
    32 + // pointCategory
    1 + // canIncrement
    1; // canDecrement

  constructor(private _data: PointsModifierAccount, private _key: PublicKey) {}

  get data(): Readonly<PointsModifierAccount> {
    return this._data;
  }

  get key(): Readonly<PublicKey> {
    return this._key;
  }

  /**
   * Register a points modifier (minimal bare bones version)
   * @param program - the points program
   * @param key - the key authorized to run this instruction
   * @param profile - the profile with the required permissions for the instruction
   * @param pointsCategory - the points category
   * @param modifier - the points modifier
   * @param canIncrement - whether the modifier can increment points
   * @param canDecrement - whether the modifier can decrement points
   * @param keyIndex - the index of the `key` in the `profile` permissions list
   * @returns InstructionReturn
   */
  static registerPointModifierBareBones(
    program: PointsIDLProgram,
    key: AsyncSigner,
    profile: PublicKey,
    pointsCategory: PublicKey,
    modifier: AsyncSigner,
    canIncrement: boolean,
    canDecrement: boolean,
    keyIndex: number
  ): InstructionReturn {
    return async (funder) => [
      {
        instruction: await program.methods
          .registerPointModifier(canIncrement, canDecrement, keyIndex)
          .accountsStrict({
            key: key.publicKey(),
            profile,
            funder: funder.publicKey(),
            category: pointsCategory,
            pointsModifierAccount: modifier.publicKey(),
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
        signers: [key, funder, modifier],
      },
    ];
  }

  /**
   * Register a points modifier
   * @param program - the points program
   * @param keyInput - key permitted to sign the instruction bundled with the profile that holds permissions and the key's index in the profile
   * @param pointsCategory - the points category
   * @param modifier - the points modifier
   * @param canIncrement - whether the modifier can increment points
   * @param canDecrement - whether the modifier can decrement points
   * @returns InstructionReturn
   */
  static registerPointModifier(
    program: PointsIDLProgram,
    keyInput: ProfileKeyInput<PointsPermissions, AsyncSigner>,
    pointsCategory: PublicKey,
    modifier: AsyncSigner,
    canIncrement: boolean,
    canDecrement: boolean
  ): InstructionReturn {
    const foundKey = findKeyInProfile(
      profileKeyInputToFindKeyInput(keyInput, [program.programId, pointsCategory], PointsPermissions.modifierPermissions()),
      PointsPermissions
    );
    if ("error" in foundKey) {
      throw foundKey.error;
    }

    return PointsModifier.registerPointModifierBareBones(
      program,
      foundKey.key,
      foundKey.profileKey,
      pointsCategory,
      modifier,
      canIncrement,
      canDecrement,
      foundKey.keyIndex
    );
  }

  /**
   * Deregister a registered points modifier (minimal bare bones version)
   * @param program - the points program
   * @param key - the key authorized to run this instruction
   * @param profile - the profile with the required permissions for the instruction
   * @param fundsTo - recipient of rent refund
   * @param pointsCategory - the points category
   * @param modifier - the points modifier
   * @param keyIndex - the index of the `key` in the `profile` permissions list
   * @returns InstructionReturn
   */
  static deregisterPointModifierBareBones(
    program: PointsIDLProgram,
    key: AsyncSigner,
    profile: PublicKey,
    fundsTo: PublicKey | "funder",
    pointsCategory: PublicKey,
    modifier: PublicKey,
    keyIndex: number
  ): InstructionReturn {
    return async (funder) => [
      {
        instruction: await program.methods
          .deregisterPointModifier(keyIndex)
          .accountsStrict({
            key: key.publicKey(),
            profile,
            fundsTo: fundsTo === "funder" ? funder.publicKey() : fundsTo,
            category: pointsCategory,
            pointsModifierAccount: modifier,
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
        signers: [key],
      },
    ];
  }

  /**
   * Deregister a registered points modifier
   * @param program - the points program
   * @param keyInput - key permitted to sign the instruction bundled with the profile that holds permissions and the key's index in the profile
   * @param fundsTo - recipient of rent refund
   * @param pointsCategory - the points category
   * @param modifier - the points modifier
   * @returns InstructionReturn
   */
  static deregisterPointModifier(
    program: PointsIDLProgram,
    keyInput: ProfileKeyInput<PointsPermissions, AsyncSigner>,
    fundsTo: PublicKey | "funder",
    pointsCategory: PublicKey,
    modifier: PublicKey
  ): InstructionReturn {
    const foundKey = findKeyInProfile(
      profileKeyInputToFindKeyInput(keyInput, [program.programId, pointsCategory], PointsPermissions.modifierPermissions()),
      PointsPermissions
    );
    if ("error" in foundKey) {
      throw foundKey.error;
    }

    return PointsModifier.deregisterPointModifierBareBones(
      program,
      foundKey.key,
      foundKey.profileKey,
      fundsTo,
      pointsCategory,
      modifier,
      foundKey.keyIndex
    );
  }

  /**
   * Increment points
   * @param program - the points program
   * @param modifier - the points modifier
   * @param pointsCategory - the points category
   * @param pointsAccount - the user points account
   * @param input - the input parameters
   * @param input.pointsValue - amount of points to increment
   * @param input.dailyPointsLimit - the daily points limit
   * @returns InstructionReturn
   */
  static incrementPoints(
    program: PointsIDLProgram,
    modifier: AsyncSigner,
    pointsCategory: PublicKey,
    pointsAccount: { key: PublicKey } | { profile: PublicKey },
    input: IncrementPointsInput
  ): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .incrementPoints({
            ...input,
            dailyPointsLimit: input.dailyPointsLimit ?? null,
          })
          .accountsStrict({
            category: pointsCategory,
            userPointsAccount:
              "key" in pointsAccount ? pointsAccount.key : UserPoints.findAddress(program, pointsCategory, pointsAccount.profile)[0],
            pointsModifierAccount: modifier.publicKey(),
          })
          .instruction(),
        signers: [modifier],
      },
    ];
  }

  /**
   * Decrement points
   * @param program - the points program
   * @param modifier - the points modifier
   * @param pointsCategory - the points category
   * @param pointsAccount - the user points account
   * @param pointsValue - amount of points to decrement
   * @returns InstructionReturn
   */
  static decrementPoints(
    program: PointsIDLProgram,
    modifier: AsyncSigner,
    pointsCategory: PublicKey,
    pointsAccount: { key: PublicKey } | { profile: PublicKey },
    pointsValue: BN
  ): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .decrementPoints(pointsValue)
          .accountsStrict({
            category: pointsCategory,
            userPointsAccount:
              "key" in pointsAccount ? pointsAccount.key : UserPoints.findAddress(program, pointsCategory, pointsAccount.profile)[0],
            pointsModifierAccount: modifier.publicKey(),
          })
          .instruction(),
        signers: [modifier],
      },
    ];
  }

  /**
   * Increment user points account level
   * @param program - the points program
   * @param modifier - the points modifier
   * @param pointsCategory - the points category
   * @param pointsAccount - the user points account
   * @param nextLevelIndex - the index of the desired points level
   * @param tokenFromAuthority - the transfer authority of `tokenFrom`. Must be provided if the desired points
   * level `tokenQty` field is > 0
   * @param tokenFrom - the source token account for tokens required for the level upgrade. Must be provided if
   * the desired points level `tokenQty` field is > 0
   * @param tokenMintOrVault - the token mint or vault required for the desired license level. Must be provided if
   * the desired points level `tokenQty` field is > 0.  If mint must match the `tokenFrom`; if vault must match the
   * `tokenVault` field in the desired points level
   * @returns InstructionReturn
   */
  static incrementLevel(
    program: PointsIDLProgram,
    modifier: AsyncSigner,
    pointsCategory: PublicKey,
    pointsAccount: { key: PublicKey } | { profile: PublicKey },
    nextLevelIndex: number,
    tokenFromAuthority?: AsyncSigner,
    tokenFrom?: PublicKey,
    tokenMintOrVault?: PublicKey
  ): InstructionReturn {
    const signers = [modifier];
    const remainingAccounts: AccountMeta[] = [];
    if (tokenFromAuthority && tokenFrom) {
      if (!signers.map((it) => it.publicKey().toBase58()).includes(tokenFromAuthority.publicKey().toBase58())) {
        signers.push(tokenFromAuthority);
      }
      remainingAccounts.push(
        ...[
          {
            pubkey: tokenFromAuthority.publicKey(),
            isSigner: true,
            isWritable: true,
          },
          {
            pubkey: tokenFrom,
            isSigner: false,
            isWritable: true,
          },
          {
            pubkey: tokenMintOrVault || PublicKey.default,
            isSigner: false,
            isWritable: true,
          },
          {
            pubkey: TOKEN_PROGRAM_ID,
            isSigner: false,
            isWritable: false,
          },
        ]
      );
    }
    return async () => [
      {
        instruction: await program.methods
          .incrementLevel({ nextLevelIndex })
          .accountsStrict({
            category: pointsCategory,
            userPointsAccount:
              "key" in pointsAccount ? pointsAccount.key : UserPoints.findAddress(program, pointsCategory, pointsAccount.profile)[0],
            pointsModifierAccount: modifier.publicKey(),
          })
          .remainingAccounts(remainingAccounts)
          .instruction(),
        signers,
      },
    ];
  }

  /**
   * Increment user account level after user has attained highest level as defined in the levels array
   * @param program - the points program
   * @param modifier - the points modifier
   * @param pointsCategory - the points category
   * @param pointsAccount - the user points account
   * @returns InstructionReturn
   */
  static incrementLevelBeyondThreshold(
    program: PointsIDLProgram,
    modifier: AsyncSigner,
    pointsCategory: PublicKey,
    pointsAccount: { key: PublicKey } | { profile: PublicKey }
  ): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .incrementLevelBeyondThreshold()
          .accountsStrict({
            category: pointsCategory,
            userPointsAccount:
              "key" in pointsAccount ? pointsAccount.key : UserPoints.findAddress(program, pointsCategory, pointsAccount.profile)[0],
            pointsModifierAccount: modifier.publicKey(),
          })
          .instruction(),
        signers: [modifier],
      },
    ];
  }

  /**
   * Decrement user points account level
   * @param program - the points program
   * @param modifier - the points modifier
   * @param pointsCategory - the points category
   * @param pointsAccount - the user points account
   * @param decrementToLevelIndex - the index of the level you wish to decrement the user level to
   * @returns InstructionReturn
   */
  static decrementLevel(
    program: PointsIDLProgram,
    modifier: AsyncSigner,
    pointsCategory: PublicKey,
    pointsAccount: { key: PublicKey } | { profile: PublicKey },
    decrementToLevelIndex: number
  ): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .decrementLevel({ decrementToLevelIndex })
          .accountsStrict({
            category: pointsCategory,
            userPointsAccount:
              "key" in pointsAccount ? pointsAccount.key : UserPoints.findAddress(program, pointsCategory, pointsAccount.profile)[0],
            pointsModifierAccount: modifier.publicKey(),
          })
          .instruction(),
        signers: [modifier],
      },
    ];
  }

  static decodeData(account: KeyedAccountInfo, program: PointsIDLProgram): DecodedAccountData<PointsModifier> {
    return decodeAccount(account, program, PointsModifier);
  }
}
