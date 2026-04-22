import Dispatcher from "./Dispatcher";
import { Fleet, ShipStats } from "@staratlas/sage-main";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { Action, iAction, iSimpleAction } from "./Action";
import { MoveAction } from "./MoveAction";

import { SubwarpAction } from "./SubwarpAction";
import { WarpAction } from "./WarpAction";
import { BASE_SCAN_CONFIG, ScanAction } from "./ScanAction";
import { iQueueItem } from "./Queue";
import { iScanConfig } from "./ScanAction";
import { DockAction } from "./DockAction";
import { UnDockAction } from "./UndockAction";
import { ExitWarpAction } from "./ExitWarpAction";
import { ExitSubwarpAction } from "./ExitSubwarpAction";
import { TransferCargoAction, iCargoTransferData } from "./TransferCargoAction";
import { getRichness, StarbaseMapItem } from "../Common/GameHandler";

import { prompt } from "../Common/prompt";
import { StartMiningAction } from "./StartMiningAction";
import { StopMiningAction } from "./StopMining";
import { ResourceDescription } from "../gameHandlers/FleetHandler";
import chalk from "chalk";
import { clone } from "lodash";
import { logger } from "../utils";
import { iCoordinates, Coordinates } from "./Coordinates";
import { BaseProcess, iBaseProcess } from "./BaseProcess";
import { Resource } from "../gameHandlers/lib";
import { FuelThankNotEnough } from "../Error/ErrorHandlers";
import { RetrieveLootAction } from "./RetrieveLootAction";
import { CustomCombatLogAction } from "./CombatFlowActions";
import { RepairIdleFLeetAction } from "./RepairIdleFLeetAction";
import { FleetDangerMonitor } from "./FleetDangerMonitor";
import type { FleetDangerMonitorOptions } from "./FleetDangerMonitor";
export type { FleetDangerTrigger, FleetDangerMonitorOptions } from "./FleetDangerMonitor";
const argv = require("yargs").argv;
var fs = require("fs");
var path = require("path");

/**
 * Describe process oject
 */
export interface iFleetProcess extends iBaseProcess<iAction> {
  saveStarbase: iCoordinates;
  dispatcher: Dispatcher;
  fleetName: string;
  actionsChain: (iAction | iSimpleAction)[];
  fleetAccount?: Fleet;
  scanConfig?: iScanConfig;
  addAction(action: iAction): iAction[];
  start(startStep: number): void;
  repeat(timesToRepeat: number | undefined, firstStartBeginningStep: number): void;
  fetchFleetAccount(): Promise<Fleet>;
  fetchFleetPublicKey(name?: string | null): Promise<PublicKey>;
  forward(): Promise<void>;
  getFuelAmount(): Promise<number>;
}

export interface MiningBuildOptions {
  movementMode?: "Warp" | "Subwarp" | "Hybrid";
  subwarpDistance?: number;
  pathToMiningStarbase?: Coordinates[];
  pathToSafeStarbase?: Coordinates[];
  // Trigger mined resource to be unloaded on mining Starbase when is more then 1 but load food for all mining times from safe starbase
  miningTimes?: number;
  // Todo: implement option to unload cargo in starbase and transport crafted resource
  transportToMiningBase?: {
    // Name of resource to transport
    resourceName: string;
    // Percent of cargo after
    percent?: number;
    amount?: number;
  }[];
  // If not defined will transport mined resource - otherwise will unload mined and will load resources based on definition
  transportToSafeStarbase?: {
    // Name of resource to transport
    resourceName: string;
    // Percent of cargo after
    percent?: number;
    amount?: number;
  }[];
  // Todo: Implement options fuelTank and ammoBank to be used in transfer scenario between bases ( with less transactions/instructions )
  fuelTankToMiningBase?: boolean;
  fuelTankToSaveStarbase?: boolean;
  ammoBankToMiningBase?: boolean;
  ammoBankToSaveStarbase?: boolean;
  loadMiningFuelOnMiningBase?: boolean;
  loadMiningFoodOnMiningBase?: boolean;
  loadMiningAmmoOnMiningBase?: boolean;
  loadTravelingFuelOnMiningBase?: boolean;
  unloadAmmoBankOnSaveBase?: boolean | number;
  unloadFuelTankOnSaveBase?: boolean | number;
  crewToSaveBase?: "max" | number;
  crewToMiningBase?: "max" | number;
  bundleDockUndock?: boolean;
  bundleTransfers?: boolean;
}

export interface iProcessAnalytics {
  actions?: number;
  foodCostMining?: number;
  ammoCostMining?: number;
  fuelMingCost?: number;
  fuelGoToMiningStarbase?: number;
  fuelGoToSaveStarbase?: number;
  fuelCostTotal?: number;
}
/**
 * Define process of actions to be completed with a fleet
 */
export class FleetProcess extends BaseProcess<iAction> implements iFleetProcess {
  // dispatcher: Dispatcher;
  fleetName: string;
  fleetPubkey?: PublicKey;
  saveStarbase: iCoordinates;
  logPath: string = "./logs/";
  fleetAccount?: Fleet;
  analytics: iProcessAnalytics = {};
  constructor(dispatcher: Dispatcher, fleetName: string, saveStarbase: iCoordinates, logPrefix: string = "", logFileNameSuffix = undefined) {
    super(dispatcher);
    // this.dispatcher = dispatcher;
    this.fleetName = fleetName;
    this.logger = this.dispatcher.logger || logger;

    this.logPath += logPrefix + "." + fleetName + "." + (logFileNameSuffix || path.basename(process.argv[1])) + ".log";
    let delimiter = "\t";
    this.log("TRANSACTION_PRIORITY_FEE_ENABLE" + delimiter + process.env["TRANSACTION_PRIORITY_FEE_ENABLE"] + delimiter);
    this.log("LIMIT" + delimiter + process.env["TRANSACTION_PRIORITY_FEE_LIMIT"] + delimiter);
    this.log("MIN_CHANCE" + delimiter + process.env["TRANSACTION_PRIORITY_FEE_MIN_CHANCE"] + delimiter);
    this.log("LOCKBACK_SLOTS" + delimiter + process.env["TRANSACTION_PRIORITY_FEE_LOCKBACK_SLOTS"] + delimiter);
    this.log("INCREASE_STEP" + delimiter + process.env["TRANSACTION_PRIORITY_FEE_INCREASE_STEP"] + delimiter);
    this.log("CAP" + delimiter + process.env["TRANSACTION_PRIORITY_FEE_CAP"] + delimiter);
    this.log("INCREASE_BASE_FEE" + delimiter + process.env["TRANSACTION_PRIORITY_FEE_INCREASE_BASE_FEE"] + delimiter);
    this.log("\n");

    this.saveStarbase = saveStarbase;
  }

  static async build(
    fleetName: string = "",
    saveStarbaseName: string = "",
    logPrefix: string = "",
    logFileNameSuffix = undefined,
    options: { mode?: "main" | "holo" } = {},
  ) {
    let dispatcher;
    // When RPC Failed till building the dispatcher
    while (true)
      try {
        dispatcher = await Dispatcher.build({ useLookupTables: true, mode: options.mode });
        break;
      } catch (e) {
        console.log("Rebuild dispatcher after 2 sec ...", String(e));
        await new Promise((resolve) => setTimeout(resolve, 2 * 1000));

        continue;
      }
    // console.timeEnd("init_dispatcher");

    if (!fleetName) {
      fleetName = argv.fleetName || (await prompt("FleetName: ")).toString().trim();
    }

    saveStarbaseName = saveStarbaseName || argv.sbName;
    let fsb = await dispatcher.sageGameHandler.asStatic().readStarbaseByName(saveStarbaseName);

    return new FleetProcess(dispatcher, fleetName, fsb.location, logPrefix, logFileNameSuffix);
  }

