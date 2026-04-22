import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { AccountMeta, KeyedAccountInfo, PublicKey, SystemProgram } from "@solana/web3.js";
import { CargoIDLProgram, CargoPod } from "@staratlas/cargo";
import {
  Account,
  AccountStatic,
  AsyncSigner,
  decodeAccountWithRemaining,
  DecodedAccountData,
  InstructionReturn,
  isAsyncSigner,
  staticImplements,
} from "@staratlas/data-source";
import {
  SageIDL,
  SageIDLProgram,
  StarbasePlayerAccount,
  CloseStarbaseCargoTokenAccountInput,
  StarbaseCreateCargoPodInput,
  StarbaseDepositCargoToGameInput,
  StarbaseRemoveCargoPodInput,
  StarbaseWithdrawCargoFromGameInput,
  TransferCargoAtStarbaseInput,
  TransferCargoWithinFleetInput,
  WrappedShipEscrow,
} from "../IDL/constants";
import { CREW_FEATURE } from "./sageCrewConfig";
import { assert } from "console";

export type MintOrRedeemCertificateInput = TransferCargoWithinFleetInput;

export const STAR_BASE_PLAYER_MIN_DATA_SIZE =
  8 + // discriminator
  1 + // version
  32 + // playerProfile
  32 + // gameId
  32 + // starbase
  32 + // sagePlayerProfile
  1 + // bump
  4 + // oldTotalCrew
  4 + // newTotalCrew
  8 + // busyCrew
  8 + // updateId
  4 + // updatedShipEscrowCount
  4; // shipEscrowCount

/**
 * Check if two `StarbasePlayerAccount` instances are equal
 * @param data1 - first StarbasePlayerAccount
 * @param data2 - second StarbasePlayerAccount
 * @returns boolean
 */
export function starbasePlayerDataEquals(data1: StarbasePlayerAccount, data2: StarbasePlayerAccount): boolean {
  return (
    data1.version === data2.version &&
    data1.playerProfile.equals(data2.playerProfile) &&
    data1.gameId.equals(data2.gameId) &&
    data1.starbase.equals(data2.starbase) &&
    data1.sagePlayerProfile.equals(data2.sagePlayerProfile) &&
    data1.bump === data2.bump &&
    data1.shipEscrowCount == data2.shipEscrowCount &&
    data1.updatedShipEscrowCount == data2.updatedShipEscrowCount &&
    data1.updateId.eq(data2.updateId) &&
    data1.oldTotalCrew == data2.oldTotalCrew &&
    data1.newTotalCrew == data2.newTotalCrew &&
    data1.busyCrew.eq(data2.busyCrew)
  );
}

@staticImplements<AccountStatic<StarbasePlayer, SageIDL>>()
export class StarbasePlayer implements Account {
  static readonly ACCOUNT_NAME: NonNullable<SageIDL["accounts"]>[number]["name"] = "StarbasePlayer";
  static readonly MIN_DATA_SIZE: number = STAR_BASE_PLAYER_MIN_DATA_SIZE;

  constructor(private _data: StarbasePlayerAccount, private _key: PublicKey, private _wrappedShipEscrows: WrappedShipEscrow[]) {}

  get data(): Readonly<StarbasePlayerAccount> {
    return this._data;
  }

  get key(): Readonly<PublicKey> {
    return this._key;
  }

  get wrappedShipEscrows(): Readonly<WrappedShipEscrow[]> {
    return this._wrappedShipEscrows || [];
  }

  /**
   * Get the total crew at the StarbasePlayer
   *
   * The StarbasePlayer account now has two fields for total crew:
   *    - oldTotalCrew: used before crew program features are enabled
   *    - newTotalCrew: used after crew program features are enabled
   *
   * This function returns the correct field based on whether crew program features are enabled
   * @param crewFeaturesEnabled - whether crew program features are enabled
   * @returns total crew at the StarbasePlayer
   */
  totalCrew(crewFeaturesEnabled = CREW_FEATURE): Readonly<number> {
    return crewFeaturesEnabled ? this.data.newTotalCrew : this.data.oldTotalCrew;
  }

