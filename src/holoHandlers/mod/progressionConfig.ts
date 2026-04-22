import { KeyedAccountInfo, PublicKey, SystemProgram } from "@solana/web3.js";
import { BN } from "@staratlas/anchor";
import {
  Account,
  AccountStatic,
  AsyncSigner,
  DecodedAccountData,
  InstructionReturn,
  decodeAccountWithRemaining,
  staticImplements,
} from "@staratlas/data-source";
import { ProgressionConfigAccount, ProgressionItem, SageIDL, SageIDLProgram } from "../IDL/constants";

// The different types of progression items
export enum ProgressionItemType {
  // Pilot License Experience for subwarp
  Subwarp,
  // Pilot License Experience for warping
  Warp,
  // Pilot License Experience for warping via starpath
  WarpLane,
  // Pilot License Experience for asteroid exit
  AsteroidExit,
  // Data Running License for scan unsuccessful
  ScanUnsuccessful,
  // Data Running License for scan successful
  ScanSuccessful,
  // Mining License for mining
  Mining,
  // Crafting License for crafting
  Crafting,
  // Loyalty Points - supply resources for upkeep
  Upkeep,
  // Loyalty Points - submit resource for starbase upgrade
  Upgrade,
}

export interface ProgressionItemInput {
  itemType: ProgressionItemType;
  item: ProgressionItem;
}

export interface PointsLimitInput {
  dailyLpLimit?: BN;
  dailyCouncilRankXpLimit?: BN;
  dailyPilotXpLimit?: BN;
  dailyDataRunningXpLimit?: BN;
  dailyMiningXpLimit?: BN;
  dailyCraftingXpLimit?: BN;
}

export interface UpdateProgressionConfigInput extends PointsLimitInput {
  keyIndex: number;
  items?: ProgressionItemInput[];
}

export interface SetProgressionItemsInput {
  keyIndex: number;
  items: ProgressionItemInput[];
}

export interface RegisterProgressionConfigInput extends PointsLimitInput {
  keyIndex: number;
}

/**
 * Check if two `ProgressionConfigAccount` instances are equal
 * @param data1 - first ProgressionConfigAccount
 * @param data2 - second ProgressionConfigAccount
 * @returns a boolean
 */
export function progressionConfigDataEquals(data1: ProgressionConfigAccount, data2: ProgressionConfigAccount): boolean {
  return (
    data1.version === data2.version &&
    data1.gameId.equals(data2.gameId) &&
    data1.dailyLpLimit.eq(data2.dailyLpLimit) &&
    data1.dailyCouncilRankXpLimit.eq(data2.dailyCouncilRankXpLimit) &&
    data1.dailyPilotXpLimit.eq(data2.dailyPilotXpLimit) &&
    data1.dailyDataRunningXpLimit.eq(data2.dailyDataRunningXpLimit) &&
    data1.dailyMiningXpLimit.eq(data2.dailyMiningXpLimit) &&
    data1.dailyCraftingXpLimit.eq(data2.dailyCraftingXpLimit) &&
    data1.numItems === data2.numItems
  );
}

@staticImplements<AccountStatic<ProgressionConfig, SageIDL>>()
export class ProgressionConfig implements Account {
  static readonly ACCOUNT_NAME: NonNullable<SageIDL["accounts"]>[number]["name"] = "ProgressionConfig";
  static readonly MIN_DATA_SIZE =
    8 + // discriminator
    1 + // version
    32 + // gameId
    8 + // dailyLpLimit
    8 + // dailyCouncilRankXpLimit
    8 + // dailyPilotXpLimit
    8 + // dailyDataRunningXpLimit
    8 + // dailyMiningXpLimit
    8 + // dailyCraftingXpLimit
    2; // numSectors
  static readonly PROGRESSION_ITEM_DATA_SIZE = 4;

  constructor(
    private _data: ProgressionConfigAccount,
    private _key: PublicKey,
    private _items: ProgressionItem[],
  ) {}

  get data(): Readonly<ProgressionConfigAccount> {
    return this._data;
  }

  get key(): PublicKey {
    return this._key;
  }

  get items(): Readonly<ProgressionItem[]> {
    return this._items || [];
  }

