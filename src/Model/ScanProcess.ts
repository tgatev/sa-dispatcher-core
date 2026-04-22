import { FleetProcess as Process } from "./FleetProcess";
import { ScanDllAction, iFleetScanStatus } from "./ScanDllAction";
import Dispatcher, { DispatcherParsedTransactionWithMeta, iPriorityFeeConfig } from "./Dispatcher";
import { Coordinates, MoveAction, iCoordinates } from "./MoveAction";
import {
  ScanAction,
  iScanConfig,
  DEFAULT_LOOK_AROUND_RANGE,
  DEFAULT_LOOK_AROUND_SCANS_TRIGGER,
  BASE_SCAN_CONFIG,
  DEFAULT_LOOK_AROUND_MIN_DIFF,
} from "./ScanAction";
import { CantFetchFleetStatuses, MissingFleetConfig, NotSafeMovement } from "../Error/ErrorHandlers";
import { iParsedScanLog, SDUProbabilityProcessor } from "./SDUProbabilityProcessor";
import { Fleet, ShipStats, calculateDistance } from "@staratlas/sage-main";
import { BN } from "@project-serum/anchor";
import { SubwarpAction } from "./SubwarpAction";
import { WarpAction } from "./WarpAction";
import { DockAction } from "./DockAction";
import { TransferCargoAction, iCargoTransferData } from "./TransferCargoAction";
import { UnDockAction } from "./UndockAction";
import _, { clone } from "lodash";
import { AccountInfo, LAMPORTS_PER_SOL, ParsedAccountData, PublicKey, SimulatedTransactionResponse } from "@solana/web3.js";
import { WaitWarpCooldownAction } from "./WaitWarpCooldownAction";
import { ExitSubwarpAction } from "./ExitSubwarpAction";
import { ExitWarpAction } from "./ExitWarpAction";
import { PaymentAction } from "./PaymentAction";
import { formatTimePeriod } from "../utils";
import { log } from "../Common/PatchConsoleLog";

/**
 *  TODO .....
 * [...] modify monitor info:
 *    [X] add last scan/simulation chance result,
 *    [X] current toolkit amount,
 *    [X] sdu Amount updates,
 *    [-] [maybe and fuel percents ]
 * [X] find sector to be result of listSectors - listing all sectors with details
 * [-] detect fleet states and start processing from each state
 * [X] change scan action to simulate before retry the transaction
 * [X] find sector should not provide sectors that are not able to reach ( not enough fuel case - moving by warp )
 * [X] Modify Transaction confirmation strategy
 * [-] Implement Warp Move with path check before start
 * [-] features for Listen Sectors in Fleet Area for count of fleets in each sector
 *      [x] refresh data on (sectors listing && getSectorFleets) when sector data is older then SECTOR_FLEETS_SYNC_TIME
 *      [-] Move immediately When fleet is alone on sector but the chance to low
 * tests:
 *  warp path is safeMovement ?
 *
 */

const DATA_IS_FRESH_PERIOD = 5 * 60;
/**
 * Manage timer process interval
 */
const RUN_TIME_PERIOD = 10; // in seconds

const WAIT_TIME_AFTER_SUCCESS = 2 * 60; // 3 minutes in seconds

/**
 * Time without successful scan before move move out of the sector
 *  - exclude cooldown waiting
 */
const WAIT_TIME_BEFORE_MOVE = 2 * 60; // 6 minutes in seconds

/**
 * Max owner fleets in single sector
 */
const MAX_OWNER_FLEETS_IN_SECTOR = 1;

/**
 * Disable time for sector when fleet leave
 */
const SECTOR_DISABLE_TIME = 60 * 60; // 30 * 60 seconds

/*
 * Used to guess some chance - this value will force going to notScanned Sectors
 *  if all sectors chances around having scan data is lower then DEFAULT_SDU_PROCESSOR_MISSING_SECTOR_CHANCE,
 *  or there is no data in SDU Processor ( findNewSector is execute before receive data, or just there is no scanners around)
 */
const DEFAULT_SDU_PROCESSOR_MISSING_SECTOR_CHANCE = 0.15;

/**
 * Time to refresh sector fleets data @see this.sectorFleets
 *   It is nice to be less then movement time
 *   that will help for counting of fleets after enter in new sector
 *
 *  Example: move on sub warp between 1 sector is 4.1 minutes SECTOR_FLEETS_SYNC_TIME= 4*60
 */
const SECTOR_FLEETS_SYNC_TIME = 5 * 60;

const FUEL_PERCENT_TO_FORCE_STARBASE_ORIENTATION = 0.3;

const DEBUG = 0;
export interface iSectorDetails {
  lastScanTime?: number;
  probabilityChance?: number;
  timeModifier?: number;
  nextScanTime?: number; // fleet cooldown expires at
  simulationsInRow?: number | 0;
}

export interface iScanArrayElement {
  fleetName: string;
  saveStarbase: iCoordinates;
  scanConfig: iScanConfig;
}

export interface iScanProcessStatus {
  isBusy: boolean;
  state:
    | "Init"
    | "Unload"
    | "Load"
    | "Warp"
    | "Subwarp"
    | "Dock"
    | "Undock"
    | "Scan"
    | "WaitCooldown"
    | "Decide"
    | "Stopped"
    | "WaitAfterFound";
  timeEnd?: Date;
  timeStart?: Date;
  toSector?: string;
  availableScans?: number;
  sdu?: number;
  scansOnSector?: number;
  totalScansByRefill?: number;
  successRateByRefill?: number;
  sectorsAround?: iFoundSectorDetails[];
  scanCd?: number;
  fuelAmount?: number;
  note?: string;
  totalFuelCost?: number;
  totalFoodCost?: number;
}
export interface iFoundSectorDetails {
  // Sector Key,
  coordinates: Coordinates;
  // Max average chance,
  avChance: number;
  // Distance
  distance: number;
  // Coefficient K
  K: number;
  // distance to starbase
  starbaseDistance: number;
  // chanceDiff (sectorX - current_sector) / distance-between
  chanceDiff: number;
}

export interface ListScanningSectorOpts {
  // 1 - K * average chance i applied to formula
  travelMode?: number;
  // When last data for sector is found success then reduce the chance = chance / successReduction
  successReduction?: number;
  // Max Distance filter
  maxDistanceFilter?: number;
}
export class ScanProcess {
  dispatcher: Dispatcher;
  scaleFactor: number = 1;
  doNotSimulateScans: boolean = false; // when true transaction will be send without simulation with current priority fee config - use case when you are sure about priority fee value and want to skip simulation step
  set mode(label: string) {
    switch (label.toLowerCase()) {
      case "holosim":
        this.scaleFactor = 1000;
        break;
      default:
        this.scaleFactor = 1;
        break;
    }
  }

  // Stop all timers
  forceStop: boolean = false;
  scanDll: ScanDllAction;
  // Sector Data information
  sectorsData: Map<string, iSectorDetails> = new Map<string, iSectorDetails>();
  // Fleets in current sector
  sectorFleets: Map<
    string,
    {
      fleets: {
        pubkey: PublicKey;
        account: AccountInfo<Buffer | ParsedAccountData>;
      }[];
      syncTime: number;
    }
  > = new Map<
    string,
    {
      fleets: {
        pubkey: PublicKey;
        account: AccountInfo<Buffer | ParsedAccountData>;
      }[];
      syncTime: number;
    }
  >();
  // List of fleets and process parameters
  scanArray: Map<string, iScanArrayElement>;
  // processing statuses
  status: Map<string, iScanProcessStatus> = new Map<string, iScanProcessStatus>();
  // Interval Id per fleet Name
  scanIntervalIds: Map<string, Timer> = new Map<string, Timer>();
  fleetProcessMap: Map<string, Process> = new Map<string, Process>();
  sduProcessor: SDUProbabilityProcessor;
  _sectorDefaultChance: number = DEFAULT_SDU_PROCESSOR_MISSING_SECTOR_CHANCE;
  _sectorDataFreshPeriod: number = DATA_IS_FRESH_PERIOD;
  // Time Period between run Execution
  _scannerRunPeriod: number = RUN_TIME_PERIOD;
  // Time to wait sector to restore
  _waitBeforeMove: number = WAIT_TIME_BEFORE_MOVE;
  // Max Owned fleets in sector
  _maxOwnerFleetsInSector = MAX_OWNER_FLEETS_IN_SECTOR;
  // Prevent going ot the same low chance sector
  _sectorDisableTime = SECTOR_DISABLE_TIME;
  // Count of Fleets in Sector sync period ( don't get too often this data )
  _sectorFleetsCountRefreshPeriod = SECTOR_FLEETS_SYNC_TIME;
  // Wait bonus time after Cooldown when successful found SDU
  _defaultBonusTimeWaitingAfterSuccess = WAIT_TIME_AFTER_SUCCESS;
  // Trigger fast move on bad sector when fleet is alone
  _fuelPercentToForceStarbaseOrientation = FUEL_PERCENT_TO_FORCE_STARBASE_ORIENTATION;
  _triggerFastMoveOnBadSector: boolean = true;
  // @ts-ignore Monitor Interval Id
  _monitorIntervalId;
  // Sector Simulation Data
  _sectorRawDataLogs: Map<string, any> = new Map<string, iSectorDetails[]>();
  _sectorTrendCalcs: Map<string, number[]> = new Map<string, number[]>();
  _priorityFeeConfig?: iPriorityFeeConfig;
  _dbLogger: (data: any) => Promise<void>;
  monitor: boolean = true;
  constructor(
    dispatcher: Dispatcher,
    scanArray: Map<string, iScanArrayElement>,
    dbLogger: (data: any) => Promise<void> = async (data: any) => {
      console.log("DB_INF", data);
    },

    priorityFeeConfig: iPriorityFeeConfig | undefined,
    options?: {
      sduProcessor: SDUProbabilityProcessor;
    },
  ) {
    this.dispatcher = dispatcher;
    this.scanArray = scanArray;
    this.scanDll = new ScanDllAction(this.dispatcher);

    // this.dispatcher.donate = false; // force disable instruction appending
    this._dbLogger = dbLogger;
    if (priorityFeeConfig) this._priorityFeeConfig = priorityFeeConfig;
    if (!(options && options.sduProcessor)) {
      this.sduProcessor = new SDUProbabilityProcessor();
    } else {
      this.sduProcessor = options.sduProcessor;
    }
    this.sduProcessor.startListener();
  }

