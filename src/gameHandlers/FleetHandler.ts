import { BN, Program } from "@project-serum/anchor";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { AccountMeta, PublicKey } from "@solana/web3.js";
import {
  readFromRPCOrError,
  InstructionReturn,
  createAssociatedTokenAccountIdempotent,
  AsyncSigner,
  ixReturnsToIxs,
  readFromRPC,
} from "@staratlas/data-source";

import {
  Fleet,
  MineItem,
  Planet,
  Resource,
  Sector,
  LoadingBayToIdleInput,
  StartMiningAsteroidInput,
  StopMiningAsteroidInput,
  DepositCargoToFleetInput,
  WithdrawCargoFromFleetInput,
  WarpToCoordinateInput,
  SurveyDataUnitTracker,
  ScanForSurveyDataUnitsInput,
  FleetAccount,
  FleetStateData,
  DisbandFleetInput,
  StarbasePlayer,
  ShipStats,
  AddShipEscrowInput,
  SagePlayerProfile,
  RemoveShipEscrowInput,
  FleetShips,
  AddShipToFleetInput,
  SageIDLProgram,
  StopSubwarpInput,
} from "@staratlas/sage-main";

import { SageGameHandler } from "./GameHandler";
import {
  CantTransferCrewToFleetError,
  FleetCargoTransferError,
  IncorrectFleetStateError,
  NotOutOfBaseError,
  ScanMissingSduTokenInFleet,
} from "../Error/ErrorHandlers";
import { getFleetSector, logger, Logger } from "../utils";
import { log } from "../Common/PatchConsoleLog";
import { Faction, ProfileFactionAccount } from "@staratlas/profile-faction";
import { Coordinates } from "../Model/Coordinates";
import { FleetHandler as BaseFleetHandler } from "../Common/FleetHandler";
export interface ResourceDescription {
  mint: PublicKey;
  amount: number;
  weight: number;
  totalWeight: number;
}
export class SageFleetHandler extends BaseFleetHandler<Fleet, SageIDLProgram, SageGameHandler> {
  logger: Logger = logger;
  static stateDiscriminatorsMap = {
    StarbaseLoadingBay: 0,
    Idle: 1,
    MineAsteroid: 2,
    MoveWarp: 3,
    MoveSubwarp: 4,
    Respawn: 5,
  };
  /**
   * Provide Current class for static calls in object context
   * @returns
   */
  asStatic(): typeof SageFleetHandler {
    return this.constructor as typeof SageFleetHandler;
  }

  constructor(public readonly _gameHandler: SageGameHandler) {
    super(_gameHandler);
  }
  async getFleetAccount(fleetPubkey: PublicKey): Promise<Fleet> {
    return this._gameHandler.getFleetAccount(fleetPubkey);
  }

  /**
   * Fetch sector from fleet state
   * @param fleetAccount
   * @returns
   */
  async getCurrentSector(fleetAccount: Fleet | PublicKey, isEndpoint: boolean = false): Promise<Coordinates> {
    if (fleetAccount instanceof PublicKey) {
      fleetAccount = await this._gameHandler.getFleetAccount(fleetAccount);
    }

    let fs = fleetAccount.state as FleetStateData;
    if (fs.Idle) {
      return new Coordinates(Number(fs.Idle.sector[0]), Number(fs.Idle.sector[1]));
    }
    if (fs.MoveSubwarp) {
      if (isEndpoint) {
        return new Coordinates(Number(fs.MoveSubwarp.toSector[0]), Number(fs.MoveSubwarp.toSector[1]));
      } else
        return getFleetSector(
          new Coordinates(Number(fs.MoveSubwarp.fromSector[0]), Number(fs.MoveSubwarp.fromSector[1])),
          new Coordinates(Number(fs.MoveSubwarp.toSector[0]), Number(fs.MoveSubwarp.toSector[1])),
          Number(fs.MoveSubwarp.departureTime),
          Number(fs.MoveSubwarp.arrivalTime),
          Date.now() / 1000,
        );

      // ! - > means the location -> but when it is updated, maybe when handle fleet state was called las time ;
      // fs.MoveSubwarp.currentSector && fs.MoveSubwarp.lastUpdate
      //
    } else if (fs.MoveWarp) {
      if (isEndpoint) return new Coordinates(Number(fs.MoveWarp.toSector[0]), Number(fs.MoveWarp.toSector[1]));
      return getFleetSector(
        new Coordinates(Number(fs.MoveWarp.fromSector[0]), Number(fs.MoveWarp.fromSector[1])),
        new Coordinates(Number(fs.MoveWarp.toSector[0]), Number(fs.MoveWarp.toSector[1])),
        Number(fs.MoveWarp.warpStart),
        Number(fs.MoveWarp.warpFinish),
        Date.now() / 1000,
      );
    } else if (fs.Respawn) {
      // may need throwing error
      return new Coordinates(Number(fs.Respawn.sector[0]), Number(fs.Respawn.sector[1]));
    } else if (fs.StarbaseLoadingBay) {
      let baseKey = fs.StarbaseLoadingBay.starbase.toBase58();
      let baseData = await this._gameHandler.getStarbaseDataByKey(baseKey); // get location from custom map
      if (!baseData) {
        // Fetch location from RPC Call of starbase account data
        let starbaseLocation = await this._gameHandler.fetchLocationByStarbaseKey(fs.StarbaseLoadingBay.starbase);
        if (!starbaseLocation) {
          throw "Docked Fleet - Cant find starbase.";
        }
        return starbaseLocation;
      }
      return new Coordinates(Number(baseData.location.x), Number(baseData.location.y));
    } else if (fs.MineAsteroid) {
      let asteroidAcc = await this._gameHandler.getPlanetAccountByKey(fs.MineAsteroid.asteroid);

      let sector = (asteroidAcc?.data?.sector as [BN, BN]) || [];
      return new Coordinates(Number(sector[0]), Number(sector[1]));
    } else {
      throw new NotOutOfBaseError(fleetAccount.state);
    }
  }

  /**
   * return Cooldown in seconds
   *
   * @param fleetAccount
   * @returns
   */
  async getCooldown(
    fleetAccount: Fleet | PublicKey,
  ): Promise<{ warpCooldown: number; scanCooldown: number; attackCooldown: number; shieldRechargeStart: number; respawnCD: number }> {
    if (fleetAccount instanceof PublicKey) {
      fleetAccount = await this._gameHandler.getFleetAccount(fleetAccount);
    }
    const fleetState: FleetStateData = fleetAccount.state;
    const now = Math.floor(Date.now() / 1000);

    // @ts-ignore
    const respawnConst = fleetAccount.data.stats.miscStats?.respawnTime || 0;

    const respawnTime = Number(fleetState.Respawn?.start || 0) + respawnConst;
    return {
      warpCooldown: Math.max(0, Number(fleetAccount.data.warpCooldownExpiresAt) - now), // add warp spool value after attack
      scanCooldown: Math.max(0, Number(fleetAccount.data.scanCooldownExpiresAt) - now),
      attackCooldown: Math.max(0), // Number(fleetAccount.data.apReloadExpiresAt) - now,
      shieldRechargeStart: Math.max(0), // Number(fleetAccount.data.shieldBreakDelayExpiresAt) - now,
      respawnCD: fleetState.Respawn ? respawnTime - now : 0,
    };
  }
  async canAttack(
    attacker: Fleet | PublicKey,
    handleExitStates: { funder: AsyncSigner; funderPermissionIdex: number } | false = false,
  ): Promise<{
    // * can attack
    canAttack: boolean;
    // * exit state instructions - to exit warp, exit from base , stop mine etc
    ixr: InstructionReturn[];
    // * minimum delay time in [miliseconds] - applicable when fleets is traveling on warp or there is some cooldown
    delay: number;
    attacksAvailable: number;
    sateLabels: string[];
  }> {
    if (!this._gameHandler.game) throw "Game is not loaded!";
    if (attacker instanceof PublicKey) {
      attacker = await this._gameHandler.getFleetAccount(attacker);
    }

    const attackerStats = attacker.data.stats as ShipStats;
    /**
     * Check token amount for ammo
     * * calculate attacks available based on ammo consumption rate and current ammo in ammoBank
     */
    const gameAmmoMint = this._gameHandler.getResourceMintAddress("ammunitions");
    let ammoTokenAccount = await this._gameHandler.getOwnerTokenAccountByMintForCargo(attacker.data.ammoBank, gameAmmoMint);
    // @ts-ignore
    let ammoConsumption = attackerStats.combatStats.ammoConsumptionRate * attackerStats.combatStats.ap;
    let attacksAvailable = Math.floor((Number(ammoTokenAccount?.amount) || 0) / (ammoConsumption / 100));
    let result = {
      canAttack: attacksAvailable > 0,
      ixr: [] as InstructionReturn[],
      delay: 0,
      attacksAvailable,
      sateLabels: [] as string[],
    };

    if (attacksAvailable < 1) {
      result.canAttack = false;
      result.sateLabels.push("NoAmmo");
      // result.sateLabels.push("AttacksAvailable: " + attacksAvailable);
      // result.sateLabels.push(`Ammo in Bank: ${ammoTokenAccount?.amount || 0} / Consumption per attack: ${ammoConsumption}`);
      // result.sateLabels.push(`Ammo Token Account: ${attackerStats.combatStats.ammoConsumptionRate} * ${attackerStats.combatStats.ap}`);
      return result;
    }

    if (!handleExitStates) {
      /**
       * when do not handle exit states - only Idle and MoveSubwarp are allowed
       */
      if (!(attacker.state.Idle || attacker.state.MoveSubwarp)) {
        result.canAttack = false;
        result.sateLabels.push("NotIdle", "NotSubwarp");
        return result;
      }
    } else {
      // When handle exit states - only Respawn are not allowed
      if (attacker.state.Respawn) {
        result.canAttack = false;
        result.sateLabels.push("Respawn");
        return result;
      }
    }

    const cds = await this.getCooldown(attacker);
    result.delay = cds.attackCooldown * 1000; // in ms
    if (handleExitStates) {
      let stateDelay = 0;
      if (attacker.state.MoveWarp) {
        stateDelay = attacker.state.MoveWarp.warpFinish * 1000 - Date.now(); // in ms
        result.ixr.push(...(await this.ixReadyToExitWarp(attacker.key, handleExitStates.funder, handleExitStates.funderPermissionIdex)));
        // Move action could be over in time before fetching the state

        result.delay = Math.max(0, result.delay, stateDelay);
        result.sateLabels.push("ExitWarp");
        return result;
      } else if (attacker.state.MineAsteroid) {
        result.ixr.push(...(await this.ixStopMining(attacker.key, handleExitStates.funder, handleExitStates.funderPermissionIdex)));
        result.sateLabels.push("StopMining");
        return result;
      } else if (attacker.state.StarbaseLoadingBay) {
        result.ixr.push(...(await this.ixUndockFromStarbase(attacker.key, handleExitStates.funder, handleExitStates.funderPermissionIdex)));
        result.sateLabels.push("UndockFromBase");
        return result;
        // Undock action could have some cooldown in future
        // Need validate is target in the same sector
      } else if (attacker.state.MoveSubwarp) {
        // No Additional delay and instruction to exit subwarp
        // Need validate is target in the same sector
        return result;
        // return { canAttack: true, ixr, delay: Math.max(0, cds.attackCooldown * 1000), attacksAvailable };
      } else if (!attacker.state.Idle) {
        throw new IncorrectFleetStateError("Idle | MoveWarp | MoveSubwarp | StarbaseLoadingBay | MineAsteroid", attacker);
      }
    }
    return result;
  }

  /**
   * Check targe fleet state
   * @param target
   * @returns
   */
  async isAttackable(attacker: Fleet | PublicKey, target: Fleet | PublicKey, attackerFaction: number, range: number = 1): Promise<boolean> {
    if (!this._gameHandler.game) throw "Game is not loaded!";
    if (target instanceof PublicKey) {
      target = await this._gameHandler.getFleetAccount(target);
    }
    if (attacker instanceof PublicKey) {
      attacker = await this._gameHandler.getFleetAccount(attacker);
    }
    if (target.state.Respawn || target.state.MoveWarp || target.state.StarbaseLoadingBay) {
      return false;
    }

    if (attacker.data.faction === target.data.faction) {
      return false;
    }
    return this.isInAttackRange(attacker, target, range);
  }
  /**
   * Calculate Free Cargo capacity
   *
   * @param fleetPubkey
   * @returns
   */
  async getFleetFreeCargoSpaces(fleetAccount: Fleet | PublicKey) {
    if (fleetAccount instanceof PublicKey) {
      fleetAccount = await this._gameHandler.getFleetAccount(fleetAccount);
    }
    let fleetStats: ShipStats = fleetAccount.data.stats;
    // Fuel Tank
    let fuelAccount = await this._gameHandler.getOwnerTokenAccountByMintForCargo(fleetAccount.data.fuelTank, this._gameHandler.getResourceMintAddress("fuel"));

    // Ammo Bank
    let ammoAccount = await this._gameHandler.getOwnerTokenAccountByMintForCargo(
      fleetAccount.data.ammoBank,
      this._gameHandler.getResourceMintAddress("ammunitions"),
    );
    // Cargo Hold
    let cargoAccounts = await this._gameHandler.getParsedTokenAccountsByOwner(fleetAccount.data.cargoHold);

    //@ts-ignore -- cargoStats.cargoCapacity not recognized
    let cargoSpace: number = fleetAccount.data.stats.cargoStats.cargoCapacity;
    for (const account of cargoAccounts) {
      let mint = this._gameHandler.recourseWight.keys().find((k) => {
        return k.equals(account.mint);
      });

      if (mint) {
        let weight = this._gameHandler.recourseWight.get(mint);
        cargoSpace -= Number(account.amount) * (weight || 1);
      }
    }

    return {
      ammoBank: Number(fleetStats.cargoStats.ammoCapacity) - Number(ammoAccount?.amount || 0),
      fuelTank: Number(fleetStats.cargoStats.fuelCapacity) - Number(fuelAccount?.amount || 0),
      cargoHold: cargoSpace,
    };
  }