  /**
   * Finds the address of a `ProgressionConfig` account
   * @param program - the SAGE program
   * @param game - the game id
   * @returns - The PDA and bump respectively
   */
  static findAddress(program: SageIDLProgram, game: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from("ProgressionConfig"), game.toBuffer()], program.programId);
  }

  /**
   * Register a Progression Config
   * @param program - SAGE program
   * @param key - the key authorized to run this instruction
   * @param profile - the profile with the required permissions for the instruction
   * @param gameId - the SAGE game id
   * @param input - instruction input params
   * @returns InstructionReturn
   */
  static registerProgressionConfig(
    program: SageIDLProgram,
    key: AsyncSigner,
    profile: PublicKey,
    gameId: PublicKey,
    input: RegisterProgressionConfigInput,
  ): {
    configKey: [PublicKey, number];
    instructions: InstructionReturn;
  } {
    const configKey = ProgressionConfig.findAddress(program, gameId);
    return {
      configKey,
      instructions: async (funder) => [
        {
          instruction: await program.methods
            .registerProgressionConfig({
              ...input,
              dailyLpLimit: input.dailyLpLimit ?? null,
              dailyCouncilRankXpLimit: input.dailyCouncilRankXpLimit ?? null,
              dailyPilotXpLimit: input.dailyPilotXpLimit ?? null,
              dailyDataRunningXpLimit: input.dailyDataRunningXpLimit ?? null,
              dailyMiningXpLimit: input.dailyMiningXpLimit ?? null,
              dailyCraftingXpLimit: input.dailyCraftingXpLimit ?? null,
            })
            .accountsStrict({
              gameAndProfile: {
                key: key.publicKey(),
                profile,
                gameId,
              },
              funder: funder.publicKey(),
              progressionConfig: configKey[0],
              systemProgram: SystemProgram.programId,
            })
            .instruction(),
          signers: [key, funder],
        },
      ],
    };
  }

  /**
   * Update a Progression Config
   * @param program - SAGE program
   * @param key - the key authorized to run this instruction
   * @param profile - the profile with the required permissions for the instruction
   * @param gameId - the SAGE game id
   * @param input - instruction input params
   * @returns InstructionReturn
   */
  static updateProgressionConfig(
    program: SageIDLProgram,
    key: AsyncSigner,
    profile: PublicKey,
    gameId: PublicKey,
    input: UpdateProgressionConfigInput,
  ): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .updateProgressionConfig({
            keyIndex: input.keyIndex,
            items: input.items ?? null,
            dailyLpLimit: input.dailyLpLimit ?? null,
            dailyCouncilRankXpLimit: input.dailyCouncilRankXpLimit ?? null,
            dailyPilotXpLimit: input.dailyPilotXpLimit ?? null,
            dailyDataRunningXpLimit: input.dailyDataRunningXpLimit ?? null,
            dailyMiningXpLimit: input.dailyMiningXpLimit ?? null,
            dailyCraftingXpLimit: input.dailyCraftingXpLimit ?? null,
          })
          .accountsStrict({
            gameAndProfile: {
              key: key.publicKey(),
              profile,
              gameId,
            },
            progressionConfig: ProgressionConfig.findAddress(program, gameId)[0],
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
        signers: [key],
      },
    ];
  }

  /**
   * Deregister a Progression Config
   * @param program - SAGE program
   * @param key - the key authorized to run this instruction
   * @param profile - the profile with the required permissions for the instruction
   * @param fundsTo - the entity that should receive rent refunds
   * @param gameId - the SAGE game id
   * @param input - instruction input params
   * @returns InstructionReturn
   */
  static deregisterProgressionConfig(
    program: SageIDLProgram,
    key: AsyncSigner,
    profile: PublicKey,
    fundsTo: PublicKey | "funder",
    gameId: PublicKey,
    input: RegisterProgressionConfigInput,
  ): InstructionReturn {
    return async (funder) => [
      {
        instruction: await program.methods
          .deregisterProgressionConfig(input)
          .accountsStrict({
            gameAndProfile: {
              key: key.publicKey(),
              profile,
              gameId,
            },
            fundsTo: fundsTo === "funder" ? funder.publicKey() : fundsTo,
            progressionConfig: ProgressionConfig.findAddress(program, gameId)[0],
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
        signers: [key, funder],
      },
    ];
  }

  static decodeData(account: KeyedAccountInfo, program: SageIDLProgram): DecodedAccountData<ProgressionConfig> {
    return decodeAccountWithRemaining(account, program, ProgressionConfig, (remainingData, data) =>
      Array(data.numItems)
        .fill(0)
        .map((_, index) =>
          program.coder.types.decode<ProgressionItem>(
            "ProgressionItem",
            remainingData
              .subarray(ProgressionConfig.PROGRESSION_ITEM_DATA_SIZE * index)
              .subarray(0, ProgressionConfig.PROGRESSION_ITEM_DATA_SIZE),
          ),
        ),
    );
  }
}
