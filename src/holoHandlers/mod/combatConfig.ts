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
import { CombatConfigAccount, SageIDL, SageIDLProgram, RegisterCombatConfigInput, BaseUpdateCombatConfigInput } from "../IDL/constants";

export interface UpdateCombatConfigInput extends Omit<
  BaseUpdateCombatConfigInput,
  "globalCeasefire" | "lootExclusivityTime" | "starbaseUpgradeProgressContinuation" | "crewRespawnTime" | "rawShipsRespawnTime"
> {
  globalCeasefire: boolean;
  lootExclusivityTime?: number;
  starbaseUpgradeProgressContinuation?: number;
  crewRespawnTime?: number;
  rawShipsRespawnTime?: number;
}

/**
 * Check if two `CombatConfigAccount` instances are equal
 * @param data1 - first CombatConfigAccount
 * @param data2 - second CombatConfigAccount
 * @returns a boolean
 */
export function combatConfigDataEquals(data1: CombatConfigAccount, data2: CombatConfigAccount): boolean {
  return (
    data1.version === data2.version &&
    data1.gameId.equals(data2.gameId) &&
    data1.globalCeasefire === data2.globalCeasefire &&
    data1.lootExclusivityTime === data2.lootExclusivityTime &&
    data1.starbaseUpgradeProgressContinuation === data2.starbaseUpgradeProgressContinuation &&
    data1.crewRespawnTime === data2.crewRespawnTime &&
    data1.rawShipsRespawnTime === data2.rawShipsRespawnTime
  );
}

@staticImplements<AccountStatic<CombatConfig, SageIDL>>()
export class CombatConfig implements Account {
  static readonly ACCOUNT_NAME: NonNullable<SageIDL["accounts"]>[number]["name"] = "CombatConfig";
  static readonly MIN_DATA_SIZE =
    8 + // discriminator
    1 + // version
    32 + // gameId
    1 + // globalCeasefire
    2 + // lootExclusivityTime
    4 + // starbaseUpgradeProgressContinuation
    2 + // crewRespawnTime
    2; // rawShipsRespawnTime

  constructor(
    private _data: CombatConfigAccount,
    private _key: PublicKey,
  ) {}

  get data(): Readonly<CombatConfigAccount> {
    return this._data;
  }

  get key(): PublicKey {
    return this._key;
  }

  /**
   * Finds the address of a `CombatConfig` account
   * @param program - the SAGE program
   * @param game - the game id
   * @returns - The PDA and bump respectively
   */
  static findAddress(program: SageIDLProgram, game: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from("CombatConfig"), game.toBuffer()], program.programId);
  }

  /**
   * Register a Combat Config
   * @param program - SAGE program
   * @param key - the key authorized to run this instruction
   * @param profile - the profile with the required permissions for the instruction
   * @param gameId - the SAGE game id
   * @param input - instruction input params
   * @returns InstructionReturn
   */
  static registerCombatConfig(
    program: SageIDLProgram,
    key: AsyncSigner,
    profile: PublicKey,
    gameId: PublicKey,
    input: RegisterCombatConfigInput,
  ): {
    configKey: [PublicKey, number];
    instructions: InstructionReturn;
  } {
    const configKey = CombatConfig.findAddress(program, gameId);
    return {
      configKey,
      instructions: async (funder) => [
        {
          instruction: await program.methods
            .registerCombatConfig(input)
            .accountsStrict({
              gameAndProfile: {
                key: key.publicKey(),
                profile,
                gameId,
              },
              funder: funder.publicKey(),
              combatConfig: configKey[0],
              systemProgram: SystemProgram.programId,
            })
            .instruction(),
          signers: [key, funder],
        },
      ],
    };
  }

  /**
   * Update a Combat Config
   * @param program - SAGE program
   * @param key - the key authorized to run this instruction
   * @param profile - the profile with the required permissions for the instruction
   * @param gameId - the SAGE game id
   * @param input - instruction input params
   * @returns InstructionReturn
   */
  static updateCombatConfig(
    program: SageIDLProgram,
    key: AsyncSigner,
    profile: PublicKey,
    gameId: PublicKey,
    input: UpdateCombatConfigInput,
  ): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .updateCombatConfig({
            keyIndex: input.keyIndex,
            globalCeasefire: input.globalCeasefire ? 1 : 0,
            lootExclusivityTime: input.lootExclusivityTime ?? null,
            starbaseUpgradeProgressContinuation: input.starbaseUpgradeProgressContinuation ?? null,
            crewRespawnTime: input.crewRespawnTime ?? null,
            rawShipsRespawnTime: input.rawShipsRespawnTime ?? null,
          })
          .accountsStrict({
            gameAndProfile: {
              key: key.publicKey(),
              profile,
              gameId,
            },
            combatConfig: CombatConfig.findAddress(program, gameId)[0],
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
        signers: [key],
      },
    ];
  }

  /**
   * Deregister a Combat Config
   * @param program - SAGE program
   * @param key - the key authorized to run this instruction
   * @param profile - the profile with the required permissions for the instruction
   * @param fundsTo - the entity that should receive rent refunds
   * @param gameId - the SAGE game id
   * @param input - instruction input params
   * @returns InstructionReturn
   */
  static deregisterCombatConfig(
    program: SageIDLProgram,
    key: AsyncSigner,
    profile: PublicKey,
    fundsTo: PublicKey | "funder",
    gameId: PublicKey,
    input: RegisterCombatConfigInput,
  ): InstructionReturn {
    return async (funder) => [
      {
        instruction: await program.methods
          .deregisterCombatConfig(input)
          .accountsStrict({
            gameAndProfile: {
              key: key.publicKey(),
              profile,
              gameId,
            },
            fundsTo: fundsTo === "funder" ? funder.publicKey() : fundsTo,
            combatConfig: CombatConfig.findAddress(program, gameId)[0],
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
        signers: [key, funder],
      },
    ];
  }

  static decodeData(account: KeyedAccountInfo, program: SageIDLProgram): DecodedAccountData<CombatConfig> {
    return decodeAccount(account, program, CombatConfig);
  }
}