  async forceStopFleet(fleetKey: string, reason: string = "") {
    this.dispatcher.logger.log("FORCE STOP SCANNING:", fleetKey);
    this.status.set(fleetKey, { isBusy: false, state: "Stopped", timeStart: new Date(), note: reason });
    clearInterval(this.scanIntervalIds?.get(fleetKey));
    this.scanIntervalIds.delete(fleetKey);

    // If there is no active fleets - force stop process
    if ([...this.scanIntervalIds.keys()].length == 0) {
      this.forceStop = true;
    }
  }

  async forceStopProcess() {
    // force stop - stopping all scanners
    this.dispatcher.logger.log("Force Stop scan processes.");
    for (const statusKey of this.scanIntervalIds.keys()) {
      await this.forceStopFleet(statusKey, "Force Stop Process TRIGGER");
    }
    this.dispatcher.logger.log("There is no active Fleets...");
    clearInterval(this._monitorIntervalId);

    // resolve main scanner process
  }

  /**
   * Start execution of steps
   */
  start(): Promise<void> {
    return new Promise(async (resolve: any, reject: any) => {
      // Preset Scanner Map states, processing initialize time interval for each fleet
      for (const scannerKey of this.scanArray.keys()) {
        const scanner = this.scanArray.get(scannerKey) as iScanArrayElement;
        const fleetKey = scanner.fleetName;
        // Set interval Per Fleet
        let scanIntervalId = this.scanIntervalIds?.get(fleetKey);
        if (scanIntervalId) continue; // Already set

        if (scanner) {
          let status = {
            isBusy: false,
            state: "Init",
          } as iScanProcessStatus;
          this.status.set(fleetKey, status);
          // If there is no scan sector set TargetSector as default
          if (!scanner.scanConfig.scanSector) {
            let fleetAccount = await this.getFleetProcess(scannerKey).fetchFleetAccount();
            if (fleetAccount.state.Respawn) {
              await this.forceStopFleet(fleetKey, "Fleet is in Respawn state.");
              this.forceStop = false;
              this.scanArray.delete(fleetKey);
              this.dispatcher.logger.err(`Fleet {${fleetKey}} NOT Respawn [ Stop Processing]`);
              continue;
            }
            scanner.scanConfig.scanSector = await this.getFleetProcess(scannerKey).getCurrentSector(fleetAccount);

            // still Cant match current sector ?
            if (!scanner.scanConfig.scanSector) {
              throw "Cant find fleet current sector.";
              // scanner.scanConfig.scanSector = scanner.scanConfig.targetSector;
            }
          }

          // Arrow function is needed to have access for the resources
          let intervalId = setInterval(async () => {
            // {this} is current ScanProcess;

            // Clear Interval and resolve promise
            this.dispatcher.logger.log("Now:", new Date());
            if (DEBUG >= 1) this.dispatcher.logger.log("ForceStop:", this.forceStop);
            if (DEBUG >= 1) this.dispatcher.logger.log("States:", this.status.constructor.name, [...this.status.keys()].length);
            if (DEBUG >= 2) this.dispatcher.logger.log("Keys:", [...this.status.keys()]);

            // is Busy - skip and return false
            // Ensure function execution end to reduce memory usage
            let status = this.status.get(fleetKey);
            if (!status || status.isBusy) {
              if (!status) this.dispatcher.logger.log(fleetKey, "MISSING STATUS !!!!!!!!!!!!!!!!!!!!!");
              // !!! NOT NEED FOR sa-dispatcher.com - just return, SPAMMING RPC - Min INterval SHOULD BE HEIGHeR
              let fp = this.getFleetProcess(fleetKey);
              let fa = fp.fleetAccount || (await fp.fetchFleetAccount());
              let fps = this.getStatus(fleetKey);
              if (fa.state.MoveSubwarp) {
                let exitTime = new Date(Number(fa.state.MoveSubwarp.arrivalTime) * 1000);
                fps.note =
                  "Exit subwarp after " +
                  formatTimePeriod((exitTime.getTime() - new Date().getTime()) / 1000) +
                  ". " +
                  exitTime.toUTCString();
              } else if (fa.state.MoveWarp) {
                let exitTime = new Date(Number(fa.state.MoveWarp.warpFinish) * 1000);
                fps.note =
                  "Exit warp after " + formatTimePeriod((exitTime.getTime() - new Date().getTime()) / 1000) + ". " + exitTime.toUTCString();
              }
              return;
            }

            // is Free
            // Start Execution
            status.isBusy = true;
            status.state = "Decide";

            try {
              await this.run(fleetKey);
            } catch (e) {
              this.dispatcher.logger.crit(e);
              this.forceStopFleet(fleetKey, "Execution Failed:" + String(e) || "");
              let s = this.status.get(fleetKey);
              if (s) s.note = String(e);
              throw e; // brake process
            }
            status.isBusy = false;

            if (DEBUG >= 1) this.dispatcher.logger.log(fleetKey, "Process is FREE NOW");
          }, this._scannerRunPeriod * 1000);

          // Set interval Id
          this.scanIntervalIds.set(scanner.fleetName, intervalId);
          // Slow down fleet submission cause RPC Overloading
          await new Promise((resolveTime) => setTimeout(resolveTime, 1000));
        }
      }

      this._monitorIntervalId = setInterval(async () => {
        if (this.monitor === true) await this.displayMonitor();
        if (DEBUG >= 1) this.dispatcher.logger.log("Iterators:", [...this.scanIntervalIds.keys()].length, [...this.scanIntervalIds.keys()]);
        if (this.forceStop) {
          this.dispatcher.logger.crit("Force Stop Process TRIGGERED - stopping all fleets...");
          await this.forceStopProcess();
          return resolve();
        }
      }, this._scannerRunPeriod * 1000);
    });
  }

  async displayMonitor() {
    this.dispatcher.logger.log();
    this.dispatcher.logger.log("".padEnd(130, "="));
    this.dispatcher.logger.log("MONITOR".padStart(55, " "));
    this.dispatcher.logger.log("".padEnd(130, "="));

    this.dispatcher.logger.log(
      "|",
      "SectorKey".padEnd(9, " "),
      "|",
      "FleetKey".padEnd(15, " "),
      "|",
      "Fuel amount".padEnd(15, " "),
      "|",
      "sRate".padEnd(10, " "),
      "|",
      "tScans".padEnd(10, " "),
      "|",
      "?Bussy".padEnd(6, " "),
      "|",
      "State".padEnd(15, " "),
      "|",
      "SA".padEnd(6, " "),
      "|",
      "SDU".padEnd(6, " "),
      "|",
      "Chance%".padEnd(7, " "),
      "|",
      "Sim".padEnd(3, " "),
      "|",
      "SOS".padEnd(3, " "),
      "|",
      "sCD".padEnd(3, " "),
      "|",
    );
    this.dispatcher.logger.log("".padStart(120, "-"));
    let allCosts = { food: 0, fuel: 0 };
    for (const fleetKey of this.status.keys()) {
      let data = this.getStatus(fleetKey);
      let process = this.getFleetProcess(fleetKey);
      let fleetStats: ShipStats = process.fleetAccount?.data.stats || (await process.fetchFleetAccount()).data.stats;
      let fsConfig = this.scanArray.get(fleetKey);
      let processSectorData = this.sectorsData.get(fsConfig?.scanConfig.scanSector?.toSectorKey() || "");
      let sduChance = Math.round((processSectorData?.probabilityChance || 0) * 1000000) / 10000;
      this.dispatcher.logger.log(
        "|",
        fsConfig?.scanConfig.scanSector?.toSectorKey().padEnd(9, " "),
        "|",
        fleetKey.padEnd(15, " "),
        "|",
        (
          data.fuelAmount?.toString() +
          " " +
          Math.floor(((data.fuelAmount || 0) * 100) / Number(fleetStats.cargoStats.fuelCapacity)).toString() +
          "%"
        ).padEnd(15, " "),
        "|",
        ((data.successRateByRefill || "0") + "%").toString().padStart(10, " "),
        "|",
        (data.totalScansByRefill || "0").toString().padStart(10, " "),
        "|",
        data?.isBusy.toString().padEnd(6, " "),
        "|",
        data?.state.toString().padEnd(15, " "),
        "|",
        data?.availableScans?.toString().padStart(6, " "),
        "|",
        data?.sdu?.toString().padStart(6, " "),
        "|",
        sduChance.toString().padStart(7, " "),
        "|",
        (processSectorData?.simulationsInRow || 0).toString().padStart(3, " "),
        "|",
        data.scansOnSector?.toString().padStart(3, " "),
        "|",
        data.scanCd?.toString().padStart(3, " "),
        "|",
      );
      this.dispatcher.logger.log(
        "Fuel:",
        Math.round(data.totalFuelCost || 0),
        "Food:",
        Math.round(data.totalFoodCost || 0),
        "    Note:",
        data.note || "",
      );
      allCosts.fuel += data.totalFuelCost || 0;
      allCosts.food += data.totalFoodCost || 0;
    }
    // this.dispatcher.logger.log("BLOCK DATA:", this.dispatcher.blockHash, this.dispatcher.lastValidBlockHeight);
    this.dispatcher.logger.log("".padEnd(130, "="));
    this.dispatcher.logger.log(
      "TOTAL TRANSACTIONS: ",
      Dispatcher.feesAggregator / LAMPORTS_PER_SOL,
      "|",
      "Fuel",
      Math.round(allCosts.fuel),
      "Food",
      Math.round(allCosts.food),
    );
    this.dispatcher.logger.log("".padEnd(130, "="));
    this.dispatcher.logger.log();
  }

  getStatus(fleetKey: string): iScanProcessStatus {
    return this.status.get(fleetKey) || ({} as iScanProcessStatus);
  }

