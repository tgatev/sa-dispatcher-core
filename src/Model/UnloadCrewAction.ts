import { SimulatedTransactionResponse, TransactionInstruction } from "@solana/web3.js";
import { InstructionReturn } from "@staratlas/data-source";
import { Action, iSimpleAction } from "./Action";
import { FleetProcess as Process } from "./FleetProcess";
import { iQueueItem } from "./Queue";
import { Coordinates, iCoordinates } from "./MoveAction";
import { clone } from "lodash";
import { ShipStats } from "@staratlas/sage-main";
import Dispatcher, { DispatcherParsedTransactionWithMeta } from "./Dispatcher";

/**
 * Implements Transfer Crew fleet action
 *
 */
export class UnloadCrewAction extends Action implements iSimpleAction {
  static accumulatedTransactionCost = 0;
  static accumulatedRunTime = 0;
  static transactionsCount: number = 1;
  sector: iCoordinates;
  crewAmount: number;
  constructor(process: Process, amount: number, sector = new Coordinates(0, 0)) {
    super(process);
    this.sector = clone(sector);
    this.crewAmount = amount;
  }

  accumulateFees() {
    this.results.execution.forEach((trx) => {
      //@ts-ignore
      this.results.transactionFees += trx?.meta?.fee || 0;
      UnloadCrewAction.accumulatedTransactionCost += this.results.transactionFees || 0;
    });

    UnloadCrewAction.accumulatedRunTime += this.results.runTime || 0;
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
    if (this.crewAmount)
      return await this.dispatcher.sageFleetHandler.ixUnloadFleetCrew(
        await this.process.fetchFleetPublicKey(),
        this.crewAmount,
        this.dispatcher.signer.as,
        this.dispatcher.funderPermissionIdex
      );

    return [];
  }

  /**
   * Provide Dock TransactionInstruction[]
   * @returns
   */
  async getInstructions(): Promise<TransactionInstruction[]> {
    return this.dispatcher.sageGameHandler.convertInstructionReturnToTransactionInstruction(
      this.dispatcher.signer.as,
      await this.getInstructionsReturns()
    );
  }

  async execute(): Promise<Array<DispatcherParsedTransactionWithMeta | SimulatedTransactionResponse | undefined>> {
    let fa = await this.process.fetchFleetAccount();
    let fs: ShipStats = fa.data.stats;
    let state = fs.miscStats.crewCount;
    let rx = await this.dispatcher.signAndSend(await this.getInstructionsReturns(), false, this.priorityFeeConfig, {
      //@ts-ignore d not used
      retryOnTimeout: async (d: Dispatcher) => {
        // Wait new block before validation - 1 block is around 3 seconds
        await new Promise((resolve) => setTimeout(resolve, 4000));
        let fa = await this.process.fetchFleetAccount();
        let fs: ShipStats = fa.data.stats;
        let executed: boolean = state !== fs.miscStats.crewCount;
        // If the state is not the same as before transaction start then transactions is supposed to be executed
        return !executed; // False means - Do Not Repeat timeout is 'false timeout' so continue script execution
      },
      signals: this.signals,
    });
    return rx;
  }

  async display(verbose = false): Promise<string> {
    let display = `Dock: T<${this.getTransactionCount()}>` + (this.sector ? ` sector: ${this.sector.toSectorKey()} ` : "");
    verbose && this.process.logger.info(display);

    return display;
  }

  getTransactionCount() {
    return UnloadCrewAction.transactionsCount;
  }

  /**@inheritdoc */
  async export(type: string = "", data: any = {}): Promise<string> {
    return await Action.prototype.export.bind(this)(type, {
      sector: this.sector,
      ...data,
    });
  }
}
