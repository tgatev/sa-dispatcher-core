import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { KeyedAccountInfo, PublicKey, SystemProgram } from "@solana/web3.js";
import { BN } from "@staratlas/anchor";
import {
  Account,
  AccountStatic,
  AsyncSigner,
  DecodedAccountData,
  InstructionReturn,
  arrayDeepEquals,
  decodeAccountWithRemaining,
  staticImplements,
} from "@staratlas/data-source";
import { CargoIDL } from ".";
import { CargoIDLProgram, CargoPodAccount } from "./constants";

/**
 * Checks equality between 2 Cargo Pod Accounts
 * @param data1 - First Cargo Pod Account
 * @param data2 - Second Cargo Pod Account
 * @returns boolean
 */
export function cargoPodDataEquals(data1: CargoPodAccount, data2: CargoPodAccount): boolean {
  return (
    data1.version === data2.version &&
    data1.podBump === data2.podBump &&
    data1.openTokenAccounts === data2.openTokenAccounts &&
    arrayDeepEquals(data1.podSeeds, data2.podSeeds, (a, b) => a === b) &&
    data1.statsDefinition.equals(data2.statsDefinition) &&
    data1.authority.equals(data2.authority) &&
    data1.seqId === data2.seqId &&
    data1.unupdatedTokenAccounts === data2.unupdatedTokenAccounts
  );
}

export const CARGO_POD_OFFSET = 8 + 1 + 32 + 32 + 1 + 32 + 1 + 2 + 1;

@staticImplements<AccountStatic<CargoPod, CargoIDL>>()
export class CargoPod implements Account {
  static readonly ACCOUNT_NAME: NonNullable<CargoIDL["accounts"]>[number]["name"] = "CargoPod";
  static readonly MIN_DATA_SIZE: number = CARGO_POD_OFFSET;

  constructor(private _data: CargoPodAccount, private _key: PublicKey, private _stats: BN[]) {}

  get data(): Readonly<CargoPodAccount> {
    return this._data;
  }

  get key(): PublicKey {
    return this._key;
  }

  get stats(): Readonly<BN[]> {
    return this._stats || [];
  }