  setStatus(fleetKey: string, status: iScanProcessStatus): void {
    this.status.set(fleetKey, status);
  }

  /**
   * Provide owner fleets sectors list with count of owner fleets inside
   *  ( meaning: where my fleets are located )
   *
   * @param process
   * @returns
   */
  getFleetSectors() {
    let sectors = new Map<string, number>();
    for (const fleetKey of this.scanArray.keys()) {
      let fleet = this.scanArray.get(fleetKey);
      let sectorKey = fleet?.scanConfig.scanSector?.toSectorKey() || "";
      let fleetsCount = sectors.get(sectorKey) || 0;
      fleetsCount += 1;
      sectors.set(sectorKey, fleetsCount);
    }

    return sectors;
  }

  /**
   * Provide data for fleets in sector
   *
   * @param sectorKey
   * @returns
   */
  async getSectorFleetsData(sectorKey: string) {
    if (DEBUG >= 1) this.dispatcher.logger.log(" >>>>> getSectorFleetsData", sectorKey);
    let cords = sectorKey.split(",");
    let now = new Date().getTime();

    let sectorFleets = this.sectorFleets.get(sectorKey);
    if (!sectorFleets || sectorFleets.syncTime + this._sectorFleetsCountRefreshPeriod * 1000 < now) {
      let fleets = (await this.dispatcher.sageGameHandler.getSectorFleets(Number(cords[0]), Number(cords[1])), false) as any;
      sectorFleets = { fleets: fleets, syncTime: now };
      this.sectorFleets.set(sectorKey, sectorFleets);
    }

    return sectorFleets;
  }

  /**
   * List accessible
   *  Exclude disabled sectors from area
   *  Exclude sectors with too many fleets
   *  Ref calculate SDU Processor data to remove Old Data values
   *
   * @param fleetKey
   * @param process
   * @param fss
   * @param fsConfig
   * @returns
   */
  async listScanningSectors(
    fleetKey: string,
    fsConfig: iScanArrayElement | undefined = undefined,
    opts: ListScanningSectorOpts = { maxDistanceFilter: 150, travelMode: 2, successReduction: 1.5 },
  ) {
    let _maxDistanceFilter = opts.maxDistanceFilter || 150;
    let _travelMode = opts.travelMode || 2;
    let _sduSuccessReduction = opts.successReduction || 1.5;
    //config is always defined
    if (!fsConfig) fsConfig = this.scanArray.get(fleetKey) as iScanArrayElement;
    let process = this.getFleetProcess(fleetKey);
    let currentSector = fsConfig.scanConfig.scanSector as Coordinates;
    if (!currentSector) {
      let fa = await process.fetchFleetAccount();
      currentSector = new Coordinates(Number(fa.state.Idle?.sector[0]), Number(fa.state.Idle?.sector[1]));
      fsConfig.scanConfig.scanSector = currentSector;
    }
    let fa = process.fleetAccount;
    // @ USED To estimate best fleet sectors
    let fleetStats = (fa || (await process.fetchFleetAccount())).data.stats as ShipStats;
    let scanVsTravelingConst = 1;
    if (fsConfig.scanConfig.movementTypes.relocate == "Subwarp") {
      scanVsTravelingConst =
        (100 * fleetStats.movementStats.subwarpFuelConsumptionRate) /
        (fleetStats.movementStats.subwarpSpeed * fleetStats.miscStats.scanCoolDown); //     cost / cd*seed,
    }

    let sectorAreaMap = ScanDllAction.getTargetAreaMap(
      fsConfig.scanConfig.targetAreaSize,
      fsConfig.scanConfig.targetSector,
      fsConfig.scanConfig.targetAreaType,
    );
    let usedSectors = this.getFleetSectors();
    let sectors = [];
    let noDataSectors = [];
    if (DEBUG >= 1) this.dispatcher.logger.log("   >>> listScanningSectors >>>");
    // Found sector with max chance
    for (const sectorInAreaKey of sectorAreaMap.keys()) {
      let cords = sectorInAreaKey.split(",");
      let x = Number(cords[0]);
      let y = Number(cords[1]);

      let distance = calculateDistance([new BN(currentSector.x), new BN(currentSector.y)], [new BN(x), new BN(y)]);
      if (distance > _maxDistanceFilter) {
        continue;
      }

      let sectorLocalData = this.sectorsData.get(sectorInAreaKey);
      // If have more owner fleets in sector then allowed
      if (usedSectors.has(sectorInAreaKey) && (usedSectors.get(sectorInAreaKey) || 0) >= this._maxOwnerFleetsInSector) {
        if (DEBUG >= 2) this.dispatcher.logger.log(fleetKey, "MAX OWNER FLEETS IN SECTOR", sectorInAreaKey);
        continue;
      }

      /**
       * When sector is disabled by nextScanTime - skip the sector
       */
      if (sectorLocalData && ((sectorLocalData.simulationsInRow || 0) > 0 || (sectorLocalData.nextScanTime || 0) > new Date().getTime())) {
        if (DEBUG >= 2)
          this.dispatcher.logger.log(
            fleetKey,
            "MAX OWNER FLEETS IN SECTOR",
            sectorInAreaKey,
            sectorLocalData.simulationsInRow,
            sectorLocalData.nextScanTime,
          );
        // Todo: Add Sector time to go to current time in 2nd condition
        // if there is fleets waiting on simulations don't provide this sector for relocation
        // if (nextScanTime > now ) don't provide the sector for relocation
        continue;
      }

      // Sync sector data when list sectors or searching a new sector
      // There is sectors timeout
      // await this.getSectorFleetsData(sectorInAreaKey);

      // Always get fresh data for current sector
      let { raw: currentSectorRawData, calculated: currentSectorCalcData } = this.sduProcessor.getSectorData(currentSector.toSectorKey());

      // Use Last value for the current sector chance
      let currentSectorAvChance = currentSectorRawData[0]?.sduChance || this._sectorDefaultChance || 0;

      // Use averages
      // let currentSectorAvChance = Math.max(
      //   currentSectorCalcData?.av10min || 0,
      //   currentSectorCalcData?.av5min || 0,
      //   currentSectorCalcData?.av2min || 0,
      //   currentSectorCalcData?.average || 0,
      //   currentSectorCalcData?.av3 || 0,
      //   currentSectorCalcData?.av5 || 0
      // );

      let { raw: sduProcessorData, calculated: sduProcessorCalcs } = this.sduProcessor.getSectorData(sectorInAreaKey);
      let sduChance = this._sectorDefaultChance;

      if (
        sduProcessorData == undefined ||
        sduProcessorData.length < 1 ||
        new Date().getTime() / 1000 - sduProcessorData[0].timestamp > this._sectorDataFreshPeriod // Check last record actuality - is old data?
      ) {
        if (DEBUG >= 2)
          this.dispatcher.logger.log(
            fleetKey,
            "<<< NO-DATA >>>",
            `"${sduChance}" |`,

            `"${sduChance}"`,
            "sector:",
            sectorInAreaKey,
            "of sectors",
            sduProcessorData?.length,
          );

        noDataSectors.push(sectorInAreaKey);
      } else {
        // if there is actual data then will be used, else -> default sector chance is used
        // sduChance = Math.max(
        //   sduProcessorCalcs?.av30min || 0,
        //   sduProcessorCalcs?.av20min || 0,
        //   sduProcessorCalcs?.av10min || 0,
        //   sduProcessorCalcs?.av5min || 0,
        //   sduProcessorCalcs?.av2min || 0,
        //   sduProcessorCalcs?.average || 0,
        //   // sduProcessorCalcs?.av3 || 0,
        //   // sduProcessorCalcs?.av5 || 0,
        //   0
        // );

        if (sduProcessorCalcs?.av20min || sduProcessorCalcs?.av10min || sduProcessorCalcs?.av5min || sduProcessorCalcs?.av2min) {
          sduChance =
            Math.max(
              sduProcessorCalcs?.last || 0,
              sduProcessorCalcs?.av20min || 0,
              sduProcessorCalcs?.av10min || 0,
              sduProcessorCalcs?.av5min || 0,
              sduProcessorCalcs?.av2min || 0,
              0,
            ) || this._sectorDefaultChance; // append || this._sectorDefaultChance - when no data at all
        } else {
          sduChance =
            (sduProcessorCalcs?.av30min +
              sduProcessorCalcs?.av20min +
              sduProcessorCalcs?.av10min +
              sduProcessorCalcs?.av5min +
              sduProcessorCalcs?.av2min +
              sduProcessorCalcs?.average +
              sduProcessorCalcs?.last) /
              7 || this._sectorDefaultChance;
        }
        // console.log(fleetKey, [sduChance], "sector:", sectorInAreaKey, sduProcessorCalcs);

        if (!sduProcessorData[0].success) {
          //! if last sector was not success scan get Last Chance, else get average Values
          sduChance = Math.max(sduChance, sduProcessorData[0].sduChance || 0);
        } else {
          //! on success Devide value by 2
          sduChance = sduChance / _sduSuccessReduction;
        }

        // Round to second digit after Point
        sduChance = Math.round((sduChance + Number.EPSILON) * 100) / 100;
        if (DEBUG >= 2)
          this.dispatcher.logger.log(
            "fleet:",
            fleetKey,
            `"${sduChance}" |`,
            `"${this._sectorDefaultChance}"`,
            "sector:",
            sectorInAreaKey,
            "/",
            sduProcessorData?.length,
          );
      }

      let starBaseDistance =
        distance + calculateDistance([new BN(x), new BN(y)], [new BN(fsConfig.saveStarbase.x), new BN(fsConfig.saveStarbase.y)]);
      // console.log(
      //   "K [CHANCE]",
      //   sduChance,
      //   currentSectorAvChance,
      //   distance,
      //   (this.scaleFactor *
      //     1000 *
      //     ((sduChance / fsConfig.scanConfig.minChance) * (sduChance - fsConfig.scanConfig.minChance) * (1 + _travelMode * sduChance))) /
      //     (scanVsTravelingConst * 2 * (distance || 1) + starBaseDistance)
      // );
      // coefficient - to manage traveling between sectors
      sectors.push({
        // Sector Key,
        coordinates: new Coordinates(x, y),
        // Max average chance,
        avChance: sduChance,
        // Diff with current sector
        chanceDiff: sduChance - currentSectorAvChance,
        // Distance
        distance: distance,
        // Coefficient K
        K: Math.floor(
          (this.scaleFactor *
            1000 *
            ((sduChance / fsConfig.scanConfig.minChance) * (sduChance - fsConfig.scanConfig.minChance) * (1 + _travelMode * sduChance))) /
            (scanVsTravelingConst * 2 * (distance || 1) + starBaseDistance), // (scanCooldown/travelingSpeed)
        ),
        // distance to starbase
        starbaseDistance: distance + starBaseDistance,
        sectorData: { calcs: sduProcessorCalcs, raw: sduProcessorData },
      } as iFoundSectorDetails);
    }

    if (DEBUG >= 1) this.dispatcher.logger.log(fleetKey, ".listScanningSectors::sectors.length", sectors.length);
    return sectors;
  }

