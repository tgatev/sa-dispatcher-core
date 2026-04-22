import { SimulatedTransactionResponse, TransactionInstruction } from "@solana/web3.js";
import { InstructionReturn } from "@staratlas/data-source";
import { Action, iSimpleAction } from "./Action";
import { FleetProcess as Process } from "./FleetProcess";
import { iQueueItem } from "./Queue";
import { Coordinates, iCoordinates } from "./MoveAction";
import { clone } from "lodash";
import { DispatcherParsedTransactionWithMeta } from "./Dispatcher";
import { iError } from "../Error/ErrorHandlers";
import { formatTimePeriod } from "../utils";
import { RepairDockedFLeetAction } from "./RepairDockedFLeetAction";
import { TransferCargoAction } from "./TransferCargoAction";
import { log } from "../Common/PatchConsoleLog";
/**
 * Implements undock fleet action
 */
export class RespawnToLoadingBayAction extends Action implements iSimpleAction {
  static accumulatedTransactionCost = 0;
  static accumulatedRunTime = 0;
  static transactionsCount: number = 1;
  sector: iCoordinates;
  constructor(
    process: Process,
    public awaitRespawn: boolean = true,
    sector = new Coordinates(0, 0),
  ) {
    super(process);
    this.sector = clone(sector);
  }
  async getQueueItem(): Promise<iQueueItem<Action>> {
    let item = {
      action: this,
      execTime: new Date().getTime(),
      next: async (process: Process) => {
        // After fleet is un-docked - then continue processing
        return process.forward();
      },
    } as iQueueItem<Action>;

    return item;
  }
  async validate(): Promise<boolean | iError> {
    let fa = await this.process.fetchFleetAccount();

    if (this.awaitRespawn) {
      let cds = await this.dispatcher.sageFleetHandler.getCooldown(fa);
      if (cds.respawnCD > 0) {
        // new Promise((r) => setTimeout(r, cds.respawnCD * 1000));
        this.waitBeforeExecute = (cds.respawnCD + 0.1) * 1000;
      }
    }
    return true;
  }
  async execute(): Promise<Array<DispatcherParsedTransactionWithMeta | SimulatedTransactionResponse | undefined>> {
    let rx = await this.dispatcher.signAndSend(await this.getInstructionsReturns(), true, this.priorityFeeConfig, {
      // retryOnTimeout [OR ERROR]: async (d, e) => {
      retryOnTimeout: async (d, e) => {
        // Check 'e' for validation state error -> handle state
        // await new Promise((resolve) => setTimeout(resolve, 2000));
        this.waitTimeProgress(2000, this.process.fleetName + " txERR Before Verify " + formatTimePeriod(2), 500);
        return !(await this.verifyExecution({ error: e }));
      },
      continueOnError: true,
      retry_wait_time: 60, // Define higher wait time [ 60+sec ] for retry to allow for respawn to happen, witout info for respawn time we will repeat many times until respawn happens, and we want to avoid that
      signals: this.signals,
    });

    return rx;
  }

  /**
   * Provide Undock InstructionReturn[]
   *
   * @returns
   */
  async getInstructionsReturns(): Promise<InstructionReturn[]> {
    let fa = await this.process.fetchFleetAccount();
    if (!fa.state.Respawn) {
      return [];
    }

    return await this.dispatcher.sageFleetHandler.ixRespawnFleet(fa, this.dispatcher.signer.as, this.dispatcher.funderPermissionIdex);
  }

  /**
   * Provide Undock TransactionInstruction[]
   * @returns
   */
  async getInstructions(): Promise<TransactionInstruction[]> {
    return this.dispatcher.sageGameHandler.convertInstructionReturnToTransactionInstruction(
      this.process.dispatcher.signer.as,
      await this.getInstructionsReturns(),
    );
  }

  accumulateFees() {
    this.results.execution.forEach((trx) => {
      //@ts-ignore
      this.results.transactionFees += trx?.meta?.fee || 0;
      RespawnToLoadingBayAction.accumulatedTransactionCost += this.results.transactionFees || 0;
    });

    RespawnToLoadingBayAction.accumulatedRunTime += this.results.runTime || 0;
    super.accumulateFees();
  }

  async display(verbose = false): Promise<string> {
    let display = `RespawnToLoadingBay: T<${this.getTransactionCount()}> ` + (this.sector ? `sector: ${this.sector.toSectorKey()} ` : "");
    verbose && this.process.logger.info(display);

    return display;
  }

  getTransactionCount() {
    return RespawnToLoadingBayAction.transactionsCount;
  }

  // @ts-ignore args not used
  async verifyExecution(args: any): Promise<boolean> {
    // let fa = await this.process.fetchFleetAccount();
    // if (fa.state.StarbaseLoadingBay) {
    //   return true;
    // } else {
    //   return false;
    // }
    return true; // For now return true to avoid blocking process in case of error, but ideally should check if fleet is undocked and in loading bay
  }

  /**@inheritdoc */
  async export(type: string = "", data: any = {}): Promise<string> {
    return await Action.prototype.export.bind(this)(type, { sector: this.sector, ...data });
  }
}

/**
 * Handle respawn to loading bay action - wait for respawn if needed, then undock and optionally refuel and repair
 * @param withRefuel - whether to refuel after respawn, default true
 * @returns
 * @param process
 * @param param1
 */
export async function handleRespawnToLoadingBayAction(
  pro: Process,
  { withRefuel, awaitingSleepTime }: { withRefuel: boolean; awaitingSleepTime?: number } = { withRefuel: true, awaitingSleepTime: 60 },
): Promise<void> {
  let fa = await pro.fetchFleetAccount();
  let awaitRespawn = true; // We will handle it manually
  if (awaitingSleepTime == undefined || awaitingSleepTime <= 0) {
    awaitingSleepTime = 60;
  }

  let fs = fa.state;
  console.error("handleRespawnToLoadingBayAction: Fleet state before respawn ", fs, fs.Respawn);
  if (!!fs.Respawn) {
    console.error("handleRespawnToLoadingBayAction: YES YES YES  ", fs.Respawn);

    try {
      let action = new RespawnToLoadingBayAction(pro, false);

      while (awaitRespawn) {
        let res = await action.run().catch((e) => {
          pro.logger.err("Error in handleRespawnToLoadingBayAction: " + (e as Error).message);
          return false;
        });
        let a = await pro.fetchFleetAccount();

        if (!a.state.Respawn) {
          awaitRespawn = false;
          break;
        }

        if (awaitingSleepTime) {
          await action.waitTimeProgress(awaitingSleepTime * 1000, pro.fleetName + " waiting for respawn ");
        }
      }
    } catch (e) {
      pro.logger.err("Error in handleRespawnToLoadingBayAction: " + (e as Error).message);
    }
    try {
      // minRepair ammount
      await new RepairDockedFLeetAction(pro, 2).run();

      if (withRefuel) {
        await new TransferCargoAction(pro, [
          { isImportToFleet: true, cargoType: "fuelTank", resourceName: "fuel", amount: "max" },
          { isImportToFleet: true, cargoType: "ammoBank", resourceName: "ammunitions", amount: "max" },
        ]).run();
      }
    } catch (e) {
      pro.logger.err("Error in refuel/repair after respawn in handleRespawnToLoadingBayAction: " + (e as Error).message);
    }
  }
}