  /**
   * Provide items in Cargo Space - with weight calculation and names
   *
   * @param fleetPubkey
   * @returns
   */
  async getCargoItems(fleetAccount: Fleet | PublicKey) {
    if (fleetAccount instanceof PublicKey) {
      fleetAccount = await this._gameHandler.getFleetAccount(fleetAccount);
    }

    let fleetStats: ShipStats = fleetAccount.data.stats;

    // Cargo Hold
    let cargoAccounts = await this._gameHandler.getParsedTokenAccountsByOwner(fleetAccount.data.cargoHold);
    let resources = [] as unknown as Array<ResourceDescription & { resourceName: string }>;
    let cargoSpace: number = fleetStats.cargoStats.cargoCapacity;

    for (const account of cargoAccounts) {
      let mint = this._gameHandler.recourseWight.keys().find((k, v) => {
        return v && k.equals(account.mint);
      });

      if (mint) {
        let weight = this._gameHandler.recourseWight.get(mint); // .get(account.mint);
        cargoSpace -= Number(account.amount) * (weight || 1);
      }
      resources.push({
        resourceName: this._gameHandler.getResourceNameByMint(account.mint) || "Unknown",
        mint: account.mint,
        amount: Number(account.amount),
        weight: this._gameHandler.recourseWight.get(account.mint) || 1,
        totalWeight: Number(account.amount) * (this._gameHandler.recourseWight.get(account.mint) || 1),
      });
    }

    return resources;
  }

  async ixDockToStarbase(fleetPubkey: PublicKey, funder: AsyncSigner, funderPermissionIdex: number = 0): Promise<InstructionReturn[]> {
    const fleetAccount = await this._gameHandler.getFleetAccount(fleetPubkey);
    let fleetState: FleetStateData = fleetAccount.state;
    fleetAccount.data.subProfileInvalidator.toBase58();
    if (!this._gameHandler.game) {
      throw "Game is not loaded!";
    }

    if (!(fleetState.Idle || fleetState.MoveWarp || fleetState.MoveSubwarp)) {
      throw new IncorrectFleetStateError("Idle | MoveWarp | MoveSubwarp", fleetAccount);
    }

    const coordinates = (fleetState.Idle?.sector || fleetState.MoveWarp?.toSector || fleetState.MoveSubwarp?.toSector) as [BN, BN];

    const ixs: InstructionReturn[] = [];

    // Constant Keys
    const starbaseKey = await this._gameHandler.getStarbaseAddress(coordinates);
    const starbaseAccount = await this._gameHandler.getStarbaseAccount(starbaseKey);
    const gameId = this._gameHandler.gameId as PublicKey;
    const gameState = this._gameHandler.gameState as PublicKey;

    // Dynamic
    // const playerProfile = this._gameHandler.playerProfile || fleetAccount.data.ownerProfile;
    const playerProfile = await this._gameHandler.getFleetPlayerProfile(fleetAccount);
    const sagePlayerProfile = await this._gameHandler.getSagePlayerProfileAddress(playerProfile);
    const starbasePlayerKey = await this._gameHandler.getStarbasePlayerAddress(starbaseKey, sagePlayerProfile, starbaseAccount.data.seqId);
    const key = funder;
    const profileFaction = this._gameHandler.getProfileFactionAddress(playerProfile);
    const fleetKey = fleetAccount.key;

    const input = funderPermissionIdex as LoadingBayToIdleInput; // TODO: when would this change?
    const program = this._gameHandler.program;

    const ix_1 = Fleet.idleToLoadingBay(program, key, playerProfile, profileFaction, fleetKey, starbaseKey, starbasePlayerKey, gameId, gameState, input);

    ixs.push(ix_1);

    return ixs;
  }

  async ixFleetStateStarbaseHandler(fleetPubkey: PublicKey, remainingAccounts?: AccountMeta[]): Promise<InstructionReturn[]> {
    let fa = await this._gameHandler.getFleetAccount(fleetPubkey);

    // const playerProfile = this._gameHandler.getFleetPlayerProfile(fa);
    // const profileFaction = this._gameHandler.getProfileFactionAddress(playerProfile);
    // console.error("faction account:", profileFaction.toBase58());

    if (fa.state.StarbaseLoadingBay)
      return [
        Fleet.fleetStateHandler(this._gameHandler.program, fleetPubkey, [
          // { pubkey: fleetPubkey, isSigner: false, isWritable: true },
          {
            pubkey: fa.state.StarbaseLoadingBay.starbase,
            isSigner: false,
            isWritable: false,
          },
        ] as AccountMeta[]),
      ];
    else {
      return [Fleet.fleetStateHandler(this._gameHandler.program, fleetPubkey, ...(remainingAccounts ? [remainingAccounts] : []))];
    }
  }
  async ixUndockFromStarbase(fleetPubkey: PublicKey, funder: AsyncSigner, funderPermissionIdex: number = 0): Promise<InstructionReturn[]> {
    const fleetAccount = await this._gameHandler.getFleetAccount(fleetPubkey);

    if (!this._gameHandler.game) {
      throw "Game is not loaded!";
    }

    if (!fleetAccount.state.StarbaseLoadingBay) {
      throw new IncorrectFleetStateError("starbase loading bay", fleetAccount);
    }
    // Should check proper state handler syntax when docked
    // const ixs: InstructionReturn[] = [Fleet.fleetStateHandler(this._gameHandler.program, fleetAccount.key)];
    const ixs: InstructionReturn[] = [];

    const starbaseKey = fleetAccount.state.StarbaseLoadingBay?.starbase as PublicKey;
    const starbaseAccount = await this._gameHandler.getStarbaseAccount(starbaseKey);

    const playerProfile = this._gameHandler.getFleetPlayerProfile(fleetAccount);
    const sagePlayerProfile = await this._gameHandler.getSagePlayerProfileAddress(playerProfile);
    const starbasePlayerKey = await this._gameHandler.getStarbasePlayerAddress(starbaseKey, sagePlayerProfile, starbaseAccount.data.seqId);

    const program = this._gameHandler.program;
    const key = funder;
    const profileFaction = this._gameHandler.getProfileFactionAddress(playerProfile);
    const fleetKey = fleetAccount.key;
    const gameId = this._gameHandler.gameId as PublicKey;
    const gameState = this._gameHandler.gameState as PublicKey;

    // Index of the signer <based on order> found in PlayerProfile program/userProfile/permitted wallets -> scope sage
    const input = funderPermissionIdex as LoadingBayToIdleInput; // TODO: when would this change? find UserProfile KeyIndex

    const ix_1 = Fleet.loadingBayToIdle(program, key, playerProfile, profileFaction, fleetKey, starbaseKey, starbasePlayerKey, gameId, gameState, input);

    ixs.push(ix_1);

    return ixs;
  }

  async ixStartMining(fleetPubkey: PublicKey, funder: AsyncSigner, funderPermissionIdex: number = 0, resource: string): Promise<InstructionReturn[]> {
    const fleetAccount = await this._gameHandler.getFleetAccount(fleetPubkey);
    let fleetState: FleetStateData = fleetAccount.state;

    if (!this._gameHandler.game) {
      throw "Game is not loaded!";
    }
    const ixs: InstructionReturn[] = [];

    let starbaseKey: PublicKey;
    if (fleetState.StarbaseLoadingBay) {
      ixs.push(...(await this.ixUndockFromStarbase(fleetPubkey, funder, funderPermissionIdex)));
      starbaseKey = fleetState.StarbaseLoadingBay.starbase;
    } else if (fleetState.Idle || fleetState.MoveWarp || fleetState.MoveSubwarp) {
      const coordinates = (fleetState.Idle?.sector || fleetState.MoveSubwarp?.toSector || fleetState.MoveWarp?.toSector) as [BN, BN];

      starbaseKey = await this._gameHandler.getStarbaseAddress(coordinates);
    } else {
      throw new IncorrectFleetStateError("Idle | MoveWarp | MoveSubwarp | StarbaseLoadingBay", fleetAccount);
    }

    // TODO: is there a better way determine if anything is mineable (mint) at this 'location'?
    // see `getPlanetAddress` in sageGameHandler.ts (cache of planet addresses on load)
    const starbaseAccount = await this._gameHandler.getStarbaseAccount(starbaseKey);

    const playerProfile = this._gameHandler.getFleetPlayerProfile(fleetAccount);
    const sagePlayerProfile = await this._gameHandler.getSagePlayerProfileAddress(playerProfile);
    const starbasePlayerKey = await this._gameHandler.getStarbasePlayerAddress(starbaseKey, sagePlayerProfile, starbaseAccount.data.seqId);
    const planetKey = await this._gameHandler.getPlanetAddress(starbaseAccount.data.sector as [BN, BN]);

    const mint = this._gameHandler.getResourceMintAddress(resource);
    this.logger.log("RESOURCE Start mine ", resource, "Mint", mint.toBase58());
    if (!mint) {
      throw `resource mint not found for ${resource}`;
    }

    const mineItemKey = await this._gameHandler.getMineItemAddress(mint);
    const resourceKey = this._gameHandler.getResourceAddress(mineItemKey, planetKey);

    const profileFaction = this._gameHandler.getProfileFactionAddress(playerProfile);
    const fleetKey = fleetAccount.key;

    const program = this._gameHandler.program;
    const key = funder;
    const gameState = this._gameHandler.gameState as PublicKey;
    const gameId = this._gameHandler.gameId as PublicKey;

    const input = {
      keyIndex: funderPermissionIdex,
    } as StartMiningAsteroidInput;

    const fleetFuelTokenAccount = await getAssociatedTokenAddress(this._gameHandler.getResourceMintAddress("fuel"), fleetAccount.data.fuelTank, true);

    const ix_1 = Fleet.startMiningAsteroid(
      program,
      key,
      playerProfile,
      profileFaction,
      fleetKey,
      starbaseKey,
      starbasePlayerKey,
      mineItemKey,
      resourceKey,
      planetKey,
      gameState,
      gameId,
      fleetFuelTokenAccount,
      input,
    );

    ixs.push(ix_1);

    return ixs;
  }