  /**
   * Find new sector filtering by chance
   * if there is no free sector in area with better chance return the same sector
   *
   * @param fleetKey
   * @param process
   * @returns
   */
  async findNewSector(
    fleetKey: string,
    orderCloseToStarbase: Boolean = false,
    fsConfig: iScanArrayElement | undefined = undefined,
  ): Promise<iFoundSectorDetails | undefined> {
    let process = this.getFleetProcess(fleetKey);
    let fleetAccount = process.fleetAccount || (await process.fetchFleetAccount());
    if (!fsConfig) fsConfig = this.scanArray.get(fleetKey);
    if (DEBUG >= 1) this.dispatcher.logger.log(fsConfig);
    // Best( N ) sectors
    let topSectorsN = 1; //Math.max(3, fsConfig?.scanConfig.targetAreaSize || 0);
    let tmpSize = (fsConfig?.scanConfig.targetAreaSize || 1) * (fsConfig?.scanConfig.targetAreaSize || 1);
    while (tmpSize > 4) {
      tmpSize = Math.floor(tmpSize / 2);
      topSectorsN++;
    }
    // MaxMin
    topSectorsN = Math.max(2, topSectorsN);
    topSectorsN = Math.min(7, topSectorsN);

    this.dispatcher.logger.dbg("FIND NEW SECTORS best ", topSectorsN, "of", tmpSize);

    // fsConfig?.scanConfig.targetAreaSize
    if (!fsConfig) throw fleetKey + " fsConfig is missing...";
    let fss = await this.scanDll.getStatus(fleetAccount, fsConfig.scanConfig);
    if (DEBUG >= 1)
      this.dispatcher.logger.log(
        `<<<<< FindSector >>>>> ${fleetKey} >>>>> ${fsConfig.scanConfig.movementTypes.relocate} >>>> orderCloseToStarbase:`,
        orderCloseToStarbase,
        fss,
      );
    let sectors = await this.listScanningSectors(fleetKey);
    if (DEBUG >= 1) {
      this.dispatcher.logger.info("Sectors listed:", sectors.length);
    }
    let currentSector = (await process.getCurrentSector(fleetAccount)) || (fsConfig?.scanConfig.scanSector as Coordinates);
    let safeGoingSectors = [];
    // Force orientation to starbase on low fuel amount
    let fuelAmount = await process.getFuelAmount();
    // Filter sectors out of range
    for (let sector of sectors) {
      if (fsConfig.scanConfig.movementTypes.relocate == "Warp") {
        // @ts-ignore maxWarpDistance type never :(
        let maxWarpDistance = fleetAccount.data.stats.movementStats.maxWarpDistance;
        let path = MoveAction.calcWarpPath(currentSector, sector.coordinates, maxWarpDistance);
        log(
          "Path to ",
          sector.coordinates.toSectorKey(),
          path.map((e) => e.toSectorKey()),
        );
        log("Current State:", fleetAccount.state);
        log("Current Sector:", currentSector);
        /** //! ERROR
         * 
 * TypeError: undefined is not an object (evaluating 'tmp_from.x')
      at calcPathCosts (/home/teykarat/sa-dispatcher/src/Model/MoveAction.ts:257:23)
      at getPathCosts (/home/teykarat/sa-dispatcher/src/Model/MoveAction.ts:468:24)
      at <anonymous> (/home/teykarat/sa-dispatcher/src/Model/ScanProcess.ts:828:32)
         */
        // Calc Path - validate path step by step and push sector for relocation
        let costs = MoveAction.getPathCosts(
          fleetAccount.data.stats,
          fuelAmount,
          currentSector,
          path,
          "Warp",
          process.saveStarbase,
          fsConfig.scanConfig.movementTypes.initial,
        );
        if (costs.safeStatus && sector.K > 0) {
          if (DEBUG >= 2) this.dispatcher.logger.log(fleetKey, "WarpValidation: Success");
          safeGoingSectors.push(sector);
        }
        if (DEBUG >= 2) this.dispatcher.logger.err(fleetKey, "WarpValidation: Fail", sector);
      } else if (fsConfig.scanConfig.movementTypes.relocate == "Subwarp") {
        // is SubWarp
        let validated = await new SubwarpAction(process, sector.coordinates).isSafeGoingTo(
          sector.coordinates,
          fuelAmount,
          fsConfig.scanConfig.scanSector,
        );
        if (DEBUG >= 2) this.dispatcher.logger.log(fleetKey, "Subwarp Safe Validation:", validated, sector.K);
        if (validated && sector.K > 0) {
          if (DEBUG >= 1)
            this.dispatcher.logger.log(fleetKey, sector.coordinates.toSectorKey(), "Valid?", validated, sector.K, [
              sector.avChance,
              sector.chanceDiff,
              sector.distance,
            ]);
          safeGoingSectors.push(sector);
        }
      } else {
        throw "Not implements Mode !!! " + fsConfig.scanConfig.movementTypes.relocate;
      }
    }

    if (DEBUG >= 1)
      this.dispatcher.logger.log(
        "<<<<< FindSector >>>>> Safe Going Sectors Length:",
        safeGoingSectors.length,
        "from: ",
        sectors.length,
        " listed",
      );

    if ((await process.getFuelPercent()) < this._fuelPercentToForceStarbaseOrientation) {
      orderCloseToStarbase = true;
    }
    /**
     * Current sector is always safe sector,
     *  - If there is no other options then current one this will be used to trigger refill
     */
    if (safeGoingSectors.length < 1) {
      // Bad story - cant go any where return current sector
      return undefined;
    }

    // Sort sector Details and return proper one
    let sortedResults = _.orderBy(safeGoingSectors, ["K", "distance"], ["asc", "desc"]);
    let bestSectors = [];
    for (let i = 1; topSectorsN >= i; i++) {
      let index = sortedResults.length - i;
      if (index < 0) break;

      if (sortedResults[index]) {
        bestSectors.push(sortedResults[index]);
      }
    }
    // console.error("<<<BEST>>>", bestSectors.length + 1, orderCloseToStarbase, "<<<SORTED>>>", bestSectors);

    if (DEBUG >= 1)
      this.dispatcher.logger.log(fleetKey, "SORTED RESULTS", sortedResults.length, "SAFE GOING SECTORS", safeGoingSectors.length);

    // Less then 10 scans orientation to starbase
    let closestSectors = [];
    if (fss.hasFood < 20 || orderCloseToStarbase === true) {
      // || Fuel less then 20 %
      // || Fuel Less then 20 percents
      if (DEBUG >= 1) this.dispatcher.logger.log("Top Sectors[f<10]");
      if (sortedResults.length >= 3) {
        closestSectors = _.orderBy(
          //[sortedResults[sortedResults.length - 3], sortedResults[sortedResults.length - 2], sortedResults[sortedResults.length - 1]],
          bestSectors,
          ["starbaseDistance", "K"],
          ["asc", "desc"],
        );
        if (DEBUG >= 1)
          this.dispatcher.logger.log(fleetKey, JSON.stringify(closestSectors), {
            order: "getFirst: Closest to starbase",
            ...{ starbaseDistance: "asc", K: "desc" },
          });
      } else {
        0;
        // fs config area size == 0 -> is only one sector
        closestSectors.push(sortedResults[sortedResults.length - 1]);
      }
    } else {
      if (DEBUG >= 1) this.dispatcher.logger.log(fleetKey, "Top Sectors[f(e)]");
      if (sortedResults.length >= 3) {
        closestSectors = _.orderBy(
          // [sortedResults[sortedResults.length - 3], sortedResults[sortedResults.length - 2], sortedResults[sortedResults.length - 1]],
          bestSectors,
          ["distance", "K"],
          ["asc", "desc"],
        );

        if (DEBUG >= 1)
          this.dispatcher.logger.log(fleetKey, JSON.stringify(closestSectors), {
            order: "getFirst: Closest to fleet",
            ...{ distance: "asc", K: "desc" },
          });
      } else {
        // fs config area size == 0 -> is only one sector
        closestSectors.push(sortedResults[sortedResults.length - 1]);
      }
    }

    // Top Sector is need ( depends of order )
    for (let iter = 0; iter < closestSectors.length; iter++) {
      if (closestSectors[iter].avChance > fsConfig.scanConfig.minChance) {
        return closestSectors[iter];
      }
    }

    /**
     * When there is no sectors this means:
     *  1: No good chances in Aria or ( also the current sector is in this )
     *  2: No Safe going sectors - this should trigger refill
     *  3: in case of look around - at lease current sector should be in the sectors list ( expecting good chance on it )
     */
    return closestSectors[0] || undefined; // || sectors.find((details) => details.coordinates.toSectorKey() == currentSector.toSectorKey());
  }

