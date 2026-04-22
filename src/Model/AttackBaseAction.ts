import { clone } from "lodash";
import { Action } from "./Action";
import { Coordinates, iCoordinates } from "./Coordinates";
import { FleetProcess as Process } from "./FleetProcess";
import { FleetStateData } from "@staratlas/holosim";
import { InstructionReturn } from "@staratlas/data-source";
import { SimulatedTransactionResponse, TransactionInstruction } from "@solana/web3.js";
import { DispatcherParsedTransactionWithMeta } from "./Dispatcher";
import { iSimpleAction } from "./Action";
import { SageFleetHandler } from "../holoHandlers/FleetHandler";

export class AttackBaseAction extends Action implements iSimpleAction {
  static accumulatedTransactionCost = 0;
  static accumulatedRunTime = 0;
  static transactionsCount: number = 1;
  sector: iCoordinates;
  constructor(process: Process, sector = new Coordinates(0, 0)) {
    super(process);
    this.sector = clone(sector);
  }

  // Before execute - wait cooldown if needed
  async wrapBeforeExecute(action: Action): Promise<void> {
    const fa = await this.process.fetchFleetAccount();
    const cds = await this.dispatcher.sageGameHandler.sageFleetHandler.getCooldown(fa);

    // let apCD = fa.data.
    if (cds.attackCooldown > 0) {
      console.log(`Waiting attack cooldown ${cds.attackCooldown} seconds`);
      await new Promise((r) => setTimeout(r, cds.attackCooldown * 1000));
    }

    await super.wrapBeforeExecute(action);
  }

  async validate(): Promise<boolean> {
    try {
      const fa = await this.process.fetchFleetAccount();
      if (!fa.state.Idle) {
        return false;
      }

      // If there is no starbase or attack is not possible, ixAttackStarbase will throw or return []
      const ixs = await this.getInstructionsReturns();
      return ixs.length > 0;
    } catch {
      return false;
    }
  }

  async getInstructionsReturns(): Promise<InstructionReturn[]> {
    const fa = await this.process.fetchFleetAccount();
    if (!fa.state.Idle) {
      return [];
    }

    const programAny = this.dispatcher.sageGameHandler.program as any;
    // Some program/IDL variants do not expose attackStarbase.
    if (!programAny?.methods?.attackStarbase) {
      return [];
    }

    const idleSector = fa.state.Idle.sector as any;
    const starbase = this.dispatcher.sageGameHandler.getStarbaseAddress(idleSector);
    try {
      return await (this.dispatcher.sageFleetHandler as unknown as SageFleetHandler).ixAttackStarbase(
        fa.key,
        starbase,
        this.dispatcher.signer.as,
        this.dispatcher.funderPermissionIdex,
      );
    } catch (err) {
      const msg = String((err as any)?.message || err || "");
      if (msg.includes("attackStarbase") && msg.includes("not a function")) {
        return [];
      }
      return [];
    }
  }

  async getInstructions(): Promise<TransactionInstruction[]> {
    return this.dispatcher.sageGameHandler.convertInstructionReturnToTransactionInstruction(
      this.dispatcher.signer.as,
      await this.getInstructionsReturns(),
    );
  }

  async execute(): Promise<Array<DispatcherParsedTransactionWithMeta | SimulatedTransactionResponse | undefined>> {
    const ixs = await this.getInstructionsReturns();
    if (!ixs.length) return [];

    const rx = await this.dispatcher.signAndSend(ixs, false, this.priorityFeeConfig, {
      signals: this.signals,
      continueOnError: true,
    });

    await this.process.fetchFleetAccount();
    return rx;
  }

  async verifyExecution(_args: any): Promise<boolean> {
    return true;
  }

  accumulateFees() {
    this.results.execution.forEach((trx) => {
      // @ts-ignore
      this.results.transactionFees += trx?.meta?.fee || 0;
      AttackBaseAction.accumulatedTransactionCost += this.results.transactionFees || 0;
    });

    AttackBaseAction.accumulatedRunTime += this.results.runTime || 0;
    super.accumulateFees();
  }

  async display(verbose = false): Promise<string> {
    const display = `AttackBase: T<${this.getTransactionCount()}> ` + (this.sector ? `sector: ${this.sector.toSectorKey()} ` : "");
    verbose && this.process.logger.info(display);
    return display;
  }

  getTransactionCount() {
    return AttackBaseAction.transactionsCount;
  }

  async getQueueItem() {
    return {
      action: this,
      execTime: Date.now(),
      next: async (process: Process) => process.forward(),
    } as any;
  }
}