  async ixStopMining(fleetPubkey: PublicKey, funder: AsyncSigner, funderPermissionIdex: number = 0): Promise<InstructionReturn[]> {
    const fleetAccount = await this._gameHandler.getFleetAccount(fleetPubkey);

    if (!this._gameHandler.game) {
      throw "Game is not loaded!";
    }

    if (!fleetAccount.state.MineAsteroid) {
      throw new IncorrectFleetStateError("Mining", fleetAccount);
    }

    const ixs: InstructionReturn[] = [];

    const gameFoodMint = this._gameHandler.game?.data.mints.food as PublicKey;
    const gameAmmoMint = this._gameHandler.game?.data.mints.ammo as PublicKey;
    const gameFuelMint = this._gameHandler.game?.data.mints.fuel as PublicKey;

    const resourceKey = fleetAccount.state.MineAsteroid?.resource as PublicKey;
    const resourceAccount = await this._gameHandler.getResourceAccount(resourceKey);

    const mineItemKey = resourceAccount.data.mineItem; // TODO: check if this is the only way to get the 'mineItemKey'
    const mineItemAccount = await this._gameHandler.getMineItemAccount(mineItemKey);
    const mint = mineItemAccount.data.mint; // TODO: check if this is the only way get the 'mint'

    const planetKey = fleetAccount.state.MineAsteroid?.asteroid as PublicKey;
    const planetAccount = await this._gameHandler.getPlanetAccountByKey(planetKey);

    const coordinates = planetAccount.data.sector as [BN, BN]; // TODO: check if this is the only way get the 'coordinates'
    const starbaseKey = await this._gameHandler.getStarbaseAddress(coordinates);

    const cargoHold = fleetAccount.data.cargoHold;
    const fleetAmmoBank = fleetAccount.data.ammoBank;
    const fleetFuelTank = fleetAccount.data.fuelTank;

    const resourceTokenFrom = await getAssociatedTokenAddress(mint, mineItemKey, true);
    const ataResourceTokenTo = await createAssociatedTokenAccountIdempotent(mint, cargoHold, true);
    const resourceTokenTo = ataResourceTokenTo.address;
    const ix_0 = ataResourceTokenTo.instructions;

    ixs.push(ix_0);

    // Create food ATA idempotently – if food balance ran to 0 the ATA gets closed on-chain
    // and StopMining fails with AccountNotInitialized on food_token_from.
    const ataFoodTokenTo = await createAssociatedTokenAccountIdempotent(gameFoodMint, cargoHold, true);
    const fleetFoodToken = ataFoodTokenTo.address;
    ixs.push(ataFoodTokenTo.instructions);
    const fleetAmmoToken = await getAssociatedTokenAddress(gameAmmoMint, fleetAmmoBank, true);
    const fleetFuelToken = await getAssociatedTokenAddress(gameFuelMint, fleetFuelTank, true);

    const program = this._gameHandler.program;
    const cargoProgram = this._gameHandler.cargoProgram;
    const playerProfile = this._gameHandler.getFleetPlayerProfile(fleetAccount);
    const profileFaction = this._gameHandler.getProfileFactionAddress(playerProfile);
    const fleetKey = fleetAccount.key;
    const ammoBank = fleetAccount.data.ammoBank;
    const foodCargoType = this._gameHandler.getCargoTypeAddress(gameFoodMint);
    const ammoCargoType = this._gameHandler.getCargoTypeAddress(gameAmmoMint);
    const resourceCargoType = this._gameHandler.getCargoTypeAddress(mint);
    const cargoStatsDefinition = this._gameHandler.cargoStatsDefinition as PublicKey;
    const gameState = this._gameHandler.gameState as PublicKey;
    const gameId = this._gameHandler.gameId as PublicKey;
    const foodTokenFrom = fleetFoodToken;
    const ammoTokenFrom = fleetAmmoToken;
    const foodMint = gameFoodMint;
    const ammoMint = gameAmmoMint;

    const ix_1 = Fleet.asteroidMiningHandler(
      program,
      cargoProgram,
      // profileFaction,
      fleetKey,
      starbaseKey,
      mineItemKey,
      resourceKey,
      planetKey,
      cargoHold,
      ammoBank,
      foodCargoType,
      ammoCargoType,
      resourceCargoType,
      cargoStatsDefinition,
      gameState,
      gameId,
      foodTokenFrom,
      ammoTokenFrom,
      resourceTokenFrom,
      resourceTokenTo,
      foodMint,
      ammoMint,
    );

    ixs.push(ix_1);

    const key = funder;
    const fuelTank = fleetFuelTank;
    const fuelCargoType = this._gameHandler.getCargoTypeAddress(gameFuelMint);
    const fuelTokenFrom = fleetFuelToken;
    const fuelMint = gameFuelMint;
    const input = {
      keyIndex: funderPermissionIdex,
    } as StopMiningAsteroidInput;
    const miningXpUserAccount = await this._gameHandler.getUserPointsAddress(playerProfile, this._gameHandler.miningXpCategory);
    const miningXpModifier = await this._gameHandler.findPointsModifierAddress(this._gameHandler.miningXpCategory);
    const pilotXpUserAccount = await this._gameHandler.getUserPointsAddress(playerProfile, this._gameHandler.pilotingXpCategory);
    const pilotXpModifier = await this._gameHandler.findPointsModifierAddress(this._gameHandler.pilotingXpCategory);
    const councilUserAccount = await this._gameHandler.getUserPointsAddress(playerProfile, this._gameHandler.councilRankXpCategory);
    const councilXpModifier = await this._gameHandler.findPointsModifierAddress(this._gameHandler.councilRankXpCategory);

    const ix_2 = Fleet.stopMiningAsteroid(
      program,
      cargoProgram,
      this._gameHandler.pointsProgram,
      key,
      playerProfile,
      profileFaction,
      fleetKey,
      mineItemAccount.key,
      resourceKey,
      planetKey,
      fuelTank,
      fuelCargoType,
      cargoStatsDefinition,
      miningXpUserAccount,
      this._gameHandler.miningXpCategory,
      miningXpModifier,
      pilotXpUserAccount,
      this._gameHandler.pilotingXpCategory,
      pilotXpModifier,
      councilUserAccount,
      this._gameHandler.councilRankXpCategory,
      councilXpModifier,
      gameState,
      gameId,
      fuelTokenFrom,
      fuelMint,
      input,
    );

    ixs.push(ix_2);

    return ixs;
  }

  /**
   * Instruction to load Crew to fleet
   * @param fleetPubkey
   * @param amount
   * @returns
   */
  async ixLoadFleetCrew(fleetPubkey: PublicKey, amount: BN, funder: AsyncSigner, funderPermissionIdex: number = 0): Promise<InstructionReturn[]> {
    const fleetAccount = await this._gameHandler.getFleetAccount(fleetPubkey);
    let fleetState: FleetStateData = fleetAccount.state;
    if (!this._gameHandler.game) {
      throw "Game is not loaded!";
    }

    let starbaseKey;
    if (fleetState.StarbaseLoadingBay) {
      starbaseKey = fleetAccount.state.StarbaseLoadingBay?.starbase as PublicKey;
    } else if (fleetState.Idle || fleetState.MoveWarp || fleetState.MoveSubwarp) {
      const coordinates = (fleetState.Idle?.sector || fleetState.MoveSubwarp?.toSector || fleetState.MoveWarp?.toSector) as [BN, BN];
      starbaseKey = await this._gameHandler.getStarbaseAddress(coordinates);
      if (!starbaseKey) {
        throw new IncorrectFleetStateError("Cant find starbaseKey", fleetAccount);
      }
    } else {
      throw new IncorrectFleetStateError("starbase loading bay", fleetAccount);
    }

    const program = this._gameHandler.program;
    const key = funder;
    const playerProfileKey = this._gameHandler.getFleetPlayerProfile(fleetAccount);
    const profileFactionKey = this._gameHandler.getProfileFactionAddress(playerProfileKey);
    const sagePlayerProfile = await this._gameHandler.getSagePlayerProfileAddress(playerProfileKey);
    // const starbaseKey = fleetAccount.state.StarbaseLoadingBay?.starbase as PublicKey;
    const starbaseAccount = await this._gameHandler.getStarbaseAccount(starbaseKey);
    const starbasePlayerKey = await this._gameHandler.getStarbasePlayerAddress(starbaseKey, sagePlayerProfile, starbaseAccount.data.seqId);
    const starbasePlayerAccount: StarbasePlayer = await this._gameHandler.getStarbasePlayerAccount(playerProfileKey, starbaseKey);
    let freeCrew = starbasePlayerAccount.totalCrew() - starbasePlayerAccount.data.busyCrew;

    if (freeCrew < amount) {
      throw new CantTransferCrewToFleetError(amount, freeCrew);
    }

    const ix_1 = Fleet.loadFleetCrew(
      program,
      key,
      playerProfileKey,
      profileFactionKey,
      fleetPubkey,
      starbaseKey,
      starbasePlayerKey,
      this._gameHandler.gameId as PublicKey,
      {
        count: new BN(amount),
        keyIndex: funderPermissionIdex,
      },
    );
    return [ix_1];
  }

  async ixUnloadFleetCrew(fleetPubkey: PublicKey, amount: number, funder: AsyncSigner, funderPermissionIdex: number = 0): Promise<InstructionReturn[]> {
    const fleetAccount = await this._gameHandler.getFleetAccount(fleetPubkey);

    if (!this._gameHandler.game) {
      throw "Game is not loaded!";
    }
    const fleetState: FleetStateData = fleetAccount.state;
    let starbaseKey;
    if (fleetState.StarbaseLoadingBay) {
      starbaseKey = fleetAccount.state.StarbaseLoadingBay?.starbase as PublicKey;
    } else if (fleetState.Idle || fleetState.MoveWarp || fleetState.MoveSubwarp) {
      const coordinates = (fleetState.Idle?.sector || fleetState.MoveSubwarp?.toSector || fleetState.MoveWarp?.toSector) as [BN, BN];
      starbaseKey = await this._gameHandler.getStarbaseAddress(coordinates);
      if (!starbaseKey) {
        throw new IncorrectFleetStateError("Cant find starbaseKey", fleetAccount);
      }
    } else {
      throw new IncorrectFleetStateError("starbase loading bay", fleetAccount);
    }

    const program = this._gameHandler.program;
    const key = funder;
    const playerProfileKey = this._gameHandler.getFleetPlayerProfile(fleetAccount);
    const profileFactionKey = this._gameHandler.getProfileFactionAddress(playerProfileKey);
    const sagePlayerProfile = await this._gameHandler.getSagePlayerProfileAddress(playerProfileKey);
    // const starbaseKey = fleetAccount.state.StarbaseLoadingBay?.starbase as PublicKey;
    const starbaseAccount = await this._gameHandler.getStarbaseAccount(starbaseKey);
    const starbasePlayerKey = await this._gameHandler.getStarbasePlayerAddress(starbaseKey, sagePlayerProfile, starbaseAccount.data.seqId);
    // starbasePlayerKey;

    const ix_1 = Fleet.unloadFleetCrew(
      program,
      key,
      playerProfileKey,
      profileFactionKey,
      fleetPubkey,
      starbaseKey,
      starbasePlayerKey,
      this._gameHandler.gameId as PublicKey,
      {
        count: new BN(amount),
        keyIndex: funderPermissionIdex,
      },
    );
    return [ix_1];
  }

  async ixDepositCargoToFleet(
    fleetPubkey: PublicKey,
    cargoPodToKey: PublicKey,
    tokenMint: PublicKey,
    amount: BN,
    funder: AsyncSigner,
    funderPermissionIdex: number = 0,
  ): Promise<InstructionReturn[]> {
    const fleetAccount = await this._gameHandler.getFleetAccount(fleetPubkey);
    if (!this._gameHandler.game) throw "Game is not loaded!";

    const fleetState: FleetStateData = fleetAccount.state;
    let starbaseKey;
    if (fleetState.StarbaseLoadingBay) {
      starbaseKey = fleetAccount.state.StarbaseLoadingBay?.starbase as PublicKey;
    } else if (fleetState.Idle || fleetState.MoveWarp || fleetState.MoveSubwarp) {
      const coordinates = (fleetState.Idle?.sector || fleetState.MoveSubwarp?.toSector || fleetState.MoveWarp?.toSector) as [BN, BN];
      starbaseKey = await this._gameHandler.getStarbaseAddress(coordinates);
      if (!starbaseKey) {
        throw new IncorrectFleetStateError("Cant find starbaseKey", fleetAccount);
      }
    } else {
      throw new IncorrectFleetStateError("starbase loading bay", fleetAccount);
    }

    const ixs: InstructionReturn[] = [];
    const playerProfileKey = this._gameHandler.getFleetPlayerProfile(fleetAccount);

    const starbaseAccount = await this._gameHandler.getStarbaseAccount(starbaseKey);
    const sagePlayerProfile = await this._gameHandler.getSagePlayerProfileAddress(playerProfileKey);
    const starbasePlayerKey = await this._gameHandler.getStarbasePlayerAddress(starbaseKey, sagePlayerProfile, starbaseAccount.data.seqId);
    const pods = await this._gameHandler.getStarbasePlayerCargoPods(starbasePlayerKey);
    const cargoPodFromKey = pods.mainCargoPod;
    // let amounts = this._gameHandler.getAmountsByMints(cargoPodFromKey);
    const tokenAccounts = await this._gameHandler.getParsedTokenAccountsByOwner(cargoPodFromKey);
    const tokenAccount = tokenAccounts.find((tokenAccount) => {
      return tokenAccount.mint.toBase58() === tokenMint.toBase58();
    });

    const program = this._gameHandler.program;
    const cargoProgram = this._gameHandler.cargoProgram;
    const key = funder;
    const fundsToKey = funder.publicKey();
    const profileFactionKey = this._gameHandler.getProfileFactionAddress(playerProfileKey);
    const fleetKey = fleetPubkey;

    // to load max amount when is less then expected
    //    this behavior leads to stop the fleet in no ware, or unefficient transportation cycles
    // amount = amount > tokenAccount.amount ? new BN(tokenAccount.amount) : amount;

    if (!tokenAccount || amount > tokenAccount.amount) {
      throw new FleetCargoTransferError(`Cant supply ${amount} ${this._gameHandler.getResourceNameByMint(tokenMint)} to fleet.`, {
        amount: amount,
        fleet: fleetKey,
        cargo: cargoPodToKey,
        resourceMint: tokenMint,
        tokenAccount: tokenAccount?.address,
        timestamp: Math.floor(Date.now() / 1000),
      });
    }

    const cargoType = this._gameHandler.getCargoTypeAddress(tokenMint);
    const cargoStatsDefinition = this._gameHandler.cargoStatsDefinition as PublicKey;
    const gameId = this._gameHandler.gameId as PublicKey;
    const gameState = this._gameHandler.gameState as PublicKey;
    const input = {
      keyIndex: funderPermissionIdex,
      amount,
    } as DepositCargoToFleetInput;

    const tokenFrom = await getAssociatedTokenAddress(tokenMint, cargoPodFromKey, true);
    // Check token account existence - only when missing should be created
    let tokenTo = (await this._gameHandler.getOwnerTokenAccountByMintForCargo(cargoPodToKey, tokenMint))?.address;
    if (!tokenTo) {
      const ataTokenTo = await createAssociatedTokenAccountIdempotent(tokenMint, cargoPodToKey, true);
      tokenTo = ataTokenTo.address;
      const ix_0 = ataTokenTo.instructions;

      ixs.push(ix_0);
    }

    const ix_1 = Fleet.depositCargoToFleet(
      program,
      cargoProgram,
      key, // pkWallet? singer
      playerProfileKey, // profile key
      profileFactionKey,
      fundsToKey,
      starbaseKey,
      starbasePlayerKey,
      fleetKey,
      cargoPodFromKey,
      cargoPodToKey,
      cargoType,
      cargoStatsDefinition,
      tokenFrom,
      tokenTo,
      tokenMint,
      gameId,
      gameState,
      input,
    );

    ixs.push(ix_1);

    return ixs;
  }