  /**
   * Check for relocation
   *
   * @param fleetKey
   * @param process
   * @param fss
   * @returns
   */
  async shouldMove(fleetKey: string, process: Process, fss: iFleetScanStatus) {
    let fsConfig = this.scanArray.get(fleetKey);
    let sectorKey = fsConfig?.scanConfig.scanSector?.toSectorKey() || "";
    let sectorData = this.sectorsData.get(sectorKey);
    let fleetsInSectors = await this.getFleetSectors();
    let fleetsCountInSector = fleetsInSectors.get(sectorKey) || 1; // to be called this method always there is a fleet in this sector

    // Don't Move when there is too small amount of toolkit - this will stuck the fleet on the sector till the percent rise up [! not always good !]
    // if(fss.hasToolkits < 5){
    //   return false
    // }

    // 10 minutes divided by time period is equal to 10 minutes without TransactionResponse ( only simulations )
    /**
     * When there is more then one fleet in sector and there is a lot of scans
     *  - first will hit the first rule to escape
     *  - each other will hit the second rule to escape
     */
    if (sectorData && (sectorData.simulationsInRow || 0) > (fleetsCountInSector * this._waitBeforeMove) / this._scannerRunPeriod) {
      // Set This sector to be skipped from find sector for {X} of time and reset counter
      sectorData.nextScanTime = new Date().getTime() + this._sectorDisableTime * 1000;
      // sectorData.simulationsInRow = 0;
      this.dispatcher.logger.log(fleetKey, "Move case 1. Reason: too many attempts, lock sector till ", new Date(sectorData.nextScanTime));
      return true;
    }
    /**
     *  sector time check: when there is more then one fleet in this sector
     *    - first one leaving will disable the sector for some time
     *    - all other fleets will leave based on nextScanTime is too big
     */
    if (sectorData && (sectorData.nextScanTime || 0) > new Date().getTime() + this._waitBeforeMove * 1000) {
      this.dispatcher.logger.log(fleetKey, "Move case 2. Sector is locked.");

      return true;
    }

    if (!fss.onSector) {
      this.dispatcher.logger.log(fleetKey, "Move case 3. Reason is not on sector.");
      return true;
    }

    return false;
  }

  /**
   * Update Sectors around and look for better one close to the fleet
   *
   * @param fleetKey
   * @param process
   * @param fss
   */
  async lookAroundForSector(fleetKey: string) {
    let fsConfig = clone(this.scanArray.get(fleetKey) || ({} as iScanArrayElement));
    let laConfig = {
      fleetName: fsConfig.fleetName,
      saveStarbase: fsConfig.saveStarbase,
      scanConfig: {
        minChance: fsConfig.scanConfig.minChance,
        movementTypes: clone(fsConfig.scanConfig.movementTypes),
        targetAreaSize: fsConfig.scanConfig.lookAround?.size || DEFAULT_LOOK_AROUND_RANGE,
        targetSector:
          fsConfig.scanConfig.scanSector ||
          ({
            x: 0,
            y: 0,
            isShipCenter: true,
          } as iCoordinates),
        scanSector: clone(fsConfig.scanConfig.scanSector),
      },
    } as iScanArrayElement;
    laConfig.scanConfig.movementTypes.relocate = fsConfig.scanConfig.lookAround?.moveType || fsConfig.scanConfig.movementTypes.relocate;
    if (DEBUG >= 1) this.dispatcher.logger.log(fleetKey, "<<<<<< Look Around >>>>>", fsConfig.scanConfig.lookAround);
    // if there is no scan sector get fleet centered coordinates

    let sps = this.status.get(fleetKey) || ({} as iScanProcessStatus);
    sps.sectorsAround = await this.listScanningSectors(fleetKey, laConfig);
    sps.sectorsAround = _.orderBy(sps.sectorsAround, ["chanceDiff"], ["desc"]).filter(
      (v) =>
        v.chanceDiff > (fsConfig.scanConfig.lookAround?.diff || DEFAULT_LOOK_AROUND_MIN_DIFF) &&
        v.avChance >= laConfig.scanConfig.minChance,
    );
    if (DEBUG >= 1) this.dispatcher.logger.log(fleetKey, "sps.sectorsAround: ", sps.sectorsAround.length, sps.sectorsAround);

    // Display info
    // for (let c = sps.sectorsAround.length; c - 1 < 0; c--) {
    //   let item = sps.sectorsAround[c - 1];
    //   if (!item) continue;
    //   this.dispatcher.logger.log(
    //     item.coordinates.toSectorKey(),
    //     "distance",
    //     item.distance,
    //     "StarBase",
    //     item.starbaseDistance,
    //     "K",
    //     item.K,
    //     "Chance",
    //     item.avChance,
    //     "diff",
    //     item.chanceDiff
    //   );
    // }

    // May need check
    let currentSector = this.scanArray.get(fleetKey)?.scanConfig.scanSector;
    if (sps.sectorsAround.length > 0) {
      return sps.sectorsAround[0].coordinates;
    } else {
      return currentSector;
    } // Max Diff
  }

  /**
   * Relocate to sector
   *
   * @param fleetKey most often is fleet name
   * @param process process with dispatcher to execute transactions
   * @param toSector default is scan sector from config
   */
  async relocate(fleetKey: string, toSector: iCoordinates | undefined = undefined, moveType: "Subwarp" | "Warp" | "Hybrid" = "Subwarp") {
    let process = this.getFleetProcess(fleetKey);
    let fleetAccount = await process.fetchFleetAccount();
    this.dispatcher.logger.log(fleetKey, ">>> RELOCATE >>>>");
    let status = this.getStatus(fleetKey);
    let fsConfig = this.scanArray.get(fleetKey);
    if (!fsConfig) {
      throw new Error("Missing config for fleet " + fleetKey);
    }
    // @ts-ignore fsConfig?.scanConfig is defined at the beginning of the process or after findNewSector
    if (!toSector) {
      toSector = fsConfig?.scanConfig.scanSector;
    }

    if (!toSector) {
      this.dispatcher.logger.log(fsConfig);
      throw "Missing scan coordinates.";
    }

    if (
      !(fleetAccount.state.Idle || fleetAccount.state.MoveSubwarp || fleetAccount.state.MoveWarp || fleetAccount.state.StarbaseLoadingBay)
    ) {
      await this.forceStopFleet(fleetKey, "Fleet State not in Idle, MoveSubwarp, MoveWarp or Docked");
      return false;
      // throw "Fleet In not Idle, MoveSubwarp or MoveWarp , or Docked.";
    }
    // let fleetBnLocation =
    // (fleetAccount.state.Idle?.sector ||
    //   fleetAccount.state.MoveSubwarp?.toSector ||
    //   fleetAccount.state.MoveWarp?.toSector) as [BN, BN];

    let fleetLocation = await process.getCurrentSector(fleetAccount);
    if (toSector.equals(fleetLocation)) {
      this.dispatcher.logger.log(
        fleetKey,
        "!!!! CANT GO TO THE SAME SECTOR !!!!",
        `[${toSector.x}, ${toSector.y}] ->->-> [${fleetLocation.x},${fleetLocation.y}]`,
      );
      return false;
    }
    // Reset counter for scans in current sector
    let fps = this.getStatus(fleetKey);
    fps.scansOnSector = 0;
    fps.fuelAmount = await process.getFuelAmount();

    try {
      if (!moveType) moveType = fsConfig.scanConfig.movementTypes.relocate;

      if (moveType == "Warp") {
        // @ts-ignore .maxWarpDistance exists
        let maxWarpDistance = fleetAccount.data.stats.movementStats.maxWarpDistance / 100;
        let fleetSector: iCoordinates = (await process.getCurrentSector(fleetAccount)) || (fsConfig?.scanConfig.scanSector as Coordinates);
        new Coordinates(Number(fleetAccount.state.Idle?.sector[0]), Number(fleetAccount.state.Idle?.sector[1]));

        let path = MoveAction.calcWarpPath(fleetSector, toSector, maxWarpDistance); //

        let pathCosts = MoveAction.getPathCosts(
          fleetAccount.data.stats,
          fps.fuelAmount,
          fleetLocation,
          path,
          moveType,
          fsConfig.saveStarbase,
          fsConfig.scanConfig.movementTypes.initial,
        );
        if (DEBUG >= 1) {
          this.dispatcher.logger.log(
            fleetKey,
            `Validate Movement { PathMode: ${moveType} , RefillMode: ${fsConfig.scanConfig.movementTypes.initial}, currentFuel: ${fps.fuelAmount}}`,
          );
          this.dispatcher.logger.log(fleetKey, "Path Costs:", pathCosts);
        }

        // WHEN DO NOT GOING TO STARBASE -> Validate Movement Safe Going to starbase By initial Movement Type
        if (path[path.length - 1].x !== process.saveStarbase.x && path[path.length - 1].y !== process.saveStarbase.y) {
          if (DEBUG >= 1)
            this.dispatcher.logger.log(
              fleetKey,
              "... SafeBack Check --> ",
              `to [${path[path.length - 1].x} , ${path[path.length - 1].y}]`,
              "by",
              fsConfig.scanConfig.movementTypes.initial,
            );

          if (!pathCosts.safeStatus) {
            // Cant go to idle Sector
            // Refill
            await this.refillFLow(fleetKey);
            return;
          }
        } else {
          // WHEN GOING TO
          this.dispatcher.logger.log(fleetKey, "<<<< Relocating to Starbase >>> ");
          /** 
              Do Nothing -> while we are going to starbase 
              Will validate each warp movement step by step 
              That behavior will allow a part of path to be executed by Warp and left by Subwarp
              That will safe time WHICH IS MAIN IDEA TO USE WARP
          */
        }
        // Implement movement to sector

        for (let i = 0; i <= path.length - 1; i++) {
          this.dispatcher.logger.log(fleetKey, "Warp Relocation Path >>>>>>>>", `[${i + 1} / ${path.length}]`);
          status.toSector = toSector.x + "," + toSector.y;
          let warpMove = new WarpAction(process, path[i]);
          if (this._priorityFeeConfig) warpMove.priorityFeeConfig = this._priorityFeeConfig;

          if (!(await warpMove.isSafeGoingTo(toSector))) {
            throw new NotSafeMovement(fleetKey, toSector, "Warp");
          }

          status.timeStart = new Date();
          status.state = "WaitCooldown";
          let waitWarpCooldown = new WaitWarpCooldownAction(process);
          if (this._priorityFeeConfig) waitWarpCooldown.priorityFeeConfig = this._priorityFeeConfig;
          await waitWarpCooldown.run();
          await this._dbLogger({
            fleet: fleetKey,
            timeCost: waitWarpCooldown.results.runTime,
            type: waitWarpCooldown.constructor.name,
            r4cost: await waitWarpCooldown.getResourceCost(),
            transactionsCost: 0,
          });
          status.timeStart = new Date();

          await warpMove.run();
          fps.totalFuelCost = (fps.totalFuelCost || 0) + ((await warpMove.getResourceCost()).fuel || 0);

          await this._dbLogger({
            fleet: fleetKey,
            timeCost: warpMove.results.runTime,
            type: warpMove.constructor.name,
            r4cost: await warpMove.getResourceCost(),
            transactionsCost: Dispatcher.lanportsToSol(warpMove.results.transactionFees),
          });

          status.timeEnd = new Date();
          status.state = "Warp";

          fps.fuelAmount = await process.getFuelAmount();
        }
        // Handle exiting before scan action handling - to reduce waiting
        let exit = new ExitWarpAction(process);
        if (this._priorityFeeConfig) exit.priorityFeeConfig = this._priorityFeeConfig;
        await exit.run();
        await this._dbLogger({
          fleet: fleetKey,
          timeCost: exit.results.runTime,
          type: exit.constructor.name,
          r4cost: await exit.getResourceCost(),
          transactionsCost: Dispatcher.lanportsToSol(exit.results.transactionFees),
        });
      } else if (moveType == "Subwarp") {
        let movementAction = new SubwarpAction(process, toSector);
        if (this._priorityFeeConfig) movementAction.priorityFeeConfig = this._priorityFeeConfig;

        status.state = "Subwarp";
        status.toSector = toSector.x + "," + toSector.y;
        status.timeStart = new Date();
        status.timeEnd = undefined;

        if (await movementAction.isSafeGoingTo(toSector)) {
          await movementAction.run();
          fps.totalFuelCost = (fps.totalFuelCost || 0) + ((await movementAction.getResourceCost()).fuel || 0);
          // movementAction.results.execution
          await this._dbLogger({
            fleet: fleetKey,
            timeCost: movementAction.results.runTime,
            type: movementAction.constructor.name,
            r4cost: await movementAction.getResourceCost(),
            transactionsCost: Dispatcher.lanportsToSol(movementAction.results.transactionFees),
          });

          status.timeEnd = new Date();
          // Handle exiting before scan action handling - to reduce waiting
          let exitSubwarp = new ExitSubwarpAction(process);
          if (this._priorityFeeConfig) movementAction.priorityFeeConfig = this._priorityFeeConfig;
          await exitSubwarp.run();
          await this._dbLogger({
            fleet: fleetKey,
            timeCost: exitSubwarp.results.runTime,
            type: exitSubwarp.constructor.name,
            r4cost: await exitSubwarp.getResourceCost(),
            transactionsCost: Dispatcher.lanportsToSol(exitSubwarp.results.transactionFees),
          });
          // fps.
          fps.fuelAmount = await process.getFuelAmount();
        } else {
          throw new NotSafeMovement(fleetKey, toSector, "SubWarp");
        }
      } else {
        throw "Unknown Movement type.";
      }
    } catch (e) {
      if (e instanceof Error) {
        if (e.constructor.name == "NotSafeMovement") {
          // let fss = await this.scanDll.getStatus(fleetAccount, fsConfig.scanConfig);

          // Go to star base on buksir by subwarp
          this.dispatcher.logger.log(fleetKey, ">>>> FORCE REFILL >>>> NotSafeMovement Error:", e.message);
          await this.refillFLow(fleetKey, "Subwarp");
        } else {
          throw e;
        }
      } else {
        throw e;
      }
    }
    this.dispatcher.logger.log(fleetKey, " >>>>> RELOCATE ENDS");
    return true;
  }

