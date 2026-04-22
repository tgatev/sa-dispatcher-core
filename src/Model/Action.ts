import { FleetProcess as Process } from "./FleetProcess";
import Dispatcher, { DispatcherParsedTransactionWithMeta, iPriorityFeeConfig } from "./Dispatcher";
import { SimulatedTransactionResponse, TransactionInstruction } from "@solana/web3.js";
import { AbortTrigger, iError } from "../Error/ErrorHandlers";

import { InstructionReturn } from "@staratlas/data-source";
import { iQueueItem } from "./Queue";
import { waitTimeProgress } from "../utils";
import { iActionSignals } from "../Common/Interfaces";
import { BaseProcess } from "./BaseProcess";
import { Coordinates } from "./Coordinates";

export interface iActionR4Cost {
  fuel?: number;
  food?: number;
  ammunitions?: number;
  tool?: number;
}

export enum ActionEvents {
  CombatAttack = "CombatAttack",
  StateChange = "StateChange",
  SectorEvent = "SectorEvent",
  AreaSignal = "AreaSignal",
  RadioSignal = "RadioSignal",
}
export interface BaseActionEventData {
  process: Process;
  action: Action;
  eventType: ActionEvents;
  fleetName?: string;
  starbaseName?: string;
  location?: Coordinates;
  area?: Coordinates[];
  [key: string]: any;
}

export type ActionInterruptResult = { type: "proceed" } | { type: "return"; instructions: InstructionReturn[] } | { type: "abort"; data?: Record<string, any> };

export type ActionInterrupt = () => Promise<ActionInterruptResult>;

export interface iActionInterruptOptions {
  onInterrupt?: ActionInterrupt;
}

export interface iActionInterruptAware {
  exitMovementOptions?: iActionInterruptOptions;
}
/**
 * Define base action interface
 */
export interface iAction {
  mode: "starbased" | "holosim";
  dispatcher: Dispatcher;
  process: BaseProcess<iAction>;
  r4cost: iActionR4Cost;
  verifyAfterExecution: boolean;
  results: {
    execution: Array<DispatcherParsedTransactionWithMeta | SimulatedTransactionResponse | undefined>;
    preValidation: any;
    postValidation: any;
    runTime: number;
    transactionCost: iActionR4Cost;
    timeCost: number;
    transactionFees: number;
  };
  signals: iActionSignals;
  build: () => Promise<boolean>;
  execute: () => Promise<Array<DispatcherParsedTransactionWithMeta | SimulatedTransactionResponse | undefined>>;
  validate: () => Promise<boolean | iError>;
  wrapExecute: (props?: {
    before?: (action: Action<any>) => Promise<void>;
    after?: (action: Action<any>) => Promise<void>;
    around?: (action: Action<any>) => Promise<void>;
  }) => Promise<void>;
  run: () => Promise<boolean | iError>;
  /** Time spend */
  getTimeCost: () => Promise<number | iError>;

  /** Action transaction cost in SOL */
  getTransactionCost: () => Promise<number | iError>;
  getTransactionCount: () => number;
  verifyExecution: (args: any) => Promise<boolean>;
  /**
   * Display action configurations and return them as a string
   */
  display: (verbose: boolean) => Promise<string>;
  export: (data?: any) => Promise<any | string>;

  //* Used to validate or Brake process on demand
  onBeforeExecute: (action: iAction) => Promise<void>;
  onAfterExecute: (action: iAction) => Promise<void>;
}

export interface iSimpleAction extends iAction {
  getInstructionsReturns: () => Promise<InstructionReturn[]>;
  getInstructions: () => Promise<TransactionInstruction[]>;
  getQueueItem: (executionTime?: number) => Promise<iQueueItem<iAction>>;
  accumulateFees: (sol: number) => void;
  handleExitMovement(opts?: iActionInterruptOptions): Promise<InstructionReturn[]>;
}

/**
 * Base action class
 */