  /**
   * Build transaction instruction to transfer cargo
   *      from Fleet to Starbase
   *
   * @param fleetPubkey fleet public key
   * @param tokenMint token mint adress
   * @param amount amount to be transfered
   * @param cargoPodFromPubkey default null is fleet.cargoHold, in other cases this could me ammoBank ot fuel Thank
   * @returns
   */
  async ixWithdrawCargoFromFleet(
    fleetPubkey: PublicKey,
    tokenMint: PublicKey,
    amount: BN,
    cargoPodFromPubkey: PublicKey | null = null,
    funder: AsyncSigner,
    funderPermissionIdex: number = 0,
  ): Promise<InstructionReturn[]> {
    const fleetAccount = await this._gameHandler.getFleetAccount(fleetPubkey);
    // TODO: ensure fleet state is "StarbaseLoadingBay" - is there a better way to do this?
    if (!this._gameHandler.game) {
      throw "Game is not loaded!";
    }

    const fleetState: FleetStateData = fleetAccount.state;
    let starbaseKey;
    if (fleetState.StarbaseLoadingBay) {
      starbaseKey = fleetAccount.state.StarbaseLoadingBay?.starbase as PublicKey;
    } else if (fleetState.Idle || fleetState.MoveWarp || fleetState.MoveSubwarp) {
      const coordinates = (fleetState.Idle?.sector || fleetState.MoveSubwarp?.toSector || fleetState.MoveWarp?.toSector) as [BN, BN];
      starbaseKey = await this._gameHandler.getStarbaseAddress(coordinates);
      if (!starbaseKey) {
        throw new IncorrectFleetStateError("Cant find starbaseKey", fleetAccount);
      }
    } else {
      throw new IncorrectFleetStateError("starbase loading bay", fleetAccount);
    }

    const ixs: InstructionReturn[] = [];

    const playerProfileKey = this._gameHandler.getFleetPlayerProfile(fleetAccount);

    const starbaseAccount = await this._gameHandler.getStarbaseAccount(starbaseKey);
    const sagePlayerProfile = await this._gameHandler.getSagePlayerProfileAddress(playerProfileKey);
    const starbasePlayerKey = await this._gameHandler.getStarbasePlayerAddress(starbaseKey, sagePlayerProfile, starbaseAccount.data.seqId);

    const pods = await this._gameHandler.getStarbasePlayerCargoPods(starbasePlayerKey);
    const cargoPodToKey = pods.mainCargoPod;

    const program = this._gameHandler.program;
    const cargoProgram = this._gameHandler.cargoProgram;
    const key = funder;
    const fundsToKey = funder.publicKey();
    const profileFactionKey = this._gameHandler.getProfileFactionAddress(playerProfileKey);
    const fleetKey = fleetPubkey;

    const cargoPodFromKey = cargoPodFromPubkey || fleetAccount.data.cargoHold; // cargoHold if not selected specific cargo account as ammoBank or fuelTank

    const tokenAccounts = await this._gameHandler.getParsedTokenAccountsByOwner(cargoPodFromKey);
    const tokenAccount = tokenAccounts.find((tokenAccount) => tokenAccount.mint.toBase58() === tokenMint.toBase58());

    if (!tokenAccount) {
      throw "token account not found";
    }
    // Force max amount value as value in fleet cargo, which is maximum possible
    amount = amount > tokenAccount.amount ? new BN(tokenAccount.amount) : amount;

    const cargoType = this._gameHandler.getCargoTypeAddress(tokenMint);
    const cargoStatsDefinition = this._gameHandler.cargoStatsDefinition as PublicKey;
    const gameId = this._gameHandler.gameId as PublicKey;
    const gameState = this._gameHandler.gameState as PublicKey;
    const input = {
      keyIndex: funderPermissionIdex,
      amount,
    } as WithdrawCargoFromFleetInput;

    const tokenFrom = await getAssociatedTokenAddress(tokenMint, cargoPodFromKey, true);
    // Check token account existence - only when missing should be created
    let tokenTo = (await this._gameHandler.getOwnerTokenAccountByMintForCargo(cargoPodToKey, tokenMint))?.address;
    if (!tokenTo) {
      const ataTokenTo = await createAssociatedTokenAccountIdempotent(tokenMint, cargoPodToKey, true);
      tokenTo = ataTokenTo.address;
      const ix_0 = ataTokenTo.instructions;

      ixs.push(ix_0);
    }

    const ix_1 = Fleet.withdrawCargoFromFleet(
      program,
      cargoProgram,
      key,
      fundsToKey,
      playerProfileKey,
      profileFactionKey,
      starbaseKey,
      starbasePlayerKey,
      fleetKey,
      cargoPodFromKey,
      cargoPodToKey,
      cargoType,
      cargoStatsDefinition,
      tokenFrom,
      tokenTo,
      tokenMint,
      gameId,
      gameState,
      input,
    );

    ixs.push(ix_1);

    return ixs;
  }

  async ixWarpToCoordinate(fleetPubkey: PublicKey, coordinates: [BN, BN], funder: AsyncSigner, funderPermissionIdex: number = 0): Promise<InstructionReturn[]> {
    const fleetAccount = await this._gameHandler.getFleetAccount(fleetPubkey);
    let fleetState: FleetStateData = fleetAccount.state;

    if (!this._gameHandler.game) {
      throw "Game is not loaded!";
    }

    const ixs: InstructionReturn[] = [];

    if (!(fleetState.Idle || fleetState.MoveWarp || fleetState.MoveSubwarp)) {
      if (fleetState.StarbaseLoadingBay) {
        ixs.push(...(await this.ixUndockFromStarbase(fleetPubkey, funder, funderPermissionIdex)));
      } else {
        throw new IncorrectFleetStateError("Idle | MoveWarp | MoveSubwarp | StarbaseLoadingBay", fleetAccount);
      }
    }

    const _ = this._gameHandler.getSectorAddress(coordinates);
    const gameFuelMint = this._gameHandler.game?.data.mints.fuel as PublicKey;

    const program = this._gameHandler.program;
    const key = funder;
    const playerProfile = this._gameHandler.getFleetPlayerProfile(fleetAccount);
    const profileFaction = this._gameHandler.getProfileFactionAddress(playerProfile);
    const fleetKey = fleetPubkey;
    const fleetFuelTank = fleetAccount.data.fuelTank;
    const fuelCargoType = this._gameHandler.getCargoTypeAddress(gameFuelMint);
    const cargoStatsDefinition = this._gameHandler.cargoStatsDefinition as PublicKey;
    const tokenMint = gameFuelMint;
    const tokenFrom = await getAssociatedTokenAddress(tokenMint, fleetFuelTank, true);
    const gameState = this._gameHandler.gameState as PublicKey;
    const gameId = this._gameHandler.gameId as PublicKey;
    const cargoProgram = this._gameHandler.cargoProgram;

    const input = {
      keyIndex: funderPermissionIdex, // FIXME: This is the index of the wallet used to sign the transaction in the permissions list of the player profile being used.
      toSector: coordinates,
    } as WarpToCoordinateInput;

    const ix_1 = Fleet.warpToCoordinate(
      program,
      key,
      playerProfile,
      profileFaction,
      fleetKey,
      fleetFuelTank,
      fuelCargoType,
      cargoStatsDefinition,
      tokenFrom,
      tokenMint,
      gameState,
      gameId,
      cargoProgram,
      input,
    );

    ixs.push(ix_1);

    return ixs;
  }

  async ixReadyToExitWarp(fleetPubkey: PublicKey, funder: AsyncSigner, funderPermissionIdex: number = 0): Promise<InstructionReturn[]> {
    const fleetAccount = await this._gameHandler.getFleetAccount(fleetPubkey);
    const playerProfile = this._gameHandler.getFleetPlayerProfile(fleetAccount);

    const pilotXpUserAccount = await this._gameHandler.getUserPointsAddress(playerProfile, this._gameHandler.pilotingXpCategory);
    const pilotXpModifier = await this._gameHandler.findPointsModifierAddress(this._gameHandler.pilotingXpCategory);
    const councilUserAccount = await this._gameHandler.getUserPointsAddress(playerProfile, this._gameHandler.councilRankXpCategory);
    const councilXpModifier = await this._gameHandler.findPointsModifierAddress(this._gameHandler.councilRankXpCategory);

    const ixs: InstructionReturn[] = [];

    const ix_1 = Fleet.moveWarpHandler(
      this._gameHandler.program,
      this._gameHandler.pointsProgram,
      playerProfile,
      fleetPubkey,
      pilotXpUserAccount,
      this._gameHandler.pilotingXpCategory,
      pilotXpModifier,
      councilUserAccount,
      this._gameHandler.councilRankXpCategory,
      councilXpModifier,
      this._gameHandler.gameId as PublicKey,
    );

    ixs.push(ix_1);

    return ixs;
  }

  async ixSubwarpToCoordinate(
    fleetPubkey: PublicKey,
    coordinates: [BN, BN],
    funder: AsyncSigner,
    funderPermissionIdex: number = 0,
  ): Promise<InstructionReturn[]> {
    const fleetAccount = await this._gameHandler.getFleetAccount(fleetPubkey);
    let fleetState: FleetStateData = fleetAccount.state;

    if (!this._gameHandler.game) {
      throw "Game is not loaded!";
    }

    const ixs: InstructionReturn[] = [];

    if (!(fleetState.Idle || fleetState.MoveWarp || fleetState.MoveSubwarp)) {
      if (fleetState.StarbaseLoadingBay) {
        ixs.push(...(await this.ixUndockFromStarbase(fleetPubkey, funder, funderPermissionIdex)));
      } else {
        throw new IncorrectFleetStateError("Idle | MoveWarp | MoveSubwarp | StarbaseLoadingBay", fleetAccount);
      }
    }

    const _ = this._gameHandler.getSectorAddress(coordinates);
    const program = this._gameHandler.program;
    const key = funder;
    const playerProfile = this._gameHandler.getFleetPlayerProfile(fleetAccount);
    const profileFaction = this._gameHandler.getProfileFactionAddress(playerProfile);
    const fleetKey = fleetPubkey;
    const gameState = this._gameHandler.gameState as PublicKey;
    const gameId = this._gameHandler.gameId as PublicKey;
    const input = {
      keyIndex: funderPermissionIdex, //  This is the index of the wallet used to sign the transaction in the permissions list of the player profile being used..
      toSector: coordinates,
    } as WarpToCoordinateInput;

    const ix_1 = Fleet.startSubwarp(program, key, playerProfile, profileFaction, fleetKey, gameId, gameState, input);
    ixs.push(ix_1);

    return ixs;
  }

