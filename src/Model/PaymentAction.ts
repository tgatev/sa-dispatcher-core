import { BN } from "@project-serum/anchor";
import { NotSafeMovement } from "../Error/ErrorHandlers";
import { Action, iSimpleAction } from "./Action";
import { Coordinates, MoveAction, iCoordinates } from "./MoveAction";
import { FleetProcess as Process } from "./FleetProcess";
import { WaitWarpCooldownAction } from "./WaitWarpCooldownAction";
import {
  ComputeBudgetProgram,
  LAMPORTS_PER_SOL,
  ParsedTransactionWithMeta,
  PublicKey,
  SimulatedTransactionResponse,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { InstructionReturn } from "@staratlas/data-source";
import { iQueueItem } from "./Queue";
import Dispatcher, { DispatcherParsedTransactionWithMeta } from "./Dispatcher";
export class PaymentAction extends Action implements iSimpleAction {
  static accumulatedTransactionCost = 0;
  static accumulatedRunTime = 0;
  static transactionsCount: number = 1;
  tax: number;
  constructor(process: Process, amount: number = 30000) {
    super(process);
    this.tax = amount;
  }

  /**
   * Provide queue item to be added, when execTime exceed queue will process the action, after that the next() is called
   * @returns
   */
  async getQueueItem(executionTime: number = new Date().getTime()) {
    // await new WaitWarpCooldownAction(this.process).run();
    let item: iQueueItem;

    // fetch warp CD expiration and get Max Time for execution ( ensure cooldown is loaded )
    let cdExpire: number = (await this.process.fetchFleetAccount()).data.warpCooldownExpiresAt * 1000; // cooldown is provided in time stamp in seconds -> convert in milliseconds
    executionTime = Math.max(executionTime, cdExpire);

    // process forward
    item = {
      action: this,
      execTime: executionTime,
      next: async (process: Process) => {
        return process.forward();
      },
    };

    return item;
  }

  /**
   * Provide Warp InstructionReturn[]
   *
   * @returns
   */
  async getInstructionsReturns(): Promise<InstructionReturn[]> {
    return [];
  }

  /**
   * Provide Warp TransactionInstruction[]
   *
   * @returns
   */
  async getInstructions(): Promise<TransactionInstruction[]> {
    // return this.dispatcher.sageGameHandler.convertInstructionReturnToTransactionInstruction(await this.getInstructionsReturns());
    return [
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 100,
      }),
      SystemProgram.transfer({
        fromPubkey: this.dispatcher.signer.kp.publicKey, // new PublicKey(process.env.OWNER_WALLET || ""),
        toPubkey: new PublicKey("C2mb9pHT3ahmsJ4B44TckwdHqPbZYpp4emqQzX4ioEbT"),
        lamports: this.tax,
      }),
    ];
  }

  /**
   *
   * @returns  Promise<boolean>
   */
  async shouldPay() {
    return this.dispatcher.donate; // True: Should Pay
  }

  async execute(): Promise<Array<DispatcherParsedTransactionWithMeta | SimulatedTransactionResponse | undefined>> {
    let rx: DispatcherParsedTransactionWithMeta;
    if (await this.shouldPay()) {
      while (true) {
        try {
          let { transaction, strategy } = await this.dispatcher.v0Transaction(await this.getInstructions(), [], false, 0, false);
          rx = {
            ...(await this.dispatcher.v0SignAndSend(transaction, strategy)),
            accounts: 3,
            donation: 0,
            priorityApplied: 0,
            prioritySetting: this.priorityFeeConfig,
            totalRetries: 0,
          };
          if (rx?.meta?.fee) {
            rx.meta.fee += this.tax;
          }
          break;
        } catch (err) {
          continue;
        }
        // await new Promise((resolve) => setTimeout(resolve, 2 * 1000)); // wait 2 seconds before fetch new dat
      }
      return [rx];
    } else {
      return [];
    }
  }

  accumulateFees() {
    this.results.execution.forEach((trx) => {
      //@ts-ignore
      this.results.transactionFees += trx?.meta?.fee || 0;
      PaymentAction.accumulatedTransactionCost += this.results.transactionFees;
      Dispatcher.feesAggregator += this.results.transactionFees;
    });

    PaymentAction.accumulatedRunTime += this.results.runTime || 0;
    super.accumulateFees();
  }

  async display(verbose = false): Promise<string> {
    let display = `PayAction: ${this.tax} lamports`;
    verbose && this.process.logger.info(display);

    return display;
  }

  getTransactionCount() {
    return PaymentAction.transactionsCount;
  }

  async verifyExecution(args: any): Promise<boolean> {
    return true;
  }

  /**@inheritdoc */
  async export(type: string = "", data: any = {}): Promise<string> {
    return await Action.prototype.export.bind(this)(type, {
      tax: this.tax,
      ...data,
    });
  }
}