export class Action<TProcess extends Process = Process> implements iAction {
  mode: "starbased" | "holosim" = "starbased";
  process: TProcess;
  dispatcher: Dispatcher;
  r4cost: iActionR4Cost = { fuel: 0, food: 0, ammunitions: 0, tool: 0 };
  waitBeforeExecute: number = 0; //[seconds] time needed to complete the same action [ warp/subwarp/mine]
  waitAfterExecute: number = 0; //[seconds] bonus wait after execution to ensure the block was closed and transactions are finalized before next action execution
  waitTimeCostAfter: boolean = true;
  r4costs: iActionR4Cost = { ammunitions: 0, fuel: 0, tool: 0, food: 0 };
  verifyAfterExecution = true;
  timeCost: number = 0;
  //the base Action class do not submit transactions
  static transactionsCount: number = 0;
  onBeforeExecute: (action: iAction) => Promise<void> = async () => {};
  onAfterExecute: (action: iAction) => Promise<void> = async () => {};
  signals: iActionSignals;
  /**
   * Used to listen fleet events during the execution of the action, to handle dynamic changes and react on them
   *
   * @param process
   * @param action
   * @param event
   * @param data
   * @param fleetName
   * @returns
   */
  onFleet: (d: BaseActionEventData & {}) => Promise<void> = async (d: BaseActionEventData & {}) => {
    this.process.dispatcher.logger.dbg(`Fleet Event: [${d.fleetName}] ${d["event"]} - Data: ${d}`);
    return;
  };
  /**
   * Used to listen location events during the execution of the action, to handle dynamic changes and react on them
   *
   * @returns
   */
  onLocation: (d: BaseActionEventData & {}) => Promise<void> = async (d: BaseActionEventData & {}) => {
    this.process.dispatcher.logger.dbg(`Fleet Event: [${d.fleetName}] ${d["event"]} - Data: ${d}`);

    return;
  };

  onArea: (process: TProcess, event: string, data: any, fleetName: string) => Promise<void> = async () => {
    return;
  };
  results: {
    execution: Array<DispatcherParsedTransactionWithMeta | SimulatedTransactionResponse | undefined>;
    preValidation: any;
    postValidation: any;
    runTime: number;
    transactionCost: iActionR4Cost;
    timeCost: number;
    transactionFees: number;
  };
  priorityFeeConfig: iPriorityFeeConfig = {
    enable: Boolean(process.env["TRANSACTION_PRIORITY_FEE_ENABLE"] || 0),
    minChance: Number(process.env["TRANSACTION_PRIORITY_FEE_MIN_CHANCE"] || 50),
    lockbackSlots: Number(process.env["TRANSACTION_PRIORITY_FEE_LOCKBACK_SLOTS"] || 50),
    increaseStep: Number(process.env["TRANSACTION_PRIORITY_FEE_INCREASE_STEP"] || 0),
    increaseBaseFee: Number(process.env["TRANSACTION_PRIORITY_FEE_INCREASE_BASE_FEE"] || 0),
  };
  static accumulatedTransactionCost: number = 0;
  static accumulatedRunTime: number = 0;
  public forceSubwarpExit: boolean = false; // when true - the process will try to exit[STOP]subwarp on when handle fleet state is called by this action
  constructor(process: TProcess) {
    this.process = process;
    this.dispatcher = process.dispatcher;
    this.results = {
      // execution Result
      execution: [],
      // pre validate - is able to execute action
      preValidation: undefined,
      // validate result - state, resources etc.
      postValidation: undefined,
      // Used for total runtime
      runTime: 0,
      // execution runtime
      timeCost: 0,
      // R4 Resources costs
      transactionCost: {},
      // Transaction Fee in solana
      transactionFees: 0,
    };
    /**
     * Most of the actions child send transactions to the block chain
     *  -- work around fix to ensure the the chain block wa completed before generation of the new transaction
     * TO DO: check the connection how to confirm transaction after block finalization
     */
    this.waitAfterExecute = 0;
    this.signals = {
      abort: {
        data: {},
        state: async () => {
          return false;
        },
        //@ts-ignore data - not used
        beforeAbort: async (data: any) => {
          this.signals.abort.data = { ...this.signals.abort.data, ...data };
        },
        thrower: async (data: any) => {
          throw new AbortTrigger({
            action: this.constructor.name,
            fleetName: this.process.fleetName,
            message: "Abort signal received!",
            ...data,
            ...this.signals.abort.data,
          });
        },
      },
    };
  }

  /**
   *
   * @param type @default "" Valid Type as "" | "json"
   * @param data any data which should be included inside export
   * @returns
   */
  async export(type: string, data: any = {}): Promise<any | string> {
    if (type == "json") {
      return JSON.stringify({ actionType: this.constructor.name, ...data });
    }
    return { actionType: this.constructor.name, ...data };
  }