  async ixReadyToExitSubwarp(
    fleetPubkey: PublicKey,

    funder: AsyncSigner,
    funderPermissionIdex: number = 0,
    forceExit: boolean = false,
  ): Promise<InstructionReturn[]> {
    const ixs: InstructionReturn[] = [];

    const fleetAccount = await this._gameHandler.getFleetAccount(fleetPubkey);
    const gameFuelMint = this._gameHandler.game?.data.mints.fuel as PublicKey;
    const playerProfile = this._gameHandler.getFleetPlayerProfile(fleetAccount);
    const profileFaction = this._gameHandler.getProfileFactionAddress(playerProfile);
    const fleetFuelTank = fleetAccount.data.fuelTank;
    const fuelCargoType = this._gameHandler.getCargoTypeAddress(gameFuelMint);
    const cargoStatsDefinition = this._gameHandler.cargoStatsDefinition as PublicKey;
    const tokenMint = gameFuelMint;
    const tokenFrom = await getAssociatedTokenAddress(tokenMint, fleetFuelTank, true);
    const gameState = this._gameHandler.gameState as PublicKey;
    const gameId = this._gameHandler.gameId as PublicKey;
    const pilotXpUserAccount = await this._gameHandler.getUserPointsAddress(playerProfile, this._gameHandler.pilotingXpCategory);
    const pilotXpModifier = await this._gameHandler.findPointsModifierAddress(this._gameHandler.pilotingXpCategory);
    const councilUserAccount = await this._gameHandler.getUserPointsAddress(playerProfile, this._gameHandler.councilRankXpCategory);
    const councilXpModifier = await this._gameHandler.findPointsModifierAddress(this._gameHandler.councilRankXpCategory);

    // Fleet.stopSubwarp
    const ix_1 = Fleet.movementSubwarpHandler(
      this._gameHandler.program,
      this._gameHandler.cargoProgram,
      this._gameHandler.pointsProgram,
      playerProfile, // PlayerProfile
      fleetPubkey, // Fleet public key
      fleetFuelTank, // Fuel thank Public Key
      fuelCargoType, // fuelCargoType: PublicKey
      cargoStatsDefinition,
      tokenFrom,
      tokenMint,
      pilotXpUserAccount,
      this._gameHandler.pilotingXpCategory,
      pilotXpModifier,
      councilUserAccount,
      this._gameHandler.councilRankXpCategory,
      councilXpModifier,
      gameId,
    );

    ixs.push(ix_1);

    if (forceExit) {
      let ix_2 = Fleet.stopSubwarp(
        this._gameHandler.program,
        this._gameHandler.cargoProgram,
        this._gameHandler.pointsProgram,
        funder,
        playerProfile,
        profileFaction,
        fleetPubkey,
        fleetFuelTank,
        fuelCargoType,
        cargoStatsDefinition,
        tokenFrom,
        tokenMint,
        pilotXpUserAccount,
        this._gameHandler.pilotingXpCategory,
        pilotXpModifier,
        councilUserAccount,
        this._gameHandler.councilRankXpCategory,
        councilXpModifier,
        gameId,
        gameState,
        {
          keyIndex: funderPermissionIdex, //  This is the index of the wallet used to sign the transaction in the permissions list of the player profile being used..
        } as StopSubwarpInput,
      );
      ixs.push(ix_2);
    }
    return ixs;
  }

  async ixSduSectorScan(fleetPubkey: PublicKey, funder: AsyncSigner, funderPermissionIdex: number = 0): Promise<InstructionReturn[]> {
    const ixs: InstructionReturn[] = [];
    const key = funder;
    const fleetAccount = await this._gameHandler.getFleetAccount(fleetPubkey);
    if (!this._gameHandler.game) {
      throw "Game is not loaded!";
    }
    if (!fleetAccount.state.Idle) {
      throw new IncorrectFleetStateError("Idle", fleetAccount);
    }

    const playerProfile = this._gameHandler.getFleetPlayerProfile(fleetAccount);
    const profileFaction = this._gameHandler.getProfileFactionAddress(playerProfile);
    const cargoHold = fleetAccount.data.cargoHold;
    const cargoStatsDefinition = this._gameHandler.cargoStatsDefinition as PublicKey;
    const resourceMint = this._gameHandler.getResourceMintAddress("food");
    const sduMint = this._gameHandler.getResourceMintAddress("sdu");

    const sectorPubkey = this._gameHandler.getSectorAddress([fleetAccount.state.Idle?.sector[0], fleetAccount.state.Idle?.sector[1]]);

    let [surveyDataUnitTracker] =
      // @ts-ignore - .account exists
      await this._gameHandler.program.account.surveyDataUnitTracker.all();
    const pkSurveyDataUnitTracker = surveyDataUnitTracker.publicKey;
    let signerSurveyDataUnitTracker = surveyDataUnitTracker.account.signer;
    const sduTokenFrom = await this._gameHandler.getOwnerTokenAccountByMintForCargo(
      signerSurveyDataUnitTracker,
      this._gameHandler.getResourceMintAddress("sdu"),
    );
    let sduTokenTo = await this._gameHandler.getOwnerTokenAccountByMintForCargo(cargoHold, this._gameHandler.getResourceMintAddress("sdu"));

    if (!sduTokenTo) {
      // cargo Token acount for sdu should be created before scan cause program limitation
      throw new ScanMissingSduTokenInFleet(fleetPubkey, cargoHold, sduMint);
      const ataSduTokenTo = await createAssociatedTokenAccountIdempotent(sduMint, cargoHold, true);
      // @ts-ignore - assign new value
      sduTokenTo = ataSduTokenTo.address;
      // Push first instruction
      this.logger.warn("InCargo Create New SDU account instruction:", ataSduTokenTo.address.toString());
      ixs.push(ataSduTokenTo.instructions);
      //  If There is need to execute token acount creation
      // this.logger.warn("InCargo Create New SDU account instruction:", ataSduTokenTo.address.toString());
      // let tx = await this._gameHandler.buildAndSignTransaction(ataSduTokenTo.instructions);
      // await this._gameHandler.sendTransaction(tx);
    }

    const foodTokenFrom = await this._gameHandler.getOwnerTokenAccountByMintForCargo(cargoHold, this._gameHandler.getResourceMintAddress("food"));

    const sduCargoType = this._gameHandler.getCargoTypeAddress(sduMint);
    const resourceCargoType = this._gameHandler.getCargoTypeAddress(resourceMint);

    surveyDataUnitTracker = surveyDataUnitTracker.publicKey;

    const gameId = this._gameHandler.gameId as PublicKey;
    const gameState = this._gameHandler.gameState as PublicKey;
    const input = {
      keyIndex: funderPermissionIdex,
    } as ScanForSurveyDataUnitsInput; // TODO: when would this change?
    const dataRunningXpUserAccount = await this._gameHandler.getUserPointsAddress(playerProfile, this._gameHandler.dataRunningXpCategory);
    const dataRunningXpModifier = await this._gameHandler.findPointsModifierAddress(this._gameHandler.dataRunningXpCategory);
    const councilUserAccount = await this._gameHandler.getUserPointsAddress(playerProfile, this._gameHandler.councilRankXpCategory);
    const councilXpModifier = await this._gameHandler.findPointsModifierAddress(this._gameHandler.councilRankXpCategory);

    let ix_1 = SurveyDataUnitTracker.scanForSurveyDataUnits(
      this._gameHandler.program,
      this._gameHandler.cargoProgram,
      this._gameHandler.pointsProgram,
      key,
      playerProfile,
      profileFaction,
      fleetPubkey,
      sectorPubkey,
      pkSurveyDataUnitTracker,
      cargoHold,
      sduCargoType,
      resourceCargoType,
      cargoStatsDefinition,
      // @ts-ignore - address exists always
      sduTokenFrom?.address,
      sduTokenTo?.address,
      foodTokenFrom?.address,
      resourceMint,
      dataRunningXpUserAccount,
      this._gameHandler.dataRunningXpCategory,
      dataRunningXpModifier,
      councilUserAccount,
      this._gameHandler.councilRankXpCategory,
      councilXpModifier,
      gameId,
      gameState,
      input,
    );

    ixs.push(ix_1);

    return ixs;
  }

  async isInAttackRange(attacker: Fleet | PublicKey, target: Fleet | PublicKey, attackRange: number = 1): Promise<boolean> {
    const attackerSector = await this.getCurrentSector(attacker);
    const targetSector = await this.getCurrentSector(target);
    console.error("getRange for ", `${attackerSector.x},${attackerSector.y}`, " and ", `${targetSector.x},${targetSector.y}`, " with range ", attackRange);

    if (Math.abs(attackerSector.x - targetSector.x) > attackRange) return false;
    if (Math.abs(attackerSector.y - targetSector.y) > attackRange) return false;
    console.error(true);
    return true;
  }

  async ixRetrieveLoot(fleetAccount: PublicKey | Fleet, funder: AsyncSigner, funderPermissionIdex: number = 0): Promise<InstructionReturn[]> {
    // if (fleetAccount instanceof PublicKey) {
    //   fleetAccount = await this._gameHandler.getFleetAccount(fleetAccount);
    // }
    // let fs = fleetAccount.data.stats as ShipStats;
    // const ixs = [];
    // const fleetState: FleetStateData = fleetAccount.state;
    // if (!this._gameHandler.game) throw "Game is not loaded!";
    // if (!fleetState.StarbaseLoadingBay) {
    //   throw new IncorrectFleetStateError("StarbaseLoadingBay");
    // }
    // const playerProfile = this._gameHandler.getFleetPlayerProfile(fleetAccount);
    // const profileFaction = this._gameHandler.getProfileFactionAddress(playerProfile);
    // const starbase = fleetState.StarbaseLoadingBay.starbase;
    // const starbaseAccount = await this._gameHandler.getStarbaseAccount(starbase);
    // const sagePlayerProfile = await this._gameHandler.getSagePlayerProfileAddress(playerProfile);
    // const starbasePlayer = await this._gameHandler.getStarbasePlayerAddress(starbase, sagePlayerProfile, starbaseAccount.data.seqId);
    // const pods = await this._gameHandler.getStarbasePlayerCargoPods(starbasePlayer);

    // const toolkitMint = this._gameHandler.getResourceMintAddress("toolkit");
    // if (!toolkitMint) throw new Error("Game does not have toolkit defined in resources");
    // const toolkitTokenFrom = await this._gameHandler.getOwnerTokenAccountByMintForCargo(pods.mainCargoPod, toolkitMint);
    // if (!toolkitTokenFrom) throw new Error("Starbase player does not have toolkit token account");

    // const cargoType = this._gameHandler.getCargoTypeAddress(toolkitMint);
    // const cargoStatsDefinition = this._gameHandler.cargoStatsDefinition as PublicKey;
    // const gameId = this._gameHandler.gameId as PublicKey;
    // const gameState = this._gameHandler.gameState as PublicKey;

    //     const ataResourceTokenTo = await createAssociatedTokenAccountIdempotent(mint, cargoHold, true);
    //     const resourceTokenTo = ataResourceTokenTo.address;
    //     const ix_0 = ataResourceTokenTo.instructions;
    // // TODO - Get Data from Loot Account and fill in the correct values for RetrieveLootInput
    // let accs: LootRetrievalAccounts[] = [
    //   {
    //     cargoType: cargoType,
    //     amount: 1,
    //     tokenFrom: toolkitTokenFrom.address,
    //     tokenMint: toolkitMint,
    //     tokenTo: await this._gameHandler.getOwnerTokenAccountByMintForCargo(fleetAccount.data.cargoHold, toolkitMint),
    //   },
    // ];
    // let input: RetrieveLootInput = {
    //   keyIndex: funderPermissionIdex,
    //   lootRetrieval: accs,
    // };

    // let lootKey: PublicKey = fleetAccount.key;
    // let ix = Fleet.retrieveLoot(
    //   this._gameHandler.program,
    //   this._gameHandler.cargoProgram,
    //   funder,
    //   playerProfile,
    //   profileFaction,
    //   fleetAccount.key,
    //   lootKey,
    //   fleetAccount.data.cargoHold,
    //   lootCargoPod, // take from Attack Action
    //   cargoStatsDefinition,
    //   sector,
    //   gameId,
    //   input,
    // );

    return [];
  }