  /**
   * Validate fleet cargo space is empty
   * @returns
   */
  async validateEmptyCargo() {
    let freeSpace = (await this.getFleetFreeSpaces()).cargoHold;
    let fa: ShipStats = (this.fleetAccount || (await this.fetchFleetAccount())).data.stats;

    if (freeSpace !== fa.cargoStats.cargoCapacity) {
      throw "Cargo is not empty";
    }
    // To do
    // Unload All Cargo

    return true;
  }

  /** Todo: not clear concept and context yet */
  static async readMiningProcessInput() {}
  /**
   * Log data to to process log file
   * @param data
   */
  log(data: string) {
    fs.appendFileSync(this.logPath, data);
  }

  registerFleet(): void {
    this.dispatcher.eventEmitter
      .on(`${this.fleetName}.start`, (step: number = 0) => this.start(step))
      .on(`${this.fleetName}.stop`, async () => this.stop())
      .on(`${this.fleetName}.warp`, (to: iCoordinates) => this.warp(to))
      .on(`${this.fleetName}.subwarp`, (to: iCoordinates) => this.subwarp(to))
      .on(`${this.fleetName}.scan`, () => this.scan())
      .on(`${this.fleetName}.waitAndScan`, () => this.scan());
    // .on(`${this.fleetName}.recharge`, () => this.recharge())
    // .on(`${this.fleetName}.relocate`, () => this.relocate())
    // .on(`${this.fleetName}.relocate`, () => this.relocate())
    // .on(`${this.fleetName}.stayOnSector`, () => this.stayOnSector());
  }

  watchDangerWhileAwaitingAction(options: FleetDangerMonitorOptions = {}): () => void {
    const monitor = new FleetDangerMonitor(this.awaitingActionRuntime, {
      fleetName: this.fleetName,
      getGameMap: () => this.dispatcher.sageGameHandler?.gameMap,
      fetchFleetPublicKey: () => this.fetchFleetPublicKey(),
      getFleetAccount: () => this.fleetAccount,
      fetchFleetAccount: () => this.fetchFleetAccount(),
      defaultLogger: (...args: unknown[]) => this.logger.warn(...args),
    });
    return monitor.watch(options);
  }

  /**
   * Forward simple actions scenario step by step
   * - Enqueue Action to dispatcher.queue
   *    to be added in bigger transaction.
   * - Check iQueueItem
   */
  async forward() {
    // chain over
    if (this.currentStep >= this.actionsChain.length) {
      this.currentStep = 0;
      return;
    }

    let action = this.actionsChain[this.currentStep] as iSimpleAction;

    this.logger.log("!!!!! Process forward index:", this.currentStep, "type:", action.constructor.name);
    // Iterate before recursion
    this.currentStep++;

    if (action.constructor.name === "ScanAction") {
      // Execute scan
      await action.run();
      // directly forward next step
      this.forward(); // if next is not scan will put
    } else {
      let qItem: iQueueItem<iAction> = await action.getQueueItem();
      await this.dispatcher.queue.queue([qItem]);
    }
  }

  displayActionsData() {
    this.logger.info("====== Summary ======");
    this.actionsChain.forEach((action) => {
      this.logger.info(action.constructor.name, "\t", action.results.transactionFees / LAMPORTS_PER_SOL, "\t", action.results.runTime);
    });

    this.logger.info("====== Totals ======");

    this.logger.info("Dock", "\t", DockAction.accumulatedTransactionCost / LAMPORTS_PER_SOL, "\t", DockAction.accumulatedRunTime);
    this.logger.info("Undock", "\t", UnDockAction.accumulatedTransactionCost / LAMPORTS_PER_SOL, "\t", UnDockAction.accumulatedRunTime);
    this.logger.info("Warp", "\t", WarpAction.accumulatedTransactionCost / LAMPORTS_PER_SOL, "\t", WarpAction.accumulatedRunTime);
    this.logger.info("ExitWarp", "\t", ExitWarpAction.accumulatedTransactionCost / LAMPORTS_PER_SOL, "\t", ExitWarpAction.accumulatedRunTime);
    this.logger.info("SubWarp", "\t", SubwarpAction.accumulatedTransactionCost / LAMPORTS_PER_SOL, "\t", SubwarpAction.accumulatedRunTime);
    this.logger.info("ExitSubWarp", "\t", ExitSubwarpAction.accumulatedTransactionCost / LAMPORTS_PER_SOL, "\t", ExitSubwarpAction.accumulatedRunTime);
    this.logger.info("TransferCargo", "\t", TransferCargoAction.accumulatedTransactionCost / LAMPORTS_PER_SOL, "\t", TransferCargoAction.accumulatedRunTime);
    this.logger.info("StartMiningAction", "\t", StartMiningAction.accumulatedTransactionCost / LAMPORTS_PER_SOL, "\t", StartMiningAction.accumulatedRunTime);
    this.logger.info("StopMiningAction", "\t", StopMiningAction.accumulatedTransactionCost / LAMPORTS_PER_SOL, "\t", StopMiningAction.accumulatedRunTime);
    this.logger.info("Scan", "\t", ScanAction.accumulatedTransactionCost / LAMPORTS_PER_SOL, "\t", ScanAction.accumulatedRunTime);
    // this.logger.log("Transport", "\t", UnDockAction.accumulatedTransactionCost, "\t", UnDockAction.accumulatedRunTime);

    this.logger.info("Action", "\t", Action.accumulatedTransactionCost / LAMPORTS_PER_SOL, "\t", Action.accumulatedRunTime);
    this.logger.info("====== ====== ======");
  }

  async warp(data: iCoordinates) {
    // calculation action.verify(); is the method used to calc
    // saveBackToHome Fuel, max warp distance, cool-down load
    //   calcSave back distance before move
    this.logger.log(this.saveStarbase);
    let action = new WarpAction(this, data);

    await action.run();
  }

  async subwarp(data: iCoordinates) {
    // calculation action.verify(); is the method used to calc
    // saveBackToHome Fuel, max warp distance, cool-down load
    //   calcSave back distance before move
    this.logger.log(this.saveStarbase);
    let action = new SubwarpAction(this, data);

    await action.run();
  }

  async scan() {
    // calculation action.verify(); is the method used to calc
    // saveBackToHome Fuel, max warp distance, cool-down load
    //   calcSave back distance before move
    let action = new ScanAction(this, BASE_SCAN_CONFIG);

    await action.run();
  }

  /**
   * Fetch fleet account with data
   *
   * @returns
   */
  async fetchFleetAccount(name: string | null = null): Promise<Fleet> {
    this.fleetAccount = await this.dispatcher.sageFleetHandler.getFleetAccount(await this.fetchFleetPublicKey(name));
    return this.fleetAccount as Fleet;
  }

  /**
   * Fetch and Cache Fleet public key (static data)
   *
   * @param name
   * @returns
   */
  async fetchFleetPublicKey(name: string | null = null): Promise<PublicKey> {
    if (!this.fleetPubkey) {
      this.fleetPubkey = await this.dispatcher.sageGameHandler.getFleetAddress(this.dispatcher.playerProfile, name || this.fleetName);
    }

    return this.fleetPubkey as PublicKey;
  }