  /**
   * Parse Valid json and apply Object.Keys and Values to this
   * */
  async import(data: string) {
    let fields = JSON.parse(data) || {};
    for (let k of Object.keys(fields)) {
      // @ts-ignore
      this[k] = fields[k];
    }
  }

  getTransactionCount(): number {
    return Action.transactionsCount;
  }
  /**
   * Base display implementations
   */
  async display(verbose = false): Promise<string> {
    let display = this.constructor.name;
    verbose && console.info(display);

    return display;
  }

  async build() {
    return true;
  }

  /**
   * Verify action execution - to confirm is transaction done ( needed to filter false Timeout )
   * @param args
   * @returns
   */
  //@ts-ignore args: not used
  async verifyExecution(args: any) {
    return true;
  }

  async validate(): Promise<boolean | iError> {
    return true;
  }

  async increaseResourcesCost(R4costCollector: iActionR4Cost) {
    for (const key in R4costCollector) {
      if (Object.prototype.hasOwnProperty.call(R4costCollector, key)) {
        // @ts-ignore
        this.r4cost[key] += R4costCollector[key];
      }
    }
  }

  /**
   *
   * @param time in seconds
   */
  async waitingTimeCost(time: number = 0): Promise<void> {
    if (this.waitTimeCostAfter || time) {
      if (!time) {
        time = await this.getTimeCost();
      }
      await this.waitTimeProgress(time * 1000, this.process.fleetName + " Wait time cost:");

      // this.results.timeCost += time;
    }
  }

  async getTimeCost(): Promise<number> {
    return this.timeCost || 0;
  }

  async getResourceCost(): Promise<iActionR4Cost> {
    return this.r4cost;
  }

  async getTransactionCost(): Promise<number> {
    return 0.0;
  }
  async waitTimeProgress(time: number, label: string = "", tickTime = 1000) {
    // waitTimeProgress(5000)
    await waitTimeProgress(time, label, tickTime, { abortSignal: this.signals.abort });
  }

  async wrapBeforeExecute(action: Action) {
    // Reset on each run
    action.results.transactionFees = 0;
    this.onBeforeExecute && (await this.onBeforeExecute(action));

    // let validationStatus =
    await action.validate();
    // if (validationStatus !== true) {
    //   // console.error("VALIDATION FAILED");
    //   throw validationStatus;
    // }

    if (action.waitBeforeExecute) {
      await action.waitingTimeCost(action.waitBeforeExecute);
    }
  }

  async wrapAfterExecute(action: Action) {
    action.accumulateFees();
    this.onAfterExecute && (await this.onAfterExecute(action));

    if (action.waitTimeCostAfter) {
      // console.log(this.constructor.name, this.process.fleetName, "waitTimeCostAfter -> waitingTimeCost", await this.getTimeCost());
      await action.waitingTimeCost();
    }
    if (action.waitAfterExecute) {
      await action.waitingTimeCost(action.waitAfterExecute);
    }
  }

