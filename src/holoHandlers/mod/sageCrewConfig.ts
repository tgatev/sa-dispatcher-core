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
import { RegisterSageCrewConfigInput, SageCrewConfigAccount, SageIDL, SageIDLProgram } from "../IDL/constants";

/** Whether or not crew program features are turned on */
export const CREW_FEATURE = true;

/**
 * Check if two `SageCrewConfigAccount` instances are equal
 * @param data1 - first SageCrewConfigAccount
 * @param data2 - second SageCrewConfigAccount
 * @returns a boolean
 */
export function sageCrewConfigDataEquals(data1: SageCrewConfigAccount, data2: SageCrewConfigAccount): boolean {
  return (
    data1.version === data2.version && data1.gameId.equals(data2.gameId) && data1.config.equals(data2.config) && data1.bump === data2.bump
  );
}

@staticImplements<AccountStatic<SageCrewConfig, SageIDL>>()
export class SageCrewConfig implements Account {
  static readonly ACCOUNT_NAME: NonNullable<SageIDL["accounts"]>[number]["name"] = "SageCrewConfig";
  static readonly MIN_DATA_SIZE =
    8 + // discriminator
    1 + // version
    32 + // gameId
    32 + // config
    1; // bump

  constructor(private _data: SageCrewConfigAccount, private _key: PublicKey) {}

  get data(): Readonly<SageCrewConfigAccount> {
    return this._data;
  }

  get key(): PublicKey {
    return this._key;
  }

  /**
   * Find the SageCrewConfig account address
   * @param program - SAGE program
   * @param gameId - the SAGE game id
   * @returns The PDA and bump respectively
   */
  static findAddress(program: SageIDLProgram, gameId: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from("SageCrewConfig"), gameId.toBuffer()], program.programId);
  }

  /**
   * Register a SageCrewConfig
   * @param params - the params to this functions
   * @param params.program - SAGE program
   * @param params.key - the key authorized to run this instruction
   * @param params.profile - the profile with the required permissions for the instruction
   * @param params.crewProgramConfig - the crew program config account
   * @param params.gameId - the SAGE game id
   * @param params.input - instruction input params
   * @returns InstructionReturn
   */
  static registerSageCrewConfig(params: {
    program: SageIDLProgram;
    key: AsyncSigner;
    profile: PublicKey;
    crewProgramConfig: PublicKey;
    gameId: PublicKey;
    input: RegisterSageCrewConfigInput;
  }): InstructionReturn {
    const { program, key, profile, crewProgramConfig, gameId, input } = params;
    return async (funder) => [
      {
        instruction: await program.methods
          .registerSageCrewConfig(input)
          .accountsStrict({
            gameAndProfile: {
              key: key.publicKey(),
              profile,
              gameId,
            },
            funder: funder.publicKey(),
            sageCrewConfig: this.findAddress(program, gameId)[0],
            config: crewProgramConfig,
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
        signers: [key, funder],
      },
    ];
  }

  static decodeData(account: KeyedAccountInfo, program: SageIDLProgram): DecodedAccountData<SageCrewConfig> {
    return decodeAccount(account, program, SageCrewConfig);
  }
}