  /**
   * Handle fleet attack another fleet
   * @param attacker - attacker fleet
   * @param target - target fleet
   * @param funder - payer and signer of the transaction
   * @param funderPermissionIdex - index of the funder in the permissions array of the player profile
   * @returns
   */
  async ixAttackFleet(
    attacker: PublicKey | Fleet,
    target: PublicKey | Fleet,
    funder: AsyncSigner,
    funderPermissionIdex: number = 0,
  ): Promise<{
    canAttack: boolean;
    ixr: InstructionReturn[];
    delay: number;
    attacksAvailable: number;
    sateLabels: string[];
    lootAccountKey: PublicKey | undefined;
    ixrAttackOnly: InstructionReturn[];
  }> {
    throw "Method not implemented in sage!";
    // if (!this._gameHandler.game) throw "Game is not loaded!";

    // /**
    //  * Fetch both fleet accounts if only public keys are provided
    //  */
    // let attAccount: Fleet;
    // let tgtAccount: Fleet;
    // if (attacker instanceof PublicKey && target instanceof PublicKey) {
    //   [attAccount, tgtAccount] = await Promise.all([
    //     this._gameHandler.getFleetAccount(attacker),
    //     this._gameHandler.getFleetAccount(target),
    //   ]);
    // } else if (target instanceof PublicKey && attacker instanceof Fleet) {
    //   tgtAccount = await this._gameHandler.getFleetAccount(target);
    //   attAccount = attacker;
    // } else if (attacker instanceof PublicKey && target instanceof Fleet) {
    //   attAccount = await this._gameHandler.getFleetAccount(attacker);
    //   tgtAccount = target;
    // } else if (attacker instanceof Fleet && target instanceof Fleet) {
    //   attAccount = attacker;
    //   tgtAccount = target;
    // } else {
    //   throw new Error("Invalid attacker or target type");
    // }
    // let canAttackCheck = await this.canAttack(attAccount, { funder, funderPermissionIdex });
    // const isAttackable = await this.isAttackable(attAccount, tgtAccount, attAccount.data.faction, 1);

    // if (!isAttackable) {
    //   canAttackCheck.canAttack = false;
    //   canAttackCheck.sateLabels.push("Unattackable");
    //   canAttackCheck.ixr = [] as InstructionReturn[];
    //   return { ...canAttackCheck, lootAccountKey: undefined };
    // }
    // /**
    //  * could not be attacked
    //  */
    // if (tgtAccount.state.Respawn) {
    //   canAttackCheck.canAttack = false;
    //   canAttackCheck.sateLabels.push("TargetDEAD");
    //   return { ...canAttackCheck, lootAccountKey: undefined };
    // }
    // if (tgtAccount.state.MoveWarp) {
    //   canAttackCheck.canAttack = false;
    //   canAttackCheck.sateLabels.push("TargetWarping");
    //   return { ...canAttackCheck, lootAccountKey: undefined };
    // }
    // if (!canAttackCheck.canAttack || canAttackCheck.attacksAvailable < 1) {
    //   return { ...canAttackCheck, lootAccountKey: undefined };
    // }

    // const attPlayerProfile = this._gameHandler.getFleetPlayerProfile(attAccount);
    // const tgtPlayerProfile = this._gameHandler.getFleetPlayerProfile(tgtAccount);
    // const attProfileFaction = this._gameHandler.getProfileFactionAddress(attPlayerProfile);
    // const tgtProfileFaction = this._gameHandler.getProfileFactionAddress(tgtPlayerProfile);

    // const gameAmmoMint = this._gameHandler.game?.data.mints.ammo as PublicKey;
    // const attAmmoToken = await getAssociatedTokenAddress(gameAmmoMint, attAccount.data.ammoBank, true);
    // const tgtAmmoToken = await getAssociatedTokenAddress(gameAmmoMint, tgtAccount.data.ammoBank, true);
    // const ammoCargoType = this._gameHandler.getCargoTypeAddress(gameAmmoMint);
    // const attCombatXpUserAccount = await this._gameHandler.getUserPointsAddress(attPlayerProfile, this._gameHandler.combatXpCategory);
    // const attCouncilUserAccount = await this._gameHandler.getUserPointsAddress(attPlayerProfile, this._gameHandler.councilRankXpCategory);
    // const tgtCombatXpUserAccount = await this._gameHandler.getUserPointsAddress(tgtPlayerProfile, this._gameHandler.combatXpCategory);
    // const tgtCouncilUserAccount = await this._gameHandler.getUserPointsAddress(tgtPlayerProfile, this._gameHandler.councilRankXpCategory);
    // const combatXpModifier = await this._gameHandler.findPointsModifierAddress(this._gameHandler.combatXpCategory);
    // const councilXpModifier = await this._gameHandler.findPointsModifierAddress(this._gameHandler.councilRankXpCategory);

    // // Use sector of the target
    // let location = await this.getCurrentSector(tgtAccount);
    // let sector = this._gameHandler.getSectorAddress([new BN(location.x), new BN(location.y)]);

    // let ix = Fleet.attackFleet(
    //   this._gameHandler.program as any,
    //   this._gameHandler.cargoProgram,
    //   this._gameHandler.pointsProgram as any,
    //   funder,
    //   attPlayerProfile,
    //   attProfileFaction,
    //   attAccount.key,
    //   tgtAccount.key,
    //   attAccount.data.ammoBank,
    //   tgtAccount.data.ammoBank,
    //   attAccount.data.cargoHold,
    //   tgtAccount.data.cargoHold,
    //   attAmmoToken,
    //   tgtAmmoToken,
    //   ammoCargoType,
    //   this._gameHandler.cargoStatsDefinition!, // Its defined on game loads
    //   gameAmmoMint,
    //   attCombatXpUserAccount,
    //   attCouncilUserAccount,
    //   tgtCombatXpUserAccount,
    //   tgtCouncilUserAccount,
    //   this._gameHandler.combatXpCategory,
    //   combatXpModifier,
    //   this._gameHandler.councilRankXpCategory,
    //   councilXpModifier,
    //   sector,
    //   this._gameHandler.gameId as PublicKey,
    //   {
    //     keyIndex: funderPermissionIdex,
    //     // anyFleetDies: true,
    //   } as AttackFleetInput
    // );
    // canAttackCheck.ixr.push(ix.instructions);
    // return {
    //   lootAccountKey: ix.lootAccountKey,
    //   ...canAttackCheck,
    // };
    return { canAttack: false, ixr: [], attacksAvailable: 0, sateLabels: [], lootAccountKey: undefined, delay: 0, ixrAttackOnly: [] };
  }

  /**
   * Handle fleet respawn from central space station
   *
   * @param fleetPubkey
   * @param funder
   * @param funderPermissionIdex
   * @returns
   */
  async ixRespawnFleet(fleetAccount: PublicKey | Fleet, funder: AsyncSigner, funderPermissionIdex: number = 0): Promise<InstructionReturn[]> {
    throw "ixRespawnFleet Method not implemented in sage!";
    // if (fleetAccount instanceof PublicKey) {
    //   fleetAccount = await this._gameHandler.getFleetAccount(fleetAccount);
    // }
    // const fleetState: FleetStateData = fleetAccount.state;
    // if (!this._gameHandler.game) throw "Game is not loaded!";
    // if (!fleetState.Respawn) {
    //   throw new IncorrectFleetStateError("Respawn");
    // } else {
    //   const cds = await this.getCooldown(fleetAccount);
    //   if (cds.respawnCD > 0) {
    //     throw new FleetRespawnOnCooldownError("Respawn", cds.respawnCD);
    //   }
    // }

    // const playerProfile = this._gameHandler.getFleetPlayerProfile(fleetAccount);
    // const profileFaction = this._gameHandler.getProfileFactionAddress(playerProfile);
    // let starbase: PublicKey;
    // switch (fleetAccount.data.faction) {
    //   case Faction.Ustur: {
    //     starbase = this._gameHandler.getStarbaseAddress([new BN(40), new BN(30)]);
    //     break;
    //   }
    //   case Faction.MUD: {
    //     starbase = this._gameHandler.getStarbaseAddress([new BN(0), new BN(-39)]);
    //     break;
    //   }
    //   case Faction.ONI: {
    //     starbase = this._gameHandler.getStarbaseAddress([new BN(-40), new BN(30)]);
    //     break;
    //   }
    //   default: {
    //     throw new Error("Cant determine starbase for respawn, unknown faction.");
    //   }
    // }

    // const starbaseAccount = await this._gameHandler.getStarbaseAccount(starbase);
    // const sagePlayerProfile = await this._gameHandler.getSagePlayerProfileAddress(playerProfile);
    // const starbasePlayer = await this._gameHandler.getStarbasePlayerAddress(starbase, sagePlayerProfile, starbaseAccount.data.seqId);

    // const ammoAddress = this._gameHandler.getResourceMintAddress("ammunitions");
    // const fuelAddress = this._gameHandler.getResourceMintAddress("fuel");
    // const fleetAmmoToken = createAssociatedTokenAccountIdempotent(ammoAddress, fleetAccount.data.ammoBank, true);
    // const fleetFuelToken = createAssociatedTokenAccountIdempotent(fuelAddress, fleetAccount.data.fuelTank, true);
    // let ixs: InstructionReturn[] = [];
    // ixs.push(fleetAmmoToken.instructions);
    // ixs.push(fleetFuelToken.instructions);
    // ixs.push(
    //   Fleet.forceDropFleetCargo(
    //     this._gameHandler.program,
    //     this._gameHandler.cargoProgram,
    //     fleetAccount.key,
    //     fleetAccount.data.ammoBank,
    //     this._gameHandler.getCargoTypeAddress(ammoAddress),
    //     this._gameHandler.cargoStatsDefinition!,
    //     this._gameHandler.gameId!,
    //     fleetAmmoToken.address,
    //     ammoAddress
    //   )
    // );
    // ixs.push(
    //   Fleet.forceDropFleetCargo(
    //     this._gameHandler.program,
    //     this._gameHandler.cargoProgram,
    //     fleetAccount.key,
    //     fleetAccount.data.fuelTank,
    //     this._gameHandler.getCargoTypeAddress(fuelAddress),
    //     this._gameHandler.cargoStatsDefinition!,
    //     this._gameHandler.gameId!,
    //     fleetFuelToken.address,
    //     fuelAddress
    //   )
    // );

    // ixs.push(
    //   Fleet.respawnToLoadingBay(
    //     this._gameHandler.program,
    //     funder,
    //     playerProfile,
    //     profileFaction,
    //     fleetAccount.key,
    //     starbase,
    //     starbasePlayer,
    //     // pods.mainCargoPod,
    //     fleetAccount.data.cargoHold,
    //     fleetAccount.data.fuelTank,
    //     fleetAccount.data.ammoBank,
    //     this._gameHandler.gameId!,
    //     this._gameHandler.gameState!,
    //     { keyIndex: funderPermissionIdex }
    //   )
    // );
    // return ixs;
    return [];
  }

  async ixRepairDockedFleet(
    fleetAccount: PublicKey | Fleet,
    amount: undefined | number = undefined,
    funder: AsyncSigner,
    funderPermissionIdex: number = 0,
  ): Promise<InstructionReturn[]> {
    throw "ixRepairDockedFleet Method not implemented in sage!";
    // if (fleetAccount instanceof PublicKey) {
    //   fleetAccount = await this._gameHandler.getFleetAccount(fleetAccount);
    // }

    // const ixs = [];
    // const fleetState: FleetStateData = fleetAccount.state;
    // if (!this._gameHandler.game) throw "Game is not loaded!";
    // if (!fleetState.StarbaseLoadingBay) {
    //   throw new IncorrectFleetStateError("StarbaseLoadingBay");
    // }
    // const playerProfile = this._gameHandler.getFleetPlayerProfile(fleetAccount);
    // const profileFaction = this._gameHandler.getProfileFactionAddress(playerProfile);
    // const starbase = fleetState.StarbaseLoadingBay.starbase;
    // const starbaseAccount = await this._gameHandler.getStarbaseAccount(starbase);
    // const sagePlayerProfile = await this._gameHandler.getSagePlayerProfileAddress(playerProfile);
    // const starbasePlayer = await this._gameHandler.getStarbasePlayerAddress(starbase, sagePlayerProfile, starbaseAccount.data.seqId);
    // const pods = await this._gameHandler.getStarbasePlayerCargoPods(starbasePlayer);

    // const toolkitMint = this._gameHandler.getResourceMintAddress("toolkit");
    // if (!toolkitMint) throw new Error("Game does not have toolkit defined in resources");
    // const toolkitTokenFrom = await this._gameHandler.getOwnerTokenAccountByMintForCargo(pods.mainCargoPod, toolkitMint);
    // if (!toolkitTokenFrom) throw new Error("Starbase player does not have toolkit token account");

    // const cargoType = this._gameHandler.getCargoTypeAddress(toolkitMint);
    // const cargoStatsDefinition = this._gameHandler.cargoStatsDefinition as PublicKey;
    // const gameId = this._gameHandler.gameId as PublicKey;
    // const gameState = this._gameHandler.gameState as PublicKey;
    // // Atlas Mint
    // const atlasMint = this._gameHandler.game.data.mints.atlas; //En3GRDgFiY8ZoHA86k7LwJkBrB7u1UrjxENpni3CFe1C
    // const atlasTokenCreate = createAssociatedTokenAccountIdempotent(atlasMint, funder.publicKey(), true);
    // ixs.push(atlasTokenCreate.instructions);
    // const atlasTokenFrom = atlasTokenCreate.address;
    // // log(await this._gameHandler.getOwnerTokenAccountByMintForCargo(this._gameHandler.game.data.vaults.atlas, atlasMint));

    // // const atlasTokenFrom = createAssociatedTokenAccountIdempotent(atlasMint, funder.publicKey(), true);
    // // const toWallet = this._gameHandler.game!.data.vaults.atlas;
    // //! !!!!!!!!!!!!!!!!!! HARD CODED KEY
    // const atlasTokenTo = new PublicKey("D8ALb45RFLh5HPDXqWm6RLRePxLjC8pU2QgNHfLjuHZY"); // createAssociatedTokenAccountIdempotent(atlasMint, toWallet, true);
    // log("HP:", fleetAccount.data.hp, fleetAccount.data.pendingHp, (fleetAccount.data.stats as ShipStats).combatStats.hp); // For testing only
    // log(
    //   "R :",
    //   (fleetAccount.data.stats as ShipStats).combatStats.repairAbility,
    //   (fleetAccount.data.stats as ShipStats).combatStats.repairEfficiency,
    //   (fleetAccount.data.stats as ShipStats).combatStats.repairRate
    // ); // For testing only
    // // return [];
    // let ix = Fleet.repairDockedFleet(
    //   this._gameHandler.program,
    //   this._gameHandler.cargoProgram,
    //   funder,
    //   playerProfile,
    //   profileFaction,
    //   starbase,
    //   starbasePlayer,
    //   fleetAccount.key,
    //   pods.mainCargoPod,
    //   cargoType,
    //   cargoStatsDefinition,
    //   toolkitTokenFrom.address,
    //   toolkitMint,
    //   atlasTokenFrom, // - CHECK ATLAS MINT feeTokenFrom,
    //   atlasTokenTo, // - CHECK ATLAS MINT feeTokenTo,
    //   atlasMint, // - CHECK and use ATLAS MINT
    //   gameId,
    //   gameState,
    //   {
    //     keyIndex: funderPermissionIdex,
    //   } as RepairDockedFleetInput
    // );
    // return [ix];
    console.error("ixRepairDockedFleet Method not implemented in sage!");
    return [];
  }