  /**
   * Provide fuelTank fill percent
   * @returns
   */
  async getFuelPercent() {
    let fleetStats: ShipStats = (this.fleetAccount || (await this.fetchFleetAccount())).data.stats;
    let fuelPercent = ((await this.getFuelAmount()) || 0) / Number(fleetStats.cargoStats.fuelCapacity);
    return fuelPercent;
  }

  /**
   * Provide current amount of fuel in fuel tank
   * @returns
   */
  async getFuelAmount() {
    let fa: Fleet = this.fleetAccount || (await this.fetchFleetAccount());
    return await this.dispatcher.sageGameHandler.getTokenAccountMintAmount(fa.data.fuelTank, this.dispatcher.sageGameHandler.getResourceMintAddress("fuel"));
  }

  /**
   * Fetch sector from fleet state
   * @param fleetAccount
   * @returns
   */
  async getCurrentSector(fleetAccount: Fleet): Promise<iCoordinates> {
    return this.dispatcher.sageFleetHandler.getCurrentSector(fleetAccount);
  }

  /**
   * Provide free cargo spaces for assigned fleet.
   * @returns
   */
  async getFleetFreeSpaces() {
    let fleetAccount = this.fleetAccount || (await this.fetchFleetAccount());

    return this.dispatcher.sageFleetHandler.getFleetFreeCargoSpaces(fleetAccount);
  }

  async getFleetResourceAmounts() {
    let fleetAccount = this.fleetAccount || (await this.fetchFleetAccount());
    // Fuel Tank
    let fuelAccount = await this.dispatcher.sageGameHandler.getOwnerTokenAccountByMintForCargo(
      fleetAccount.data.fuelTank,
      this.dispatcher.sageGameHandler.getResourceMintAddress("fuel"),
    );

    // Ammo Bank
    let ammoAccount = await this.dispatcher.sageGameHandler.getOwnerTokenAccountByMintForCargo(
      fleetAccount.data.ammoBank,
      this.dispatcher.sageGameHandler.getResourceMintAddress("ammunitions"),
    );
    // Cargo Hold
    let cargoAccounts = await this.dispatcher.sageGameHandler.getParsedTokenAccountsByOwner(fleetAccount.data.cargoHold);

    //@ts-ignore -- cargoStats.cargoCapacity not recognized
    let cargoResources = new Map<string, ResourceDescription>();

    const parsedCargoAccounts = cargoAccounts as any[];
    for (const key of Object.keys(this.dispatcher.sageGameHandler.asStatic().SAGE_RESOURCES_MINTS)) {
      let account = parsedCargoAccounts.find((a) => a.mint.equals(this.dispatcher.sageGameHandler.getResourceMintAddress(key)));
      if (account) {
        let weight = this.dispatcher.sageGameHandler.findWeight(account.mint.toBase58());
        // recourseWight.get(this.dispatcher.sageGameHandler.getResourceMintAddress(key)) || 0;
        cargoResources.set(key, {
          amount: Number(account.amount) || 0,
          mint: account.mint,
          totalWeight: weight * (Number(account.amount) || 0),
          weight: weight,
        });
      }
    }

    return {
      //@ts-ignore
      ammoBank: Number(ammoAccount?.amount || 0),
      //@ts-ignore
      fuelTank: Number(fuelAccount?.amount || 0),
      cargoHold: cargoResources,
    };
  }

  /**
   * Fetch Cargo and Crew State with refetching fleet account Data
   */
  async fetchCargoStates(refreshFleetAccount: boolean = false) {
    if (refreshFleetAccount) await this.fetchFleetAccount();
    let fa = this.fleetAccount || (await this.fetchFleetAccount());
    let fs: ShipStats = fa.data.stats;
    let state = await this.getFleetResourceAmounts();

    return {
      crew: fs.miscStats.crewCount,
      ammoBank: state.ammoBank,
      fuelTank: state.fuelTank,
      cargo: Array.from(state.cargoHold.entries()).toSorted((a, b) => a[1].mint.toString().localeCompare(b[1].mint.toString())),
    };
  }
  /**
   *
   * @param process
   * @param sectors
   * @param mode
   * @param from
   * @param safeMove
   * @returns
   */
  static generatePathActions(
    process: FleetProcess,
    sectors: Coordinates[],
    mode: "Warp" | "Subwarp" | "Hybrid",
    from = new Coordinates(0, 0),
    safeMove: boolean = true,
  ): MoveAction[] {
    let actions: MoveAction[] = [];
    let tmpMode = mode == "Hybrid" ? "Warp" : mode;
    let tmpFrom = clone(from);
    sectors.forEach((toSector) => {
      let action;
      if (tmpMode == "Warp") {
        action = new WarpAction(process, toSector, tmpFrom);
        action.isSafeMove = Boolean(safeMove);
        actions.push(action);
        tmpFrom = toSector;
      } else {
        action = new SubwarpAction(process, toSector, tmpFrom);
        action.isSafeMove = Boolean(safeMove);
        actions.push(action);
      }
      if (mode == "Hybrid") {
        tmpMode = tmpMode == "Warp" ? "Subwarp" : "Warp";
        tmpFrom = toSector;
      }
    });

    return actions;
  }