  async refill(fleetKey: string, fleetAccount: Fleet | undefined = undefined) {
    let status = this.getStatus(fleetKey);
    let process = this.getFleetProcess(fleetKey);
    // Move to starbase - should be done
    // Dock to starbase
    status.state = "Dock";
    status.timeStart = new Date();
    let dock = new DockAction(process);
    if (this._priorityFeeConfig) dock.priorityFeeConfig = this._priorityFeeConfig;
    await dock.run();
    await this._dbLogger({
      fleet: fleetKey,
      timeCost: dock.results.runTime,
      type: dock.constructor.name,
      r4cost: await dock.getResourceCost(),
      transactionsCost: Dispatcher.lanportsToSol(dock.results.transactionFees),
    });
    status.timeEnd = new Date();
    this.dispatcher.logger.err(fleetKey, ">>> REFILL >>>> DOCKED [0] >>>>");

    // Unload SDU or something else
    status.state = "Unload";
    status.timeStart = new Date();
    if (!fleetAccount) fleetAccount = await process.fetchFleetAccount();
    let sduAmount = await process.dispatcher.sageGameHandler.getTokenAccountMintAmount(
      fleetAccount.data.cargoHold,
      process.dispatcher.sageGameHandler.getResourceMintAddress("sdu"),
    );
    let foodAmount = await process.dispatcher.sageGameHandler.getTokenAccountMintAmount(
      fleetAccount.data.cargoHold,
      process.dispatcher.sageGameHandler.getResourceMintAddress("food"),
    );

    // If there is more then 1 sdu
    if (sduAmount - 1 > 0) {
      let tca = new TransferCargoAction(process, [
        { isImportToFleet: false, resourceName: "sdu", amount: sduAmount - 1 || "max" } as iCargoTransferData,
      ]);

      if (this._priorityFeeConfig) tca.priorityFeeConfig = this._priorityFeeConfig;
      await tca.run();
      await this._dbLogger({
        fleet: fleetKey,
        timeCost: tca.results.runTime,
        type: tca.constructor.name,
        r4cost: await tca.getResourceCost(),
        transactionsCost: Dispatcher.lanportsToSol(tca.results.transactionFees),
      });
      status.timeEnd = new Date();
    }
    this.dispatcher.logger.err(fleetKey, ">>> REFILL >>>> Unloaded [1] >>>>");

    // Refill
    let freeSpaces = await this.dispatcher.sageFleetHandler.getFleetFreeCargoSpaces(fleetAccount);
    status.state = "Load";
    status.timeStart = new Date();
    let foodConsumptionRate = await this.getFleetScanConsumption(fleetKey);
    let loadAmount = await this.getFoodAmountForRefill(fleetKey);
    loadAmount.amount -= foodAmount;
    if (loadAmount.amount < 0) loadAmount.amount = 0;
    console.error("Refill food amount:", loadAmount, "Consumption rate:", foodConsumptionRate);
    let tca = new TransferCargoAction(process, [
      foodConsumptionRate > 0
        ? { isImportToFleet: true, resourceName: "food", amount: loadAmount.amount, condition: { whenLessThen: loadAmount.whenLessThen } }
        : {
            isImportToFleet: true,
            resourceName: "food",
            amount: loadAmount.amount,
            condition: { whenLessThen: loadAmount.whenLessThen },
          },
      // { isImportToFleet: true, resourceName: "food", amount: freeSpaces.cargoHold },
      { isImportToFleet: true, resourceName: "fuel", amount: freeSpaces.fuelTank, cargoType: "fuelTank" },
    ]);
    if (this._priorityFeeConfig) tca.priorityFeeConfig = this._priorityFeeConfig;
    await tca.run();
    await this._dbLogger({
      fleet: fleetKey,
      timeCost: tca.results.runTime,
      type: tca.constructor.name,
      r4cost: await tca.getResourceCost(),
      transactionsCost: Dispatcher.lanportsToSol(tca.results.transactionFees),
    });
    this.dispatcher.logger.err(fleetKey, ">>> REFILL >>>> Loaded [1] >>>>");

    status.timeEnd = new Date();
    // TODO Check resources before run - if no then exclude fleet

    // Undock
    status.state = "Undock";
    status.timeStart = new Date();
    let undock = new UnDockAction(process);
    if (this._priorityFeeConfig) undock.priorityFeeConfig = this._priorityFeeConfig;
    await undock.run();
    await this._dbLogger({
      fleet: fleetKey,
      timeCost: undock.results.runTime,
      type: undock.constructor.name,
      r4cost: await undock.getResourceCost(),
      transactionsCost: Dispatcher.lanportsToSol(undock.results.transactionFees),
    });
    status.timeEnd = new Date();
    this.dispatcher.logger.err(fleetKey, ">>> REFILL >>>> Undock [2] >>>>");

    // Find sector and Modify Scan Sector
    status.state = "Decide";
    status.timeStart = new Date();
    // status.totalFuelCost = 0;
    // status.totalFoodCost = 0;
    // Find New sector and Relocate will be defined in refillFlow;
    // Done
  }

  /**
   * Provide process for fleet action
   * @param fleetKey
   * @returns
   */
  getFleetProcess(fleetKey: string) {
    let fleetProcess = this.fleetProcessMap.get(fleetKey);

    if (!fleetProcess) {
      let fsConfig = this.scanArray.get(fleetKey);
      if (!fsConfig) throw new MissingFleetConfig(fleetKey);

      fleetProcess = new Process(this.dispatcher, fsConfig.fleetName, fsConfig.saveStarbase, "");
      this.fleetProcessMap.set(fleetKey, fleetProcess);
      return fleetProcess;
    } else {
      return fleetProcess;
    }
  }

  async scan(process: Process, fsConfig: iScanArrayElement) {
    let scanAction = new ScanAction(process, fsConfig.scanConfig);
    scanAction.doNotSimulate = this.doNotSimulateScans || false;
    if (this._priorityFeeConfig) scanAction.priorityFeeConfig = this._priorityFeeConfig;
    await scanAction.run();
    await this.pushSimulationDataToTracker(scanAction);

    return scanAction;
  }

