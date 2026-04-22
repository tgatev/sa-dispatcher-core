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
import { CargoIDL } from ".";
import { CargoIDLProgram, CargoStatsDefinitionAccount, InitDefinitionInput, UpdateDefinitionInput } from "./constants";

/**
 * Checks equality between 2 StatsDefinition Accounts
 * @param data1 - First Stats Definition Account
 * @param data2 - Second Stats Definition Account
 * @returns boolean
 */
export function cargoStatsDefinitionAccountDataEquals(data1: CargoStatsDefinitionAccount, data2: CargoStatsDefinitionAccount): boolean {
  return (
    data1.version === data2.version &&
    data1.authority.equals(data2.authority) &&
    data1.defaultCargoType.equals(data2.defaultCargoType) &&
    data1.statsCount === data2.statsCount &&
    data1.seqId === data2.seqId
  );
}

@staticImplements<AccountStatic<CargoStatsDefinition, CargoIDL>>()
export class CargoStatsDefinition implements Account {
  static readonly ACCOUNT_NAME: NonNullable<CargoIDL["accounts"]>[number]["name"] = "CargoStatsDefinition";
  static readonly MIN_DATA_SIZE: number =
    8 + // discriminator
    1 + //version
    32 + //authority
    32 + //defaultCargoType
    2 + //statsCount
    2; //seqId

  constructor(private _data: CargoStatsDefinitionAccount, private _key: PublicKey) {}

  get data(): Readonly<CargoStatsDefinitionAccount> {
    return this._data;
  }

  get key(): PublicKey {
    return this._key;
  }

  /**
   * Initializes a new Stats Definition Account
   * @param root0 - Object containing function parameters
   * @param root0.program - Cargo Program
   * @param root0.profile - Profile with required Cargo Permissions
   * @param root0.statsDefinition - New Stats Definition Account
   * @param root0.input - Input params
   * @returns InstructionReturn
   */
  static initDefinition({
    program,
    profile,
    statsDefinition,
    input,
  }: {
    program: CargoIDLProgram;
    profile: PublicKey;
    statsDefinition: AsyncSigner;
    input: InitDefinitionInput;
  }): InstructionReturn {
    return async (funder) => [
      {
        instruction: await program.methods
          .initDefinition(input)
          .accountsStrict({
            profile,
            funder: funder.publicKey(),
            statsDefinition: statsDefinition.publicKey(),
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
        signers: [funder, statsDefinition],
      },
    ];
  }

  /**
   * Updates the Sequence ID of an existing Stats Definition Account
   * @param root0 - Object with function params
   * @param root0.program - Cargo program
   * @param root0.managerKey - Key authorized to use this instruction
   * @param root0.profile - Profile with required Cargo permissions
   * @param root0.statsDefinition - Stats Definition Account
   * @param root0.input - input params
   * @returns InstructionReturn
   */
  static updateDefinition({
    program,
    managerKey,
    profile,
    statsDefinition,
    input,
  }: {
    program: CargoIDLProgram;
    managerKey: AsyncSigner;
    profile: PublicKey;
    statsDefinition: PublicKey;
    input: UpdateDefinitionInput;
  }): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .updateDefinition(input)
          .accountsStrict({
            statsDefinition,
            key: managerKey.publicKey(),
            profile,
          })
          .instruction(),
        signers: [managerKey],
      },
    ];
  }

  static decodeData(account: KeyedAccountInfo, program: CargoIDLProgram): DecodedAccountData<CargoStatsDefinition> {
    return decodeAccount(account, program, CargoStatsDefinition);
  }
}