  /**
   * Specific processes building
   */
  async generateMiningProcessSteps(miningStarbase: StarbaseMapItem, resourceName: string, options: MiningBuildOptions = {}) {
    let fleetAccount = await this.fetchFleetAccount();
    let fleetStats: ShipStats = fleetAccount.data.stats;
    let maxDistance = Number(fleetStats.movementStats.maxWarpDistance) / 100;
    let hardness = this.dispatcher.sageGameHandler.asStatic().resourceHardness[resourceName];
    if (hardness === undefined) throw "Unknown resource name";

    let richness = getRichness(miningStarbase, resourceName);
    if (!richness) throw `Resource ${resourceName} not found on starbase ${miningStarbase.name} (${miningStarbase.location.toSectorKey()})`;

    let generatedActions: iAction[] = [];
    let tmpCoordinate = clone(this.saveStarbase);
    //@ts-ignore value type never but it is number
    let cargoSpace: number = fleetAccount.data.stats.cargoStats.cargoCapacity;
    if (!options.movementMode) options.movementMode = "Hybrid";
    // Prepare Mining cost
    // pre set mining times force to use for mining
    if (options.miningTimes == undefined) {
      options.miningTimes = 1;
    } else if (options.miningTimes < 0) {
      throw "Incorrect input value: options.miningTimes < 0 ";
    }

    this.logger.info("Mining Config:", options);
    // Define Early To Fetch Costs
    let startMiningAction = new StartMiningAction(this, resourceName, hardness, richness, { autoStop: false });
    // Get Mining time for full Cargo // catch case when continuing process execution from step > 0, when the fleet have loaded cargo
    // let miningTime = await startMiningAction.getTimeCost(fleetStats.cargoStats.cargoCapacity);
    // let miningCostsProm = startMiningAction.getResourceCost(miningTime);
    let totalMiningCostsPromise = startMiningAction.calcMiningTimesCosts(options.miningTimes);
    let travelBetweenStarbases: boolean = !this.saveStarbase.equals(miningStarbase.location);
    let fuelGoToMiningStarbase: number = 0,
      fuelGoToSaveStarbase: number = 0;

    // convert transport instructions to iCargoTransferData []
    if (travelBetweenStarbases) {
      // Calculate path
      if (!options.pathToMiningStarbase) {
        if (options.movementMode == "Subwarp") {
          options.pathToMiningStarbase = [miningStarbase.location];
        } else if (options.movementMode == "Warp") {
          options.pathToMiningStarbase = MoveAction.calcWarpPath(this.saveStarbase, miningStarbase.location, maxDistance);
        } else {
          // Hybrid
          options.pathToMiningStarbase = MoveAction.calcWarpPath(this.saveStarbase, miningStarbase.location, maxDistance, options.subwarpDistance || 0);
        }
      }
      if (!options.pathToSafeStarbase) {
        if (options.movementMode == "Subwarp") {
          options.pathToSafeStarbase = [this.saveStarbase];
        } else if (options.movementMode == "Warp") {
          options.pathToSafeStarbase = MoveAction.calcWarpPath(miningStarbase.location, this.saveStarbase, maxDistance);
        } else {
          // Hybrid
          options.pathToSafeStarbase = MoveAction.calcWarpPath(miningStarbase.location, this.saveStarbase, maxDistance, options.subwarpDistance || 0);
        }
      }

      fuelGoToMiningStarbase =
        MoveAction.calcTotalCost(MoveAction.calcPathCosts(fleetStats, this.saveStarbase, options.pathToMiningStarbase, options.movementMode), "fuel") + 1;
      // this.logger.log(MoveAction.calcPathCosts(fleetStats, this.saveStarbase, options.pathToMiningStarbase, options.movementMode));
      fuelGoToSaveStarbase =
        MoveAction.calcTotalCost(MoveAction.calcPathCosts(fleetStats, miningStarbase.location, options.pathToSafeStarbase, options.movementMode), "fuel") + 1;
      // this.logger.log(MoveAction.calcPathCosts(fleetStats, miningStarbase.location, options.pathToSafeStarbase, options.movementMode));
      this.logger.log("==========================================");
      this.logger.info("Fuel to Mining Starbase: ", fuelGoToMiningStarbase);
      this.logger.info("Fuel to Save Starbase: ", fuelGoToSaveStarbase);
      this.logger.log("==========================================");
    }
    this.logger.info("Movement mode:", options.movementMode);
    this.logger.info("Save Starbase:", this.saveStarbase.toSectorKey());
    this.logger.info("Mining Starbase:", miningStarbase.location.toSectorKey());

    // let miningCosts = await miningCostsProm;
    let totalMiningCosts = await totalMiningCostsPromise;

    // exit planet (mining) amount
    /** Provide pointer reference to handlers */
    let foodCostTotal = totalMiningCosts.food || 0;

    let prepareTransportInstructions = async (
      isImport: boolean,
      freeSpaceToLoad: number,
      inputData: {
        // Name of resource to transport
        resourceName: string;
        // Percent of cargo after
        percent?: number;
        amount?: number;
      }[],
    ) => {
      let result = [] as iCargoTransferData[];
      // Validate total Weights
      let totalWeight = inputData.reduce((aggregator, data) => {
        return {
          resourceName: "total",
          amount:
            aggregator.amount ||
            0 +
              this.dispatcher.sageGameHandler.calcCargoSpaceUsed(
                data.resourceName,
                // If amount is in percents -> calculate amount to load
                data.amount || Math.floor((data.percent || 0) * cargoFreeSpace),
              ),
        };
      });

      if ((totalWeight.amount || 0) > cargoFreeSpace) {
        throw "Total Resources weight to load is more then free cargo space";
      }

      // prepare instructions
      result = inputData.map((def) => {
        let resourceWeight = this.dispatcher.sageGameHandler.recourseWight.get(this.dispatcher.sageGameHandler.getResourceMintAddress(def.resourceName)) || 1;
        let instruction = { isImportToFleet: isImport, resourceName: def.resourceName } as iCargoTransferData;
        // Exclude food space in percent calculation - 100% is cargo space - food cost
        if (isImport == false) {
          instruction.condition = { whenMoreThen: 0 };
        }
        if (def.percent && !def.amount) {
          let spaceToLoad = freeSpaceToLoad * def.percent;
          instruction.amount = Math.floor(spaceToLoad / resourceWeight);
        } else if (!def.percent && def.amount) {
          if (def.amount < 0) {
            throw "Amount could not be negative.";
          }
          instruction.amount = def.amount; // Expect user to calculate weight
        } else {
          console.error(def);
          throw "Unparsable definition!";
        }

        return instruction;
      });
      // this.logger.log("generated Transport Instructions:", result);
      return result;
    };
    let miningTimesFuel = totalMiningCosts.fuel || 0;
    let fuelCostTotal = miningTimesFuel + fuelGoToMiningStarbase + fuelGoToSaveStarbase;
    // this.logger.log(miningTimesFuel, fuelGoToMiningStarbase, fuelGoToSaveStarbase);
    this.logger.info("Fuel for mining times:", options.miningTimes, "total:", miningTimesFuel);
    this.logger.info("Fuel < TOTAL for load >:", fuelCostTotal);
    this.logger.info("Ammo < TOTAL for load >:", totalMiningCosts.ammunitions);
    this.logger.info("Food < TOTAL for load >:", totalMiningCosts.food);
    this.logger.info("Loads on safe-starbase:");
    let loadInstructionsOnSaveStarbase: iCargoTransferData[] = [];

    // Load instructions on safe starbase
    /**
      fuelTankToMiningBase?: boolean;
      fuelTankToSaveStarbase?: boolean;
      ammoBankToMiningBase?: boolean;
      ammoBankToSaveStarbase?: boolean;
      loadMiningFuelOnMiningBase?: boolean;
      loadMiningFoodOnMiningBase?: boolean;
      loadMiningAmmoOnMiningBase?: boolean;
      loadTravelingFuelOnMiningBase?: boolean;
     */
    // Load Fuel On saveStarbase
    let fuelToLoadOnSaveStarbase: number | "max" = 0;
    let whenLoadFuel: number;

    // in case when 2 ways path is longer then max capacity -> should reload on mining starbase to be able to return
    if (options.loadTravelingFuelOnMiningBase) {
      fuelToLoadOnSaveStarbase += fuelGoToMiningStarbase;
    } else {
      fuelToLoadOnSaveStarbase += fuelGoToMiningStarbase + fuelGoToSaveStarbase;
    }

    if (!options.loadMiningFuelOnMiningBase) {
      fuelToLoadOnSaveStarbase += miningTimesFuel;
    }
    whenLoadFuel = fuelToLoadOnSaveStarbase;
    // Validate that capacity is enough -? is the miing base so far away
    if (fuelToLoadOnSaveStarbase > fleetStats.cargoStats.fuelCapacity) {
      throw "Not enough fuel capacity to go to " + this.saveStarbase.toSectorKey();
    }

    // If transfer fuel by fuelTank -> fill on max
    // When not transporting fuel to starbase is more optimal to fill tank on Max: : this will reduce transactions in most cases
    if (options.fuelTankToMiningBase || this.saveStarbase.equals(miningStarbase.location)) {
      fuelToLoadOnSaveStarbase = "max";
      whenLoadFuel = options.fuelTankToMiningBase ? fleetStats.cargoStats.fuelCapacity : fuelCostTotal;
    } else if (options.fuelTankToSaveStarbase) {
      fuelToLoadOnSaveStarbase = fuelGoToMiningStarbase + (options.miningTimes && !options.loadMiningFuelOnMiningBase ? miningTimesFuel : 0);
      whenLoadFuel = fuelToLoadOnSaveStarbase;
    }

    if (fuelToLoadOnSaveStarbase == "max" || fuelToLoadOnSaveStarbase > 0) {
      this.logger.info("  Fuel On SaveStarbase:", fuelToLoadOnSaveStarbase);
      // if (options.fuelTankToSaveStarbase)
      //   // Unload fuel tank to free tha space for transportation
      //   loadInstructionsOnSaveStarbase.push({
      //     isImportToFleet: false,
      //     cargoType: "fuelTank",
      //     resourceName: "fuel",
      //     amount: "max",
      //     condition: { whenMoreThen: 0 },
      //   });

      loadInstructionsOnSaveStarbase.push({
        isImportToFleet: true,
        cargoType: "fuelTank",
        resourceName: "fuel",
        amount: fuelToLoadOnSaveStarbase,
        condition: { whenLessThen: whenLoadFuel },
      } as iCargoTransferData);
    }

    // Load ammo on Safe Starbase
    let ammoToLoadOnSaveStarbase: number | "max" = 0;
    let whenLoadAmmo: number;
    // If transfer ammunitions by ammoBank -> fill on max
    // when not transport ammunitions back is more optimal to load on max: this will reduce transactions in most cases
    if (options.ammoBankToMiningBase || !options.ammoBankToSaveStarbase) {
      ammoToLoadOnSaveStarbase = "max";
      whenLoadAmmo = options.ammoBankToMiningBase ? fleetStats.cargoStats.ammoCapacity : totalMiningCosts.ammunitions || 1;
    } else {
      if (!options.loadMiningAmmoOnMiningBase) {
        ammoToLoadOnSaveStarbase += totalMiningCosts.ammunitions || 1;
      }
      whenLoadAmmo = totalMiningCosts.ammunitions || 1;
    }

    // When load ammo on mining base - unload all ammo on safe base
    if (options.loadMiningAmmoOnMiningBase) {
      loadInstructionsOnSaveStarbase.push({
        isImportToFleet: false,
        cargoType: "ammoBank",
        resourceName: "ammunitions",
        amount: "max",
        condition: { whenMoreThen: 0 },
      } as iCargoTransferData);
    } else if (ammoToLoadOnSaveStarbase == "max" || ammoToLoadOnSaveStarbase > 1) {
      loadInstructionsOnSaveStarbase.push({
        isImportToFleet: true,
        cargoType: "ammoBank",
        resourceName: "ammunitions",
        amount: ammoToLoadOnSaveStarbase,
        condition: { whenLessThen: whenLoadAmmo },
      } as iCargoTransferData);
    }

    // Let food load for mining
    let cargoFreeSpace = cargoSpace;
    if (!options.loadMiningFoodOnMiningBase) {
      if (foodCostTotal) {
        loadInstructionsOnSaveStarbase.push({
          isImportToFleet: true,
          resourceName: "food",
          amount: foodCostTotal,
          // cargoType: "cargoHold", // this is default value // food is only in cargoHold
          condition: { whenLessThen: foodCostTotal },
        });
        cargoFreeSpace -= foodCostTotal;
      }
    }
    if (options.crewToMiningBase) {
      loadInstructionsOnSaveStarbase.push({
        cargoType: "passengers",
        isImportToFleet: true,
        resourceName: "passenger",
        amount: options.crewToMiningBase,
      });
    }

    if (options.transportToMiningBase) {
      loadInstructionsOnSaveStarbase.push(...(await prepareTransportInstructions(true, cargoFreeSpace, options.transportToMiningBase)));
    }

    this.logger.info("All Load on SafeStarbase:", loadInstructionsOnSaveStarbase);
    // Save starbase load action
    let sbReload = new TransferCargoAction(this, loadInstructionsOnSaveStarbase);

    // Mining Process
    generatedActions.push(sbReload);

    let uda1 = new UnDockAction(this, tmpCoordinate);
    // uda1.priorityFeeConfig = { enable: true, increaseBaseFee: 5000 };
    generatedActions.push(uda1);

    // add generated movement steps between saveStarbase -> miningStarbase
    if (travelBetweenStarbases && options.pathToMiningStarbase && options.pathToMiningStarbase.length > 0) {
      let safeMove = !Boolean(options.loadTravelingFuelOnMiningBase || options.fuelTankToSaveStarbase); // Force Disable fuel check for Movements when load fuel on mining base
      FleetProcess.generatePathActions(this, options.pathToMiningStarbase, options.movementMode, tmpCoordinate, safeMove).forEach((act) => {
        generatedActions.push(act);
      });
      // Get Last Sector after movement
      let last = generatedActions.length - 1;
      let action = generatedActions[last] as MoveAction;
      tmpCoordinate = clone(action.coordinates);
    }

    // Cases where should dock mining base when departure
    if (
      options.transportToMiningBase ||
      (options.miningTimes == 0 && (options.transportToSafeStarbase || options.crewToSaveBase || options.loadTravelingFuelOnMiningBase)) ||
      options.ammoBankToMiningBase ||
      options.fuelTankToMiningBase ||
      options.loadMiningAmmoOnMiningBase ||
      options.loadMiningFoodOnMiningBase ||
      options.loadMiningFuelOnMiningBase ||
      options.crewToMiningBase
    ) {
      let da1 = new DockAction(this, tmpCoordinate);
      // da1.priorityFeeConfig = { enable: true, increaseBaseFee: 5000 };
      generatedActions.push(da1);
      // Unload Transported Resources
      let unloadInstructions: iCargoTransferData[] = [];
      if (options.transportToMiningBase) {
        unloadInstructions.push(...(await prepareTransportInstructions(false, cargoFreeSpace, options.transportToMiningBase)));
      }
      if (options.ammoBankToMiningBase) {
        // Unload cap - mining amount
        unloadInstructions.push({
          isImportToFleet: false,
          resourceName: "ammunitions",
          cargoType: "ammoBank",
          amount: fleetStats.cargoStats.ammoCapacity - (totalMiningCosts.ammunitions || 0) - 1,
          condition: { whenMoreThen: 0 },
        });
      }

      if (options.fuelTankToMiningBase) {
        let unloadFuelAddition = 0;
        if (options.pathToSafeStarbase && !options.loadTravelingFuelOnMiningBase) {
          unloadFuelAddition += fuelGoToSaveStarbase + fuelGoToMiningStarbase; // fuelGoToMiningStarbase is already burned
        }
        if (!options.loadMiningFuelOnMiningBase) {
          unloadFuelAddition += miningTimesFuel;
        }

        // Unload cap - mining amount
        unloadInstructions.push({
          isImportToFleet: false,
          resourceName: "fuel",
          cargoType: "fuelTank",
          amount: fleetStats.cargoStats.fuelCapacity - unloadFuelAddition,
        });
      }
      if (options.crewToMiningBase) {
        unloadInstructions.push({
          isImportToFleet: false,
          resourceName: "passenger",
          cargoType: "passengers",
          amount: options.crewToMiningBase,
        });
      }
      this.logger.info("unload instruction on mining Base:", unloadInstructions);

      let unloadAction = new TransferCargoAction(this, unloadInstructions);

      // Reset Cargo value
      cargoFreeSpace = cargoSpace;
      generatedActions.push(unloadAction);

      if (options.loadMiningAmmoOnMiningBase || options.loadMiningFoodOnMiningBase || options.loadMiningFuelOnMiningBase) {
        let loadInstructions: iCargoTransferData[] = [];
        if (options.loadMiningAmmoOnMiningBase) {
          loadInstructions.push({
            isImportToFleet: true,
            resourceName: "ammunitions",
            cargoType: "ammoBank",
            amount: totalMiningCosts.ammunitions || 1,
            condition: { whenLessThen: totalMiningCosts.ammunitions || 1 },
          });
        }
        if (options.loadMiningFuelOnMiningBase) {
          loadInstructions.push({
            isImportToFleet: true,
            resourceName: "fuel",
            cargoType: "fuelTank",
            amount: totalMiningCosts.fuel || 0,
            condition: { whenLessThen: totalMiningCosts.fuel || 0 },
          });
        }

        if (options.loadMiningFoodOnMiningBase && foodCostTotal) {
          loadInstructions.push({
            isImportToFleet: true,
            resourceName: "food",
            amount: foodCostTotal,
            condition: { whenLessThen: foodCostTotal },
          });
        }
        this.logger.log(" load mining resources on Mining base", loadInstructions);
        generatedActions.push(new TransferCargoAction(this, loadInstructions));
      }
      let uda2 = new UnDockAction(this, tmpCoordinate);
      // uda2.priorityFeeConfig = { enable: true, increaseBaseFee: 5000 };
      generatedActions.push(uda2);
    }

    if (options.miningTimes >= 1) {
      for (let turns = options.miningTimes; turns >= 1; turns--) {
        //--startStep 6
        generatedActions.push(startMiningAction);
        //--startStep 7
        generatedActions.push(new StopMiningAction(this));

        // After Mining unload to mining starbase flow
        if (turns > 1) {
          let da1 = new DockAction(this, tmpCoordinate);
          // da1.priorityFeeConfig = { enable: true, increaseBaseFee: 5000 };
          generatedActions.push(da1);
          // Unload Mined resources
          this.logger.log("Unload resources on mining starbase.", turns);
          generatedActions.push(new TransferCargoAction(this, [{ isImportToFleet: false, resourceName: resourceName, amount: "max" }]));
          let uda2 = new UnDockAction(this, tmpCoordinate);
          // uda2.priorityFeeConfig = { enable: true, increaseBaseFee: 5000 };
          generatedActions.push(uda2);
        } else if (
          turns == 1 &&
          ((options.transportToSafeStarbase && options.transportToSafeStarbase.length > 0) ||
            options.loadTravelingFuelOnMiningBase ||
            options.fuelTankToSaveStarbase ||
            options.ammoBankToSaveStarbase)
        ) {
          let da1 = new DockAction(this, tmpCoordinate);
          // da1.priorityFeeConfig = { enable: true, increaseBaseFee: 5000 };
          generatedActions.push(da1);
          // unload mined resource
          this.logger.log("Unload resources on mining starbase.", turns);
          this.logger.log(
            "conditions",
            options.transportToSafeStarbase && options.transportToSafeStarbase.length > 0,
            "||",
            options.loadTravelingFuelOnMiningBase,
            "||",
            options.fuelTankToSaveStarbase,
            "||",
            options.ammoBankToSaveStarbase,
          );
          let loadMiningBaseInstruction: iCargoTransferData[] = [];

          if (options.transportToSafeStarbase && options.transportToSafeStarbase.length > 0) {
            generatedActions.push(
              new TransferCargoAction(this, [{ isImportToFleet: false, resourceName: resourceName, amount: "max", condition: { whenMoreThen: 0 } }]),
            );

            /**
             *  This unload step fix runtime issue when there is a rest of food after mining
             *    - situation found in configs with miningTimes > 4, cause of resource loading number rounding when load food for mining
             *    - this fix is pretty safe but will store small amounts of food on mining base when happen.
             *    - this rule is not triggered when there is 0 amount of food rest
             */
            // unload rest food after mining ( happen when miningTimes is big number and foodCostTotal > 0 )
            // Need when there is more then 4 times of mining - cause precision of food consumption
            if (foodCostTotal)
              loadMiningBaseInstruction.push({
                isImportToFleet: false,
                resourceName: "food",
                amount: "max",
                condition: { whenMoreThen: 0 },
              });
            if (options.transportToSafeStarbase && options.transportToSafeStarbase.length > 0) {
              loadMiningBaseInstruction.push(...(await prepareTransportInstructions(true, cargoSpace, options.transportToSafeStarbase)));
            }
          }

          if (options.fuelTankToSaveStarbase) {
            loadMiningBaseInstruction.push({
              isImportToFleet: true,
              resourceName: "fuel",
              cargoType: "fuelTank",
              amount: "max",
            });
          } else if (options.loadTravelingFuelOnMiningBase) {
            loadMiningBaseInstruction.push({
              isImportToFleet: true,
              resourceName: "fuel",
              cargoType: "fuelTank",
              amount: fuelGoToSaveStarbase,
            });
          }

          if (options.ammoBankToSaveStarbase) {
            loadMiningBaseInstruction.push({
              isImportToFleet: true,
              resourceName: "ammunitions",
              cargoType: "ammoBank",
              amount: "max",
            });
          }
          if (options.crewToSaveBase) {
            loadMiningBaseInstruction.push({
              isImportToFleet: true,
              resourceName: "passenger",
              cargoType: "passengers",
              amount: options.crewToSaveBase,
            });
          }
          this.logger.log("Total loadMiningBaseInstruction:", loadMiningBaseInstruction);
          // Load resources to transfer
          generatedActions.push(
            // Cause there is a chance to have
            new TransferCargoAction(
              this,
              loadMiningBaseInstruction,
              // /// Comment runtime callable action cause is difficult to predict runtime results - Replace with more predictable food fix in upper lines
              //   , async (v) => {
              //   let res: iCargoTransferData[] = [];
              //   if (options.transportToSafeStarbase) {
              //     let currentFreeSpaces = await v.process.getFleetFreeSpaces();
              //     res = await prepareTransportInstructions(true, currentFreeSpaces.cargoHold, options.transportToSafeStarbase);
              //   }

              //   return res;
              // }
            ),
          );
          let uda2 = new UnDockAction(this, tmpCoordinate);
          // uda2.priorityFeeConfig = { enable: true, increaseBaseFee: 5000 };
          generatedActions.push(uda2);
        } else {
          // There is no resources to load on star base and we should go to move directly
          continue;
        }
      }
    } else if (options.miningTimes == 0) {
      let loadMiningBaseInstruction: iCargoTransferData[] = [];

      if (options.transportToSafeStarbase && options.transportToSafeStarbase.length > 0) {
        loadMiningBaseInstruction.push(...(await prepareTransportInstructions(true, cargoSpace, options.transportToSafeStarbase)));
      }

      // Manage fuel tank loading
      if (options.fuelTankToSaveStarbase) {
        loadMiningBaseInstruction.push({
          isImportToFleet: true,
          resourceName: "fuel",
          cargoType: "fuelTank",
          amount: "max",
        });
      } else if (options.loadTravelingFuelOnMiningBase) {
        loadMiningBaseInstruction.push({
          isImportToFleet: true,
          resourceName: "fuel",
          cargoType: "fuelTank",
          amount: fuelGoToSaveStarbase,
        });
      }

      // Manage ammoBank loading
      if (options.ammoBankToSaveStarbase) {
        loadMiningBaseInstruction.push({
          isImportToFleet: true,
          resourceName: "ammunitions",
          cargoType: "ammoBank",
          amount: "max",
        });
      }
      if (options.crewToSaveBase) {
        loadMiningBaseInstruction.push({
          isImportToFleet: true,
          resourceName: "passenger",
          cargoType: "passengers",
          amount: options.crewToSaveBase,
        });
      }
      let undock = generatedActions.pop() as UnDockAction; // Move undock position
      generatedActions.push(new TransferCargoAction(this, loadMiningBaseInstruction));
      generatedActions.push(undock);
    }
    // add generated movement steps between saveStarbase -> miningStarbase
    if (travelBetweenStarbases && options.pathToSafeStarbase && options.pathToSafeStarbase.length > 0) {
      FleetProcess.generatePathActions(this, options.pathToSafeStarbase, options.movementMode, tmpCoordinate, true).forEach((act) => {
        generatedActions.push(act);
      });
      // Get Last Sector after movement
      let last = generatedActions.length - 1;
      let action = generatedActions[last] as MoveAction;
      tmpCoordinate = clone(action.coordinates);
    }

    /////////////////////////
    // Dock on safe Starbase
    /////////////////////////
    let da2 = new DockAction(this, tmpCoordinate);
    // da2.priorityFeeConfig = { enable: true, increaseBaseFee: 5000 };
    generatedActions.push(da2);
    let unloadSaveStarbaseInstruction: iCargoTransferData[] = [];
    // unloading all resources transported in cargoHold
    // if (options.transportToSafeStarbase && options.transportToSafeStarbase.length > 0) {
    //   // Transported Resources
    //   unloadSaveStarbaseInstruction.push(...(await prepareTransportInstructions(false, cargoSpace, options.transportToSafeStarbase)));
    // } else {
    //   // Mining resource unload
    //   unloadSaveStarbaseInstruction.push({
    //     isImportToFleet: false,
    //     resourceName: resourceName,
    //     amount: "max",
    //     condition: { whenMoreThen: 0 },
    //   });
    // }
    // ! Unload all cargo specific instructions independent of resource type - this will fix cases with rest of food after mining and simplify process for user when there is no need to manage cargoHold resources
    unloadSaveStarbaseInstruction.push({ isImportToFleet: false, resourceName: "ALL", amount: "max" } as iCargoTransferData); // Force unload all cargo instruction
    // Prepare loading resources instructions
    if (options.ammoBankToSaveStarbase || options.unloadAmmoBankOnSaveBase) {
      let amount: "max" | number = "max";
      let condition: number = 0;
      // When value is boolean - > amount "max" , whenMoreThen: 0
      if (undefined !== options.unloadAmmoBankOnSaveBase && options.unloadAmmoBankOnSaveBase === true) {
        amount = "max";
      } else if (undefined !== options.unloadAmmoBankOnSaveBase) {
        // Value is Number then: unload amount: Number , whenMoreThen: number-1 ( or 0 pri n-1 < 0 )
        amount = Number(options.unloadAmmoBankOnSaveBase);
        condition = amount - 1 >= 0 ? amount : 0;
      }
      if (amount == "max" || amount > 0)
        unloadSaveStarbaseInstruction.push({
          isImportToFleet: false,
          // leave at least 1 resource in cargo to prevent token account creation
          amount: amount,
          cargoType: "ammoBank",
          resourceName: "ammunitions",
          condition: { whenMoreThen: condition }, // Safe check that there is token account and Amount in there
        });
    }
    // There is a logic to exclude this in safe star base to prevent un
    if (options.fuelTankToSaveStarbase || options.unloadFuelTankOnSaveBase) {
      let amount: "max" | number = "max";
      let condition: number = 0;
      // When value is boolean - > amount "max" , whenMoreThen: 0
      if (undefined !== options.unloadFuelTankOnSaveBase && options.unloadFuelTankOnSaveBase === true) {
        amount = "max";
      } else if (undefined !== options.unloadFuelTankOnSaveBase) {
        // Value is Number then: unload amount: Number , whenMoreThen: number-1 ( or 0 pri n-1 < 0 )
        amount = Number(options.unloadFuelTankOnSaveBase);
        condition = amount - 1 >= 0 ? amount : 0;
      }

      unloadSaveStarbaseInstruction.push({
        isImportToFleet: false,
        // leave at least 1 resource in cargo to prevent token account creation
        amount: amount,
        cargoType: "fuelTank",
        resourceName: "fuel",
        condition: { whenMoreThen: condition }, // Safe check that there is token account and Amount in there
      });
    }
    if (options.crewToSaveBase) {
      unloadSaveStarbaseInstruction.push({
        isImportToFleet: false,
        amount: options.crewToSaveBase,
        cargoType: "passengers",
        resourceName: "passenger",
      });
    }
    // NOTE!!! unload rest food after mining ( happen when miningTimes is big number )
    // When transport food to save starbase - avoid duplicated instruction
    // if (
    //   !unloadSaveStarbaseInstruction.find((v) => {
    //     return v.isImportToFleet == false && v.resourceName == "food";
    //   })
    // ) {
    //   unloadSaveStarbaseInstruction.push({ isImportToFleet: false, resourceName: "food", amount: "max", condition: { whenMoreThen: 0 } });
    // }
    this.logger.log("Unload on SaveStarbase:", unloadSaveStarbaseInstruction);
    generatedActions.push(new TransferCargoAction(this, unloadSaveStarbaseInstruction));
    // unload only in case then food cost for mining is > 0 ( aka miningTimes > 0 )
    // if (foodCostTotal)
    //   generatedActions.push(
    //     new TransferCargoAction(this, [{ isImportToFleet: false, resourceName: "food", amount: "max", condition: { whenMoreThen: 0 } }]),
    //   );

    this.logger.log("Generation End: Actions Length: ", this.actionsChain.length);
    let analytics = {
      foodCostMining: foodCostTotal,
      ammoCostMining: totalMiningCosts.ammunitions,
      fuelMingCost: totalMiningCosts.fuel,
      fuelGoToMiningStarbase: fuelGoToMiningStarbase,
      fuelGoToSaveStarbase: fuelGoToSaveStarbase,
      fuelCostTotal: fuelCostTotal,
    };

    this.accumulateAnalytics(analytics);

    /**
     * Merge Transfer Actions
     */
    let resultActions: iAction[] = [];
    for (let i = 0; i < generatedActions.length; i++) {
      // console.log(generatedActions[i].constructor.name);
      if (generatedActions[i].constructor.name == "TransferCargoAction" && generatedActions[i + 1]?.constructor.name == "TransferCargoAction") {
        let action = new TransferCargoAction(generatedActions[i].process as FleetProcess, [
          ...(generatedActions[i] as TransferCargoAction).resources,
          ...(generatedActions[i + 1] as TransferCargoAction).resources,
        ]);
        // Go to next Step
        resultActions.push(action);
        i++;
        continue;
      } else {
        resultActions.push(generatedActions[i]);
      }
    }

    if (options.bundleDockUndock) {
      // We remove Dock and Undock actions from generated steps, because they will be managed by the other actions as sub instructions
      resultActions = resultActions.filter((a) => !(a instanceof DockAction || a instanceof UnDockAction));
    }
    //TODO Bundle Transfers ... > more complex cause need to manage different conditions and resources in one action
    // --- Coming soon
    return {
      actions: resultActions,
      analytics: analytics,
    };
  }

