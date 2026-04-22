import { BN } from "@project-serum/anchor";
import { ParsedTransactionWithMeta, PublicKey, SimulatedTransactionResponse } from "@solana/web3.js";
import { Fleet } from "@staratlas/sage-main";
import { isNumber } from "lodash";
import { SageGameHandler } from "../..";
import { Action } from "./Action";
import { DockAction } from "./DockAction";
import { iCoordinates } from "./MoveAction";
import { FleetProcess as Process } from "./FleetProcess";
import { iCargoTransferData, TransferCargoAction } from "./TransferCargoAction";
import { UnDockAction } from "./UndockAction";
import { WarpAction } from "./WarpAction";
import { SubwarpAction } from "./SubwarpAction";
import { BASE_SCAN_CONFIG, ScanAction } from "./ScanAction";
import Dispatcher, { DispatcherParsedTransactionWithMeta } from "./Dispatcher";

export interface iTransferStarbaseConfig {
  fuelCost: number | "max";
  coordinates: iCoordinates;
  recourseList: Map<PublicKey, number>;
  publicKey?: PublicKey;
  cargoPod?: PublicKey;
  sbPlayerKey?: PublicKey;
  cargoLoadMode?: "heavy-to-light" | "light-to-heavy" | Map<PublicKey, number>;
  fuelTank?: "reload" | "unload";
  ammoBank?: "reload" | "unload";
}
export interface iTransportConfig {
  sb1: iTransferStarbaseConfig;
  sb2: iTransferStarbaseConfig;
  path: iCoordinates[];
  movementMode: "Warp" | "SubWarp" | "Hybrid" | "WarpScan";
  maxIterations?: number;
}

/**
 * Transport action define two directional model to transfer cargo
 *    from Starbase 1 to Starbase 2 trough a Fleet
 * Support 2 directional cargo load configuration.
 * Expect:
 *    Path[] of coordinates where First and last points are the Starbase coordinates,
 *    Configuration for cargo feeling onn each starbase,
 *    Fuel reloading configuration.
 *
 *
 * {
 *   sb1: {
 *     coordinates: { x: 40, y: 30 },
 *     recourseList: new Map<PublicKey, number>()
 *      .set(me.SAGE_RESOURCES_MINTS["toolkit"], 500000)
 *      .set(me.SAGE_RESOURCES_MINTS["fuel"], 50000)
 *      .set(me.SAGE_RESOURCES_MINTS["power_source"], 50000),
 *    fuelCost: "max",
 *    fuelTank: "reload",
 *    ammoBank: "reload",
 *    // cargoLoadMode: "heavy-to-light",
 *    cargoLoadMode: new Map<PublicKey, number>()
 *      .set(me.SAGE_RESOURCES_MINTS["toolkit"], 60)
 *      .set(me.SAGE_RESOURCES_MINTS["fuel"], 30)
 *      .set(me.SAGE_RESOURCES_MINTS["power_source"], 10),
 *  } as iTransferStarbaseConfig,
 *  sb2: {
 *    coordinates: { x: 49, y: 20 },
 *    recourseList: new Map<PublicKey, number>()
 *      .set(me.SAGE_RESOURCES_MINTS["polymer"], 500000)
 *      .set(me.SAGE_RESOURCES_MINTS["power_source"], 50000),
 *    fuelCost: 1000,
 *    fuelTank: "unload",
 *    ammoBank: "unload",
 *  },
 *  path: [
 *    { x: 40, y: 30 },
 *    { x: 45, y: 25 },
 *    { x: 49, y: 20 },
 *  ],
 *  movementMode: "Hybrid",
 */
var isOdd = function (x: number) {
  return x & 1;
};
var isEven = function (x: number) {
  return !(x & 1);
};
export class TransportAction extends Action {
  config: iTransportConfig;
  buildStatus: boolean = false;
  constructor(process: Process, config: iTransportConfig) {
    super(process);
    this.config = config;
    this.waitBeforeExecute = 2;
    this.validateCargoModePercents(this.config.sb1);
    this.validateCargoModePercents(this.config.sb2);
  }

  async build(): Promise<boolean> {
    if (!this.buildStatus) {
      // fetch cargo pods
      await this.fetchStarbasePublicKey(this.config.sb1);
      await this.fetchStarbasePublicKey(this.config.sb2);
    }

    this.buildStatus = true;
    return true;
  }

