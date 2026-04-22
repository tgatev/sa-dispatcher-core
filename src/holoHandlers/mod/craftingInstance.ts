import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { AccountMeta, KeyedAccountInfo, PublicKey, SystemProgram } from "@solana/web3.js";
import { BN } from "@staratlas/anchor";
import { CargoIDLProgram } from "@staratlas/cargo";
import { CraftingIDLProgram, CraftingProcess } from "@staratlas/crafting";
import {
  Account,
  AccountStatic,
  AsyncSigner,
  DecodedAccountData,
  InstructionReturn,
  decodeAccount,
  staticImplements,
} from "@staratlas/data-source";
import { PointsIDLProgram } from "@staratlas/points";
import {
  CraftingInstanceAccount,
  SageIDL,
  SageIDLProgram,
  StarbaseCancelCraftingProcessInput,
  StarbaseClaimCraftingNonConsumablesInput,
  StarbaseClaimCraftingOutputsInput,
  StarbaseCloseCraftingProcessInput,
  StarbaseCreateCraftingProcessInput,
  StarbaseDepositCraftingIngredientInput,
  StarbaseStartCraftingProcessInput,
} from "../IDL/constants";
import { ProgressionConfig } from "./progressionConfig";

export enum CraftingInstanceType {
  // Represents a `CraftingInstance` used for starbase crafting
  StarbaseCrafting = 1,
  // Represents a `CraftingInstance` used for starbase upgrade materials
  StarbaseUpgradeMaterial = 2,
}

/**
 * Check if two `CraftingInstanceAccount` instances are equal
 * @param data1 - first CraftingInstanceAccount
 * @param data2 - second CraftingInstanceAccount
 * @returns boolean
 */
export function craftingInstanceDataEquals(data1: CraftingInstanceAccount, data2: CraftingInstanceAccount): boolean {
  return (
    data1.version === data2.version &&
    data1.seqId === data2.seqId &&
    data1.numCrew.eq(data2.numCrew) &&
    data1.authority.equals(data2.authority) &&
    data1.craftingProcess.equals(data2.craftingProcess) &&
    data1.instanceType === data2.instanceType &&
    data1.bump === data2.bump
  );
}

@staticImplements<AccountStatic<CraftingInstance, SageIDL>>()
export class CraftingInstance implements Account {
  static readonly ACCOUNT_NAME: NonNullable<SageIDL["accounts"]>[number]["name"] = "CraftingInstance";
  static readonly MIN_DATA_SIZE =
    8 + // discriminator
    1 + // version
    2 + // seqId
    8 + // numCrew
    32 + // authority
    32 + // craftingProcess
    1 + // instanceType
    1; // bump

  constructor(private _data: CraftingInstanceAccount, private _key: PublicKey) {}

  get data(): Readonly<CraftingInstanceAccount> {
    return this._data;
  }

  get key(): PublicKey {
    return this._key;
  }

  /**
   * Calculate the crafting duration
   * @param durationPerUnit - the duration per unit of the crafting recipe
   * @param quantity - the quantity being crafted
   * @param numCrew - the number of crew taking part in the crafting
   * @param timeUntilExhaustion - time in seconds until food exhaustion will occur
   * @param exhaustedCraftingSpeed - the crafting speed when exhausted for the given starbase
   * @returns the crafting duration in seconds
   */
  static calculateCraftingDuration(
    durationPerUnit: BN,
    quantity: BN,
    numCrew: BN,
    timeUntilExhaustion = 0,
    exhaustedCraftingSpeed = 1
  ): BN {
    if (numCrew.isZero()) {
      throw new Error("Invalid value for numCrew");
    }
    const quotient = quantity.div(numCrew);
    const remainder = quantity.mod(numCrew);

    // Unmodified duration of the crafting process
    const totalDurationBN = quotient.add(BN.min(remainder, new BN(1))).mul(durationPerUnit);
    const totalDuration = Number(totalDurationBN);

    if (timeUntilExhaustion >= totalDuration) {
      // Crafting can be completed before exhaustion, return the total duration
      return new BN(totalDuration);
    } else {
      // Crafting will be interrupted by exhaustion, calculate the remaining time
      const clampedTimeUntilExhaustion = Math.max(0, timeUntilExhaustion);
      const remainingTime = totalDuration - clampedTimeUntilExhaustion;
      const remainingTimeAfterExhaustion = remainingTime / exhaustedCraftingSpeed;
      return new BN(clampedTimeUntilExhaustion + remainingTimeAfterExhaustion);
    }
  }