  /**
   * Finds the Cargo Pod PDA
   * @param program - Cargo IDL program
   * @param podSeeds - Pod Seeds
   * @returns PDA key & bump
   * TODO: Validate is it working correctly
   */
  static findAddress(program: CargoIDLProgram, podSeeds: Buffer): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from("cargo_pod"), podSeeds], program.programId);
  }

  /**
   * Initialize new Cargo Pod
   * @param program - Cargo program
   * @param authority - Authority for new Cargo Pod
   * @param statsDefinition - The key for StatsDefinition Account
   * @param podSeeds - Pod Seeds
   * @returns IntructionReturn
   */
  static initCargoPod(program: CargoIDLProgram, authority: AsyncSigner, statsDefinition: PublicKey, podSeeds: Buffer): InstructionReturn {
    const addressResult = this.findAddress(program, podSeeds);
    return async (funder) => [
      {
        instruction: await program.methods
          .initCargoPod(Array.from(podSeeds))
          .accountsStrict({
            authority: authority.publicKey(),
            funder: funder.publicKey(),
            cargoPod: addressResult[0],
            statsDefinition,
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
        signers: [authority, funder],
      },
    ];
  }

  /**
   * Add Cargo to Cargo Pod
   * Only the registered cargo pod authority is allowed to do this
   * @param program - Cargo IDL program
   * @param authority - Authority for the cargo pod
   * @param originTokenAccountAuthority - Authority for origin Token Account
   * @param cargoPod - Cargo Pod PublicKey
   * @param cargoType - Cargo Type PublicKey
   * @param statsDefinition - Stats Definition PublicKey
   * @param originTokenAccount - Origin Token Account
   * @param destinationTokenAccount - Token Account owned by Cargo Pod
   * @param cargoAmount - Amount of cargo to be deposited
   * @returns InstructionReturn
   */
  static addCargo(
    program: CargoIDLProgram,
    authority: AsyncSigner,
    originTokenAccountAuthority: AsyncSigner,
    cargoPod: PublicKey,
    cargoType: PublicKey,
    statsDefinition: PublicKey,
    originTokenAccount: PublicKey,
    destinationTokenAccount: PublicKey,
    cargoAmount: BN
  ): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .addCargo(cargoAmount)
          .accountsStrict({
            authority: authority.publicKey(),
            signerOriginAccount: originTokenAccountAuthority.publicKey(),
            cargoPod,
            cargoType,
            statsDefinition,
            originTokenAccount,
            cargoTokenAccount: destinationTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction(),
        signers: [authority, originTokenAccountAuthority],
      },
    ];
  }

  /**
   * Legitimize cargo
   * The cargo pod token accounts can receive tokens from anyone.  However, only tokens received through the cargo pod program
   * are recognized as valid cargo.  This instruction can be used in cases where one wants to "legitimize" such token account balances
   * Only the registered cargo pod authority is allowed to do this
   * @param program - Cargo IDL program
   * @param authority - Cargo Pod Authority
   * @param cargoPod - Cargo Pod Account
   * @param cargoType - Cargo Type Account
   * @param statsDefinition - Stats Definition Account
   * @param cargoTokenAccount - Cargo Pod Token Account
   * @param cargoAmount - Amount of cargo to be legitimized
   * @returns InstructionReturn
   */
  static legitimizeCargo(
    program: CargoIDLProgram,
    authority: AsyncSigner,
    cargoPod: PublicKey,
    cargoType: PublicKey,
    statsDefinition: PublicKey,
    cargoTokenAccount: PublicKey,
    cargoAmount: BN
  ): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .legitimizeCargo(cargoAmount)
          .accountsStrict({
            authority: authority.publicKey(),
            cargoPod,
            cargoType,
            statsDefinition,
            cargoTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction(),
        signers: [authority],
      },
    ];
  }

  /**
   * Remove Cargo from Cargo Pod
   * Only the registered cargo pod authority is allowed to do this
   * @param program - Cargo IDL program
   * @param authority - Authority for Cargo Pod
   * @param cargoPod - Cargo Pod Account
   * @param cargoType - Cargo Type Account
   * @param statsDefinition - Stats Definition Account
   * @param originTokenAccount - Token Account owned by Cargo Pod
   * @param destinationTokenAccount - Destination Token Account
   * @param cargoAmount - Amount of cargo to be transferred
   * @returns InstructionReturn
   */
  static removeCargo(
    program: CargoIDLProgram,
    authority: AsyncSigner,
    cargoPod: PublicKey,
    cargoType: PublicKey,
    statsDefinition: PublicKey,
    originTokenAccount: PublicKey,
    destinationTokenAccount: PublicKey,
    cargoAmount: BN
  ): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .removeCargo(cargoAmount)
          .accountsStrict({
            authority: authority.publicKey(),
            cargoPod,
            cargoType,
            statsDefinition,
            cargoTokenAccount: originTokenAccount,
            destinationTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction(),
        signers: [authority],
      },
    ];
  }

  /**
   * Burns Cargo in a Cargo Pod
   * This is permanent and irreversible
   * @param program - Cargo IDL program
   * @param authority - Authority for the Cargo Pod
   * @param cargoPod - Cargo Pod Account
   * @param cargoType - Cargo Type Account
   * @param statsDefinition - Stats Definition Account
   * @param cargoTokenAccount - Token Account owned by Cargo Pod
   * @param tokenMint - Token Mint key
   * @param cargoAmount - Amount of cargo to be burned
   * @returns InstructionReturn
   */
  static consumeCargo(
    program: CargoIDLProgram,
    authority: AsyncSigner,
    cargoPod: PublicKey,
    cargoType: PublicKey,
    statsDefinition: PublicKey,
    cargoTokenAccount: PublicKey,
    tokenMint: PublicKey,
    cargoAmount: BN
  ): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .consumeCargo(cargoAmount)
          .accountsStrict({
            authority: authority.publicKey(),
            cargoPod,
            cargoType,
            statsDefinition,
            cargoTokenAccount,
            tokenMint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction(),
        signers: [authority],
      },
    ];
  }

  /**
   * Transfers Cargo between 2 Cargo Pods
   * @param program - Cargo IDL program
   * @param originPodAuthority - Authority for the origin Cargo Pod
   * @param destinationPodAuthority - Authority for the destination Cargo Pod
   * @param originCargoPod - Origin Cargo Pod
   * @param destinationCargoPod - Destination Cargo Pod
   * @param cargoType - Cargo Type Account
   * @param statsDefinition - Stats Definition Account
   * @param originTokenAccount - Token Account owned by origin Cargo Pod
   * @param destinationTokenAccount - Token Account owned by destination Cargo Pod
   * @param cargoAmount - Amount of cargo to be transferred
   * @returns InstructionReturn
   */
  static transferCargo(
    program: CargoIDLProgram,
    originPodAuthority: AsyncSigner,
    destinationPodAuthority: AsyncSigner,
    originCargoPod: PublicKey,
    destinationCargoPod: PublicKey,
    cargoType: PublicKey,
    statsDefinition: PublicKey,
    originTokenAccount: PublicKey,
    destinationTokenAccount: PublicKey,
    cargoAmount: BN
  ): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .transferCargo(cargoAmount)
          .accountsStrict({
            originPodAuthority: originPodAuthority.publicKey(),
            destinationPodAuthority: destinationPodAuthority.publicKey(),
            originCargoPod,
            destinationCargoPod,
            cargoType,
            statsDefinition,
            originTokenAccount,
            destinationTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction(),
        signers: [originPodAuthority, destinationPodAuthority],
      },
    ];
  }

  /**
   * Updates Cargo Pod Authority
   * This transfers the ownership of the cargo pod to another person/entity
   * @param program - Cargo IDL program
   * @param authority - Current Authority
   * @param newAuthority - New Authority
   * @param cargoPod - Cargo Pod account
   * @returns InstructionReturn
   */
  static transferAuthority(
    program: CargoIDLProgram,
    authority: AsyncSigner,
    newAuthority: AsyncSigner,
    cargoPod: PublicKey
  ): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .transferAuthority()
          .accountsStrict({
            originPodAuthority: authority.publicKey(),
            newPodAuthority: newAuthority.publicKey(),
            cargoPod,
          })
          .instruction(),
        signers: [authority, newAuthority],
      },
    ];
  }

  /**
   * Mints to a Cargo Pod Token Account
   * @param program - Cargo IDL program
   * @param mintAmount - Amount to be minted
   * @param authority - Authority for the Cargo Pod Account
   * @param mint - Mint Key
   * @param statsDefinition - Stats Definition Account
   * @param cargoPod - Cargo Pod Account
   * @param cargoType - Cargo Type Account
   * @param tokenAccountToMintTo - Cargo Pod Token Account
   * @param tokenProgram - Token Program
   * @returns InstructionReturn
   */
  static mintTo(
    program: CargoIDLProgram,
    mintAmount: BN,
    authority: AsyncSigner,
    mint: AsyncSigner,
    statsDefinition: PublicKey,
    cargoPod: PublicKey,
    cargoType: PublicKey,
    tokenAccountToMintTo: AsyncSigner,
    tokenProgram: PublicKey
  ): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .mintTo(mintAmount)
          .accountsStrict({
            authority: authority.publicKey(),
            mintAuthority: mint.publicKey(),
            statsDefinition,
            cargoPod,
            cargoType,
            cargoTokenAccount: tokenAccountToMintTo.publicKey(),
            tokenMint: mint.publicKey(),
            tokenProgram,
          })
          .instruction(),
        signers: [authority, mint],
      },
    ];
  }

  /**
   * Updates a Cargo Pod `seq id` to match the Stats Definition, Also freezes the pod until all related token accounts are updated
   * @param program - Cargo IDL program
   * @param cargoPod - Cargo Pod Account
   * @param statsDefinition - Stats Definition Account
   * @returns InstructionReturn
   */
  static updateCargoPod(program: CargoIDLProgram, cargoPod: PublicKey, statsDefinition: PublicKey): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .updateCargoPod()
          .accountsStrict({
            cargoPod,
            statsDefinition,
          })
          .instruction(),
        signers: [],
      },
    ];
  }

  /**
   * Updates Cargo Pod Token Account
   * @param program - Cargo IDL program
   * @param statsDefinition - Stats Definition Account
   * @param cargoPod - Cargo Pod Account
   * @param oldCargoType - Old Cargo Type Account
   * @param cargoType - Current Cargo Type Account
   * @param cargoTokenAccount - Token Account owned by the Cargo Pod
   * @returns InstructionReturn
   */
  static updatePodTokenAccount(
    program: CargoIDLProgram,
    statsDefinition: PublicKey,
    cargoPod: PublicKey,
    oldCargoType: PublicKey,
    cargoType: PublicKey,
    cargoTokenAccount: PublicKey
  ): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .updatePodTokenAccount()
          .accountsStrict({
            statsDefinition,
            cargoPod,
            oldCargoType,
            cargoType,
            cargoTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction(),
        signers: [],
      },
    ];
  }

  /**
   * Close Cargo Pod Token Account
   * @param p - input parameters for this function
   * @param p.program - Cargo IDL program
   * @param p.authority - Cargo Pod Authority
   * @param p.cargoPod - Cargo Pod Account
   * @param p.tokenAccountToClose - Cargo Pod Token Account
   * @param p.cargoType - Cargo Type Account
   * @param p.mint - Mint
   * @returns InstructionReturn
   */
  static closeTokenAccount(p: {
    program: CargoIDLProgram;
    authority: AsyncSigner;
    cargoPod: PublicKey;
    tokenAccountToClose: PublicKey;
    cargoType: PublicKey;
    mint: PublicKey;
  }): InstructionReturn {
    const { program, authority, cargoPod, tokenAccountToClose, cargoType, mint } = p;

    return async (funder) => [
      {
        instruction: await program.methods
          .closeTokenAccount()
          .accountsStrict({
            funder: funder.publicKey(),
            authority: authority.publicKey(),
            cargoPod,
            cargoType,
            cargoTokenAccount: tokenAccountToClose,
            mint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction(),
        signers: [authority],
      },
    ];
  }

  /**
   * Close Cargo Pod Account
   * @param program - Cargo IDL program
   * @param authority - Authority for Cargo Pod
   * @param cargoPod - Cargo Pod Account
   * @returns InstructionReturn
   */
  static closeCargoPod(program: CargoIDLProgram, authority: AsyncSigner, cargoPod: PublicKey): InstructionReturn {
    return async (funder) => [
      {
        instruction: await program.methods
          .closeCargoPod()
          .accountsStrict({
            funder: funder.publicKey(),
            authority: authority.publicKey(),
            cargoPod,
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
        signers: [authority],
      },
    ];
  }

  static decodeData(account: KeyedAccountInfo, program: CargoIDLProgram): DecodedAccountData<CargoPod> {
    return decodeAccountWithRemaining(account, program, CargoPod, (remainingData) =>
      Array((account.accountInfo.data.length - CARGO_POD_OFFSET) / 8)
        .fill(0)
        .map((_, index) => new BN(remainingData.subarray(8 * index).subarray(0, 8), 10, "le"))
    );
  }
}