  async fetchStarbasePublicKey(sb: iTransferStarbaseConfig): Promise<void> {
    if (!sb.cargoPod) {
      let fleetAccount = await this.process.fetchFleetAccount();
      sb.cargoPod = await this.dispatcher.sageGameHandler.getStarbaseCargoPod(fleetAccount.data.ownerProfile, [
        new BN(sb.coordinates.x),
        new BN(sb.coordinates.y),
      ]);
    }
  }

  /**
   * Validate cargo loading percentages dividing between resources
   */
  validateCargoModePercents(sb: iTransferStarbaseConfig) {
    if (sb.cargoLoadMode && "string" !== typeof sb.cargoLoadMode) {
      let sum: number = 0;
      for (let iterator of sb.cargoLoadMode) {
        sum += Number(sb.cargoLoadMode.get(iterator[0]));
        if (sum > 100) {
          throw "Percentage could not be more then 100.";
        }
      }
    }
  }

  /**
   * Active generation of iCargoTransferData - respond to the need of transportation task
   *  sb.Config examples:
   *
   * Load resources by weight cargoLoadMode = "heavy-to-light"||"light-to-heavy"   
   * 
   * let me = SageGameHandler.asStatic();
    sb1: {
      coordinates: { x: 40, y: 30 },
      recourseList: new Map<PublicKey, number>()
        .set(me.SAGE_RESOURCES_MINTS["toolkit"], 500000)
        .set(me.SAGE_RESOURCES_MINTS["fuel"], 50000)
        .set(me.SAGE_RESOURCES_MINTS["power_source"], 50000),
      fuelCost: 35000,
      cargoLoadMode: "heavy-to-light", // Default Mode if missing in the definition
    }

   * 
   * Load By Percentage configuration cargoLoadMode: new Map<PublicKey, number>
   *    cargoLoadMode - should contain the same amount of mints and the same mints  
    
    sb: {
      coordinates: { x: 40, y: 30 },
      recourseList: new Map<PublicKey, number>()
        .set(me.SAGE_RESOURCES_MINTS["toolkit"], 500000)
        .set(me.SAGE_RESOURCES_MINTS["fuel"], 50000)
        .set(me.SAGE_RESOURCES_MINTS["power_source"], 50000),
      fuelCost: 35000,
      cargoLoadMode: new Map<PublicKey, number>()
        .set(me.SAGE_RESOURCES_MINTS["toolkit"], 60)
        .set(me.SAGE_RESOURCES_MINTS["fuel"], 30)
        .set(me.SAGE_RESOURCES_MINTS["power_source"], 10),
    }
   *
   */
  static async generateCargoLoadToFleet(proc: Process, sb: iTransferStarbaseConfig): Promise<iCargoTransferData[]> {
    let fleetAccount = proc.fleetAccount as Fleet;
    let instructions: iCargoTransferData[] = [];
    let weights = proc.dispatcher.sageGameHandler.recourseWight;
    let sGH = proc.dispatcher.sageGameHandler;

    // @ts-ignore sb.cargo pod prebuild in build
    let starbaseTokenAmounts = await sGH.getAmountsByMints(sb.cargoPod);
    let freeSpaces = await proc.dispatcher.sageFleetHandler.getFleetFreeCargoSpaces(fleetAccount);
    switch (sb.cargoLoadMode) {
      case undefined:
      case "heavy-to-light":
        {
          let sorted = new Map<PublicKey, number>(
            [...sb.recourseList.entries()].sort((a, b) => {
              return Number(weights.get(b[0])) - Number(weights.get(a[0]));
            })
          );
          sorted.forEach((val: number, mint: PublicKey) => {
            let res = buildInstruction(mint, sb, freeSpaces.cargoHold);
            if (res?.length === 3) {
              instructions.push(res[0] as iCargoTransferData);
              freeSpaces.cargoHold -= Number(res[1]);
            }
          });
        }
        break;
      case "light-to-heavy":
        {
          {
            let sorted = new Map<PublicKey, number>(
              [...sb.recourseList.entries()].sort((a, b) => {
                return Number(weights.get(a[0])) - Number(weights.get(b[0]));
              })
            );

            sorted.forEach((val: number, mint: PublicKey) => {
              let res = buildInstruction(mint, sb, freeSpaces.cargoHold);
              if (res?.length === 3) {
                instructions.push(res[0] as iCargoTransferData);
                freeSpaces.cargoHold -= Number(res[1]);
              }
            });
          }
        }
        break;
      default:
        if (typeof sb.cargoLoadMode === "object") {
          if (sb.cargoLoadMode.size === sb.recourseList.size) {
            sb.recourseList.forEach((maxValueToTransport: number, mint: PublicKey) => {
              // @ts-ignore .cargoCapacity type never
              let res = buildInstruction(mint, sb, fleetAccount.data.stats.cargoStats.cargoCapacity);

              if (res?.length === 3) {
                instructions.push(res[0] as iCargoTransferData);
                // Update free space
                freeSpaces.cargoHold -= Number(res[1]);
              }
            });
          } else {
            throw new Error("cargoLoadMode Map definition is not the same size as resourceList map.");
          }
        } else {
          throw new Error("Unknown cargoLoadMode.");
        }
        break;
    }
    // helper method TODO: move on more accessible place // Make Static
    function buildInstruction(_mint: PublicKey, _sb: iTransferStarbaseConfig, cargoSpaceToFill: number) {
      //@ts-ignore .cargoCapacity detected as never
      let maxLoad = cargoSpaceToFill / (weights.get(_mint.toBase58()) || 1);
      let maxTokenAmount = starbaseTokenAmounts.get(_mint.toBase58());

      // Fix issue: starbaseTokenAmounts.get(_mint) always return undefined <WTF>
      for (const key of starbaseTokenAmounts.keys()) {
        if (_mint.equals(new PublicKey(key))) {
          Dispatcher.Logger.crit(sGH.getResourceNameByMint(_mint), key.toString(), starbaseTokenAmounts.get(key));
          maxTokenAmount = starbaseTokenAmounts.get(key);
        }
      }
      if (!maxTokenAmount) {
        return;
      }
      // % percent of cargo load definition is a % prom CargoCapacity existing free space
      if (typeof sb.cargoLoadMode === "object") {
        maxLoad *= (sb.cargoLoadMode.get(_mint) || 1) / 100;
      }
      maxLoad = Math.floor(maxLoad);
      if (maxLoad && maxTokenAmount) {
        // Check amount in starbase and get the existing or highest amount
        maxLoad = maxLoad <= maxTokenAmount ? maxLoad : maxTokenAmount;
        if (maxLoad > 0) {
          // Update max resource to transport - at the and of task should be 0
          _sb.recourseList.set(_mint, Number(sb.recourseList.get(_mint) || 0) - Number(maxLoad));
          return [
            {
              isImportToFleet: true,
              amount: maxLoad,
              cargoType: "cargoHold",
              resourceName: sGH.getResourceNameByMint(_mint),
              // condition: { whenLessThen: sb.fuelCost }, - to dod - think about conditional loading usage for optimization
              //   for  less transactions on short distance or withMoreThen condition
            } as iCargoTransferData,
            // Weight
            maxLoad * (weights.get(_mint) || 1),
            // Amount of loaded resource
            maxLoad,
          ];
        }
      }
    }
    return instructions;
  }
  // Todo Make Static
  async unloadCargo(sb: iTransferStarbaseConfig) {
    let fleetAccount = await this.process.fetchFleetAccount();

    if (!fleetAccount?.state.StarbaseLoadingBay) {
      throw Error("Wrong state, cant unload cargo. State: " + fleetAccount?.state);
    }

    let tokenAmounts = await this.dispatcher.sageGameHandler.getAmountsByMints(fleetAccount?.data.cargoHold as PublicKey);

    let instructions: iCargoTransferData[] = [];

    if (sb.fuelTank && sb.fuelTank === "unload") {
      instructions.push({
        isImportToFleet: false,
        resourceName: "fuel",
        amount: "max",
        cargoType: "fuelTank",
      });
    }

    if (sb.ammoBank && sb.ammoBank === "unload") {
      instructions.push({
        isImportToFleet: false,
        resourceName: "ammunitions",
        amount: "max",
        cargoType: "ammoBank",
      });
    }

    let unloadedAmount = 0;
    tokenAmounts.forEach((amount: number, mint: string) => {
      if (amount) {
        instructions.push({
          isImportToFleet: false,
          resourceName: this.dispatcher.sageGameHandler.getResourceNameByMint(new PublicKey(mint)),
          amount: amount,
        });
        unloadedAmount += amount;
      }
    });
    this.process.logger.crit("Unload Instruction:", instructions);
    await new TransferCargoAction(this.process, instructions).run();

    return unloadedAmount;
  }

