import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import Dispatcher from "./Dispatcher";
import { Logger, logger } from "../utils";
import { iAction } from "../..";
import { prompt } from "../Common/prompt";
import {
  AwaitingActionRuntime,
  AwaitingActionWatcherContext as AwaitingActionRuntimeWatcherContext,
  AwaitingActionWatcherCleanup,
} from "./AwaitingActionRuntime";
export const argv = require("yargs").argv;

/**
 * Describe process oject
 */
export interface iBaseProcess<TAction> {
  dispatcher: Dispatcher;
  actionsChain: TAction[];

  addAction(action: TAction): TAction[];
  start(startStep: number): void;
  repeat(timesToRepeat: number | undefined, firstStartBeginningStep: number): void;
  forward(): Promise<void>;
}

export type { AwaitingActionWatcherCleanup } from "./AwaitingActionRuntime";
export type AwaitingActionWatcherContext<TAction extends iAction> = AwaitingActionWatcherContextBase<TAction>;
type AwaitingActionWatcherContextBase<TAction extends iAction> = AwaitingActionRuntimeWatcherContext<TAction, BaseProcess<TAction>> & {
  process: BaseProcess<TAction>;
};
export type AwaitingActionWatcher<TAction extends iAction> = AwaitingActionWatcherBase<TAction>;
type AwaitingActionWatcherBase<TAction extends iAction> = (
  ctx: AwaitingActionWatcherContextBase<TAction>,
) => AwaitingActionWatcherCleanup | Promise<AwaitingActionWatcherCleanup>;

export abstract class BaseProcess<TAction extends iAction> implements iBaseProcess<TAction> {
  public static getPropertyValueOrDefault(obj: any, property: string, defaultValue: any = "") {
    if (typeof obj === "object" && obj !== null && property in obj) {
      return obj[property];
    } else {
      return defaultValue;
    }
  }

  actionsChain: TAction[] = [];
  dispatcher: Dispatcher;
  logger: Logger = logger;
  currentStep: number = 0;
  // Stop Flag
  forceStop: boolean = false;
  protected readonly awaitingActionRuntime = new AwaitingActionRuntime<TAction, BaseProcess<TAction>>({
    logger: (...args) => this.logger.warn(...args),
  });

  get awaitingAction(): TAction | undefined {
    return this.awaitingActionRuntime.action;
  }

  get awaitingActionPromise(): Promise<any> | undefined {
    return this.awaitingActionRuntime.actionPromise;
  }

  get lastAwaitingActionAbortContext(): Record<string, any> | undefined {
    return this.awaitingActionRuntime.lastAbortContext;
  }

  nullifyAwaitingAction() {
    this.awaitingActionRuntime.clear();
  }

  resetAwaitingActionRuntime() {
    this.awaitingActionRuntime.resetAbortContext();
    this.awaitingActionRuntime.clear();
  }

  addAwaitingActionWatcher(watcher: AwaitingActionWatcher<TAction>): () => void {
    return this.awaitingActionRuntime.addWatcher(async ({ owner, action }) =>
      watcher({ owner, action, process: owner } as AwaitingActionWatcherContextBase<TAction>),
    );
  }

  async signalAwaitingActionAbort(data: Record<string, any> = {}, restoreState = true): Promise<boolean> {
    return await this.awaitingActionRuntime.signalAbort(data, restoreState);
  }

  async waitForAwaitingActionToSettle(timeoutMs: number): Promise<void> {
    await this.awaitingActionRuntime.waitForSettle(timeoutMs);
  }

  /**
   * Append executable actions list
   *
   * @param action
   * @returns
   */
  addAction(action: TAction): TAction[] {
    // action.validate(); // todo check on add action is not best place cause scenario is prebuild in add action - start mining need to have recourses in cargo but the flow could be more complex - which mean high complexity of validation
    this.actionsChain.push(action);
    return this.actionsChain;
  }

  //   abstract start(startStep: number): void;

  /**
   * Set flag to stop next query executions.
   */
  async stop() {
    this.forceStop = true;
  }