  async wrapAroundExecute(action: Action) {
    let startTime = new Date().getTime();
    // Need To set when there is wrong Start Mining resource -> should brake the script
    let retryLimiter = {
      simulation: 10,
      error: 10,
      fleetState: 10,
      unknown: 10,
      verification: 10,
    };
    while (true) {
      // console.log(this.signals);
      // console.log(
      //   typeof this.signals.abort.state === "boolean" && typeof this.signals.abort.state,
      //   typeof this.signals.abort.state !== "boolean" && (await this.signals.abort.state({}))
      // );
      if (this.signals.abort) {
        await this.checkAbortSignal();
      }
      try {
        action.results.execution = await action.execute();
        if (action.verifyAfterExecution) {
          if (await action.verifyExecution({})) {
            action.dispatcher.logger.dbg(action.constructor.name, "Action execution verified! Go to next action!");
            break; //! Execution was successful
          } else {
            // console.error("Validation Failed - Wait 2000 ms before re-checking ...");
            await new Promise((resolve) => setTimeout(resolve, 2000));
            // ! retry validation
            if (await action.verifyExecution({})) {
              break;
            }
            action.dispatcher.logger.error("Action execution NOT verified! REPEAT action!");
            continue; //! RETRY When not executed
          }
        }

        // if (this.constructor.name === "TransferCargoAction") {
        //   if (this.verifyAfterExecution) {
        //     console.log("transferCargo execution validation after execute !");
        //     if (!(await this.verifyExecution({}))) throw new FleetCargoTransferError("Cargo transfer was not verified", {});
        //   }
        // }
        break;
      } catch (err) {
        // // throw err;
        /***
         * !! This error processing target is to validate execution after "False Timeout"
         *  !! But this is moved as arrow function in execute method in each action
         *
         */
        //@ts-ignore
        // this.dispatcher.logger.crit("XXXXX VALIDATE or RETRY", err.constructor.name);
        if (!(err instanceof Error)) console.error("Catcher is not Instance of Error", err.constructor.name, err);
        if (err instanceof Error) {
          // Execution BRAKES on this points
          action.dispatcher.logger.error("ERROR_CATCHER: ", {
            constructor: err.constructor.name,
            name: err.name,
            message: err.message || err,
            cause: err.cause,
            retries: retryLimiter,
          });
          /**
           * Switch is handling the moments when should truly brake, and when should retry to execute the transaction
           */
          switch (err.constructor.name) {
            // Errors that should not repeat transaction - this errors brakes the
            case "FleetCargoTransferError":
            case "CantTransferCrewToFleetError":
            case "NotSafeMovement":
            case "...Add MORE BRAKES":
              action.dispatcher.logger.log(["Error Type is properly BRAKING the Script"]);
              throw err;
              break;
            // Often happens when fleet state was read without being block closed / synced
            case "IncorrectFleetStateError":
              retryLimiter.fleetState--;
              if (retryLimiter.fleetState < 0) throw err;
              await new Promise((resolve) => setTimeout(resolve, 2000));
              break;
            /**
             * Most often after 'false timeout' - fleet is in incorrect state to repeat the transaction and that throws SimulationError
             *   this is handled after the switch statement
             */
            case "SimulationError":
              // for transfer cargo - often that happen after 'false timeout' - but this case was catch on execution
              // other scenario is a bed instruction or missing amount of resource
              //    so this is a brake for transfer cargo, cause of the risk to have no enough fuel after load
              if (action.constructor.name == "TransferCargoAction") {
                throw err;
              }
              //! End of infinity simulations
              retryLimiter.simulation--;
              if (retryLimiter.simulation < 0) throw err;
              await new Promise((resolve) => setTimeout(resolve, 2000));

              break;
            case "Error": {
              //! Throwing unknown types of errors after many retries
              retryLimiter.error--;
              if (retryLimiter.error < 0) throw err;
              await new Promise((resolve) => setTimeout(resolve, 2000));

              break;
            }
            case "AbortTrigger": {
              throw err;
              break;
            }
            default:
              if (action.constructor.name === "TransferCargoAction") throw err; // when transfer cargo  and there is error - throw Error
              // if (err.constructor.name === "AbortTrigger") throw err; // when transfer cargo  and there is error - throw Error
              action.dispatcher.logger.crit("RETRY ACTION:", action.constructor.name, err.constructor.name, err);
              //! Throwing unknown types of errors after many retries
              retryLimiter.unknown--;
              if (retryLimiter.unknown < 0) throw err;
              await new Promise((resolve) => setTimeout(resolve, 2000));

              break; // Brake is for switch
          }

          // console.error("Wait 2000 ms before verification ...");
          await new Promise((resolve) => setTimeout(resolve, 2000));
          if (await action.verifyExecution({})) {
            action.dispatcher.logger.log(["Catcher: Action execution verified! Go to next action!"]);
            break; // Execution was successful
          } else {
            action.dispatcher.logger.log("Catcher: Action execution NOT verified! REPEAT action!");
            retryLimiter.verification--;
            if (retryLimiter.verification < 0) throw err;
            continue; // RETRY When not executed
          }
        } else {
          //@ts-ignore
          action.dispatcher.logger.crit("ActionError Repeat: Unknown Error Type: ", [err.constructor.name], err);
          throw err;
        }
      }
    }

    action.results.runTime = Math.ceil(new Date().getTime() - startTime) / 1000;
  }