  async ixRepairIdleFleet(
    fleetAccount: PublicKey | Fleet,
    targetAccount: PublicKey | Fleet,
    amount: undefined | number = undefined,
    funder: AsyncSigner,
    funderPermissionIdex: number = 0,
  ): Promise<InstructionReturn[]> {
    throw "ixRepairIdleFleet Method not implemented in sage!";
    //   const [fa, ft] = await Promise.all([
    //     fleetAccount instanceof PublicKey ? await this.getFleetAccount(fleetAccount) : Promise.resolve(fleetAccount),
    //     targetAccount instanceof PublicKey ? await this.getFleetAccount(targetAccount) : Promise.resolve(targetAccount),
    //   ]);

    //   const playerProfile = this._gameHandler.getFleetPlayerProfile(fa);
    //   const profileFaction = this._gameHandler.getProfileFactionAddress(playerProfile);

    //   const toolkitMint = this._gameHandler.getResourceMintAddress("toolkit");
    //   if (!toolkitMint) throw new Error("Game does not have toolkit defined in resources");
    //   const cargoType = this._gameHandler.getCargoTypeAddress(toolkitMint);
    //   const toolkitTokenFrom = await this._gameHandler.getOwnerTokenAccountByMintForCargo(fa.data.cargoHold, toolkitMint);
    //   if (!toolkitTokenFrom) throw new Error("Fleet does not have toolkit token account");

    //   let ix = Fleet.repairIdleFleet(
    //     this._gameHandler.program,
    //     this._gameHandler.cargoProgram,
    //     funder,
    //     playerProfile,
    //     profileFaction,
    //     fa.key,
    //     ft.key,
    //     fa.data.cargoHold,
    //     cargoType,
    //     this._gameHandler.cargoStatsDefinition!,
    //     toolkitTokenFrom.address,
    //     toolkitMint,
    //     this._gameHandler.gameId as PublicKey,
    //     {
    //       keyIndex: funderPermissionIdex,
    //       // amount
    //     } as RepairIdleFleetInput
    //   );

    // return [ix];
    return [];
  }

  async ixRepairStarbase(
    fleetAccount: PublicKey | Fleet,
    starbasePubkey: PublicKey,
    amount: number | undefined = undefined,
    funder: AsyncSigner,
    funderPermissionIdex: number = 0,
  ) {
    const fa = fleetAccount instanceof PublicKey ? await this.getFleetAccount(fleetAccount) : fleetAccount;
    const playerProfile = this._gameHandler.getFleetPlayerProfile(fa);
    const profileFaction = this._gameHandler.getProfileFactionAddress(playerProfile);

    const toolkitMint = this._gameHandler.getResourceMintAddress("toolkit");
    if (!toolkitMint) throw new Error("Game does not have toolkit defined in resources");
    const cargoType = this._gameHandler.getCargoTypeAddress(toolkitMint);
    const toolkitTokenFrom = await this._gameHandler.getOwnerTokenAccountByMintForCargo(fa.data.cargoHold, toolkitMint);
    if (!toolkitTokenFrom) throw new Error("Fleet does not have toolkit token account");
    throw "ixRepairStarbase Method not implemented in sage!";

    // let ix = Fleet.repairStarbase(
    //   this._gameHandler.program,
    //   this._gameHandler.cargoProgram,
    //   funder,
    //   playerProfile,
    //   profileFaction,
    //   fa.key,
    //   starbasePubkey,
    //   this._gameHandler.cargoStatsDefinition!,
    //   profileFaction,
    //   fa.data.cargoHold,
    //   toolkitTokenFrom.address,
    //   cargoType,
    //   this._gameHandler.cargoStatsDefinition!,
    //   toolkitMint,
    //   this._gameHandler.gameId!,
    //   this._gameHandler.gameState!,
    //   {
    //     keyIndex: funderPermissionIdex,
    //     // toolkitAmount: 1,
    //   } as RepairStarbaseInput,
    // );

    // return [ix];
    return [];
  }

  /**
   * ! Working only when have at least one ship in the escrow
   * Add Ships To Escrow ( PLAYER Profile CSS -> port of entry to the game)
   * @param playerProfile
   * @param shipMint
   * @param amount
   * @param funder
   * @param funderPermissionIdex
   * @returns
   */
  async addShipToEscrow(
    playerProfile: PublicKey,
    shipMint: PublicKey,
    amount: number,
    funder: AsyncSigner,
    funderPermissionIdex: number = 0,
  ): Promise<InstructionReturn[]> {
    if (!this._gameHandler.game) {
      throw "Game is not loaded!";
    }
    if (amount < 1) {
      return [];
    }

    const ixs = [];
    const profileFaction = this._gameHandler.getProfileFactionAddress(playerProfile);
    let ship = await this._gameHandler.findShipByMint(shipMint); // Just to validate the mint is a ship
    if (!ship) {
      throw new Error("Provided mint is not a ship mint");
    }
    this._gameHandler.logger.log("<<<addShipToEscrow>>>", playerProfile.toBase58(), shipMint.toBase58(), amount, ship.key);

    const sagePlayerProfile = await this._gameHandler.getSagePlayerProfileAddress(playerProfile);
    const factionAccount = await this._gameHandler.getFactionAccount(profileFaction);
    factionAccount.data.faction;
    let starbase: PublicKey;
    switch (factionAccount.data.faction) {
      case Faction.Ustur: {
        starbase = this._gameHandler.getStarbaseAddress([new BN(40), new BN(30)]);
        break;
      }
      case Faction.MUD: {
        starbase = this._gameHandler.getStarbaseAddress([new BN(0), new BN(-39)]);
        break;
      }
      case Faction.ONI: {
        starbase = this._gameHandler.getStarbaseAddress([new BN(-40), new BN(30)]);
        break;
      }
      default: {
        throw new Error("Cant determine starbase for respawn, unknown faction.");
      }
    }
    const starbaseAccount = await this._gameHandler.getStarbaseAccount(starbase);
    const starbasePlayer = await this._gameHandler.getStarbasePlayerAddress(starbase, sagePlayerProfile, starbaseAccount.data.seqId);
    // TToken account of the ship to move to escrow
    // const shipTokenAccountAddressFrom = await getAssociatedTokenAddress(shipMint, funder.publicKey(), true);
    const shipTokenAccountAddressFrom = await createAssociatedTokenAccountIdempotent(shipMint, funder.publicKey(), true);
    let starbasePlayerAccount = await this._gameHandler.getStarbasePlayerAccount(playerProfile, starbase);

    /**
     * - Create TOKEN ACCOUNT
     *
     */
    // let ix__1 = createTokenAccount(funder, owner, shipMint);
    let shipEscrowTokenAccountTokenTO = await createAssociatedTokenAccountIdempotent(shipMint, sagePlayerProfile, true);

    // let shipEscrowTokenAccountTokenTO = await createAssociatedTokenAccountIdempotent(shipMint, starbasePlayer, true);
    ixs.push(shipEscrowTokenAccountTokenTO.instructions);

    let _shipEscrowTokenAccount: PublicKey = shipEscrowTokenAccountTokenTO.address; //  (await getAssociatedTokenAddress(shipMint, sagePlayerProfile, true)) ||

    let escrows = starbasePlayerAccount.wrappedShipEscrows;

    let escrowShipIndex: number | undefined = escrows.findIndex((v) => v.ship.equals(ship.key)); // todo  find it
    if (escrowShipIndex < 0) {
      escrowShipIndex = undefined;
    }
    // _shipEscrowTokenAccount = createTokenAccount(funder, owner, shipMint);

    ixs.push(
      SagePlayerProfile.addShipEscrow(
        this._gameHandler.program as any,
        playerProfile,
        ProfileFactionAccount.findAddress(this._gameHandler.profileFactionProgram as any, playerProfile)[0],
        sagePlayerProfile, // escrow authority
        funder, // origin token account owner
        shipTokenAccountAddressFrom.address,
        // shipMint,
        ship.key, // ! ship account ( NOT MINT )
        _shipEscrowTokenAccount, // ! escrow token account
        starbasePlayer,
        starbase,
        this._gameHandler.gameId!,
        this._gameHandler.gameState!,
        {
          // Permission index of the funder
          keyIndex: funderPermissionIdex,
          shipAmount: new BN(amount),
          ...(escrowShipIndex
            ? // Ship Escrow index
              { index: escrowShipIndex }
            : {}),
        } as AddShipEscrowInput,
      ),
    );

    log(
      {
        fameProgram: this._gameHandler.program.programId,
        playerProfile,
        profileFactionAddressKey: ProfileFactionAccount.findAddress(this._gameHandler.profileFactionProgram as any, playerProfile)[0],
        sagePlayerProfile, // escrow authority
        funder: funder.publicKey(), // origin token account owner
        shipTokenAccountAddressFrom: shipTokenAccountAddressFrom.address,
        // shipMint,
        ship: ship.key,
        _shipEscrowTokenAccount,
        starbasePlayer,
        starbase,
        gameId: this._gameHandler.gameId!,
        gameState: this._gameHandler.gameState!,
        input: {
          // Permission index of the funder
          keyIndex: funderPermissionIdex,
          shipAmount: new BN(amount),
          // Ship Escrow index
          ...(escrowShipIndex
            ? // Ship Escrow index
              { index: escrowShipIndex }
            : {}),
        } as AddShipEscrowInput,
      },
      "<<<addShipToEscrow>>>",
    );
    // throw "<<<addShipToEscrow>>> STOPPED ON DEBUGGING";

    return ixs;
  }

