/**
 * Scan (D)escision(L)ogic(L)ayer Action
 */

import { Fleet } from "@staratlas/sage-main";
import { SageGameHandler } from "../..";
import { Coordinates, iCoordinates } from "./MoveAction";
import { FleetProcess as Process } from "./FleetProcess";
import Dispatcher from "./Dispatcher";
import { BN } from "@project-serum/anchor";
import { iScanConfig } from "./ScanAction";

export interface iFleetScanStatus {
  isIdle: boolean;
  inArea: boolean;
  onSector: boolean;
  // hasToolkits: number; // if false means should reload
  hasFood: number;
  isCooldownLoaded: boolean; // Should Wait
  sduAmount: number;
  foodAmount: number;
}

export class ScanDllAction {
  dispatcher;
  process?: Process;
  constructor(dispatcher: Dispatcher) {
    this.dispatcher = dispatcher;
  }

  async getProcess(fleetName: string, fleetStarbase: iCoordinates) {
    if (this.process) return this.process;
    this.process = new Process(this.dispatcher, fleetName, fleetStarbase);
  }

  /**
   *
   * @param fleetAccount
   * @returns
   */
  static isAbleToScan(statuses: iFleetScanStatus): boolean {
    // @ts-ignore undefined means false
    return statuses.hasFood >= 1 && statuses.isCooldownLoaded && statuses.onSector; // && statuses.inArea - to limit only inarea, //statuses.isIdle &&
  }

  async getStatus(fleetAccount: Fleet, scanConfig: iScanConfig): Promise<iFleetScanStatus> {
    const amounts = await this.dispatcher.sageGameHandler.getAmountsByMints(fleetAccount.data.cargoHold, [
      this.dispatcher.sageGameHandler.getResourceMintAddress("food"),
      this.dispatcher.sageGameHandler.getResourceMintAddress("sdu"),
    ]);

    const food = amounts.get(this.dispatcher.sageGameHandler.getResourceMintAddress("food").toBase58());

    const sdu = amounts.get(this.dispatcher.sageGameHandler.getResourceMintAddress("sdu").toBase58());
    let statuses = {
      isIdle: Boolean(fleetAccount.state.Idle),
      // hasToolkits: Number(await ScanDllAction.hasToolkits(fleetAccount, toolkits || 0)),
      hasFood: Number(await ScanDllAction.hasFood(fleetAccount, food || 0)),
      isCooldownLoaded: ScanDllAction.isCooldownLoaded(fleetAccount),
      onSector: await ScanDllAction.onSector(fleetAccount, scanConfig),
      sduAmount: sdu || 0,
      foodAmount: food || 0,
    } as iFleetScanStatus;

    let res = ScanDllAction.inArea(fleetAccount, scanConfig.targetAreaSize, scanConfig.targetSector, scanConfig.targetAreaType);
    statuses.inArea = res.status;

    return statuses;
  }

  static getTargetAreaSquareMap(targetAreaSize: number, targetSector: iCoordinates): Map<string, any> {
    let areaMap = new Map<string, any>();
    // Discret values only -> should round floor
    targetAreaSize = Math.floor(targetAreaSize);

    for (let xIter: number = -1 * targetAreaSize; xIter <= targetAreaSize; xIter++) {
      for (let yIter: number = -1 * targetAreaSize; yIter <= targetAreaSize; yIter++) {
        let key: string = "" + (targetSector.x + xIter) + "," + (targetSector.y + yIter);
        areaMap.set(key, {});
      }
    }

    return areaMap;
  }

  static getTargetAreaCircleMap(targetAreaSize: number, targetSector: iCoordinates): Map<string, any> {
    let areaMap = new Map<string, any>();
    // Discret values only -> should round floor
    let maxIter = Math.floor(targetAreaSize);
    for (let xIter: number = -1 * maxIter; xIter <= maxIter; xIter++) {
      for (let yIter: number = -1 * maxIter; yIter <= maxIter; yIter++) {
        // c = sqrt(a^2+b^2)
        let distance = Math.sqrt(xIter * xIter + yIter * yIter);
        // skip ranges bigger then max range
        if (distance > targetAreaSize) {
          continue;
        }

        let key: string = "" + (targetSector.x + xIter) + "," + (targetSector.y + yIter);
        areaMap.set(key, {});
      }
    }

    return areaMap;
  }