  /**
   * On Each cycle there is different amount of resources
   * depending of amount in cargo hold
   */
  generateFuelReloadInstruction(sb: iTransferStarbaseConfig | { fuelCost: number }): iCargoTransferData {
    //@ts-ignore .fuelCapacity type never
    let capacity = this.process.fleetAccount?.data.stats.cargoStats.fuelCapacity as Number;
    let transferData: iCargoTransferData = {
      isImportToFleet: true,
      amount: sb.fuelCost ? sb.fuelCost : "max",
      cargoType: "fuelTank",
      resourceName: "fuel",
      condition: { whenLessThen: Number(sb.fuelCost && isNumber(sb.fuelCost) ? sb.fuelCost : capacity) },
    };

    return transferData;
  }

  /**
   * On Each cycle there is different amount of resources
   * depending of amount in cargo hold
   */
  generateAmmoReloadInstruction(sb: iTransferStarbaseConfig): iCargoTransferData {
    let transferData: iCargoTransferData = {
      isImportToFleet: sb.ammoBank === "reload" ? true : false,
      amount: "max",
      cargoType: "ammoBank",
      resourceName: "ammunitions",
    };
    return transferData;
  }

  // Execute CargoLoading to fleet
  async loadCargo(sb: iTransferStarbaseConfig) {
    // Load defined spaces
    this.process.fetchFleetAccount();
    let instructions: iCargoTransferData[] = [];

    if (sb.fuelTank) instructions.push(await this.generateFuelReloadInstruction(sb));
    if (sb.ammoBank) instructions.push(await this.generateAmmoReloadInstruction(sb));
    let cargoLoad = await TransportAction.generateCargoLoadToFleet(this.process, sb);

    this.process.logger.crit("Load Cargo Instruction:", [...instructions, ...cargoLoad]);
    await new TransferCargoAction(this.process, [...instructions, ...cargoLoad]).run();
  }

