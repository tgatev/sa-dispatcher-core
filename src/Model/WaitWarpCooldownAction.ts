import { BN } from "@project-serum/anchor";
import { Action } from "./Action";
import { FleetProcess as Process } from "./FleetProcess";
import { ParsedTransactionWithMeta, SimulatedTransactionResponse } from "@solana/web3.js";
import { DispatcherParsedTransactionWithMeta } from "./Dispatcher";

/**
 * Implements wait until warp coold is loaded
 */
export class WaitWarpCooldownAction extends Action {
  static transactionsCount: number = 0;

  constructor(process: Process) {
    super(process);
    this.waitAfterExecute = 0.5;
    this.waitTimeCostAfter = true;
  }

  async execute(): Promise<Array<DispatcherParsedTransactionWithMeta | SimulatedTransactionResponse | undefined>> {
    return [];
  }

  async getTimeCost(): Promise<number> {
    let fleetAccount = await this.process.fetchFleetAccount();
    let cdExpire = fleetAccount.data.warpCooldownExpiresAt as BN;
    let waitTime = Number(cdExpire.toString()) - Number(Date.now() / 1000);

    if (waitTime < 0) {
      return 0;
    }
    return waitTime + 1; // append 2 s to time
  }

  async display(verbose = false): Promise<string> {
    let display = `WaitWarpCooldownAction: T<${this.getTransactionCount()}>`;
    verbose && this.process.logger.info(display);

    return display;
  }

  getTransactionCount() {
    return WaitWarpCooldownAction.transactionsCount;
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
