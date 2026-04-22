import { SimulatedTransactionResponse, TransactionInstruction } from "@solana/web3.js";
import { InstructionReturn } from "@staratlas/data-source";
import { Action, iSimpleAction } from "./Action";
import { FleetProcess as Process } from "./FleetProcess";
import { iQueueItem } from "./Queue";
import { DispatcherParsedTransactionWithMeta } from "./Dispatcher";

export class StopMiningAction extends Action implements iSimpleAction {
  static accumulatedTransactionCost = 0;
  static accumulatedRunTime = 0;
  constructor(process: Process) {
    super(process);
  }
  static transactionsCount: number = 2;

  accumulateFees() {
    this.results.execution.forEach((trx) => {
      //@ts-ignore
      this.results.transactionFees += trx?.meta?.fee || 0;
      StopMiningAction.accumulatedTransactionCost += this.results.transactionFees || 0;
    });

    StopMiningAction.accumulatedRunTime += this.results.runTime || 0;
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
   * Provide Stop Mining InstructionReturn[]
   * @returns
   */
  async getInstructionsReturns(): Promise<InstructionReturn[]> {
    return await this.dispatcher.sageFleetHandler.ixStopMining(
      await this.process.fetchFleetPublicKey(),
      this.dispatcher.signer.as,
      this.dispatcher.funderPermissionIdex
    );
  }

  /**
   * Provide Stop Mining TransactionInstruction[]
   * @returns
   */
  async getInstructions(): Promise<TransactionInstruction[]> {
    return this.dispatcher.sageGameHandler.convertInstructionReturnToTransactionInstruction(
      this.dispatcher.signer.as,
      await this.getInstructionsReturns()
    );
  }

  /**
   *
   * @returns
   */
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
    let display = `StopMining: T<${this.getTransactionCount()}> `;
    verbose && this.process.logger.info(display);

    return display;
  }

  getTransactionCount() {
    return StopMiningAction.transactionsCount;
  }
  // @ts-ignore ars not used
  async verifyExecution(args: any): Promise<boolean> {
    let fa = await this.process.fetchFleetAccount();
    if (fa.state.Idle) {
      return true;
    } else {
      return false;
    }
  }

  /**@inheritdoc */
  async export(type: string = "", data: any = {}): Promise<string> {
    return await Action.prototype.export.bind(this)(type, { ...data });
  }
}