  // Get total number left ro transfer (sum from starbase 1 to starbase 2 )
  getTotalLeftToTransfer() {
    let leftToTransfer: number = 0;
    this.config.sb1.recourseList.forEach((v) => {
      leftToTransfer += v;
    });
    this.config.sb2.recourseList.forEach((v) => {
      leftToTransfer += v;
    });

    return leftToTransfer;
  }

  async execute(): Promise<Array<DispatcherParsedTransactionWithMeta | SimulatedTransactionResponse | undefined>> {
    // Validate pre Build
    if (!this.buildStatus) {
      await this.build();
    }

    // Get Data from starbase 1, and starbase 2
    let leftToTransfer: number = this.getTotalLeftToTransfer();
    // Prepare Unloaded Cargo At the beginning
    await this.unloadCargo(this.config.sb1);
    let start = this.config.sb1,
      end = this.config.sb2;
    let iteratoins = 0;
    while (leftToTransfer > 0) {
      iteratoins += 0.5;
      this.process.logger.crit("-------------------- LeftTo Transfer SB1:", leftToTransfer);
      for (let pathIterator = 0; pathIterator < this.config.path.length; pathIterator++) {
        this.process.logger.crit("--------------------Actions Iterator", pathIterator, "Length", this.config.path.length);
        switch (pathIterator) {
          case 0: {
            // Load Cargo on starbase(1|2)
            this.process.logger.crit(" ------- Load Cargo ");
            await this.loadCargo(start);
            await new UnDockAction(this.process).run();
            break;
          }
          case this.config.path.length - 1: {
            switch (this.config.movementMode) {
              case "SubWarp": {
                await new SubwarpAction(this.process, this.config.path[pathIterator]).run();
                break;
              }
              case "WarpScan":
              case "Hybrid": {
                //if path.length is odd should on last element use subwarp
                if (isOdd(this.config.path.length)) {
                  await new SubwarpAction(this.process, this.config.path[pathIterator]).run();
                } else {
                  await new WarpAction(this.process, this.config.path[pathIterator]).run();
                }
                break;
              }
              case "Warp": {
                await new WarpAction(this.process, this.config.path[pathIterator]).run();
                break;
              }

              default:
                break;
            }
            this.process.logger.crit(" ------- Dock ");
            await new DockAction(this.process).run();
            this.process.logger.crit(" ------- Unload Cargo Cargo ");
            // Unload Cargo at the end of the path
            await this.unloadCargo(end);
            // on Last Coordinates the last becomes as first

            this.process.logger.crit(" ------- Reverse Path ");
            [start, end, this.config.path] = [end, start, this.config.path.reverse()];
            break;
          }
          default: {
            this.process.logger.crit(" ------- Default to move");
            switch (this.config.movementMode) {
              case "Warp":
                {
                  await new WarpAction(this.process, this.config.path[pathIterator]).run();
                }
                break;
              case "Hybrid": {
                await new WarpAction(this.process, this.config.path[pathIterator]).run();
                pathIterator += 1; // get next turn in path
                await new SubwarpAction(this.process, this.config.path[pathIterator]).run();
                break;
              }
              case "WarpScan": {
                // Move to coordinates

                await new WarpAction(this.process, this.config.path[pathIterator]).run();
                let warpCD = 0,
                  timestamp = 0,
                  scanCD = 0;

                this.process.logger.crit("Warp Scan on step:", pathIterator);
                // Till waiting Movement is on cooldown should scan
                do {
                  let fleetAccount = await this.process.fetchFleetAccount();
                  warpCD = fleetAccount.data.warpCooldownExpiresAt.toNumber();
                  scanCD = fleetAccount.data.scanCooldownExpiresAt.toNumber();
                  timestamp = new Date().getTime() / 1000;

                  // Wait Until scan or warp cooldown expire and update timestamp
                  let minCD = Math.min(warpCD, scanCD);
                  if (minCD > timestamp) {
                    this.process.logger.crit("Wait: ", minCD - timestamp);
                    await new Promise((resolve) => setTimeout(resolve, (minCD - timestamp) * 1000));
                    timestamp = new Date().getTime() / 1000;
                  }

                  let toolkitAmount = await this.dispatcher.sageGameHandler.getTokenAccountMintAmount(
                    fleetAccount.data.cargoHold,
                    this.dispatcher.sageGameHandler.asStatic().SAGE_RESOURCES_MINTS["toolkit"]
                  );
                  // @ts-ignore
                  let scanAmount = fleetAccount.data.stats.miscStats.scanRepairKitAmount;
                  this.process.logger.crit("Toolkit Amount:", toolkitAmount);
                  this.process.logger.crit("Toolkit To Scan:", scanAmount);

                  // If scan cooldown expires then scan
                  if (timestamp >= scanCD && !fleetAccount.state.StarbaseLoadingBay) {
                    // ScanCD Loaded
                    if (toolkitAmount > scanAmount) {
                      let scanConfig = BASE_SCAN_CONFIG;
                      await new ScanAction(this.process, scanConfig).run();
                    }
                  }

                  timestamp = new Date().getTime() / 1000;
                } while (warpCD > timestamp);
                break;
              }

              // In case of more then 2 points to enter
              case "SubWarp":
              // SubWarp as default movement type
              default: {
                await new SubwarpAction(this.process, this.config.path[pathIterator]).run();
                break;
              }
            }
            break;
          }
        }
        this.process.logger.crit("--------------------Actions Iterator END", pathIterator);
        // if (pathIterator > 0) throw "Exit 0" + pathIterator;
      }
      // update iterator
      this.process.logger.crit("-------------------- LeftTo Transfer SB1 END:", leftToTransfer);
      if (this.config.maxIterations && this.config.maxIterations <= iteratoins) {
        // count of courses achieved no matter transferred resources
        break;
      } else {
        leftToTransfer = this.getTotalLeftToTransfer();
      }
    }
    // ( maxW = X*distance )
    // | coefficient = MaxW /Distance
    // | max Warp Distance = sqrt( sqr(coefficient*(sb1(x) - sb2(X))) + sqr(coefficient*(sb1(Y) - sb2(Y))))

    return [];
  }
}