  /**
   * Force SDU Processor to handle logs of simulations
   * ! THIS METHOD PROCESS ONLY SIMULATION LOGS
   */
  async pushSimulationDataToTracker(scanAction: ScanAction) {
    let txData = scanAction.results.execution;
    // Lat executed Transaction is always the scan transaction
    let i = txData.length - 1;
    // txData[i].logs?.length - simulation logs
    if (
      txData &&
      i > 0 &&
      txData[i] &&
      "logs" in txData[i] &&
      Array.isArray((txData[i] as any).logs) &&
      ((txData[i] as any).logs || []).length > 0
    ) {
      await this.sduProcessor.onLogs((txData[i] as any).logs, {} as any);
    }
    // END OF LOGS PROCESSING
  }
  /** ScanDll provide flow for execution */
  /**
   * 
    //     is isAbleToScan(Idle And Have Toolkits And OnScanSector)
    //         is on sector -> scan
    //         else ->
    //             Is Save Going To -> go to sector
    //             else -> refill
    //     is StarbaseLoading Bay
    //         refill
    //     is in move action
    //         exit warp / subwarp
    // Move process || Reload Process || Scan
   * 
   * @param fleetKey 
   */
  async run(fleetKey: string) {
    let fsConfig = this.scanArray.get(fleetKey);
    if (!fsConfig) throw new MissingFleetConfig(fleetKey);

    let process = this.getFleetProcess(fleetKey);
    let fleetAccount = await process.fetchFleetAccount(); // refresh data to recieve cooldowns
    let fss = await this.scanDll.getStatus(fleetAccount, fsConfig.scanConfig);
    let fps = this.getStatus(fleetKey);
    let fleetStats = fleetAccount.data.stats as ShipStats;
    fps.availableScans = fss.hasFood;
    fps.sdu = fss.sduAmount;

    fps.successRateByRefill = Math.round((fps.sdu * 100) / (Number(fleetStats.miscStats.sduPerScan) * (fps.totalScansByRefill || 1)));
    fps.scanCd = Math.ceil(Number(fleetAccount.data.scanCooldownExpiresAt) - new Date().getTime() / 1000);
    fps.note = "Tick Start";
    // Debug
    // this.dispatcher.logger.log("HERE .... ", fsConfig.scanConfig.scanSector);
    // let data = await this.findNewSector(fleetKey, process, fss);
    // fsConfig.scanConfig.scanSector = data?.coordinates;
    if (fleetAccount.state.MoveWarp) {
      // console.log("<<<<< Movement DETECTED >>>>>");
      let ts = fleetAccount.state.MoveWarp.toSector;
      fsConfig.scanConfig.scanSector = new Coordinates(Number(ts[0]), Number(ts[1]));
      await new ExitWarpAction(process).execute();
      fps.scansOnSector = 0;
    } else if (fleetAccount.state.MoveSubwarp) {
      // console.log("<<<<< Movement DETECTED >>>>>");
      let ts = fleetAccount.state.MoveSubwarp.toSector;
      fsConfig.scanConfig.scanSector = new Coordinates(Number(ts[0]), Number(ts[1]));
      await new ExitSubwarpAction(process).execute();
      fps.scansOnSector = 0;
    }

    if (!fsConfig.scanConfig.lookAround) {
      fsConfig.scanConfig.lookAround = BASE_SCAN_CONFIG.lookAround;
    } else {
      // To disable look around set size = 0 or possibly diff as greater then 100
      if (fsConfig.scanConfig.lookAround.size == undefined) fsConfig.scanConfig.lookAround.size = 0;
      if (fsConfig.scanConfig.lookAround.trigger == undefined) fsConfig.scanConfig.lookAround.trigger = 0;
      if (!fsConfig.scanConfig.lookAround.diff) fsConfig.scanConfig.lookAround.diff = DEFAULT_LOOK_AROUND_MIN_DIFF;
    }
    if (!fps.sectorsAround) fps.sectorsAround = [];
    if (!(fss && fps)) {
      throw new CantFetchFleetStatuses(fleetKey);
    }
    let sectorKey =
      fsConfig.scanConfig.scanSector?.toSectorKey() ||
      new Coordinates(Number(fleetAccount.state.Idle?.sector[0]), fleetAccount.state.Idle?.sector[1]).toSectorKey();
    let processSectorData = this.sectorsData.get(sectorKey);
    fps.toSector = sectorKey;

    if (!processSectorData) {
      processSectorData = {} as iSectorDetails;
      this.sectorsData.set(sectorKey, processSectorData);
    }

    if (!fps.scansOnSector) fps.scansOnSector = 0; // handle false values to 0
    // this.dispatcher.logger.log("FSS:", fleetKey, fss);
    if (ScanDllAction.isAbleToScan(fss)) {
      this.dispatcher.logger.log(fleetKey, "<<<<<<< SCAN >>>>>>>", sectorKey, "Scans Available:", fss.hasFood);
      fps.note = "Can Scan";
      fps.state = "Scan";
      let nextScanTime = (processSectorData?.nextScanTime || 0) + (processSectorData?.timeModifier || 0);
      let currentTime = new Date().getTime();
      if (nextScanTime > currentTime) {
        fps.timeEnd = undefined;
        fps.state = "WaitAfterFound";
        fps.note = " NextScan time after: " + (nextScanTime - currentTime) / (1000 * 60) + " minutes.";
        fps.timeStart = new Date();
        if (DEBUG >= 2)
          this.dispatcher.logger.log(
            fleetKey,
            "WAIT NextTime: ",
            nextScanTime,
            currentTime,
            nextScanTime < currentTime,
            new Date(nextScanTime),
          );
      } else {
        fps.timeEnd = undefined;
        fps.timeStart = new Date();
        fps.note = "Waiting ... ScanAction ...";

        let scanAction = await this.scan(process, fsConfig);
        let isSimulation: boolean | undefined;

        fps.timeEnd = new Date();
        let scanResult: iParsedScanLog | undefined;

        let results = await scanAction.getScanResultParsed();
        await this._dbLogger(results);
        if (!results) return;
        isSimulation = results.simulation;
        scanResult = results.scanResult;

        if (!isSimulation) {
          fps.totalFoodCost = (fps.totalFoodCost || 0) + ((await scanAction.getResourceCost()).food || 0);
          if (scanResult.data.success) {
            await this.payOnSuccess(fleetKey);
          }
        }

        scanAction.results.execution = [];
        // this.dispatcher.logger.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
        // this.dispatcher.logger.log({ isSimulation: isSimulation, logsLength: logs.length });
        // this.dispatcher.logger.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
        // Parse Logs

        // this.dispatcher.logger.log(Boolean(scanResult && sectorKey && processSectorData), scanResult, sectorKey, processSectorData);
        if (scanResult && sectorKey && processSectorData) {
          fleetAccount = await process.fetchFleetAccount();

          processSectorData.lastScanTime = scanResult.data.timestamp * 1000;
          processSectorData.probabilityChance = scanResult.data.sduChance;
          // Process Cooldown
          processSectorData.nextScanTime = new Date().getTime(); //  fleetAccount.data.scanCooldownExpiresAt * 1000; - problem when have more then one fleets in sector
          // Scanning stop on simulation cause the sdu percent Chance is lower then limit
          if (isSimulation) {
            if (processSectorData.simulationsInRow == undefined) processSectorData.simulationsInRow = 0;
            processSectorData.simulationsInRow += 1; // reset when transaction is executed ( when % chance is bigger then min_limit )
            let fleetsInSector = await this.getSectorFleetsData(fsConfig.scanConfig.scanSector?.toSectorKey() || "");
            // this.dispatcher.logger.log("[SimulationsCount]", processSectorData.simulationsInRow);

            /**
             * in Case when the fleet is alone on the sector and sector last scan
             */
            if (this._triggerFastMoveOnBadSector && processSectorData.simulationsInRow > 1 && fleetsInSector.fleets.length <= 1) {
              // Most often we are here after lookAround Trigger with default chance > minChance
              //   - in that case is better to check Warp Cooldown, and move immediately
              let sectorData = this.sectorsData.get(sectorKey);
              // Disable sector will force this.shouldMove to move the fleet - but also  used as filter in listScanningSectors, do disable sector before search new one
              if (sectorData) {
                // Disable Sector
                processSectorData.nextScanTime = new Date().getTime() + this._sectorDisableTime * 1000;
                let laMoveType = fsConfig.scanConfig.lookAround?.moveType;
                if (laMoveType == "Warp") {
                  // When previous turn of lookAround was Warp there is and we have force relocation change mode to Sub Warp to reduce time waiting
                  if (fleetAccount.data.warpCooldownExpiresAt * 1000 > new Date().getTime()) laMoveType = "Subwarp";
                  // let newSector = await this.lookAroundForSector(fleetKey);
                  let newSector = await this.findNewSector(fleetKey, false);
                  if (!newSector) {
                    this.dispatcher.logger.err(fleetKey, ">>> No new sector found >>>>  refill >>>>");
                    return await this.refillFLow(fleetKey);
                  }
                  // fsConfig.scanConfig.scan;
                  fps.note = "Look Around after Bad emptySector";
                  fsConfig.scanConfig.scanSector = newSector.coordinates;
                  return await this.relocate(fleetKey, newSector.coordinates, laMoveType);
                }
              }
            }
          } else {
            processSectorData.simulationsInRow = 0;
            // Update look around iterator
            fps.scansOnSector = (fps.scansOnSector || 0) + 1;
            fps.totalScansByRefill = (fps.totalScansByRefill || 0) + 1;
          }

          if (scanResult.data.success && !isSimulation) {
            let fleetStats: ShipStats = fleetAccount.data.stats;

            // + 2 minutes
            // Add Row to sector data and recalculate
            // Set percent chance drop after found and recalculate sector data
            let sduProcSectorData = this.sduProcessor.data.get(fsConfig.scanConfig.scanSector?.toSectorKey() as string) || [];
            scanResult.data.sduChance -= fleetStats.miscStats.sduPerScan / 1000;
            sduProcSectorData.unshift(scanResult.data);
            this.sduProcessor.data.set(fsConfig.scanConfig.scanSector?.toSectorKey() as string, sduProcSectorData);

            processSectorData.simulationsInRow = 0;
            // Look Around For new Sector
            if (
              fsConfig.scanConfig.lookAround?.moveAfterFound == true &&
              (fsConfig.scanConfig.lookAround?.trigger || 0) > 0 &&
              (fsConfig.scanConfig.lookAround?.size || 0) > 0
            ) {
              let newSector = await this.lookAroundForSector(fleetKey);
              fps.note = "Look Around After Success go to -> " + newSector?.toSectorKey();
              // fsConfig.scanConfig.scan;
              if (newSector) {
                fsConfig.scanConfig.scanSector = newSector;
                if (await this.relocate(fleetKey, newSector, fsConfig.scanConfig.lookAround?.moveType)) {
                  // Disable sector after finish complete is important if the fleet was relocated
                  processSectorData.timeModifier = 1000 * this._defaultBonusTimeWaitingAfterSuccess;
                }

                return; // ! EARLY RETURN
              }
            } else {
              processSectorData.nextScanTime = new Date().getTime() + Number(fleetStats.miscStats.scanCoolDown) * 1000;
              processSectorData.timeModifier = 1000 * this._defaultBonusTimeWaitingAfterSuccess;
            }

            // Update statuses after scan
          } else {
            processSectorData.timeModifier = 0;
          }

          // Update iterators
          fss = await this.scanDll.getStatus(fleetAccount, fsConfig.scanConfig);
          fps = this.getStatus(fleetKey);
          fps.availableScans = fss.hasFood; // can Scan iterator

          this.dispatcher.logger.log(
            "<<<<<<< Scan RESULT",
            fleetKey,
            scanResult?.sector,
            isSimulation ? "Simulation" : " Execution",
            processSectorData.simulationsInRow,
            scanResult?.data.sduChance,
            scanResult?.data.success,
            ">>>>>>>",
          );
        }
      }
    }

    if (fss.isCooldownLoaded == false || (fps.scanCd || 0) > 0) {
      fps.state = "WaitCooldown";
      fps.note = "Scan is on cooldown.";
    }

    if (fss.hasFood >= 1) {
      let sector;
      // Check for better sector around  - this case handles situation when current sector is better then minChance, but there is better in short range
      if (fsConfig.scanConfig.lookAround && fsConfig.scanConfig.lookAround.size && fsConfig.scanConfig.lookAround?.size > 0) {
        if (fps.scansOnSector && fps.scansOnSector >= (fsConfig.scanConfig.lookAround.trigger || DEFAULT_LOOK_AROUND_SCANS_TRIGGER)) {
          // Find Sectors
          sector = await this.lookAroundForSector(fleetKey);
          if (DEBUG >= 1) this.dispatcher.logger.log(fleetKey, "lookAroundForSector - before relocate ", sector);
          if (sector) {
            if (await this.relocate(fleetKey, sector, fsConfig.scanConfig.lookAround.moveType)) {
              fps.scansOnSector = 0;
            }
          }
        }
      }

      // Menage Moving triggers and force refill when there is a need for more fuel
      if (await this.shouldMove(fleetKey, process, fss)) {
        // Check for too much simulations
        if (DEBUG >= 1) {
          this.dispatcher.logger.info(fleetKey, fsConfig.scanConfig.scanSector?.toSectorKey());
          this.dispatcher.logger.info(fleetKey, ".shouldMove ", fss);
        }

        if (fss.onSector || (processSectorData.simulationsInRow || 0) > 0) {
          if (DEBUG >= 1)
            this.dispatcher.logger.log("CASE1: onSector:true && Simulations > 0 && bad chance && fleets in sector less then 2");

          let rs = await this.findNewSector(fleetKey);

          if (!rs) {
            this.dispatcher.logger.err(fleetKey, ">>> No new sector found >>>> refill [0] >>>>");
            // there is no good sectors or fuel is less - go to refill
            await this.refillFLow(fleetKey);
            // improve readability - and secure not going on some previous value
            sector = undefined;
          } else {
            if (DEBUG >= 1) this.dispatcher.logger.log(fleetKey, "Scan Simulations on sector:", processSectorData.simulationsInRow);
            // when should move, but is possible to have no better sectors
            sector = rs.coordinates;
          }
        } else {
          if (DEBUG >= 1)
            this.dispatcher.logger.log(
              fleetKey,
              "CASE2: !( fss.onSector || processSectorData.simulationsInRow  > 0)",
              fsConfig.scanConfig.scanSector,
            );
          // Beginning of the script with pre selected selected scanSector, if there is no pre selected found sectors will be used
          if (fsConfig.scanConfig.scanSector) {
            sector = fsConfig.scanConfig.scanSector;
          } else {
            let newSector = await this.findNewSector(fleetKey);
            if (newSector) {
              sector = newSector.coordinates;
            } else {
              this.dispatcher.logger.err(fleetKey, ">>> No new sector found >>>> refill [1] >>>>");
              // There is no good sectors or fuel is less - go to refill to use the time
              await this.refillFLow(fleetKey);
              // improve readability - and secure not going on some previous value
              sector = undefined;
            }
          }
        }
      }
      if (DEBUG >= 1) this.dispatcher.logger.log(fleetKey, "Go To Sector", sector);
      // Move if there is sector
      if (sector) {
        fsConfig.scanConfig.scanSector = sector;
        await this.relocate(fleetKey, fsConfig.scanConfig.scanSector, fsConfig.scanConfig.movementTypes.relocate);
        fps.scansOnSector = 0;
        processSectorData.simulationsInRow = 0;
      }
      // if (!fss.isCooldownLoaded) {
      //   // do nothing - continue;
      // }
    }
    /**
     * fss.hasFood < 1  : no food for single scan or
     * fleetStats.miscStats.sduPerScan > fleetStats.cargoStats.cargoCapacity - fss.foodAmount - fss.sduAmount :there is not enough free space to collect SDU
     //! (fss.hasFood == 1 && fleetStats.miscStats.sduPerScan > fleetStats.cargoStats.cargoCapacity - fss.foodAmount - fss.sduAmount) 
     * Data Scanners always have hasFood ==1  this condition is to force data scanners to refill when there is not enough space for SDU 
     */
    if (
      fss.hasFood < 1 ||
      (fss.hasFood == 1 && fleetStats.miscStats.sduPerScan > fleetStats.cargoStats.cargoCapacity - fss.foodAmount - fss.sduAmount)
    ) {
      this.dispatcher.logger.err(fleetKey, ">>> No FOOD for scan >>>> refill [2]>>>>");

      await this.refillFLow(fleetKey);
    }
  }

