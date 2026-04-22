import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { KeyedAccountInfo, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  Account,
  AccountStatic,
  arrayDeepEquals,
  AsyncSigner,
  decodeAccount,
  DecodedAccountData,
  InstructionReturn,
  staticImplements,
  transferToTokenAccount,
} from "@staratlas/data-source";
import {
  DeregisterMineItemInput,
  MineItemAccount,
  RegisterMineItemInput,
  SageIDL,
  SageIDLProgram,
  UpdateMineItemInput,
} from "../IDL/constants";

/**
 * Check if two `MineItemAccount` instances are equal
 * @param data1 - first MineItemAccount
 * @param data2 - second MineItemAccount
 * @returns boolean
 */
export function mineItemDataEquals(data1: MineItemAccount, data2: MineItemAccount): boolean {
  return (
    data1.version === data2.version &&
    data1.gameId.equals(data2.gameId) &&
    data1.mint.equals(data2.mint) &&
    arrayDeepEquals(data1.name, data2.name, (a, b) => a === b) &&
    data1.numResourceAccounts.eq(data2.numResourceAccounts) &&
    data1.resourceHardness === data2.resourceHardness &&
    data1.bump === data2.bump
  );
}

export interface CustomUpdateMineItemInput {
  name?: number[];
  resourceHardness?: number;
  keyIndex: number;
}

@staticImplements<AccountStatic<MineItem, SageIDL>>()
export class MineItem implements Account {
  static readonly ACCOUNT_NAME: NonNullable<SageIDL["accounts"]>[number]["name"] = "MineItem";
  static readonly MIN_DATA_SIZE =
    8 + // discriminator
    1 + // version
    32 + // gameId
    32 + // mint
    64 + // name
    8 + // numResourceAccounts
    2 + // resourceHardness
    1; // bump;
  static readonly RESOURCE_HARDNESS_DECIMALS = 100;

  constructor(private _data: MineItemAccount, private _key: PublicKey) {}

  get data(): Readonly<MineItemAccount> {
    return this._data;
  }

  get key(): PublicKey {
    return this._key;
  }

