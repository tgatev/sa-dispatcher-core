import { SimulatedTransactionResponse, TransactionInstruction } from "@solana/web3.js";
import { InstructionReturn } from "@staratlas/data-source";
import { Action, iSimpleAction } from "./Action";
import { FleetProcess as Process } from "./FleetProcess";
import { iQueueItem } from "./Queue";
import { Coordinates, iCoordinates } from "./MoveAction";
import { clone } from "lodash";
import { DispatcherParsedTransactionWithMeta } from "./Dispatcher";

/**
 * Implements dock dleet action
 *
 */
export class DisbandAction extends Action implements iSimpleAction {
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
      DisbandAction.accumulatedTransactionCost += this.results.transactionFees || 0;
    });

    DisbandAction.accumulatedRunTime += this.results.runTime || 0;
    super.accumulateFees();
  }

  async getQueueItem(executionTime: number = new Date().getTime()): Promise<iQueueItem> {
    return {
      action: this, // this.run will be executed by the queue processor
      execTime: executionTime, // Time to call exit warp
      // Action after execution // Could contain validations
      next: async (process: Process) => {
        return process.forward(); // go back to process chain forwarding
      },
    } as iQueueItem;
  }
  /**
   * Provide Dock InstructionReturn[]
   * @returns
   */
  async getInstructionsReturns(): Promise<InstructionReturn[]> {
    // let instructions = await this.handleExitMovement();
    let instructions = await this.dispatcher.sageFleetHandler.ixFleetStateStarbaseHandler(this.process.fleetPubkey!);
    instructions = instructions.concat(
      await this.dispatcher.sageFleetHandler.ixDisbandFleet(
        await this.process.fetchFleetPublicKey(),
        this.process.dispatcher.signer.as,
        this.dispatcher.funderPermissionIdex
      )
    );
    throw "DDD";
    return instructions;
  }

  /**
   * Provide Dock TransactionInstruction[]
   * @returns
   */
  async getInstructions(): Promise<TransactionInstruction[]> {
    return this.dispatcher.sageGameHandler.convertInstructionReturnToTransactionInstruction(
      this.process.dispatcher.signer.as,
      await this.getInstructionsReturns()
    );
  }

  async execute(): Promise<Array<DispatcherParsedTransactionWithMeta | SimulatedTransactionResponse | undefined>> {
    let rx = await this.dispatcher.signAndSend(await this.getInstructionsReturns(), false, this.priorityFeeConfig, {
      retryOnTimeout: async () => {
        await new Promise((resolve) => setTimeout(resolve, 4000));
        return !(await this.verifyExecution({}));
      },
      signals: this.signals,
    });
    return rx;
  }

  async display(verbose = false): Promise<string> {
    let display = `Disband: T<${this.getTransactionCount()}>` + (this.sector ? ` sector: ${this.sector.toSectorKey()} ` : "");
    verbose && this.process.logger.info(display);

    return display;
  }

  getTransactionCount() {
    return DisbandAction.transactionsCount;
  }
  //@ts-ignore args not used
  async verifyExecution(args: any): Promise<boolean> {
    let fa = await this.process.fetchFleetAccount();

    if (fa.state.StarbaseLoadingBay) {
      return true;
    } else {
      return false;
    }
  }

  /**
   * @inheritdoc
   */
  async export(type: string = "", data: any = {}) {
    return await Action.prototype.export.bind(this)(type, { sector: this.sector, ...data });
  }
}
