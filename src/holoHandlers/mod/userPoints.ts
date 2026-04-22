import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { KeyedAccountInfo, PublicKey, SystemProgram } from "@solana/web3.js";
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
import { PointsIDL, PointsIDLProgram, UserPointsAccount } from "../IDL/points_constants";
import { PointsPermissions } from "@staratlas/points/src//permissions";
import { PointsCategory } from "@staratlas/points/src/pointsCategory";

/**
 * Check that two `UserPointsAccount` instances are equal
 * @param data1 - first instance
 * @param data2 - second instance
 * @param printOnFalse - whether or not log values if instances are not equal
 * @returns boolean
 */
function userPointsDataEquals(data1: UserPointsAccount, data2: UserPointsAccount, printOnFalse?: "printOnFalse"): boolean {
  const out =
    data1.version === data2.version &&
    data1.profile.equals(data2.profile) &&
    data1.pointCategory.equals(data2.pointCategory) &&
    data1.earnedPoints.eq(data2.earnedPoints) &&
    data1.spentPoints.eq(data2.spentPoints) &&
    data1.level === data2.level &&
    data1.dailyEarnedPoints.eq(data2.dailyEarnedPoints) &&
    data1.lastEarnedPointsTimestamp.eq(data2.lastEarnedPointsTimestamp) &&
    data1.bump === data2.bump;
  if (!out && printOnFalse === "printOnFalse") {
    console.log(`data1: ${JSON.stringify(data1, null, 2)}`);
    console.log(`data2: ${JSON.stringify(data2, null, 2)}`);
  }
  return out;
}

@staticImplements<AccountStatic<UserPoints, PointsIDL>>()
export class UserPoints implements Account {
  static readonly ACCOUNT_NAME: NonNullable<PointsIDL["accounts"]>[number]["name"] = "UserPointsAccount";
  static readonly MIN_DATA_SIZE =
    8 + // discriminator
    1 + //version
    32 + //profile
    32 + //pointCategory
    8 + //earnedPoints
    8 + //spentPoints
    2 + //level
    8 + //dailyEarnedPoints
    8 + //lastEarnedPointsTimestamp
    1; //bump

  constructor(private _data: UserPointsAccount, private _key: PublicKey) {}

  get data(): Readonly<UserPointsAccount> {
    return this._data;
  }

  get key(): PublicKey {
    return this._key;
  }

  /**
   * Find the `UserPointsAccount` address
   * @param program - the points program
   * @param pointsCategory - the points category
   * @param userProfile - the user's profile
   * @returns PDA of the account and its bump
   */
  static findAddress(program: PointsIDLProgram, pointsCategory: PublicKey, userProfile: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("UserPointsAccount"), pointsCategory.toBuffer(), userProfile.toBuffer()],
      program.programId
    );
  }

  /**
   * Create User Point Account
   * @param program - the points program
   * @param userProfile - the user's profile
   * @param pointsCategory - the points category
   * @returns address of the new account & InstructionReturn
   */
  static createUserPointAccount(
    program: PointsIDLProgram,
    userProfile: PublicKey,
    pointsCategory: PublicKey
  ): {
    instructions: InstructionReturn;
    pointAccountAddress: [PublicKey, number];
  } {
    const pointAccountAddress = this.findAddress(program, pointsCategory, userProfile);
    return {
      instructions: async (funder) => [
        {
          instruction: await program.methods
            .createUserPointAccount()
            .accountsStrict({
              userProfile,
              funder: funder.publicKey(),
              pointCategoryAccount: pointsCategory,
              userPointsAccount: pointAccountAddress[0],
              systemProgram: SystemProgram.programId,
            })
            .instruction(),
          signers: [funder],
        },
      ],
      pointAccountAddress,
    };
  }

  /**
   * Create User Point Account With License
   * Used when creating a new user points category requires a "license" (aka a token account)
   * @param program - the points program
   * @param userProfile - the user's profile
   * @param pointsCategory - the points category
   * @param tokenAccountOwner - owner of the license token account
   * @param licenseTokenAccount - the token account that represents the license
   * @returns address of the new account & InstructionReturn
   */
  static createUserPointAccountWithLicense(
    program: PointsIDLProgram,
    userProfile: PublicKey,
    pointsCategory: { category: PointsCategory } | { key: PublicKey; licenseMintOrVault: PublicKey },
    tokenAccountOwner: AsyncSigner,
    licenseTokenAccount: PublicKey
  ): {
    instructions: InstructionReturn;
    pointAccountAddress: [PublicKey, number];
  } {
    const { pointsCategoryKey, mintOrVault } =
      "category" in pointsCategory
        ? {
            pointsCategoryKey: pointsCategory.category.key,
            mintOrVault:
              pointsCategory.category.data.transferTokensToVault === 1
                ? pointsCategory.category.data.tokenVault
                : pointsCategory.category.data.tokenMint,
          }
        : {
            pointsCategoryKey: pointsCategory.key,
            mintOrVault: pointsCategory.licenseMintOrVault,
          };

    const pointAccountAddress = this.findAddress(program, pointsCategoryKey, userProfile);

    return {
      instructions: async (funder) => [
        {
          instruction: await program.methods
            .createUserPointAccountWithLicense()
            .accountsStrict({
              userProfile,
              funder: funder.publicKey(),
              category: pointsCategoryKey,
              userPointsAccount: pointAccountAddress[0],
              tokenAccountOwner: tokenAccountOwner.publicKey(),
              userTokenAccount: licenseTokenAccount,
              mintOrVault,
              tokenProgram: TOKEN_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
            })
            .instruction(),
          signers: [tokenAccountOwner, funder],
        },
      ],
      pointAccountAddress,
    };
  }

  /**
   * Spend Points
   * @param program - the points program
   * @param keyInput - key permitted to sign the instruction bundled with the profile that holds permissions and the key's index in the profile
   * @param pointsCategory - the points category
   * @param amount - amount to spend
   * @param userPointsAccount - the user points account
   * @returns InstructionReturn
   */
  static spendPoints(
    program: PointsIDLProgram,
    keyInput: ProfileKeyInput<PointsPermissions, AsyncSigner>,
    pointsCategory: PublicKey,
    amount: BN,
    userPointsAccount?: PublicKey
  ): InstructionReturn {
    const foundKey = findKeyInProfile(
      profileKeyInputToFindKeyInput(keyInput, [program.programId, pointsCategory], PointsPermissions.spendPointsPermissions()),
      PointsPermissions
    );
    if ("error" in foundKey) {
      throw foundKey.error;
    }

    return async () => [
      {
        instruction: await program.methods
          .spendPoints(amount, foundKey.keyIndex)
          .accountsStrict({
            spender: foundKey.key.publicKey(),
            spenderProfile: foundKey.profileKey,
            category: pointsCategory,
            userPointsAccount: userPointsAccount || UserPoints.findAddress(program, pointsCategory, foundKey.profileKey)[0],
          })
          .instruction(),
        signers: [foundKey.key],
      },
    ];
  }

  static decodeData(account: KeyedAccountInfo, program: PointsIDLProgram): DecodedAccountData<UserPoints> {
    return decodeAccount(account, program, UserPoints);
  }
}