  /**
   * Calculate the starbase upgrade duration
   * @param durationPerUnit - the duration per unit of the crafting recipe
   * @param quantity - the quantity being crafted
   * @param numCrew - the number of crew taking part in the crafting
   * @returns the upgrade duration in seconds
   */
  static calculateUpgradeDuration(durationPerUnit: BN, quantity: BN, numCrew: BN): BN {
    if (numCrew.isZero()) {
      throw new Error("Invalid value for numCrew");
    }
    const quotient = quantity.div(numCrew);
    const remainder = quantity.mod(numCrew);

    return quotient.add(BN.min(remainder, new BN(1))).mul(durationPerUnit);
  }

  /**
   * Find the CraftingInstance account address
   * @param program - SAGE program
   * @param authority - the crafting instance authority
   * @param craftingProcess - the crafting process
   * @returns The PDA and bump respectively
   */
  static findAddress(program: SageIDLProgram, authority: PublicKey, craftingProcess: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("CraftingInstance"), authority.toBuffer(), craftingProcess.toBuffer()],
      program.programId
    );
  }

  /**
   * Create Crafting Process
   * @param program - SAGE program
   * @param craftingProgram - crafting program
   * @param key - the key authorized to run this instruction
   * @param playerProfile - the player's profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param starbasePlayer - the Starbase player
   * @param starbase - the Starbase
   * @param gameId - the SAGE game id
   * @param gameState - the game state  account
   * @param craftingFacility - the crafting facility
   * @param craftingRecipe - the crafting recipe
   * @param craftingDomain - the crafting domain
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static createCraftingProcess(
    program: SageIDLProgram,
    craftingProgram: CraftingIDLProgram,
    key: AsyncSigner,
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    starbasePlayer: PublicKey,
    starbase: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    craftingFacility: PublicKey,
    craftingRecipe: PublicKey,
    craftingDomain: PublicKey,
    input: StarbaseCreateCraftingProcessInput
  ): InstructionReturn {
    const craftingProcessKey = CraftingProcess.findAddress(craftingProgram, craftingFacility, craftingRecipe, input.craftingId)[0];
    return async (funder) => [
      {
        instruction: await program.methods
          .createCraftingProcess(input)
          .accountsStrict({
            funder: funder.publicKey(),
            starbaseAndStarbasePlayer: {
              starbase,
              starbasePlayer,
            },
            gameAccountsAndProfile: {
              gameAndProfileAndFaction: {
                gameId,
                key: key.publicKey(),
                profile: playerProfile,
                profileFaction,
              },
              gameState,
            },
            craftingInstance: this.findAddress(program, starbasePlayer, craftingProcessKey)[0],
            craftingProcess: craftingProcessKey,
            craftingFacility,
            craftingRecipe,
            craftingDomain,
            craftingProgram: craftingProgram.programId,
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
        signers: [key, funder],
      },
    ];
  }

  /**
   * Deposit Crafting Recipe Ingredient
   * @param program - SAGE program
   * @param cargoProgram - cargo program
   * @param craftingProgram - crafting program
   * @param key - the key authorized to run this instruction
   * @param playerProfile - the player's profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param starbasePlayer - the Starbase player
   * @param starbase - the Starbase
   * @param craftingInstance - the crafting instance
   * @param craftingProcess - the crafting process
   * @param craftingFacility - the crafting facility
   * @param craftingRecipe - the crafting recipe
   * @param cargoPodFrom - the source cargo pod
   * @param cargoType - the cargo type
   * @param cargoStatsDefinition - the cargo stats definition
   * @param tokenFrom - the source account of the tokens - owner should be `cargoPodFrom`
   * @param tokenTo - the destination account of the tokens - owner should be `craftingProcess`
   * @param gameId - the SAGE game id
   * @param gameState - the game state  account
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static depositCraftingIngredient(
    program: SageIDLProgram,
    cargoProgram: CargoIDLProgram,
    craftingProgram: CraftingIDLProgram,
    key: AsyncSigner,
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    starbasePlayer: PublicKey,
    starbase: PublicKey,
    craftingInstance: PublicKey,
    craftingProcess: PublicKey,
    craftingFacility: PublicKey,
    craftingRecipe: PublicKey,
    cargoPodFrom: PublicKey,
    cargoType: PublicKey,
    cargoStatsDefinition: PublicKey,
    tokenFrom: PublicKey,
    tokenTo: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    input: StarbaseDepositCraftingIngredientInput
  ): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .depositCraftingIngredient(input)
          .accountsStrict({
            starbaseAndStarbasePlayer: {
              starbase,
              starbasePlayer,
            },
            gameAccountsAndProfile: {
              gameAndProfileAndFaction: {
                gameId,
                key: key.publicKey(),
                profile: playerProfile,
                profileFaction,
              },
              gameState,
            },
            craftingInstance,
            craftingProcess,
            craftingFacility,
            craftingRecipe,
            cargoPodFrom,
            cargoType,
            cargoStatsDefinition,
            tokenFrom,
            tokenTo,
            craftingProgram: craftingProgram.programId,
            cargoProgram: cargoProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction(),
        signers: [key],
      },
    ];
  }

  /**
   * Withdraw Crafting Recipe Ingredient
   * @param program - SAGE program
   * @param cargoProgram - cargo program
   * @param craftingProgram - crafting program
   * @param key - the key authorized to run this instruction
   * @param playerProfile - the player's profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param starbasePlayer - the Starbase player
   * @param starbase - the Starbase
   * @param craftingInstance - the crafting instance
   * @param craftingProcess - the crafting process
   * @param craftingFacility - the crafting facility
   * @param craftingRecipe - the crafting recipe
   * @param cargoPodTo - the destination cargo pod
   * @param cargoType - the cargo type
   * @param cargoStatsDefinition - the cargo stats definition
   * @param tokenFrom - the source token account - owner should be `craftingProcess`
   * @param tokenTo - the destination token account - owner should be `cargoPodTo`
   * @param tokenMint - the token mint
   * @param gameId - the SAGE game id
   * @param gameState - the game state  account
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static withdrawCraftingIngredient(
    program: SageIDLProgram,
    cargoProgram: CargoIDLProgram,
    craftingProgram: CraftingIDLProgram,
    key: AsyncSigner,
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    starbasePlayer: PublicKey,
    starbase: PublicKey,
    craftingInstance: PublicKey,
    craftingProcess: PublicKey,
    craftingFacility: PublicKey,
    craftingRecipe: PublicKey,
    cargoPodTo: PublicKey,
    cargoType: PublicKey,
    cargoStatsDefinition: PublicKey,
    tokenFrom: PublicKey,
    tokenTo: PublicKey,
    tokenMint: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    input: StarbaseDepositCraftingIngredientInput
  ): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .withdrawCraftingIngredient(input)
          .accountsStrict({
            starbaseAndStarbasePlayer: {
              starbase,
              starbasePlayer,
            },
            gameAccountsAndProfile: {
              gameAndProfileAndFaction: {
                gameId,
                key: key.publicKey(),
                profile: playerProfile,
                profileFaction,
              },
              gameState,
            },
            craftingInstance,
            craftingProcess,
            craftingFacility,
            craftingRecipe,
            cargoPodTo,
            cargoType,
            cargoStatsDefinition,
            tokenFrom,
            tokenTo,
            tokenMint,
            craftingProgram: craftingProgram.programId,
            cargoProgram: cargoProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction(),
        signers: [key],
      },
    ];
  }

  /**
   * Start Crafting Process
   * @param program - SAGE program
   * @param craftingProgram - crafting program
   * @param key - the key authorized to run this instruction
   * @param playerProfile - the player's profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param starbasePlayer - the Starbase player
   * @param starbase - the Starbase
   * @param craftingInstance - the crafting instance
   * @param craftingProcess - the crafting process
   * @param craftingFacility - the crafting facility
   * @param craftingRecipe - the crafting recipe
   * @param gameId - the SAGE game id
   * @param gameState - the game state  account
   * @param input - the instruction input params
   * @param recipeFeeRecipient - the recipe fee recipient`, should be as defined in `craftingRecipe` account
   * @param tokenFromAuthority - the transfer authority of `tokenFrom`
   * @param tokenFrom - the source token account for crafting fees
   * @param tokenTo - the destination token account (ATA) for crafting fees, owned by crafting process
   * @returns InstructionReturn
   */
  static startCraftingProcess(
    program: SageIDLProgram,
    craftingProgram: CraftingIDLProgram,
    key: AsyncSigner,
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    starbasePlayer: PublicKey,
    starbase: PublicKey,
    craftingInstance: PublicKey,
    craftingProcess: PublicKey,
    craftingFacility: PublicKey,
    craftingRecipe: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    input: StarbaseStartCraftingProcessInput,
    recipeFeeRecipient?: PublicKey,
    tokenFromAuthority?: AsyncSigner,
    tokenFrom?: PublicKey,
    tokenTo?: PublicKey
  ): InstructionReturn {
    const signers = [key];
    const remainingAccounts: AccountMeta[] = [];
    if (recipeFeeRecipient && tokenFromAuthority && tokenFrom && tokenTo) {
      if (!signers.map((it) => it.publicKey().toBase58()).includes(tokenFromAuthority.publicKey().toBase58())) {
        signers.push(tokenFromAuthority);
      }
      remainingAccounts.push(
        ...[
          {
            pubkey: recipeFeeRecipient,
            isSigner: false,
            isWritable: false,
          },
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
            pubkey: tokenTo,
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
          .startCraftingProcess(input)
          .accountsStrict({
            starbaseAndStarbasePlayer: {
              starbase,
              starbasePlayer,
            },
            craftingInstance,
            craftingProcess,
            craftingRecipe,
            craftingFacility,
            gameAccountsAndProfile: {
              gameAndProfileAndFaction: {
                gameId,
                key: key.publicKey(),
                profile: playerProfile,
                profileFaction,
              },
              gameState,
            },
            craftingProgram: craftingProgram.programId,
          })
          .remainingAccounts(remainingAccounts)
          .instruction(),
        signers,
      },
    ];
  }

  /**
   * Stop Crafting Process
   *
   * Meant to be used for processes already started but not yet complete.
   * @param program - SAGE program
   * @param craftingProgram - crafting program
   * @param key - the key authorized to run this instruction
   * @param playerProfile - the player's profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param starbasePlayer - the Starbase player
   * @param starbase - the Starbase
   * @param craftingInstance - the crafting instance
   * @param craftingProcess - the crafting process
   * @param craftingFacility - the crafting facility
   * @param craftingRecipe - the crafting recipe
   * @param gameId - the SAGE game id
   * @param gameState - the game state  account
   * @param input - the instruction input params
   * @param tokenFrom - the source token account for crafting fees, ATA owned by crafting process
   * @param tokenTo - the token account that the refund of crafting fees should be sent to
   * @returns InstructionReturn
   */
  static stopCraftingProcess(
    program: SageIDLProgram,
    craftingProgram: CraftingIDLProgram,
    key: AsyncSigner,
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    starbasePlayer: PublicKey,
    starbase: PublicKey,
    craftingInstance: PublicKey,
    craftingProcess: PublicKey,
    craftingFacility: PublicKey,
    craftingRecipe: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    input: StarbaseStartCraftingProcessInput,
    tokenFrom?: PublicKey,
    tokenTo?: PublicKey
  ): InstructionReturn {
    const remainingAccounts: AccountMeta[] = [];
    if (tokenFrom && tokenTo) {
      remainingAccounts.push(
        ...[
          {
            pubkey: tokenFrom,
            isSigner: false,
            isWritable: true,
          },
          {
            pubkey: tokenTo,
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
          .stopCraftingProcess(input)
          .accountsStrict({
            starbaseAndStarbasePlayer: {
              starbase,
              starbasePlayer,
            },
            craftingInstance,
            craftingProcess,
            craftingRecipe,
            craftingFacility,
            gameAccountsAndProfile: {
              gameAndProfileAndFaction: {
                gameId,
                key: key.publicKey(),
                profile: playerProfile,
                profileFaction,
              },
              gameState,
            },
            craftingProgram: craftingProgram.programId,
          })
          .remainingAccounts(remainingAccounts)
          .instruction(),
        signers: [key],
      },
    ];
  }

  /**
   * Cancel Crafting Process
   * @param program - SAGE program
   * @param craftingProgram - crafting program
   * @param key - the key authorized to run this instruction
   * @param playerProfile - the player's profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param fundsTo - recipient of the rent refund
   * @param starbasePlayer - the Starbase player
   * @param starbase - the Starbase
   * @param craftingInstance - the crafting instance
   * @param craftingProcess - the crafting process
   * @param craftingFacility - the crafting facility
   * @param gameId - the SAGE game id
   * @param gameState - the game state  account
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static cancelCraftingProcess(
    program: SageIDLProgram,
    craftingProgram: CraftingIDLProgram,
    key: AsyncSigner,
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    fundsTo: PublicKey | "funder",
    starbasePlayer: PublicKey,
    starbase: PublicKey,
    craftingInstance: PublicKey,
    craftingProcess: PublicKey,
    craftingFacility: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    input: StarbaseCancelCraftingProcessInput
  ): InstructionReturn {
    return async (funder) => [
      {
        instruction: await program.methods
          .cancelCraftingProcess(input)
          .accountsStrict({
            fundsTo: fundsTo === "funder" ? funder.publicKey() : fundsTo,
            starbaseAndStarbasePlayer: {
              starbase,
              starbasePlayer,
            },
            gameAccountsAndProfile: {
              gameAndProfileAndFaction: {
                gameId,
                key: key.publicKey(),
                profile: playerProfile,
                profileFaction,
              },
              gameState,
            },
            craftingInstance,
            craftingProcess,
            craftingFacility,
            craftingProgram: craftingProgram.programId,
          })
          .instruction(),
        signers: [key],
      },
    ];
  }

  /**
   * Claim Crafting Process Non-consumable inputs
   * @param program - SAGE program
   * @param cargoProgram - cargo program
   * @param craftingProgram - crafting program
   * @param starbasePlayer - the Starbase player
   * @param starbase - the Starbase
   * @param craftingInstance - the crafting instance
   * @param craftingProcess - the crafting process
   * @param craftingFacility - the crafting facility
   * @param craftingRecipe - the crafting recipe
   * @param cargoPodTo - the destination cargo pod
   * @param cargoType - the cargo type
   * @param cargoStatsDefinition - the cargo stats definition
   * @param gameId - the SAGE game id
   * @param gameState - the game state  account
   * @param tokenFrom - the source token account - owner should be `craftingProcess`
   * @param tokenTo - the destination token account - owner should be `cargoPodTo`
   * @param tokenMint - the token mint
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static claimCraftingNonConsumables(
    program: SageIDLProgram,
    cargoProgram: CargoIDLProgram,
    craftingProgram: CraftingIDLProgram,
    starbasePlayer: PublicKey,
    starbase: PublicKey,
    craftingInstance: PublicKey,
    craftingProcess: PublicKey,
    craftingFacility: PublicKey,
    craftingRecipe: PublicKey,
    cargoPodTo: PublicKey,
    cargoType: PublicKey,
    cargoStatsDefinition: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    tokenFrom: PublicKey,
    tokenTo: PublicKey,
    tokenMint: PublicKey,
    input: StarbaseClaimCraftingNonConsumablesInput
  ): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .claimCraftingNonConsumables(input)
          .accountsStrict({
            starbaseAndStarbasePlayer: {
              starbase,
              starbasePlayer,
            },
            gameAccounts: {
              gameId,
              gameState,
            },
            craftingInstance,
            craftingProcess,
            craftingFacility,
            craftingRecipe,
            cargoPodTo,
            cargoType,
            cargoStatsDefinition,
            tokenFrom,
            tokenTo,
            tokenMint,
            craftingProgram: craftingProgram.programId,
            cargoProgram: cargoProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction(),
        signers: [],
      },
    ];
  }

  /**
   * Claim Crafting Process Output
   * @param program - SAGE program
   * @param craftingProgram - crafting program
   * @param starbasePlayer - the Starbase player
   * @param starbase - the Starbase
   * @param craftingInstance - the crafting instance
   * @param craftingProcess - the crafting process
   * @param craftingFacility - the crafting facility
   * @param craftingRecipe - the crafting recipe
   * @param gameId - the SAGE game id
   * @param gameState - the game state  account
   * @param tokenFrom - the source token account - owner should be `craftingProcess`
   * @param tokenMint - the token mint
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static burnCraftingConsumables(
    program: SageIDLProgram,
    craftingProgram: CraftingIDLProgram,
    starbasePlayer: PublicKey,
    starbase: PublicKey,
    craftingInstance: PublicKey,
    craftingProcess: PublicKey,
    craftingFacility: PublicKey,
    craftingRecipe: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    tokenFrom: PublicKey,
    tokenMint: PublicKey,
    input: StarbaseClaimCraftingOutputsInput
  ): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .burnCraftingConsumables(input)
          .accountsStrict({
            starbaseAndStarbasePlayer: {
              starbase,
              starbasePlayer,
            },
            gameAccounts: {
              gameId,
              gameState,
            },
            craftingInstance,
            craftingProcess,
            craftingFacility,
            craftingRecipe,
            tokenFrom,
            tokenMint,
            craftingProgram: craftingProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction(),
        signers: [],
      },
    ];
  }

  /**
   * Claim Crafting Process Output
   * @param program - SAGE program
   * @param cargoProgram - cargo program
   * @param craftingProgram - crafting program
   * @param starbasePlayer - the Starbase player
   * @param starbase - the Starbase
   * @param craftingInstance - the crafting instance
   * @param craftingProcess - the crafting process
   * @param craftingFacility - the crafting facility
   * @param craftingRecipe - the crafting recipe
   * @param craftableItem - the craftable item for the output
   * @param cargoPodTo - the destination cargo pod
   * @param cargoType - the cargo type
   * @param cargoStatsDefinition - the cargo stats definition
   * @param gameId - the SAGE game id
   * @param gameState - the game state  account
   * @param tokenFrom - the source token account - owner should be `craftableItem`
   * @param tokenTo - the destination token account - owner should be `cargoPodTo`
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static claimCraftingOutputs(
    program: SageIDLProgram,
    cargoProgram: CargoIDLProgram,
    craftingProgram: CraftingIDLProgram,
    starbasePlayer: PublicKey,
    starbase: PublicKey,
    craftingInstance: PublicKey,
    craftingProcess: PublicKey,
    craftingFacility: PublicKey,
    craftingRecipe: PublicKey,
    craftableItem: PublicKey,
    cargoPodTo: PublicKey,
    cargoType: PublicKey,
    cargoStatsDefinition: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    tokenFrom: PublicKey,
    tokenTo: PublicKey,
    input: StarbaseClaimCraftingOutputsInput
  ): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .claimCraftingOutputs(input)
          .accountsStrict({
            starbaseAndStarbasePlayer: {
              starbase,
              starbasePlayer,
            },
            gameAccounts: {
              gameId,
              gameState,
            },
            craftingInstance,
            craftingProcess,
            craftingFacility,
            craftingRecipe,
            craftableItem,
            cargoPodTo,
            cargoType,
            cargoStatsDefinition,
            tokenFrom,
            tokenTo,
            craftingProgram: craftingProgram.programId,
            cargoProgram: cargoProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction(),
        signers: [],
      },
    ];
  }

  /**
   * Close Crafting Process
   * @param program - SAGE program
   * @param craftingProgram - crafting program
   * @param pointsProgram - points program
   * @param key - the key authorized to run this instruction
   * @param playerProfile - the player's profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param fundsTo - recipient of the rent refund
   * @param starbasePlayer - the Starbase player
   * @param starbase - the Starbase
   * @param craftingInstance - the crafting instance
   * @param craftingProcess - the crafting process
   * @param craftingFacility - the crafting facility
   * @param craftingRecipe - the crafting recipe
   * @param craftingXpUserAccount - the user account for Crafting XP
   * @param craftingXpCategory - the Crafting XP Points Category Account
   * @param craftingXpModifier - the Crafting XP modifier
   * @param councilRankXpUserAccount - the user account for Council Rank XP
   * @param councilRankXpCategory - the Council Rank XP Points Category Account
   * @param councilRankXpModifier - the Council Rank XP modifier
   * @param gameId - the SAGE game id
   * @param gameState - the game state  account
   * @param input - the instruction input params
   * @param tokenFrom - the source token account for crafting fees, ATA owned by crafting process
   * @param tokenTo - the recipe fee recipient`, should be as defined in `craftingRecipe` account
   * @returns InstructionReturn
   */
  static closeCraftingProcess(
    program: SageIDLProgram,
    craftingProgram: CraftingIDLProgram,
    pointsProgram: PointsIDLProgram,
    key: AsyncSigner,
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    fundsTo: PublicKey | "funder",
    starbasePlayer: PublicKey,
    starbase: PublicKey,
    craftingInstance: PublicKey,
    craftingProcess: PublicKey,
    craftingFacility: PublicKey,
    craftingRecipe: PublicKey,
    craftingXpUserAccount: PublicKey,
    craftingXpCategory: PublicKey,
    craftingXpModifier: PublicKey,
    councilRankXpUserAccount: PublicKey,
    councilRankXpCategory: PublicKey,
    councilRankXpModifier: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    input: StarbaseCloseCraftingProcessInput,
    tokenFrom?: PublicKey,
    tokenTo?: PublicKey
  ): InstructionReturn {
    const remainingAccounts: AccountMeta[] = [];
    if (tokenFrom && tokenTo) {
      remainingAccounts.push(
        ...[
          {
            pubkey: tokenFrom,
            isSigner: false,
            isWritable: true,
          },
          {
            pubkey: tokenTo,
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
    return async (funder) => [
      {
        instruction: await program.methods
          .closeCraftingProcess(input)
          .accountsStrict({
            fundsTo: fundsTo === "funder" ? funder.publicKey() : fundsTo,
            starbaseAndStarbasePlayer: {
              starbase,
              starbasePlayer,
            },
            gameAccountsAndProfile: {
              gameAndProfileAndFaction: {
                gameId,
                key: key.publicKey(),
                profile: playerProfile,
                profileFaction,
              },
              gameState,
            },
            craftingInstance,
            craftingProcess,
            craftingRecipe,
            craftingFacility,
            craftingXpAccounts: {
              userPointsAccount: craftingXpUserAccount,
              pointsCategory: craftingXpCategory,
              pointsModifierAccount: craftingXpModifier,
            },
            councilRankXpAccounts: {
              userPointsAccount: councilRankXpUserAccount,
              pointsCategory: councilRankXpCategory,
              pointsModifierAccount: councilRankXpModifier,
            },
            progressionConfig: ProgressionConfig.findAddress(program, gameId)[0],
            pointsProgram: pointsProgram.programId,
            craftingProgram: craftingProgram.programId,
          })
          .remainingAccounts(remainingAccounts)
          .instruction(),
        signers: [key],
      },
    ];
  }

  static decodeData(account: KeyedAccountInfo, program: SageIDLProgram): DecodedAccountData<CraftingInstance> {
    return decodeAccount(account, program, CraftingInstance);
  }
}
