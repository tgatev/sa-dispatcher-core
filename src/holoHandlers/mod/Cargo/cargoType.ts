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
import { CargoIDL } from ".";
import {
  CargoIDLProgram,
  CargoTypeAccount,
  InitCargoTypeForNextSeqIdInput,
  InitCargoTypeFromOldCargoTypeInput,
  InitCargoTypeInput,
} from "./constants";
import { CargoStatsDefinition } from "./statsDefinition";

/**
 * Check equality between 2 Cargo Type Accounts
 * @param data1 - First Cargo Type Account
 * @param data2 - Second Cargo Type Account
 * @returns boolean
 */
export function cargoTypeDataEquals(data1: CargoTypeAccount, data2: CargoTypeAccount): boolean {
  return (
    data1.version === data2.version &&
    data1.bump === data2.bump &&
    data1.statsCount === data2.statsCount &&
    data1.statsDefinition.equals(data2.statsDefinition) &&
    data1.mint.equals(data2.mint) &&
    data1.seqId === data2.seqId
  );
}

export const CARGO_TYPE_OFFSET = 8 + 1 + 32 + 32 + 32 + 1 + 2 + 2;

@staticImplements<AccountStatic<CargoType, CargoIDL>>()
export class CargoType implements Account {
  static readonly ACCOUNT_NAME: NonNullable<CargoIDL["accounts"]>[number]["name"] = "CargoType";
  static readonly MIN_DATA_SIZE: number = CARGO_TYPE_OFFSET;

  constructor(private _data: CargoTypeAccount, private _key: PublicKey, private _stats: BN[]) {}

  get data(): Readonly<CargoTypeAccount> {
    return this._data;
  }

  get key(): PublicKey {
    return this._key;
  }

  get stats(): Readonly<BN[]> {
    return this._stats || [];
  }

  /**
   * Finds PDA for Cargo Type Account
   * @param program - The Cargo IDL program
   * @param statsDefinition - Stats Definition Account key
   * @param mint - Mint key
   * @param seqId - Sequence ID of the Cargo Type Account
   * @returns PDA key & bump
   */
  static findAddress(program: CargoIDLProgram, statsDefinition: PublicKey, mint: PublicKey, seqId: number): [PublicKey, number] {
    const arr = new ArrayBuffer(2);
    const view = new DataView(arr);
    view.setUint16(0, seqId, true);
    const seqIdSeed = new Uint8Array(view.buffer);

    return PublicKey.findProgramAddressSync(
      [Buffer.from("cargo_type"), seqIdSeed, statsDefinition.toBuffer(), mint.toBuffer()],
      program.programId
    );
  }

  /**
   * Initialize a new Cargo Type Account
   * @param root0 - Object for initCargoType instruction
   * @param root0.program - Cargo Program
   * @param root0.managerKey - Key authorized for this instruction
   * @param root0.profile - Profile with required Cargo Permissions
   * @param root0.statsDefinition - Stats Definition Account
   * @param root0.mint - Mint key
   * @param root0.input - Input struct
   * @param root0.statsDefinitionSeqId - Stats Definition Sequence ID
   * @returns InstructionReturn
   */
  static initCargoType({
    program,
    managerKey,
    profile,
    statsDefinition,
    mint,
    input,
    statsDefinitionSeqId,
  }: {
    program: CargoIDLProgram;
    managerKey: AsyncSigner;
    profile: PublicKey;
    statsDefinition: PublicKey;
    mint: PublicKey;
    input: InitCargoTypeInput;
    statsDefinitionSeqId: number;
  }): InstructionReturn {
    const cargoTypeAddressResults = this.findAddress(program, statsDefinition, mint, statsDefinitionSeqId);

    return async (funder) => [
      {
        instruction: await program.methods
          .initCargoType(input)
          .accountsStrict({
            // definitionAuthority: authority.publicKey(),
            funder: funder.publicKey(),
            cargoType: cargoTypeAddressResults[0],
            statsDefinition,
            mint,
            systemProgram: SystemProgram.programId,
            key: managerKey.publicKey(),
            profile,
          })
          .instruction(),
        signers: [managerKey, funder],
      },
    ];
  }

  /**
   * Initializes a new Cargo Type Account with the same Mint as an old one. Updates stats if new values are provided, otherwise copies from old Cargo Type Account.
   * @param root0 - Object containing parameters
   * @param root0.program - Cargo program
   * @param root0.managerKey - Key authorized to use this instruction
   * @param root0.profile - Profile with required Cargo permissions
   * @param root0.statsDefinition - Stats Definition Account
   * @param root0.oldCargoType - Old Cargo Type Account
   * @param root0.mint - Mint account
   * @param root0.input - Input struct
   * @returns InstructionReturn
   */
  static initCargoTypeFromOldCargoType({
    program,
    managerKey,
    profile,
    statsDefinition,
    oldCargoType,
    mint,
    input,
  }: {
    program: CargoIDLProgram;
    managerKey: AsyncSigner;
    profile: PublicKey;
    statsDefinition: PublicKey;
    oldCargoType: CargoType;
    mint: AsyncSigner;
    input: InitCargoTypeFromOldCargoTypeInput;
  }): InstructionReturn {
    const [cargoType] = this.findAddress(program, statsDefinition, mint.publicKey(), oldCargoType.data.seqId + 1);
    return async (funder) => [
      {
        instruction: await program.methods
          .initCargoTypeFromOldCargoType(input)
          .accountsStrict({
            // definitionAuthority: definitionAuthority.publicKey(),
            key: managerKey.publicKey(),
            profile,
            funder: funder.publicKey(),
            statsDefinition,
            oldCargoType: oldCargoType.key,
            cargoType,
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
        signers: [managerKey],
      },
    ];
  }

  /**
   * Initialize a new cargo type with `seq_id = definition.seq_id + 1`
   * @param root0 - Object containing function parameters
   * @param root0.program - Cargo Program
   * @param root0.managerKey - Key authorized to use this instruction
   * @param root0.profile - Profile with required Cargo Permissions
   * @param root0.statsDefinition - Stats Definition Account
   * @param root0.typeMint - Cargo Type Mint
   * @param root0.input - Input struct
   * @returns InstructionReturn
   */
  static initCargoTypeForNextSeqId({
    program,
    managerKey,
    profile,
    statsDefinition,
    typeMint,
    input,
  }: {
    program: CargoIDLProgram;
    managerKey: AsyncSigner;
    profile: PublicKey;
    statsDefinition: CargoStatsDefinition;
    typeMint: PublicKey;
    input: InitCargoTypeForNextSeqIdInput;
  }): InstructionReturn {
    const [cargoType] = this.findAddress(program, statsDefinition.key, typeMint, statsDefinition.data.seqId + 1);

    return async (funder) => [
      {
        instruction: await program.methods
          .initCargoTypeForNextSeqId(input)
          .accountsStrict({
            // definitionAuthority: definitionAuthority.publicKey(),
            key: managerKey.publicKey(),
            profile,
            funder: funder.publicKey(),
            mint: typeMint,
            statsDefinition: statsDefinition.key,
            cargoType,
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
        signers: [managerKey],
      },
    ];
  }

  static decodeData(account: KeyedAccountInfo, program: CargoIDLProgram): DecodedAccountData<CargoType> {
    return decodeAccountWithRemaining(account, program, CargoType, (remainingData) =>
      Array((account.accountInfo.data.length - CARGO_TYPE_OFFSET) / 8)
        .fill(0)
        .map((_, index) => new BN(remainingData.subarray(8 * index).subarray(0, 8), 10, "le"))
    );
  }
}