  /**
   * Generates looting scenario steps for specific Location and process, safe Base is used to unload cargo
   */
  async generateLootingProcessSteps(
    location: Coordinates,
    waitTimeOnNoLoot: number = 0,
    mode: "Warp" | "Subwarp" | "Hybrid" = "Warp",
    hybridSubLength: number = 0,
  ) {
    let fa = await this.fetchFleetAccount();
    let fs = fa.data.stats as ShipStats;
    /// We start from starbase location always !
    let [pathTo, pathBack] = [
      await MoveAction.calcWarpPath(this.saveStarbase, location, fs.movementStats.maxWarpDistance, hybridSubLength || 0),
      await MoveAction.calcWarpPath(location, this.saveStarbase, fs.movementStats.maxWarpDistance, hybridSubLength || 0),
    ];

    let [pathCostsTo, pathCostsBack] = [
      await MoveAction.calcPathCosts(fs, this.saveStarbase, pathTo, mode),
      await MoveAction.calcPathCosts(fs, location, pathBack, mode),
    ];

    let steps = pathCostsTo.length + pathCostsBack.length;
    let totals = [...pathCostsTo, ...pathCostsBack].reduce(
      (acc, cur) => {
        acc.fuel += cur.fuel || 0;
        acc.time += cur.time || 0;
        return acc;
      },
      { fuel: 0, time: 0, type: mode },
    );
    totals.fuel += steps; // For safety we add 1 fuel for each step to prevent edge cases with fuel precision and 0 fuel left after move
    if (totals.fuel > fs.cargoStats.fuelCapacity) {
      throw new FuelThankNotEnough({
        expected: totals.fuel,
        fleetName: this.fleetName,
        fuelTankSize: fs.cargoStats.fuelCapacity,
        mode: mode,
        path: [...pathTo, ...pathBack].map((c) => c.toSectorKey()),
      });
    }

    let res = [];

    if (totals.fuel > 0) {
      res.push(
        new TransferCargoAction(this, [
          {
            isImportToFleet: true,
            resourceName: "fuel",
            cargoType: "fuelTank",
            amount: "max", // When we need to run we may need fuel
          } as iCargoTransferData,
        ]),
      );
      res.push(...FleetProcess.generatePathActions(this, pathTo, mode, this.saveStarbase, true));
    } else {
      res.push(new UnDockAction(this, this.saveStarbase));
    }
    let loot = new RetrieveLootAction(this, "FILL_CARGO", 5);
    loot.waitOnNoLoot = waitTimeOnNoLoot;
    res.push(loot);
    if (pathBack.length > 0) {
      res.push(...FleetProcess.generatePathActions(this, pathBack, mode, location, true));
    }
    res.push(new TransferCargoAction(this, [{ isImportToFleet: false, resourceName: "ALL", amount: "max" }]));
    return res;
  }