  /**
   * ! Working only when have at least one ship in the wallet
   * Remove Ships To Escrow ( PLAYER Profile CSS -> port of entry to the game  base to wallet )
   * @param playerProfile
   * @param shipMint
   * @param amount
   * @param funder
   * @param funderPermissionIdex
   * @returns
   */
  async removeShipToEscrow(
    playerProfile: PublicKey,
    shipMint: PublicKey,
    amount: number,
    funder: AsyncSigner,
    funderPermissionIdex: number = 0,
  ): Promise<InstructionReturn[]> {
    if (!this._gameHandler.game) {
      throw "Game is not loaded!";
    }
    if (amount < 1) {
      return [];
    }
    // this._gameHandler.logger.
    log("removeShipToEscrow", playerProfile.toBase58(), shipMint.toBase58(), amount);

    let ship = await this._gameHandler.findShipByMint(shipMint); // Just to validate the mint is a ship
    if (!ship) {
      throw new Error("Provided mint is not a ship mint");
    }

    const ixs: InstructionReturn[] = [];
    const profileFaction = this._gameHandler.getProfileFactionAddress(playerProfile);
    const sagePlayerProfile = await this._gameHandler.getSagePlayerProfileAddress(playerProfile);
    const factionAccount = await this._gameHandler.getFactionAccount(profileFaction);
    factionAccount.data.faction;
    let starbase: PublicKey;
    switch (factionAccount.data.faction) {
      case Faction.Ustur: {
        starbase = this._gameHandler.getStarbaseAddress([new BN(40), new BN(30)]);
        break;
      }
      case Faction.MUD: {
        starbase = this._gameHandler.getStarbaseAddress([new BN(0), new BN(-39)]);
        break;
      }
      case Faction.ONI: {
        starbase = this._gameHandler.getStarbaseAddress([new BN(-40), new BN(30)]);
        break;
      }
      default: {
        throw new Error("Cant determine starbase for respawn, unknown faction.");
      }
    }

    /** Starbase player Account */
    let starbasePlayerAccount = await this._gameHandler.getStarbasePlayerAccount(playerProfile, starbase);
    let escrows = starbasePlayerAccount.wrappedShipEscrows;
    // let escrowsFound = escrows.filter((v) => shipMint.equals(this._gameHandler.getShipMint(v.ship))).map((v) => v.ship.toBase58());
    let escrowShipIndex: number | undefined = escrows.findIndex((v) => v.ship.equals(ship.key));
    if (escrowShipIndex < 0) {
      escrowShipIndex = undefined;
    }
    console.error("escrowShipIndex", escrowShipIndex, escrows.length);

    // Starbase escrow ship list
    // let escrowShipIndex = undefined; ///  escrows.findIndex((v) => v.ship.toBase58() == ship.toBase58()) || escrows.length; // todo  find it

    // Get ATA for shipMint and starbasePlayer
    let ataTo = await createAssociatedTokenAccountIdempotent(shipMint, funder.publicKey(), true);
    this.logger.warn("<<<removeShipToEscrow>>> Ship token account does not exist, creating ...");
    ixs.push(ataTo.instructions);

    const starbaseAccount = await this._gameHandler.getStarbaseAccount(starbase);
    const starbasePlayer = await this._gameHandler.getStarbasePlayerAddress(starbase, sagePlayerProfile, starbaseAccount.data.seqId);

    let ataFrom = await createAssociatedTokenAccountIdempotent(shipMint, sagePlayerProfile, true);
    // TToken account of the ship to move to escrow
    // const shipTokenAccountAddressTo = await getAssociatedTokenAddress(shipMint, funder.publicKey(), true);
    // let shipEscrowTokenAccountFrom = await getAssociatedTokenAddress(shipMint, starbasePlayer, true);

    // INSTEAD:
    // log(
    //   "<<<removeShipToEscrow>>> ataFrom:",
    //   { account: ataFrom.address.toBase58(), shipMin: shipMint, sagePlayerProfile },
    //   "Not existing ship in escrow !!! Push ataFrom.instructions"
    // );
    // throw "Not existing ship in escrow !!! " + ataFrom.address.toBase58();
    ixs.push(ataFrom.instructions);
    const shipEscrowTokenAccount = ataFrom.address; //  await getAssociatedTokenAddress(shipMint, starbasePlayer, true);

    // let ships = (await this._gameHandler.getShipsAccounts()).filter((v) => v.type == "ok");
    // const getShipMint = (accountKey: PublicKey) => {
    //   return ships.find((v) => v.data.key.equals(accountKey))?.data.data.mint;
    //   //      accountKey.equals( )
    // };
    // const getShipAccount = (mint: PublicKey) => {
    //   return ships.find((v) => v.data.data.mint.equals(mint))?.key;
    //   //      accountKey.equals( )
    // };

    // shipEscrowTokenAccount = await getAssociatedTokenAddress(shipMint, starbasePlayer, true);

    ixs.push(
      SagePlayerProfile.removeShipEscrow(
        this._gameHandler.program as any,
        funder,
        playerProfile,
        profileFaction,
        sagePlayerProfile,
        ataTo.address,
        // shipMint,
        ship.key,
        // Ship ACCOUNT ID
        // getShipAccount(shipMint)!,
        shipEscrowTokenAccount,
        starbasePlayer,
        starbase,
        this._gameHandler.gameId!,
        this._gameHandler.gameState!,
        {
          permissionKeyIndex: funderPermissionIdex,
          shipAmount: new BN(amount),
          ...(escrowShipIndex == undefined ? {} : { shipEscrowIndex: escrowShipIndex }),
        } as RemoveShipEscrowInput,
      ),
    );
    let ix = await ixReturnsToIxs(ixs, funder);
    log(ix[0]?.keys);
    log(ix[1]?.keys);
    log(ix[2]?.keys);
    log(
      {
        game: this._gameHandler.program.programId,
        funder,
        playerProfile,
        profileFaction,
        sagePlayerProfile,
        shipTokenAccountAddressTo: ataTo.address, // shipTokenAccountAddressTo,
        // shipMint,
        shipMint: ship, // Ship ACCOUNT ID
        shipEscrowTokenAccount,
        starbasePlayer,
        starbase,
        gameId: this._gameHandler.gameId!,
        gameState: this._gameHandler.gameState!,
        input: {
          permissionKeyIndex: funderPermissionIdex,
          shipAmount: new BN(amount),
          shipEscrowIndex: escrowShipIndex,
        } as RemoveShipEscrowInput,
      },
      "<<<removeShipToEscrow>>>",
    );
    // throw "<<<removeShipToEscrow>>> STOPPED ON DEBUGGING";
    return ixs;
  }

  async ixCreateFleet(
    playerProfile: PublicKey,
    starbase: PublicKey,
    fleetName: string,
    shipMint: PublicKey,
    amount: number,
    funder: AsyncSigner,
    funderPermissionIdex: number = 0,
  ): Promise<{
    instructions: InstructionReturn[];
    fleetData: {
      fleetKey: [PublicKey, number];
      cargoHoldKey: [PublicKey, number];
      fuelTankKey: [PublicKey, number];
      ammoBankKey: [PublicKey, number];
      instructions: InstructionReturn;
    };
  }> {
    if (!this._gameHandler.game) {
      throw "Game is not loaded!";
    }

    let ship = await this._gameHandler.findShipByMint(shipMint); // Just to validate the mint is a ship
    if (!ship || ship.type != "ok") {
      throw new Error("Provided mint is not a ship mint");
    }
    this._gameHandler.logger.log("<<<createFleet>>>", playerProfile.toBase58(), shipMint.toBase58(), ship.key);

    await this._gameHandler.getShipsAccounts();
    let shipData = this._gameHandler.findShipByAccount(ship.key);
    const ixs = [];
    const profileFaction = this._gameHandler.getProfileFactionAddress(playerProfile);
    const sagePlayerProfile = await this._gameHandler.getSagePlayerProfileAddress(playerProfile);
    const factionAccount = await this._gameHandler.getFactionAccount(profileFaction);
    factionAccount.data.faction;

    const starbaseAccount = await this._gameHandler.getStarbaseAccount(starbase);
    const starbasePlayer = await this._gameHandler.getStarbasePlayerAddress(starbase, sagePlayerProfile, starbaseAccount.data.seqId);
    // TToken account of the ship to move to escrow
    /**
     * - Create TOKEN ACCOUNT
     *
     */

    // Convert fleetName string to number[] (e.g., UTF-8 encoding)
    const fleetLabelArr = Array.from(Buffer.from(fleetName, "utf8"));

    let ix = Fleet.createFleet(
      this._gameHandler.program as any,
      this._gameHandler.cargoProgram,
      funder,
      playerProfile,
      profileFaction,
      // shipData?.data.data.mint!,
      ship.key, // ! ship account ( NOT MINT )
      starbasePlayer,
      starbase,
      this._gameHandler.gameId!,
      this._gameHandler.gameState!,
      this._gameHandler.cargoStatsDefinition!,
      {
        keyIndex: funderPermissionIdex,
        fleetLabel: fleetLabelArr,
        shipAmount: new BN(amount),
        shipEscrowIndex: 0,
      },
    );
    ixs.push(ix.instructions);

    return { instructions: ixs, fleetData: ix };
  }

  async addShipToFleet(
    fleet: PublicKey | Fleet,
    shipMint: PublicKey,
    amount: number,
    funder: AsyncSigner,
    funderPermissionIdex: number = 0,
  ): Promise<InstructionReturn[]> {
    if (fleet instanceof PublicKey) {
      fleet = await this._gameHandler.getFleetAccount(fleet);
    }
    const fleetPubkey = fleet.key;

    if (!this._gameHandler.game) {
      throw "Game is not loaded!";
    }
    if (amount < 1) {
      return [];
    }

    const ixs = [];
    let fleetState: FleetStateData = fleet.state;
    if (!fleetState.StarbaseLoadingBay) {
      throw new IncorrectFleetStateError(Object.keys(fleet.state).join(","));
    }
    let ship = await this._gameHandler.findShipByMint(shipMint); // Just to validate the mint is a ship
    if (!ship) {
      throw new Error("Provided mint is not a ship mint");
    }

    const playerProfile = this._gameHandler.getFleetPlayerProfile(fleet);
    const profileFaction = this._gameHandler.getProfileFactionAddress(playerProfile);
    const sagePlayerProfile = await this._gameHandler.getSagePlayerProfileAddress(playerProfile);
    const starbase = fleetState.StarbaseLoadingBay.starbase;
    const starbaseAccount = await this._gameHandler.getStarbaseAccount(starbase);
    const starbasePlayer = await this._gameHandler.getStarbasePlayerAddress(starbase, sagePlayerProfile, starbaseAccount.data.seqId);
    // TToken account of the ship to move to escrow
    // const shipTokenAccountAddressFrom = await getAssociatedTokenAddress(shipMint, funder.publicKey(), true);
    const shipTokenAccountAddressFrom = await createAssociatedTokenAccountIdempotent(shipMint, funder.publicKey(), true);
    let starbasePlayerAccount = await this._gameHandler.getStarbasePlayerAccount(playerProfile, starbase);

    // Indexes
    let [fleetShipsAccountAddress, fleetShipsAccountAddressBump] = FleetShips.findAddress(this._gameHandler.program as any, fleetPubkey);
    let fleetShipsAccount = await readFromRPC(
      this._gameHandler.connection,
      this._gameHandler.program as any,
      fleetShipsAccountAddress,
      FleetShips,
      "confirmed",
    );
    if (fleetShipsAccount.type !== "ok") {
      throw new Error("Fleet ships account is not valid");
    }
    let fleetShipInfoIndex: number | undefined = fleetShipsAccount.data.fleetShips.findIndex((v) => v.ship.equals(ship.key));
    if (fleetShipInfoIndex < 0) {
      fleetShipInfoIndex = undefined;
    }
    let shipEscrowIndex: number | undefined = starbasePlayerAccount.wrappedShipEscrows.findIndex((v) => v.ship.equals(ship.key)); // todo  find it
    if (shipEscrowIndex < 0) {
      shipEscrowIndex = undefined;
    }

    let ix = Fleet.addShipToFleet(
      this._gameHandler.program as any,
      funder,
      playerProfile,
      profileFaction,
      fleetPubkey,
      ship.key, // ! ship account ( NOT MINT )
      starbasePlayer,
      starbase,
      this._gameHandler.gameId!,
      this._gameHandler.gameState!,
      // {
      //   keyIndex: funderPermissionIdex,
      //   shipAmount: new BN(amount),
      //   // ...(fleetShipInfoIndex === undefined ? { fleetShipInfoIndex: null } : { fleetShipInfoIndex }), // Null - When Is missing ship type - else index of the ship type in the fleet
      //   // ...(shipEscrowIndex === undefined ? {} : { shipEscrowIndex: shipEscrowIndex }),
      //   crewAmount: 0,
      // } as AddShipToFleetInput
      {
        //  crewAmount?: number
        keyIndex: funderPermissionIdex,
        shipAmount: amount!,
        fleetShipInfoIndex: fleetShipInfoIndex || null,
        shipEscrowIndex: shipEscrowIndex || 0,
      },
    );
    ixs.push(ix);

    return ixs;
  }

  /**
   * Disband fleet
   * @param fleetPubkey
   * @param funder
   * @param funderPermissionIdex
   */
  async ixDisbandFleet(fleetPubkey: PublicKey, funder: AsyncSigner, funderPermissionIdex: number = 0): Promise<InstructionReturn[]> {
    const fleetAccount = await this._gameHandler.getFleetAccount(fleetPubkey);
    let fleetState: FleetStateData = fleetAccount.state;

    if (!fleetState.StarbaseLoadingBay) {
      throw new IncorrectFleetStateError("StarbaseLoadingBay", fleetAccount);
    }

    const playerProfile = this._gameHandler.getFleetPlayerProfile(fleetAccount);
    const profileFaction = this._gameHandler.getProfileFactionAddress(playerProfile);
    const starbase = fleetState.StarbaseLoadingBay.starbase; //    const starbaseKey = await this._gameHandler.getStarbaseAddress(coordinates);
    const starbaseAccount = await this._gameHandler.getStarbaseAccount(starbase);

    const sagePlayerProfile = await this._gameHandler.getSagePlayerProfileAddress(playerProfile);
    const starbasePlayer = await this._gameHandler.getStarbasePlayerAddress(starbase, sagePlayerProfile, starbaseAccount.data.seqId);

    const rix = Fleet.disbandFleet(
      this._gameHandler.program,
      this._gameHandler.cargoProgram,
      funder,
      playerProfile,
      profileFaction,
      fleetAccount,
      starbasePlayer,
      starbase,
      this._gameHandler.gameId!,
      this._gameHandler.gameState!,
      { keyIndex: funderPermissionIdex } as DisbandFleetInput,
    );
    const ixs = [rix.instructions];

    return ixs;
  }
}
