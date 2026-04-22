import { SimulatedTransactionResponse, TransactionInstruction } from "@solana/web3.js";
import { InstructionReturn } from "@staratlas/data-source";
import { Action, iSimpleAction } from "./Action";
import { FleetProcess as Process } from "./FleetProcess";
import { iQueueItem } from "./Queue";
import { Coordinates, iCoordinates } from "./MoveAction";
import { clone } from "lodash";
import Dispatcher, { DispatcherParsedTransactionWithMeta } from "./Dispatcher";
import { BN } from "@staratlas/anchor";

/**
 * Implements Transfer Crew fleet action
 *
 */
export class CleanupCargoPodsAction extends Action implements iSimpleAction {
  static accumulatedTransactionCost = 0;
  static accumulatedRunTime = 0;
  static transactionsCount: number = 1;
  sector: iCoordinates;
  constructor(process: Process, sector = new Coordinates(0, 0)) {
    super(process);
    this.sector = clone(sector);
  }

  accumulateFees() {
    this.results.execution.forEach((trx) => {
      //@ts-ignore
      this.results.transactionFees += trx?.meta?.fee || 0;
      CleanupCargoPodsAction.accumulatedTransactionCost += this.results.transactionFees || 0;
    });

    CleanupCargoPodsAction.accumulatedRunTime += this.results.runTime || 0;
    super.accumulateFees();
  }

  async getQueueItem(executionTime: number = new Date().getTime()): Promise<iQueueItem<Action>> {
    return {
      action: this, // this.run will be executed by the queue processor
      execTime: executionTime, // Time to call exit warp
      // Action after execution // Could contain validations
      next: async (process: Process) => {
        return process.forward(); // go back to process chain forwarding
      },
    } as iQueueItem<Action>;
  }
  /**
   * Provide Dock InstructionReturn[]
   * @returns
   */
  async getInstructionsReturns(): Promise<InstructionReturn[]> {
    const fleetAccount = await this.process.fetchFleetAccount();
    let starbase = fleetAccount.state.StarbaseLoadingBay?.starbase;
    if (!starbase) {
      let sector = await this.dispatcher.sageFleetHandler.getCurrentSector(fleetAccount);
      starbase = await this.dispatcher.sageGameHandler.getStarbaseAddress([new BN(sector.x), new BN(sector.y)]);
    }
    if (starbase) {
      this.dispatcher.logger.log("---------- * TransferCargo::Execute * ------------");

      let cleanupInstructions = await this.dispatcher.sageGameHandler.ixCleanUpStarbaseCargoPods(
        starbase,
        this.dispatcher.sageGameHandler.getFleetPlayerProfile(fleetAccount),
        this.dispatcher.signer.as,
        this.dispatcher.funderPermissionIdex,
      );
      this.dispatcher.logger.log("---------- * TransferCargo::Execute * ------------");
      this.dispatcher.logger.log("POD CLEANUPS ", cleanupInstructions.length);
      this.dispatcher.logger.log("---------- * TransferCargo::Execute * ------------");
      if (cleanupInstructions && cleanupInstructions.length > 0) {
        return cleanupInstructions;
      }
    }

    return [];
  }

  /**
   * Provide Dock TransactionInstruction[]
   * @returns
   */
  async getInstructions(): Promise<TransactionInstruction[]> {
    return this.dispatcher.sageGameHandler.convertInstructionReturnToTransactionInstruction(this.dispatcher.signer.as, await this.getInstructionsReturns());
  }

  async execute(): Promise<Array<DispatcherParsedTransactionWithMeta | SimulatedTransactionResponse | undefined>> {
    try {
      let rx = await this.dispatcher.signAndSend(await this.getInstructionsReturns(), true, this.priorityFeeConfig || undefined, {
        retryOnTimeout: false,
        continueOnError: true,
      }); // send empty transaction to avoid 'Transaction too old' error on long operations
      this.dispatcher.logger.log("Pod Cleanup transaction", rx.length);
      return rx;
    } catch (e) {
      this.dispatcher.logger.error("Pod Cleanup transaction", String(e)); // cut long error messages
    }

    return [];
  }

  async display(verbose = false): Promise<string> {
    let display = `CleanupCargoPodsActions: T<${this.getTransactionCount()}>` + (this.sector ? ` sector: ${this.sector.toSectorKey()} ` : "");
    verbose && this.process.logger.info(display);

    return display;
  }

  getTransactionCount() {
    return CleanupCargoPodsAction.transactionsCount;
  }

  /**@inheritdoc */
  async export(type: string = "", data: any = {}): Promise<string> {
    return await Action.prototype.export.bind(this)(type, {
      sector: this.sector,
      ...data,
    });
  }
}