  /**
   *
   */
  async displaySteps() {
    this.logger.info("Scenario Build");

    let transactionsCount = 0;
    let content = "LocaleString" + new Date().toLocaleString();

    for (const i in this.actionsChain) {
      let action = this.actionsChain[i];
      let msg = i + " " + (await action.display(false));
      content += msg + "\r\n";
      this.logger.info(chalk.cyanBright(i), await action.display(false));

      // After display cause in display method could count dynamic transactions generated
      transactionsCount += action.getTransactionCount();
    }

    content += "========================================\r\n";
    content += "Scenario Length: " + this.actionsChain.length;
    content += "Scenario Transactions: " + transactionsCount;
    content += JSON.stringify(this.analytics);
    let filePath = "steps_export/" + path.basename(process.argv[1]) + ".steps";
    fs.writeFileSync(filePath, content, { encoding: "utf8", flag: "w" });
  }

  accumulateAnalytics(analyticsData: iProcessAnalytics = {}) {
    Object.keys(analyticsData).forEach((key) => {
      // @ts-ignore
      this.analytics[key] += analyticsData[key] || 0;
    });
  }

  static async buildAndAppendActions(proc: FleetProcess, resourceName: string, miningBase: string, options: MiningBuildOptions, times: number = 1) {
    let miningSB = await proc.dispatcher.sageGameHandler.asStatic().readStarbaseByName(miningBase);
    let miningResource = await proc.dispatcher.sageGameHandler.asStatic().readStarbaseResource(miningSB, resourceName);

    let generation = await proc.generateMiningProcessSteps(miningSB, miningResource, options);
    // console.log(JSON.stringify(options));

    while (times-- > 0) {
      proc.actionsChain.push(...generation.actions);
    }

    // Append with instruction merge

    return;
  }
}

