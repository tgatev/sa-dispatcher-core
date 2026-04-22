import { SimulatedTransactionResponse, TransactionInstruction } from "@solana/web3.js";
import { InstructionReturn } from "@staratlas/data-source";
import { Action, iSimpleAction } from "./Action";
import { FleetProcess as Process } from "./FleetProcess";
import { iQueueItem } from "./Queue";
import { Coordinates, iCoordinates } from "./MoveAction";
import { clone } from "lodash";
import { DispatcherParsedTransactionWithMeta } from "./Dispatcher";
/**
 * Implements undock fleet action
 */
export class UnDockAction extends Action implements iSimpleAction {
  static accumulatedTransactionCost = 0;
  static accumulatedRunTime = 0;
  static transactionsCount: number = 1;
  sector: iCoordinates;
  constructor(process: Process, sector = new Coordinates(0, 0)) {
    super(process);
    this.sector = clone(sector);
  }
  async getQueueItem(): Promise<iQueueItem> {
    let item = {
      action: this,
      execTime: new Date().getTime(),
      next: async (process: Process) => {
        // After fleet is un-docked - then continue processing
        return process.forward();
      },
    } as iQueueItem;

    return item;
  }

  async execute(): Promise<Array<DispatcherParsedTransactionWithMeta | SimulatedTransactionResponse | undefined>> {
    let rx = await this.dispatcher.signAndSend(await this.getInstructionsReturns(), false, this.priorityFeeConfig, {
      retryOnTimeout: async (d, e) => {
        // Check 'e' for validation state error -> handle state
        await new Promise((resolve) => setTimeout(resolve, 4000));
        return !(await this.verifyExecution({}));
      },
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
    return await this.dispatcher.sageFleetHandler.ixUndockFromStarbase(
      await this.process.fetchFleetPublicKey(),
      this.dispatcher.signer.as,
      this.dispatcher.funderPermissionIdex
    );
  }

  /**
   * Provide Undock TransactionInstruction[]
   * @returns
   */
  async getInstructions(): Promise<TransactionInstruction[]> {
    return this.dispatcher.sageGameHandler.convertInstructionReturnToTransactionInstruction(
      this.process.dispatcher.signer.as,
      await this.getInstructionsReturns()
    );
  }

  accumulateFees() {
    this.results.execution.forEach((trx) => {
      //@ts-ignore
      this.results.transactionFees += trx?.meta?.fee || 0;
      UnDockAction.accumulatedTransactionCost += this.results.transactionFees || 0;
    });

    UnDockAction.accumulatedRunTime += this.results.runTime || 0;
    super.accumulateFees();
  }

  async display(verbose = false): Promise<string> {
    let display = `UnDockAction: T<${this.getTransactionCount()}> ` + (this.sector ? `sector: ${this.sector.toSectorKey()} ` : "");
    verbose && this.process.logger.info(display);

    return display;
  }

  getTransactionCount() {
    return UnDockAction.transactionsCount;
  }

  // @ts-ignore args not used
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
    return await Action.prototype.export.bind(this)(type, { sector: this.sector, ...data });
  }
}