  async payOnSuccess(fleetKey: string): Promise<void | PaymentAction> {
    let process = this.getFleetProcess(fleetKey);
    let payment = new PaymentAction(process, 30000);
    await payment.run();

    return payment;
  }
  /**
   * Provide refilling process flow
   *
   * @param fleetKey
   * @param process
   * @param fss
   * @returns
   */
  async refillFLow(fleetKey: string, forceMode: "Warp" | "Subwarp" | "Hybrid" | undefined = undefined) {
    let fsConfig = this.scanArray.get(fleetKey);
    let process = this.getFleetProcess(fleetKey);
    let fleetAccount = process.fleetAccount || (await process.fetchFleetAccount());
    let fps = this.getStatus(fleetKey);

    if (!fsConfig) throw fleetKey + "Relocate flow have missing scanConfig";
    if (!forceMode) forceMode = fsConfig.scanConfig.movementTypes.initial;
    if (DEBUG >= 1)
      this.dispatcher.logger.log(fleetKey, `Refill [ForceMode: ${forceMode}] >>>`, fsConfig.saveStarbase.x + "," + fsConfig.saveStarbase.y);

    await this.relocate(fleetKey, fsConfig.saveStarbase, forceMode);
    // recharge resources
    await this.refill(fleetKey, fleetAccount);
    fps.totalScansByRefill = 0;
    // after refill there should have resources, find sector no way to return undefined here
    let newSector = await this.findNewSector(fleetKey, true);
    if (!newSector || fsConfig?.scanConfig.stopOnRefill) {
      await this.forceStopFleet(fleetKey, fsConfig?.scanConfig.stopOnRefill ? "Stop On Refill Trigger!" : "No Sector Found on Refill!");
      await new DockAction(process).execute();
      return;
    } else {
      // Removing - have meaning to try to scan on base and move on Trigger
      // fsConfig.scanConfig.scanSector = newSector.coordinates;
      // await this.relocate(fleetKey, fsConfig.scanConfig.scanSector, fsConfig.scanConfig.movementTypes.initial);
    }
  }

  parseResourceMovedAmount(tx: DispatcherParsedTransactionWithMeta, cargoKey: PublicKey, mint: PublicKey) {
    // tx.meta?.postTokenBalances[0].mint
  }

  async getFoodAmountForRefill(fleetKey: string) {
    let fp = this.getFleetProcess(fleetKey);
    let fa = fp.fleetAccount || (await fp.fetchFleetAccount());
    let fleetStats = fa.data.stats as ShipStats;
    if (fleetStats.miscStats.scanCost == 0)
      return {
        amount: 1,
        whenLessThen: 1,
      };

    let maxScansToFull = Math.floor(fleetStats.cargoStats.cargoCapacity / fleetStats.miscStats.sduPerScan);
    let maxFood = fleetStats.cargoStats.cargoCapacity - 1;
    if (fleetStats.miscStats.sduPerScan > fleetStats.miscStats.scanCost) {
      let minFoodToFull = maxScansToFull * fleetStats.miscStats.scanCost;
      return {
        amount: Math.floor(minFoodToFull + (maxFood - minFoodToFull) * 0.5),
        whenLessThen: fleetStats.cargoStats.cargoCapacity,
      };
    } else {
      return {
        amount: maxFood,
        whenLessThen: fleetStats.cargoStats.cargoCapacity,
      };
    }
    // let maxFoodByScans = maxScansToFull * fleetStats.miscStats.scanCost
  }
  /**
   * Provide amount of resource need for single scan
   * @param fleetKey
   * @returns
   */
  async getFleetScanConsumption(fleetKey: string): Promise<number> {
    let process = this.getFleetProcess(fleetKey);
    let fleetStats = (process.fleetAccount || (await process.fetchFleetAccount())).data.stats as ShipStats;
    return fleetStats.miscStats.scanCost || 0;
  }
}
