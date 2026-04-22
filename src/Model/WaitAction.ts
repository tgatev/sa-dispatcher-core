import { BN } from "@project-serum/anchor";
import { Action } from "./Action";
import { FleetProcess as Process } from "./FleetProcess";
import { ParsedTransactionWithMeta, SimulatedTransactionResponse } from "@solana/web3.js";
import { DispatcherParsedTransactionWithMeta } from "./Dispatcher";

/**
 * Implements wait until warp coold is loaded
 */
export class WaitAction extends Action {
  static transactionsCount: number = 0;
  private callback: (self: WaitAction) => Promise<void>;

  constructor(process: Process, callback: (self: WaitAction) => Promise<void> = async () => {}) {
    super(process);
    this.waitAfterExecute = 0.5;
    this.waitTimeCostAfter = true;
    this.callback = callback;
  }

  async execute(): Promise<Array<DispatcherParsedTransactionWithMeta | SimulatedTransactionResponse | undefined>> {
    await this.callback(this);
    return [];
  }

  async getTimeCost(): Promise<number> {
    return 0;
  }

  async display(verbose = false): Promise<string> {
    let display = `WaitAction: T<${this.getTransactionCount()}>`;
    verbose && this.process.logger.info(display);

    return display;
  }

  getTransactionCount() {
    return WaitAction.transactionsCount;
  }

  /**@inheritdoc */
  async export(type: string = "", data: any = {}): Promise<string> {
    return await Action.prototype.export.bind(this)(type, {
      waitAfterExecute: this.waitAfterExecute,
      waitTimeCostAfter: this.waitTimeCostAfter,
      ...data,
    });
  }
}