  async wrapExecute(
    props: {
      before?: (action: Action<any>) => Promise<void>;
      after?: (action: Action<any>) => Promise<void>;
      around?: (action: Action<any>) => Promise<void>;
      //@ts-ignore args: not used
    } = { before: async (_action: Action<any>) => {}, after: async (_action: Action<any>) => {}, around: async (_action: Action<any>) => {} },
  ) {
    //@ts-ignore args: not used
    if (!props.before) props.before = async (_action: Action<any>) => {};
    if (!props.around)
      props.around = async (action: Action<any>) => {
        action.results.execution = await action.execute();
      };
    //@ts-ignore args: not used
    if (!props.after) props.after = async (_action: Action<any>) => {};

    await props.before(this);
    await props.around(this);
    await props.after(this);
  }

  async run(): Promise<boolean | iError> {
    await this.wrapExecute({
      before: this.wrapBeforeExecute.bind(this),
      around: this.wrapAroundExecute.bind(this),
      after: this.wrapAfterExecute.bind(this),
    });

    return true;
  }

  async execute(): Promise<Array<DispatcherParsedTransactionWithMeta | SimulatedTransactionResponse | undefined>> {
    Action.accumulatedTransactionCost += await this.getTransactionCost();
    return [];
  }

  accumulateFees(sol: number = 0) {
    Action.accumulatedTransactionCost += (this.results.transactionFees || 0) + sol;
    Action.accumulatedRunTime += this.results.runTime || 0;
  }