  /**
   * Start execution of steps
   */
  async start(startStep: number = 0): Promise<void> {
    this.logger.log("Action chain length: ", this.actionsChain.length);
    this.logger.log("StartedAt " + new Date().toUTCString() + "\t");
    this.logger.log("StartedAt", new Date());

    for (this.currentStep = startStep; this.actionsChain.length > this.currentStep; this.currentStep++) {
      let action = this.actionsChain[this.currentStep];
      if (action) {
        let actionType = action.constructor.name;
        console.time("Executed " + actionType);
        this.logger.info("************************************");
        this.logger.info(
          BaseProcess.getPropertyValueOrDefault(this, "fleetName", ""),
          "Start Action number:",
          this.currentStep,
          `(${this.actionsChain.length})`,
          actionType,
        );
        this.logger.info("************************************");
        let executed = false;
        let retry = true;
        while (!executed && retry) {
          try {
            this.logger.log("\t" + this.currentStep + "\t" + actionType);
            await this.awaitingActionRuntime.runWithAction(action as TAction, this, () => (action as TAction).run());

            executed = true;
            // Log cost and execution time
            this.logger.log("\t" + action.results.transactionFees / LAMPORTS_PER_SOL + "\t" + action.results.runTime);
          } catch (err) {
            if (err instanceof Error) {
              switch (err.name) {
                case "FailedToOpenSocket": // process default - when internet connection drop.
                  this.logger.warn(err);
                  retry = true;
                  break;
                // case "FailedToOpenSocket": {
                //   // Was there a typo in the url or port?
                //   //  path: "https://global.rpc.hellomoon.io/186ec97f-1bc5-4f66-bde3-5d6f11009851"
                //   this.logger.warn(err);
                //   retry = true;
                //   break;
                // }
                case "NotEnoughResources": {
                  throw err;
                  break;
                }
                // Stop Mining Process when have not enough resources to mine
                default:
                  // failed to get info about account EhBSmacr44ZVkCicffGq3uKtS5yo5vT8Fs7D9gg4Lxnb: FailedToOpenSocket: Was there a typo in the url or port?
                  if (
                    /failed to get info about/.exec(err.message) ||
                    /FailedToOpenSocket: Was there a typo in the url or port/.exec(err.message) ||
                    /502 Bad Gateway/.exec(err.message)
                  ) {
                    this.logger.warn(err);
                    retry = true;
                    this.logger.warn("Retry after 10 Sec ... waiting");
                    await new Promise((resolve) => setTimeout(resolve, 10 * 1000));
                  } else {
                    throw err;
                  }
                  break;
              }
            } else {
              /*@ts-ignore */
              this.logger.crit(err.constructor.name);

              throw err;
            }
          }
        }
        console.timeEnd("Executed " + actionType);
      }
    }
    // Log cost and execution time
    this.logger.log("\n");
  }

  abstract displaySteps(): Promise<void>;
  /**
   * Start process Many times
   * @param timesToRepeat
   * @param firstStartBeginningStep
   */
  async repeat(
    timesToRepeat: number | undefined = undefined,
    firstStartBeginningStep = 0,
    // ,
    // closuers: {
    //   before?: () => Promise<void>;
    //   eachStart?: () => Promise<void>;
    //   eachEnd?: () => Promise<void>;
    //   eachStep?: (step: number) => Promise<void>;
    //   after?: () => Promise<void>;
    //   stepError?: (context: { proc: BaseProcess<Action>; step: number; err: Error }) => Promise<void>;
    // },
  ) {
    this.logger.info("Scenario Steps");
    await this.displaySteps();
    /**
     * Loop the process N times
     */
    this.logger.info("==========================");
    let limit = timesToRepeat;
    if (limit === undefined) limit = Number(await prompt("Enter Repeat times [ number {1} ]:")) || 1;
    if (limit <= 0) {
      this.logger.info("Process will be executed only 1 time");
      limit = 0;
    }

    if (firstStartBeginningStep === undefined) {
      // console.log("First start from step: ", argv.startStep);

      firstStartBeginningStep = Number(argv.startStep) || 0;
    }
    console.log("First start from step: ", firstStartBeginningStep);
    this.logger.info("Length", this.actionsChain.length);
    for (let iter = 1; iter <= limit; iter++) {
      this.logger.info(`<<<======= Process Iteration Execution === ${iter} [${limit}] === START ===>>>`);
      console.time("Iteration execution Time");

      await this.start(firstStartBeginningStep);
      console.timeEnd("Iteration execution Time");
      this.logger.info(
        `<<<======= Process Iteration Execution `,
        firstStartBeginningStep ? `( started from Step ${firstStartBeginningStep})` : "",
        ` === ${iter} [${limit}] === END ===>>>`,
      );

      firstStartBeginningStep = 0;
    }

    this.logger.info("PROCESS END");
    return;
  }
  abstract forward(): Promise<void>;
  constructor(dispatcher: Dispatcher) {
    this.dispatcher = dispatcher;
  }
}