  static getTargetAreaMap(targetAreaSize: number, targetSector: iCoordinates, targetAreaType: "Square" | "Circle" = "Square") {
    let areaMap: Map<string, {}>;
    switch (targetAreaType) {
      case "Circle":
        areaMap = ScanDllAction.getTargetAreaCircleMap(targetAreaSize, targetSector);
        break;
      case "Square":
        areaMap = ScanDllAction.getTargetAreaSquareMap(targetAreaSize, targetSector);
        break;
      default:
        areaMap = ScanDllAction.getTargetAreaSquareMap(targetAreaSize, targetSector);
        break;
    }

    return areaMap;
  }

  static inArea(
    fleetAccount: Fleet,
    targetAreaSize: number,
    targetSector: iCoordinates,
    targetAreaType: "Square" | "Circle" = "Square"
  ): { status: boolean; areaMap?: Map<string, any>; currentSectorKey?: string } {
    if (fleetAccount.state.Idle) {
      let areaMap: Map<string, {}> = ScanDllAction.getTargetAreaMap(targetAreaSize, targetSector, targetAreaType);

      let currentSectorKey = ScanDllAction.sectorToSectorKey(fleetAccount.state.Idle.sector);

      return { status: areaMap.get(currentSectorKey) ? true : false, areaMap: areaMap, currentSectorKey: currentSectorKey };
    }

    return { status: false };
  }

  static async onSector(fleetAccount: Fleet, scanConfig: iScanConfig): Promise<boolean> {
    if (!(fleetAccount.state.Idle || fleetAccount.state.MoveWarp || fleetAccount.state.MoveSubwarp)) {
      return false; // Can throw error - those should not happen in when refill is active couse the bussy state is true, or moving
    }

    let currentSector = new Coordinates(0, 0);
    if (fleetAccount.state.Idle) {
      currentSector = new Coordinates(Number(fleetAccount.state.Idle.sector[0]), Number(fleetAccount.state.Idle.sector[1]));
    } else if (fleetAccount.state.MoveWarp) {
      currentSector = new Coordinates(Number(fleetAccount.state.MoveWarp.toSector[0]), Number(fleetAccount.state.MoveWarp.toSector[1]));
    } else if (fleetAccount.state.MoveSubwarp) {
      currentSector = new Coordinates(
        Number(fleetAccount.state.MoveSubwarp.toSector[0]),
        Number(fleetAccount.state.MoveSubwarp.toSector[1])
      );
    }

    return Boolean(scanConfig.scanSector?.equals(currentSector));
  }

  static sectorToSectorKey(sector: BN[]) {
    return "" + Number(sector[0]) + "," + +Number(sector[1]);
  }

  /**
   *  has Toilkits to scan
   * @deprecated - old version - look hasFood
   *
   * @param dispatcher
   * @param fleetAccount
   * @returns Promise<number> - which is posible scan amounts
   */
  static async hasToolkits(fleetAccount: Fleet, toolkitsAmount: number): Promise<Number> {
    //@ts-ignore scanRepairKitAmount - - amount exists as type never
    let scanCounts = (toolkitsAmount || 0) / Number(fleetAccount.data.stats.miscStats.scanRepairKitAmount);
    // Can Scan ?
    // if (scanCounts >= 1) {
    //   return true;
    // } else {
    //   return false;
    // }
    return Math.floor(scanCounts);
  }

  /**
   *  has Food to scan
   * @param dispatcher
   * @param fleetAccount
   * @returns Promise<number> - which is posible scan amounts
   */
  static async hasFood(fleetAccount: Fleet, foodAmount: number): Promise<Number> {
    // @ts-ignore scanCost - amount exists - type never
    let foodCost = Number(fleetAccount.data.stats.miscStats.scanCost);

    let scanCounts = foodCost ? (foodAmount || 0) / foodCost : 1;

    // Can Scan ?
    // if (scanCounts >= 1) {
    //   return true;
    // } else {
    //   return false;
    // }
    return Math.floor(scanCounts);
  }

  // Check Cooldown
  static isCooldownLoaded(fleetAccount: Fleet) {
    if ((Number(fleetAccount.data.scanCooldownExpiresAt || 0) + 1) * 1000 > new Date().getTime()) {
      return false;
    }
    return true;
  }
}