  async handleExitMovement(opts?: iActionInterruptOptions): Promise<InstructionReturn[]> {
    let fleetAccount = await this.process.fetchFleetAccount();
    let fleetState = fleetAccount.state;
    let now = new Date().getTime();
    const resolvedInterruptOptions = opts || (this as unknown as iActionInterruptAware).exitMovementOptions;

    const waitWithInterrupt = async (waitTime: number, label: string): Promise<ActionInterruptResult> => {
      if (waitTime <= 0) {
        return { type: "proceed" };
      }

      if (!resolvedInterruptOptions?.onInterrupt) {
        await this.waitTimeProgress(waitTime, label);
        return { type: "proceed" };
      }

      const deadline = Date.now() + waitTime;
      while (true) {
        const left = deadline - Date.now();
        if (left <= 0) {
          return { type: "proceed" };
        }

        const timerPromise = this.waitTimeProgress(left, label).then<ActionInterruptResult>(() => ({ type: "proceed" }));
        const interruptResult = await Promise.race([timerPromise, resolvedInterruptOptions.onInterrupt()]);

        if (interruptResult.type === "return" || interruptResult.type === "abort") {
          return interruptResult;
        }
      }
    };
    if (fleetState.StarbaseLoadingBay) {
      return [
        ...(await this.dispatcher.sageFleetHandler.ixFleetStateStarbaseHandler(fleetAccount.key, [
          { isSigner: false, isWritable: false, pubkey: fleetState.StarbaseLoadingBay.starbase },
        ])),
      ];
    }
    if (fleetState.MoveSubwarp) {
      let exitTime = Number(fleetState.MoveSubwarp.arrivalTime) * 1000 + 1000; // +1sec
      // on force stop - we should not wait for arrival time and call stop immediately
      let waitTime = this.forceSubwarpExit ? 0 : exitTime - now;
      // console.log("Handle Exit Subwarp ", `now: ${now}`, `exit: ${exitTime}`, `wait: ${waitTime} s`, waitTime / 60_000);
      const interruptResult = await waitWithInterrupt(waitTime, this.process.fleetName + " Before exit Subwarp:");
      if (interruptResult.type === "return") {
        return interruptResult.instructions;
      }
      if (interruptResult.type === "abort") {
        throw new AbortTrigger({
          action: this.constructor.name,
          fleetName: this.process.fleetName,
          message: "ActionInterrupt abort during subwarp movement",
          ...(interruptResult.data || {}),
        });
      }

      await this.checkAbortSignal();
      return await this.dispatcher.sageFleetHandler.ixReadyToExitSubwarp(
        fleetAccount.key,
        this.process.dispatcher.signer.as,
        this.dispatcher.funderPermissionIdex,
        this.forceSubwarpExit, // True means call Stop immediately without waiting for arrival time - used when we want to brake subwarp early because of some dynamic change during the action execution
      );
    } else if (fleetState.MoveWarp) {
      let exitTime = Number(fleetState.MoveWarp.warpFinish) * 1000 + 1000;
      let waitTime = exitTime - now;
      // console.log("Handle Exit Warp ", exitTime, now, waitTime, waitTime / 60_000);

      const interruptResult = await waitWithInterrupt(waitTime, this.process.fleetName + " Before exit Warp");
      if (interruptResult.type === "return") {
        return interruptResult.instructions;
      }
      if (interruptResult.type === "abort") {
        throw new AbortTrigger({
          action: this.constructor.name,
          fleetName: this.process.fleetName,
          message: "ActionInterrupt abort during warp movement",
          ...(interruptResult.data || {}),
        });
      }

      await this.checkAbortSignal();
      return await this.dispatcher.sageFleetHandler.ixReadyToExitWarp(
        fleetAccount.key,
        this.process.dispatcher.signer.as,
        this.dispatcher.funderPermissionIdex,
      );
    } else if (fleetState.Respawn) {
      const { handleRespawnToLoadingBayAction } = await import("./RespawnToLoadingBayAction");
      await handleRespawnToLoadingBayAction(this.process);
      // let respawnTime = Number(fleetState.Respawn.start);
      // let respawnConst = fleetStats.miscStats.placeholder / 1000 || fleetStats.miscStats.respawnTime / 1000;
      // let exitTime = (respawnTime + respawnConst + 1) * 1000; // +1sec
      // let waitTime = exitTime - now;

      // const interruptResult = await waitWithInterrupt(waitTime, this.process.fleetName + " Before exit Respawn  && Repair");
      // if (interruptResult.type === "return") {
      //   return interruptResult.instructions;
      // }
      // if (interruptResult.type === "abort") {
      //   throw new AbortTrigger({
      //     action: this.constructor.name,
      //     fleetName: this.process.fleetName,
      //     message: "ActionInterrupt abort during respawn && repair",
      //     ...(interruptResult.data || {}),
      //   });
      // }

      // await this.checkAbortSignal();
      // let ixs = [
      //   ...(await this.dispatcher.sageFleetHandler.ixRespawnFleet(fleetAccount.key, this.process.dispatcher.signer.as, this.dispatcher.funderPermissionIdex)),
      //   ...(await this.dispatcher.sageFleetHandler.ixRepairDockedFleet(
      //     fleetAccount.key,
      //     2, // Mininmal repair to activate the fleet
      //     this.process.dispatcher.signer.as,
      //     this.dispatcher.funderPermissionIdex,
      //   )),
      //   // Auto load fuel and ammo on  respawn
      //   ...(await this.dispatcher.sageFleetHandler.ixDepositCargoToFleet(
      //     fleetAccount.key,
      //     fleetAccount.data.fuelTank,
      //     this.dispatcher.sageGameHandler.getResourceMintAddress("fuel"),
      //     (fleetAccount.data.stats as ShipStats).cargoStats.fuelCapacity,
      //     this.process.dispatcher.signer.as,
      //     this.dispatcher.funderPermissionIdex,
      //   )),
      //   ...(await this.dispatcher.sageFleetHandler.ixDepositCargoToFleet(
      //     fleetAccount.key,
      //     fleetAccount.data.ammoBank,
      //     this.dispatcher.sageGameHandler.getResourceMintAddress("ammunitions"),
      //     (fleetAccount.data.stats as ShipStats).cargoStats.ammoCapacity,
      //     this.process.dispatcher.signer.as,
      //     this.dispatcher.funderPermissionIdex,
      //   )),
      // ];
      // May need to add Refuel And Resupply when they will add the option to do it without moving to loading bay
    }

    return [];
  }

  async checkAbortSignal() {
    const abortContext = {
      actionType: this.constructor.name,
      fleetName: this.process.fleetName,
      currentStep: this.process.currentStep,
      ...this.signals.abort.data,
    };
    if (!this.signals?.abort) return;
    if (
      (typeof this.signals.abort.state === "boolean" && this.signals.abort.state) ||
      (typeof this.signals.abort.state !== "boolean" && (await this.signals.abort.state({})))
    ) {
      if (this.signals.abort.beforeAbort) {
        await this.signals.abort.beforeAbort(abortContext);
      }
      if (this.signals.abort.thrower) {
        await this.signals.abort.thrower(abortContext);
      }
    }
  }
}