  /**
   * Find the StarbasePlayer account address
   * @param program - SAGE program
   * @param starbase - the Starbase
   * @param sagePlayerProfile - the SAGE player profile
   * @param starbaseSeqId - the Starbase sequence id
   * @returns The PDA and bump respectively
   */
  static findAddress(
    program: SageIDLProgram,
    starbase: PublicKey,
    sagePlayerProfile: PublicKey,
    starbaseSeqId: number
  ): [PublicKey, number] {
    const arr = new ArrayBuffer(2);
    const view = new DataView(arr);
    view.setUint16(0, starbaseSeqId, true);
    const seqIdSeed = new Uint8Array(view.buffer);
    return PublicKey.findProgramAddressSync(
      [Buffer.from("starbase_player"), starbase.toBuffer(), sagePlayerProfile.toBuffer(), seqIdSeed],
      program.programId
    );
  }

  /**
   * Register a `StarbasePlayer`
   * @param program - SAGE program
   * @param profileFaction - the faction of profile associated with the `sagePlayerProfile`
   * @param sagePlayerProfile - the SAGE player profile
   * @param starbase - the Starbase
   * @param gameId - the SAGE game id
   * @param gameState - the game state
   * @param starbaseSeqId - the Starbase sequence id
   * @returns InstructionReturn
   */
  static registerStarbasePlayer(
    program: SageIDLProgram,
    profileFaction: PublicKey,
    sagePlayerProfile: PublicKey,
    starbase: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    starbaseSeqId: number
  ): InstructionReturn {
    return async (funder) => [
      {
        instruction: await program.methods
          .registerStarbasePlayer()
          .accountsStrict({
            profileFaction,
            funder: funder.publicKey(),
            gameAccounts: {
              gameId,
              gameState,
            },
            sagePlayerProfile: sagePlayerProfile,
            starbase,
            starbasePlayer: this.findAddress(program, starbase, sagePlayerProfile, starbaseSeqId)[0],
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
        signers: [funder],
      },
    ];
  }

  /**
   * Sync the Starbase player account
   * @param program - SAGE program
   * @param starbasePlayer - the Starbase player
   * @param starbase - the Starbase tied to the `starbasePlayer`
   * @param gameId - the SAGE game id
   * @param gameState - the game state  account
   * @returns InstructionReturn
   */
  static syncStarbasePlayer(
    program: SageIDLProgram,
    starbasePlayer: PublicKey,
    starbase: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey
  ): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .syncStarbasePlayer()
          .accountsStrict({
            starbaseAndStarbasePlayer: {
              starbase,
              starbasePlayer,
            },
            gameAccounts: {
              gameId,
              gameState,
            },
          })
          .instruction(),
        signers: [],
      },
    ];
  }

  /**
   * Creates a new cargo pod for the player at the `Starbase`
   * @param program - SAGE program
   * @param cargoProgram - cargo program
   * @param starbasePlayer - the Starbase player
   * @param key - the key authorized to run this instruction
   * @param playerProfile - the profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param starbase - the Starbase
   * @param cargoStatsDefinition - the cargo stats definition
   * @param gameId - the SAGE game id
   * @param gameState - the game state  account
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static createCargoPod(
    program: SageIDLProgram,
    cargoProgram: CargoIDLProgram,
    starbasePlayer: PublicKey,
    key: AsyncSigner,
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    starbase: PublicKey,
    cargoStatsDefinition: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    input: StarbaseCreateCargoPodInput
  ): InstructionReturn {
    const cargoPod = CargoPod.findAddress(cargoProgram, Buffer.from(input.podSeeds))[0];
    return async (funder) => [
      {
        instruction: await program.methods
          .createCargoPod(input)
          .accountsStrict({
            funder: funder.publicKey(),
            starbaseAndStarbasePlayer: {
              starbase,
              starbasePlayer,
            },
            gameAccountsAndProfile: {
              gameAndProfileAndFaction: {
                key: key.publicKey(),
                profile: playerProfile,
                profileFaction,
                gameId,
              },
              gameState,
            },
            cargoPod,
            cargoStatsDefinition,
            cargoProgram: cargoProgram.programId,
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
        signers: [key, funder],
      },
    ];
  }

  /**
   * Deposits cargo to the game
   * @param program - SAGE program
   * @param cargoProgram - cargo program
   * @param starbasePlayer - the Starbase player
   * @param key - the key authorized to run this instruction
   * @param playerProfile - the profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param starbase - the Starbase
   * @param cargoPod - the cargo pod
   * @param cargoType - the cargo type
   * @param cargoStatsDefinition - the cargo stats definition
   * @param tokenFrom - the source token account - owned by the `key`
   * @param tokenTo - the destination token account - owned by the `cargoPod`
   * @param gameId - the SAGE game id
   * @param gameState - the game state  account
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static depositCargoToGame(
    program: SageIDLProgram,
    cargoProgram: CargoIDLProgram,
    starbasePlayer: PublicKey,
    key: AsyncSigner,
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    starbase: PublicKey,
    cargoPod: PublicKey,
    cargoType: PublicKey,
    cargoStatsDefinition: PublicKey,
    tokenFrom: PublicKey,
    tokenTo: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    input: StarbaseDepositCargoToGameInput
  ): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .depositCargoToGame(input)
          .accountsStrict({
            starbaseAndStarbasePlayer: {
              starbase,
              starbasePlayer,
            },
            gameAccountsAndProfile: {
              gameAndProfileAndFaction: {
                key: key.publicKey(),
                profile: playerProfile,
                profileFaction,
                gameId,
              },
              gameState,
            },
            cargoPod,
            cargoType,
            cargoStatsDefinition,
            tokenFrom,
            tokenTo,
            cargoProgram: cargoProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction(),
        signers: [key],
      },
    ];
  }

  /**
   * Withdraws cargo from the game
   * @param program - SAGE program
   * @param cargoProgram - cargo program
   * @param starbasePlayer - the Starbase player
   * @param key - the key authorized to run this instruction
   * @param fundsTo - recipient of the rent refund
   * @param playerProfile - the profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param starbase - the Starbase
   * @param cargoPod - the cargo pod
   * @param cargoType - the cargo type
   * @param cargoStatsDefinition - the cargo stats definition
   * @param tokenFrom - the source token account - owned by the `cargoPod`
   * @param tokenTo - the destination token account - owned by the `key`
   * @param tokenMint - the token mint
   * @param gameId - the SAGE game id
   * @param gameState - the game state  account
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static withdrawCargoFromGame(
    program: SageIDLProgram,
    cargoProgram: CargoIDLProgram,
    starbasePlayer: PublicKey,
    key: AsyncSigner,
    fundsTo: PublicKey | "funder",
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    starbase: PublicKey,
    cargoPod: PublicKey,
    cargoType: PublicKey,
    cargoStatsDefinition: PublicKey,
    tokenFrom: PublicKey,
    tokenTo: PublicKey,
    tokenMint: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    input: StarbaseWithdrawCargoFromGameInput
  ): InstructionReturn {
    return async (funder) => [
      {
        instruction: await program.methods
          .withdrawCargoFromGame(input)
          .accountsStrict({
            fundsTo: fundsTo === "funder" ? funder.publicKey() : fundsTo,
            starbaseAndStarbasePlayer: {
              starbase,
              starbasePlayer,
            },
            gameAccountsAndProfile: {
              gameAndProfileAndFaction: {
                key: key.publicKey(),
                profile: playerProfile,
                profileFaction,
                gameId,
              },
              gameState,
            },
            cargoPod,
            cargoType,
            cargoStatsDefinition,
            tokenFrom,
            tokenTo,
            tokenMint,
            cargoProgram: cargoProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction(),
        signers: [key],
      },
    ];
  }

  /**
   * Transfers cargo from one pod to another at the same `Starbase` owned by the same player
   * @param program - SAGE program
   * @param cargoProgram - cargo program
   * @param starbasePlayer - the Starbase player
   * @param key - the key authorized to run this instruction
   * @param fundsTo - recipient of the rent refund
   * @param playerProfile - the profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param starbase - the Starbase
   * @param cargoPodFrom - the source cargo pod
   * @param cargoPodTo - the destination cargo pod
   * @param cargoType - the cargo type
   * @param cargoStatsDefinition - the cargo stats definition
   * @param tokenFrom - the source token account - owned by the `cargoPodFrom`
   * @param tokenTo - the destination token account - owned by the `cargoPodTo`
   * @param tokenMint - the token mint
   * @param gameId - the SAGE game id
   * @param gameState - the game state  account
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static transferCargoAtStarbase(
    program: SageIDLProgram,
    cargoProgram: CargoIDLProgram,
    starbasePlayer: PublicKey,
    key: AsyncSigner,
    fundsTo: PublicKey | "funder",
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    starbase: PublicKey,
    cargoPodFrom: PublicKey,
    cargoPodTo: PublicKey,
    cargoType: PublicKey,
    cargoStatsDefinition: PublicKey,
    tokenFrom: PublicKey,
    tokenTo: PublicKey,
    tokenMint: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    input: TransferCargoAtStarbaseInput
  ): InstructionReturn {
    return async (funder) => [
      {
        instruction: await program.methods
          .transferCargoAtStarbase(input)
          .accountsStrict({
            fundsTo: fundsTo === "funder" ? funder.publicKey() : fundsTo,
            starbaseAndStarbasePlayer: {
              starbase,
              starbasePlayer,
            },
            gameAccountsAndProfile: {
              gameAndProfileAndFaction: {
                key: key.publicKey(),
                profile: playerProfile,
                profileFaction,
                gameId,
              },
              gameState,
            },
            cargoPodFrom,
            cargoPodTo,
            cargoType,
            cargoStatsDefinition,
            tokenFrom,
            tokenTo,
            tokenMint,
            cargoProgram: cargoProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction(),
        signers: [key],
      },
    ];
  }

  /**
   * Closes a token account that is owned by the StarbasePlayer (burns any token balance)
   * @param program - SAGE program
   * @param cargoProgram - cargo program
   * @param starbasePlayer - the Starbase player
   * @param key - the key authorized to run this instruction
   * @param fundsTo - recipient of the rent refund
   * @param playerProfile - the profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param starbase - the Starbase
   * @param cargoPod - the cargo pod - owned by `starbasePlayer`
   * @param cargoType - the cargo type
   * @param cargoStatsDefinition - the cargo stats definition
   * @param token - the token account - owned by the `cargoPod`
   * @param tokenMint - the token mint
   * @param gameId - the SAGE game id
   * @param gameState - the game state  account
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static closeStarbaseCargoTokenAccount(
    program: SageIDLProgram,
    cargoProgram: CargoIDLProgram,
    starbasePlayer: PublicKey,
    key: AsyncSigner,
    fundsTo: PublicKey | "funder",
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    starbase: PublicKey,
    cargoPod: PublicKey,
    cargoType: PublicKey,
    cargoStatsDefinition: PublicKey,
    token: PublicKey,
    tokenMint: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    input: CloseStarbaseCargoTokenAccountInput
  ): InstructionReturn {
    return async (funder) => [
      {
        instruction: await program.methods
          .closeStarbaseCargoTokenAccount(input)
          .accountsStrict({
            fundsTo: fundsTo === "funder" ? funder.publicKey() : fundsTo,
            starbaseAndStarbasePlayer: {
              starbase,
              starbasePlayer,
            },
            gameAccountsAndProfile: {
              gameAndProfileAndFaction: {
                key: key.publicKey(),
                profile: playerProfile,
                profileFaction,
                gameId,
              },
              gameState,
            },
            cargoPod,
            cargoType,
            cargoStatsDefinition,
            token,
            tokenMint,
            cargoProgram: cargoProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction(),
        signers: [key],
      },
    ];
  }

  /**
   * Closes an empty cargo pod account owned by the player at a `Starbase`
   * @param program - SAGE program
   * @param cargoProgram - cargo program
   * @param starbasePlayer - the Starbase player
   * @param key - the key authorized to run this instruction
   * @param playerProfile - the profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param fundsTo - recipient of the rent refund
   * @param starbase - the Starbase
   * @param cargoPod - the cargo pod
   * @param gameId - the SAGE game id
   * @param gameState - the game state  account
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static removeCargoPod(
    program: SageIDLProgram,
    cargoProgram: CargoIDLProgram,
    starbasePlayer: PublicKey,
    key: AsyncSigner,
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    fundsTo: PublicKey | "funder",
    starbase: PublicKey,
    cargoPod: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    input: StarbaseRemoveCargoPodInput
  ): InstructionReturn {
    return async (funder) => [
      {
        instruction: await program.methods
          .removeCargoPod(input)
          .accountsStrict({
            fundsTo: fundsTo === "funder" ? funder.publicKey() : fundsTo,
            starbaseAndStarbasePlayer: {
              starbase,
              starbasePlayer,
            },
            gameAccountsAndProfile: {
              gameAndProfileAndFaction: {
                key: key.publicKey(),
                profile: playerProfile,
                profileFaction,
                gameId,
              },
              gameState,
            },
            cargoPod,
            cargoProgram: cargoProgram.programId,
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
        signers: [key],
      },
    ];
  }

  /**
   * Mints a certificate for a given cargo type
   * @param program - SAGE program
   * @param cargoProgram - cargo program
   * @param starbasePlayer - the Starbase player
   * @param key - the key authorized to run this instruction
   * @param playerProfile - the profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param starbase - the Starbase
   * @param cargoPod - the cargo pod, owned by the `starbasePlayer`
   * @param cargoType - the cargo type in question & associated with the `cargoMint`
   * @param cargoStatsDefinition - the cargo stats definition
   * @param certificateTokenTo - the token account where certificates are minted to
   * @param certificateMint - the cargo certificate mint
   * @param cargoTokenFrom - the source token account for the cargo - owned by the `cargo_pod`
   * @param cargoTokenTo - the destination token account for the cargo - owned by the Starbase
   * @param cargoMint - the mint of the cargo in question
   * @param gameId - the SAGE game id
   * @param gameState - the game state  account
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static mintCertificate(
    program: SageIDLProgram,
    cargoProgram: CargoIDLProgram,
    starbasePlayer: PublicKey,
    key: AsyncSigner,
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    starbase: PublicKey,
    cargoPod: PublicKey,
    cargoType: PublicKey,
    cargoStatsDefinition: PublicKey,
    certificateTokenTo: PublicKey,
    certificateMint: PublicKey,
    cargoTokenFrom: PublicKey,
    cargoTokenTo: PublicKey,
    cargoMint: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    input: MintOrRedeemCertificateInput
  ): InstructionReturn {
    return async () => [
      {
        instruction: await program.methods
          .mintCertificate(input.keyIndex, input.amount)
          .accountsStrict({
            starbaseAndStarbasePlayer: {
              starbase,
              starbasePlayer,
            },
            gameAccountsAndProfile: {
              gameAndProfileAndFaction: {
                key: key.publicKey(),
                profile: playerProfile,
                profileFaction,
                gameId,
              },
              gameState,
            },
            certificateTokenTo,
            certificateMint,
            cargoTokenFrom,
            cargoTokenTo,
            cargoMint,
            cargoPod,
            cargoType,
            cargoStatsDefinition,
            cargoProgram: cargoProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            token2022Program: TOKEN_2022_PROGRAM_ID,
          })
          .instruction(),
        signers: [key],
      },
    ];
  }

  /**
   * Redeems a certificate for a given cargo type
   * @param program - SAGE program
   * @param cargoProgram - cargo program
   * @param starbasePlayer - the Starbase player
   * @param key - the key authorized to run this instruction
   * @param playerProfile - the profile with the required permissions for the instruction
   * @param profileFaction - the profile's faction
   * @param fundsTo - recipient of the rent refund
   * @param starbase - the Starbase
   * @param cargoPod - the cargo pod, owned by the `starbasePlayer`
   * @param cargoType - the cargo type in question & associated with the `cargoMint`
   * @param cargoStatsDefinition - the cargo stats definition
   * @param certificateTokenFrom - the source token account for the cargo certificate - owned by the `certificateOwnerAuthority`
   * @param certificateOwnerAuthority - the owner of the certificates being redeemed; should be either the starbase player or a signer
   * @param certificateMint - the cargo certificate mint
   * @param cargoTokenFrom - the source token account for the cargo - owned by the Starbase
   * @param cargoTokenTo - the destination token account for the cargo - owned by the `cargo_pod`
   * @param cargoMint - the mint of the cargo in question
   * @param gameId - the SAGE game id
   * @param gameState - the game state  account
   * @param input - the instruction input params
   * @returns InstructionReturn
   */
  static redeemCertificate(
    program: SageIDLProgram,
    cargoProgram: CargoIDLProgram,
    starbasePlayer: PublicKey,
    key: AsyncSigner,
    playerProfile: PublicKey,
    profileFaction: PublicKey,
    fundsTo: PublicKey | "funder",
    starbase: PublicKey,
    cargoPod: PublicKey,
    cargoType: PublicKey,
    cargoStatsDefinition: PublicKey,
    certificateTokenFrom: PublicKey,
    certificateOwnerAuthority: AsyncSigner | PublicKey,
    certificateMint: PublicKey,
    cargoTokenFrom: PublicKey,
    cargoTokenTo: PublicKey,
    cargoMint: PublicKey,
    gameId: PublicKey,
    gameState: PublicKey,
    input: MintOrRedeemCertificateInput
  ): InstructionReturn {
    const signers = [key];
    const remainingAccounts: AccountMeta[] = [];
    if (isAsyncSigner(certificateOwnerAuthority)) {
      remainingAccounts.push({
        pubkey: certificateOwnerAuthority.publicKey(),
        isSigner: true,
        isWritable: false,
      });
      signers.push(certificateOwnerAuthority);
    } else {
      assert(starbasePlayer.equals(certificateOwnerAuthority));
    }
    return async (funder) => [
      {
        instruction: await program.methods
          .redeemCertificate(input.keyIndex, input.amount)
          .accountsStrict({
            fundsTo: fundsTo === "funder" ? funder.publicKey() : fundsTo,
            starbaseAndStarbasePlayer: {
              starbase,
              starbasePlayer,
            },
            gameAccountsAndProfile: {
              gameAndProfileAndFaction: {
                key: key.publicKey(),
                profile: playerProfile,
                profileFaction,
                gameId,
              },
              gameState,
            },
            certificateTokenFrom,
            certificateMint,
            cargoTokenFrom,
            cargoTokenTo,
            cargoMint,
            cargoPod,
            cargoType,
            cargoStatsDefinition,
            cargoProgram: cargoProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            token2022Program: TOKEN_2022_PROGRAM_ID,
          })
          .remainingAccounts(remainingAccounts)
          .instruction(),
        signers,
      },
    ];
  }

  static decodeData(account: KeyedAccountInfo, program: SageIDLProgram): DecodedAccountData<StarbasePlayer> {
    const WRAPPED_SHIP_ESCROW_SIZE = 32 + 8 + 8; // Pubkey + u64 + u64
    return decodeAccountWithRemaining(account, program, StarbasePlayer, (remainingData, data) =>
      Array(data.shipEscrowCount)
        .fill(0)
        .map((_, index) =>
          program.coder.types.decode<WrappedShipEscrow>(
            "WrappedShipEscrow",
            remainingData.subarray(WRAPPED_SHIP_ESCROW_SIZE * index).subarray(0, WRAPPED_SHIP_ESCROW_SIZE)
          )
        )
    );
  }
}
