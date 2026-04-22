import { SimulatedTransactionResponse, TransactionInstruction } from "@solana/web3.js";
import { InstructionReturn } from "@staratlas/data-source";
import { Action, iSimpleAction } from "./Action";
import { FleetProcess as Process } from "./FleetProcess";
import { iQueueItem } from "./Queue";
import { IncorrectFleetStateError } from "../Error/ErrorHandlers";
import { DispatcherParsedTransactionWithMeta } from "./Dispatcher";

export class ExitSubwarpAction extends Action implements iSimpleAction {
  static accumulatedTransactionCost = 0;
  static accumulatedRunTime = 0;
  static transactionsCount: number = 1;

  constructor(
    process: Process,
    public force: boolean = false,
  ) {
    super(process);
  }

  accumulateFees() {
    this.results.execution.forEach((trx) => {
      //@ts-ignore
      this.results.transactionFees += trx?.meta?.fee || 0;
      ExitSubwarpAction.accumulatedTransactionCost += this.results.transactionFees || 0;
    });

    ExitSubwarpAction.accumulatedRunTime += this.results.runTime || 0;
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
   * Provide Exit Subwarp InstructionReturn[]
   * @returns
   */
  async getInstructionsReturns(): Promise<InstructionReturn[]> {
    return await this.dispatcher.sageFleetHandler.ixReadyToExitSubwarp(
      await this.process.fetchFleetPublicKey(),
      this.dispatcher.signer.as,
      this.dispatcher.funderPermissionIdex,
      this.force,
    );
  }

  /**
   * Provide Exit Subwarp TransactionInstruction[]
   * @returns
   */
  async getInstructions(): Promise<TransactionInstruction[]> {
    return await this.dispatcher.sageGameHandler.convertInstructionReturnToTransactionInstruction(
      this.process.dispatcher.signer.as,
      await this.getInstructionsReturns(),
    );
  }

  async execute(): Promise<Array<DispatcherParsedTransactionWithMeta | SimulatedTransactionResponse | undefined>> {
    let fleetAccount = await this.process.fetchFleetAccount();

    let waitTime: number = 0;
    if (fleetAccount.state.MoveSubwarp) {
      waitTime = Number(fleetAccount.state.MoveSubwarp.arrivalTime.toString()) - Number(Date.now() / 1000);
    }
    if (!fleetAccount.state.MoveSubwarp) {
      throw new IncorrectFleetStateError(`MoveSubwarp.`, fleetAccount);
    }

    if (!this.force && waitTime > 0) {
      this.process.logger.log(`... wat more ${waitTime} seconds before exit transaction send.`);
      await this.waitingTimeCost(waitTime + 1);
    }

    // always 1 transaction
    let rx = await this.dispatcher.signAndSend(await this.getInstructionsReturns(), false, this.priorityFeeConfig, {
      retryOnTimeout: async () => {
        await new Promise((resolve) => setTimeout(resolve, 4000));
        return !(await this.verifyExecution({}));
      },
      signals: this.signals,
    });

    // ExitSubwarpAction.accumulatedTransactionCost += rx[0].meta?.fee || 0;
    // this.results.transactionFees += rx[0].meta?.fee || 0;

    return rx;
  }

  async verify() {
    // Todo Check state
    return true;
  }

  async display(verbose = false): Promise<string> {
    let display = `ExitSubwarp: T<${this.getTransactionCount()}>`;
    verbose && this.process.logger.info(display);

    return display;
  }

  getTransactionCount() {
    return ExitSubwarpAction.transactionsCount;
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
  /**
   * @inheritdoc
   */
  async export(type: string = "", data: any = {}): Promise<string> {
    return await Action.prototype.export.bind(this)(type, {
      ...data,
    });
  }
}