export async function buildLootRetrieveHealerActions(pro: FleetProcess, waitOnNoLoot = 30, forceHeal = false) {
  let retrieveLootAction = new RetrieveLootAction(pro, "FILL_CARGO", 5);
  retrieveLootAction.waitOnNoLoot = waitOnNoLoot; // Do not wait if there is no loot - just skip and continue with next actions ( like transfer and undock )

  pro.addAction(
    new CustomCombatLogAction(pro, {
      waitShieldUp: true,
    }),
  );

  pro.addAction(new UnDockAction(pro));

  pro.addAction(retrieveLootAction);
  pro.addAction(new RepairIdleFLeetAction(pro, waitOnNoLoot));
  pro.addAction(retrieveLootAction);

  pro.addAction(
    new TransferCargoAction(pro, [
      {
        isImportToFleet: false,
        resourceName: "ALL",
        amount: "max",
      },
    ]),
  );
  if (forceHeal) {
    pro.addAction(
      new TransferCargoAction(pro, [
        {
          isImportToFleet: true,
          resourceName: "toolkit",
          amount: "max",
        },
      ]),
    );
    pro.addAction(new RepairIdleFLeetAction(pro, waitOnNoLoot));
    pro.addAction(new DockAction(pro));
    pro.addAction(
      new CustomCombatLogAction(pro, {
        waitShieldUp: true,
      }),
    );
  }
  return pro;
}