  /**
   * Finds the MineItem account address
   * @param program - SAGE program
   * @param gameId - the SAGE game id
   * @param mint - the `MineItem` mint
   * @returns - The PDA and bump respectively
   */
  static findAddress(program: SageIDLProgram, gameId: PublicKey, mint: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from("MineItem"), gameId.toBuffer(), mint.toBuffer()], program.programId);
  }

  /**
   * Register `MineItem`
   * @param program - SAGE program
   * @param key - the key authorized to run this instruction
   * @param profile - the profile with the required permissions for the instruction
   * @param mint - the `MineItem` mint
   * @param gameId - the SAGE game id
   * @param input - input params
   * @returns - the new MineItem address and InstructionReturn
   */
  static registerMineItem(
    program: SageIDLProgram,
    key: AsyncSigner,
    profile: PublicKey,
    mint: PublicKey,
    gameId: PublicKey,
    input: RegisterMineItemInput
  ): {
    mineItemKey: [PublicKey, number];
    instructions: InstructionReturn;
  } {
    const mineItemKey = MineItem.findAddress(program, gameId, mint);
    return {
      mineItemKey,
      instructions: async (funder) => [
        {
          instruction: await program.methods
            .registerMineItem(input)
            .accountsStrict({
              gameAndProfile: {
                key: key.publicKey(),
                profile,
                gameId,
              },
              funder: funder.publicKey(),
              mineItem: mineItemKey[0],
              mint,
              systemProgram: SystemProgram.programId,
            })
            .instruction(),
          signers: [key, funder],
        },
      ],
    };
  }

  /**
   * Fund a `MineItem` bank
   * @param mineItem - the `MineItem`
   * @param mint - the `MineItem` mint
   * @param tokenFromOwner - the owner of the source token account
   * @param tokenFrom - the source token account
   * @param amount - the amount of tokens
   * @returns InstructionReturn
   */
  static fundMineItemBank(
    mineItem: PublicKey,
    mint: PublicKey,
    tokenFromOwner: AsyncSigner,
    tokenFrom: PublicKey,
    amount: number
  ): InstructionReturn {
    const tokenTo = getAssociatedTokenAddressSync(mint, mineItem, true);
    return transferToTokenAccount(tokenFromOwner, tokenFrom, tokenTo, amount);
  }

  /**
   * Update a `MineItem`
   * @param program - SAGE program
   * @param key - the key authorized to run this instruction
   * @param profile - the profile with the required permissions for the instruction
   * @param mineItem - the `MineItem`
   * @param gameId - the SAGE game id
   * @param input - input params
   * @returns InstructionReturn
   */
  static updateMineItem(
    program: SageIDLProgram,
    key: AsyncSigner,
    profile: PublicKey,
    mineItem: PublicKey,
    gameId: PublicKey,
    input: CustomUpdateMineItemInput
  ): InstructionReturn {
    const params: UpdateMineItemInput = {
      ...input,
      name: input.name == null ? null : (input.name as unknown),
      resourceHardness: input.resourceHardness == null ? null : input.resourceHardness,
    };

    return async () => [
      {
        instruction: await program.methods
          .updateMineItem(params)
          .accountsStrict({
            gameAndProfile: {
              key: key.publicKey(),
              profile,
              gameId,
            },
            mineItem,
          })
          .instruction(),
        signers: [key],
      },
    ];
  }

  /**
   * Drain a `MineItem` token account
   * @param program - SAGE program
   * @param key - the key authorized to run this instruction
   * @param profile - the profile with the required permissions for the instruction
   * @param fundsTo - the entity that should receive rent refunds
   * @param mineItem - the `MineItem`
   * @param gameId - the SAGE game id
   * @param tokenFrom - The mine item token bank to drain
   * @param tokenTo - Where to send tokens from the bank
   * @param input - input params
   * @returns InstructionReturn
   */
  static drainMineItemBank(
    program: SageIDLProgram,
    key: AsyncSigner,
    profile: PublicKey,
    fundsTo: PublicKey | "funder",
    mineItem: PublicKey,
    gameId: PublicKey,
    tokenFrom: PublicKey,
    tokenTo: PublicKey,
    input: DeregisterMineItemInput
  ): InstructionReturn {
    return async (funder) => [
      {
        instruction: await program.methods
          .drainMineItemBank(input)
          .accountsStrict({
            gameAndProfile: {
              key: key.publicKey(),
              profile,
              gameId,
            },
            fundsTo: fundsTo === "funder" ? funder.publicKey() : fundsTo,
            mineItem,
            tokenFrom,
            tokenTo,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction(),
        signers: [key],
      },
    ];
  }

  /**
   * Delete or remove a `MineItem`
   * @param program - SAGE program
   * @param key - the key authorized to run this instruction
   * @param profile - the profile with the required permissions for the instruction
   * @param fundsTo - the entity that should receive rent refunds
   * @param mineItem - the `MineItem`
   * @param gameId - the SAGE game id
   * @param input - input params
   * @returns InstructionReturn
   */
  static deregisterMineItem(
    program: SageIDLProgram,
    key: AsyncSigner,
    profile: PublicKey,
    fundsTo: PublicKey | "funder",
    mineItem: PublicKey,
    gameId: PublicKey,
    input: DeregisterMineItemInput
  ): InstructionReturn {
    return async (funder) => [
      {
        instruction: await program.methods
          .deregisterMineItem(input)
          .accountsStrict({
            gameAndProfile: {
              key: key.publicKey(),
              profile,
              gameId,
            },
            fundsTo: fundsTo === "funder" ? funder.publicKey() : fundsTo,
            mineItem,
          })
          .instruction(),
        signers: [key],
      },
    ];
  }

  static decodeData(account: KeyedAccountInfo, program: SageIDLProgram): DecodedAccountData<MineItem> {
    return decodeAccount(account, program, MineItem);
  }
}
