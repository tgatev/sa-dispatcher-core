import { PublicKey, SimulatedTransactionResponse, TransactionInstruction } from "@solana/web3.js";
import { InstructionReturn } from "@staratlas/data-source";
import { Action, iSimpleAction } from "./Action";
import { FleetProcess as Process } from "./FleetProcess";
import { iQueueItem } from "./Queue";
import { Coordinates, iCoordinates } from "./MoveAction";
import { clone } from "lodash";
import { DispatcherParsedTransactionWithMeta } from "./Dispatcher";
import { iError } from "../Error/ErrorHandlers";
/**
 * Implements undock fleet action
 */
export class RepairDockedFLeetAction extends Action implements iSimpleAction {
  static accumulatedTransactionCost = 0;
  static accumulatedRunTime = 0;
  static transactionsCount: number = 1;
  sector: iCoordinates;
  constructor(
    process: Process,
    public amount?: number,
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
    console.log("Validating RepairDockedFLeetAction - fleet account:", fa.key.toBase58());
    if (!fa.state.StarbaseLoadingBay) {
      return false;
    }
    return true;
  }
  async execute(): Promise<Array<DispatcherParsedTransactionWithMeta | SimulatedTransactionResponse | undefined>> {
    let rx = await this.dispatcher.signAndSend(await this.getInstructionsReturns(), false, this.priorityFeeConfig, {
      retryOnTimeout: async (d, e) => {
        // Check 'e' for validation state error -> handle state
        await new Promise((resolve) => setTimeout(resolve, 2000));
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
    let fa = await this.process.fetchFleetAccount();
    let ixs: InstructionReturn[] = [];
    // ixs = ixs.concat(await this.dispatcher.sageFleetHandler.ixFleetStateStarbaseHandler(fa.key));
    ixs = ixs.concat(
      await this.dispatcher.sageFleetHandler.ixRepairDockedFleet(
        await this.process.fetchFleetPublicKey(),
        this.amount,
        this.dispatcher.signer.as,
        this.dispatcher.funderPermissionIdex,
      ),
    );
    return ixs;
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
      RepairDockedFLeetAction.accumulatedTransactionCost += this.results.transactionFees || 0;
    });

    RepairDockedFLeetAction.accumulatedRunTime += this.results.runTime || 0;
    super.accumulateFees();
  }

  async display(verbose = false): Promise<string> {
    let display = `RepairDockedFLeetAction: T<${this.getTransactionCount()}> ` + (this.sector ? `sector: ${this.sector.toSectorKey()} ` : "");
    verbose && this.process.logger.info(display);

    return display;
  }

  getTransactionCount() {
    return RepairDockedFLeetAction.transactionsCount;
  }

  // @ts-ignore args not used
  async verifyExecution(args: any): Promise<boolean> {
    let fa = await this.process.fetchFleetAccount();
    if (fa.state.StarbaseLoadingBay) {
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