/***
 * * HELPERS patch FORCING Loading And Bundling Actions on already prepared builds
 */
export function forceAmmoLoading(proc: FleetProcess) {
  let transfers = proc.actionsChain.filter((a) => a instanceof TransferCargoAction);
  transfers.forEach((t) => {
    let ammoLoads = (t as TransferCargoAction).resources.filter((ri) => ri.isImportToFleet == true && ri.resourceName == Resource.ammunitions);
    ammoLoads.forEach((al) => {
      al.amount = "max";
      al.condition = { whenLessThen: "max" };
    });
  });
}

/**
 * Avoid Closing Token Account in between of transaction instructions
 * @param proc
 */
export function cleanUpFoodLodLoads(proc: FleetProcess) {
  let transfers = proc.actionsChain.filter((a) => a instanceof TransferCargoAction);

  transfers.forEach((t) => {
    let foodMovingInst = (t as TransferCargoAction).resources.filter((ri) => ri.resourceName == Resource.food && ri.cargoType == "cargoHold");

    let ins = foodMovingInst.filter((ri) => ri.isImportToFleet == true);

    let outs = foodMovingInst.filter((ri) => ri.isImportToFleet == true);
    let sum = {
      ins: ins.reduce((acc, cur) => {
        acc += Number(cur.amount);
        return acc;
      }, 0),
      outs: outs.reduce((acc, cur) => {
        acc += Number(cur.amount);
        return acc;
      }, 0),
    };

    // Exclude from cargo food loads if total amount of food for loading less then or equal to 0 after decrease

    ins.forEach((ri) => {
      ri.amount = 0;
      delete ri.condition;
      // @ts-ignore
      ri.cleanUp = "food insert cleaned up";
    });
    outs.forEach((ri) => {
      ri.amount = 0;
      delete ri.condition;

      // @ts-ignore
      ri.cleanUp = "food unload cleaned up";
    });

    foodMovingInst.push({
      isImportToFleet: sum.ins - sum.outs > 0,
      amount: Math.abs(sum.ins - sum.outs),

      resourceName: Resource.food,
      cargoType: "cargoHold",
    } as iCargoTransferData);
  });
}
