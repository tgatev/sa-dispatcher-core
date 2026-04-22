import { KeyedAccountInfo, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  Account,
  AccountStatic,
  AsyncSigner,
  DecodedAccountData,
  InstructionReturn,
  decodeAccount,
  staticImplements,
} from "@staratlas/data-source";
import { DeregisterResourceInput, ResourceAccount } from "../IDL/constants";

import { SageIDL, SageIDLProgram } from "../IDL/constants";
export enum LocationType {
  Planet = 1,
}

/**
 * Check if two `ResourceAccount` instances are equal
 * @param data1 - first ResourceAccount
 * @param data2 - second ResourceAccount
 * @returns boolean
 */
export function resourceDataEquals(data1: ResourceAccount, data2: ResourceAccount): boolean {
  return (
    data1.version === data2.version &&
    data1.gameId.equals(data2.gameId) &&
    data1.location.equals(data2.location) &&
    data1.mineItem.equals(data2.mineItem) &&
    data1.locationType === data2.locationType &&
    data1.numMiners.eq(data2.numMiners) &&
    data1.amountMined.eq(data2.amountMined) &&
    data1.systemRichness === data2.systemRichness &&
    data1.bump === data2.bump
  );
}

export interface RegisterResourceInput {
  keyIndex: number;
  locationType: number;
  systemRichness: number;
}
export interface UpdateResourceInput {
  systemRichness?: number;
  keyIndex: number;
}

@staticImplements<AccountStatic<Resource, SageIDL>>()
export class Resource implements Account {
  static readonly ACCOUNT_NAME: NonNullable<SageIDL["accounts"]>[number]["name"] = "Resource";
  static readonly MIN_DATA_SIZE =
    8 + // discriminator
    1 + // version
    32 + // gameId
    32 + // location
    32 + // mineItem
    1 + // locationType
    8 + // numMiners
    8 + // amountMined
    2 + // systemRichness
    1; // bump;
  static readonly SYSTEM_RICHNESS_DECIMALS = 100;

  constructor(private _data: ResourceAccount, private _key: PublicKey) {}

  get data(): Readonly<ResourceAccount> {
    return this._data;
  }

  get key(): PublicKey {
    return this._key;
  }

  /**
   * Finds the Resource account address
   * @param program - SAGE program
   * @param mineItem - the `MineItem` associated with the resource
   * @param location - the location of the resource e.g. a planet
   * @returns - The PDA and bump respectively
   */
  static findAddress(program: SageIDLProgram, mineItem: PublicKey, location: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from("Resource"), mineItem.toBuffer(), location.toBuffer()], program.programId);
  }

  /**
   * Register a new Resource
   * @param program - SAGE program
   * @param key - the key authorized to run this instruction
   * @param profile - the profile with the required permissions for the instruction
   * @param location - the location of the resource e.g. a planet
   * @param mineItem - the `MineItem` associated with the resource
   * @param gameId - the SAGE game id
   * @param input - input params
   * @returns - the new Resource address and InstructionReturn
   */
  static registerResource(
    program: SageIDLProgram,
    key: AsyncSigner,
    profile: PublicKey,
    location: PublicKey,
    mineItem: PublicKey,
    gameId: PublicKey,
    input: RegisterResourceInput
  ): {
    resourceKey: [PublicKey, number];
    instructions: InstructionReturn;
  } {
    const resourceKey = Resource.findAddress(program, mineItem, location);
    return {
      resourceKey,
      instructions: async (funder) => [
        {
          instruction: await program.methods
            .registerResource(input)
            .accountsStrict({
              gameAndProfile: {
                key: key.publicKey(),
                profile,
                gameId,
              },
              funder: funder.publicKey(),
              resource: resourceKey[0],
              location,
              mineItem,
              systemProgram: SystemProgram.programId,
            })
            .instruction(),
          signers: [key, funder],
        },
      ],
    };
  }

  /**
   * Update a Resource
   * @param program - SAGE program
   * @param key - the key authorized to run this instruction
   * @param profile - the profile with the required permissions for the instruction
   * @param resource - the resource being updated
   * @param mineItem - the `MineItem` associated with the resource
   * @param gameId - the SAGE game id
   * @param input - input params
   * @returns InstructionReturn
   */
  static updateResource(
    program: SageIDLProgram,
    key: AsyncSigner,
    profile: PublicKey,
    resource: PublicKey,
    mineItem: PublicKey,
    gameId: PublicKey,
    input: UpdateResourceInput
  ): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .updateResource({
            ...input,
            systemRichness: input.systemRichness == null ? null : input.systemRichness,
          })
          .accountsStrict({
            gameAndProfile: {
              key: key.publicKey(),
              profile,
              gameId,
            },
            mineItem,
            resource,
          })
          .instruction(),
        signers: [key],
      },
    ];
  }

  /**
   * Remove/Delete a Resource
   * @param program - SAGE program
   * @param key - the key authorized to run this instruction
   * @param profile - the profile with the required permissions for the instruction
   * @param fundsTo - the entity that should receive rent refunds
   * @param resource - the resource
   * @param mineItem - the `MineItem` associated with the resource
   * @param location - the location of the resource e.g. a planet
   * @param gameId - the SAGE game id
   * @param input - input params
   * @returns InstructionReturn
   */
  static deregisterResource(
    program: SageIDLProgram,
    key: AsyncSigner,
    profile: PublicKey,
    fundsTo: PublicKey | "funder",
    resource: PublicKey,
    mineItem: PublicKey,
    location: PublicKey,
    gameId: PublicKey,
    input: DeregisterResourceInput
  ): InstructionReturn {
    return async (funder) => [
      {
        instruction: await program.methods
          .deregisterResource(input)
          .accountsStrict({
            gameAndProfile: {
              key: key.publicKey(),
              profile,
              gameId,
            },
            fundsTo: fundsTo === "funder" ? funder.publicKey() : fundsTo,
            resource,
            mineItem,
            location,
          })
          .instruction(),
        signers: [key],
      },
    ];
  }

  static decodeData(account: KeyedAccountInfo, program: SageIDLProgram): DecodedAccountData<Resource> {
    return decodeAccount(account, program, Resource);
  }
}
