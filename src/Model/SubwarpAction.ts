import { BN } from "@project-serum/anchor";
import { NotSafeMovement } from "../Error/ErrorHandlers";
import { Action, iActionInterruptOptions, iSimpleAction } from "./Action";
import { MoveAction, Coordinates, iCoordinates } from "./MoveAction";
import { FleetProcess as Process } from "./FleetProcess";
import { SimulatedTransactionResponse, TransactionInstruction } from "@solana/web3.js";
import { InstructionReturn } from "@staratlas/data-source";
import { iQueueItem } from "./Queue";
import { clone } from "lodash";
import { ShipStats } from "@staratlas/sage-main";
import { DispatcherParsedTransactionWithMeta } from "./Dispatcher";

export type SubwarpCombatTargetPreview = {
  targetKey: string;
  rate?: number;
  hp?: number;
  sp?: number;
  ap?: number;
  isBusy?: boolean;
};

export type SubwarpCombatCoordinator = {
  getCoordinatorTargets?: () => Promise<SubwarpCombatTargetPreview[]>;
  getAttackableTargets?: () => Promise<SubwarpCombatTargetPreview[]>;
  getCoordinatorTargetKey?: () => Promise<string | null>;
};

export type SubwarpCombatFactoryOptions = {
  from?: iCoordinates;
  interruptOptions?: iActionInterruptOptions;
  combatCoordinator?: SubwarpCombatCoordinator;
  selectTarget?: (ctx: {
    attackableTargets: SubwarpCombatTargetPreview[];
    coordinatorTargets: SubwarpCombatTargetPreview[];
    coordinatorTargetKey: string | null;
  }) => Promise<SubwarpCombatTargetPreview | null> | SubwarpCombatTargetPreview | null;
  runCombatTick?: (ctx: {
    selectedTarget: SubwarpCombatTargetPreview | null;
    attackableTargets: SubwarpCombatTargetPreview[];
    coordinatorTargets: SubwarpCombatTargetPreview[];
  }) => Promise<void>;
  waitAfterNoTargetMs?: number;
  waitAfterTickMs?: number;
  logger?: (...args: unknown[]) => void;
};

export class SubwarpAction extends MoveAction implements iSimpleAction {
  static accumulatedTransactionCost = 0;
  static accumulatedRunTime = 0;
  static transactionsCount: number = 1;

  coordinates: iCoordinates;
  from?: iCoordinates;
  exitMovementOptions?: iActionInterruptOptions;

  static createCombatAware(
    process: Process,
    coordinates: iCoordinates,
    options: SubwarpCombatFactoryOptions = {},
  ): SubwarpAction {
    const action = new SubwarpAction(process, coordinates, options.from);
    action.exitMovementOptions = {
      ...(options.interruptOptions || {}),
      onInterrupt: SubwarpAction.createCombatInterrupt(process, options),
    };
    return action;
  }

  private static createCombatInterrupt(process: Process, options: SubwarpCombatFactoryOptions): iActionInterruptOptions["onInterrupt"] {
    return async () => {
      try {
        const fleet = await process.fetchFleetAccount();
        if (!fleet.state.MoveSubwarp) {
          return { type: "proceed" };
        }

        const coordinator = options.combatCoordinator;
        const attackableTargets = (await coordinator?.getAttackableTargets?.()) || [];
        const coordinatorTargets = (await coordinator?.getCoordinatorTargets?.()) || [];
        const coordinatorTargetKey = (await coordinator?.getCoordinatorTargetKey?.()) || null;
        
        // This is a random flow 
        const selectedByDefault =
          attackableTargets.find((t) => t.targetKey === coordinatorTargetKey) ||
          attackableTargets[0] ||
          coordinatorTargets.find((t) => t.targetKey === coordinatorTargetKey) ||
          coordinatorTargets[0] ||
          null;

        const selectedTarget =
          (await options.selectTarget?.({ attackableTargets, coordinatorTargets, coordinatorTargetKey })) || selectedByDefault;

        if (!selectedTarget) {
          const sleepMs = Math.max(250, Number(options.waitAfterNoTargetMs ?? 1000));
          await new Promise((resolve) => setTimeout(resolve, sleepMs));
          return { type: "proceed" };
        }
        
        await options.runCombatTick?.({
          selectedTarget,
          attackableTargets,
          coordinatorTargets,
        });

        const afterTickSleepMs = Math.max(0, Number(options.waitAfterTickMs ?? 0));
        if (afterTickSleepMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, afterTickSleepMs));
        }

        return { type: "proceed" };
      } catch (error) {
        options.logger?.("[SubwarpCombatFactory]["+ this.process.fleetName +"] interrupt error", String((error as any)?.message || error));
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return { type: "proceed" };
      }
    };
  }

  constructor(process: Process, coordinates: iCoordinates, from: iCoordinates | undefined = undefined) {
    super(process, coordinates, false);
    this.coordinates = coordinates;
    this.isWarpMove = false;
    this.from = clone(from);
    this.waitAfterExecute;
    if (!this.coordinates.exitWrapDelay) this.coordinates.exitWrapDelay = 0;
  }

  accumulateFees() {
    this.results.execution.forEach((trx) => {
      //@ts-ignore
      this.results.transactionFees += trx?.meta?.fee || 0;
      SubwarpAction.accumulatedTransactionCost += this.results.transactionFees || 0;
    });

    SubwarpAction.accumulatedRunTime += this.results.runTime || 0;
    super.accumulateFees();
  }

  async wrapAfterExecute(action: Action) {
    action.accumulateFees();

    const exitWaitStartedAt = Date.now();
    const exitInstructions = await this.handleExitMovement();
    const realWaitSeconds = Math.max(0, Math.ceil((Date.now() - exitWaitStartedAt) / 1000));
    this.timeCost = realWaitSeconds;
    this.results.timeCost = realWaitSeconds;

    if (exitInstructions.length) {
      await this.dispatcher.signAndSend(exitInstructions, false, this.priorityFeeConfig, {
        signals: this.signals,
      });
    }

    if (action.waitAfterExecute) {
      await action.waitingTimeCost(action.waitAfterExecute);
    }
  }

  /**
   * Provide Subwarp InstructionReturn[]
   * @returns
   */
  async getInstructionsReturns(): Promise<InstructionReturn[]> {
    let instructions = await this.handleExitMovement();
    instructions = instructions.concat(
      await this.dispatcher.sageFleetHandler.ixSubwarpToCoordinate(
        await this.process.fetchFleetPublicKey(),
        [new BN(this.coordinates.x), new BN(this.coordinates.y)],
        this.dispatcher.signer.as,
        this.dispatcher.funderPermissionIdex,
      ),
    );
    return instructions;
  }

  /**
   * Provide queue item to be added, when execTime exceed queue will process the action, after that the next() is called
   * @returns
   */
  async getQueueItem() {
    //   // exampel item chain Exit Sub warp [ the problem is how to get time delay by a general way for exit Warp/SubWarp/Mining ]
    let item: iQueueItem<iSimpleAction>;

    //   if (this.autoExit) {
    //     // inject autoexit -> process forward
    //     item = {
    //       action: this,
    //       execTime: new Date().getTime(),
    //       // Next is called after execution ... in this case we add exit action called when cooldown is loaded after that forward the process
    //       next: async (process: Process) => {
    //         // Wait Fleet status update
    //         let fleet = await process.fetchFleetAccount();
    //         let exitTime = Number(fleet.state.MoveSubwarp?.arrivalTime + 1) * 1000; // [s -> ms]
    //         let waitTime = exitTime - new Date().getTime(); // [ms]
    //         this.process.logger.log("Execute ExitTime:", new Date(exitTime), "now:", new Date());
    //         this.process.logger.log("Execute Exit after: ", waitTime / (60 * 1000), "minutes");
    //         await this.waitTimeProgress(waitTime, "Sub-Warp moving...");

    //         process.forward();
    //       },
    //     };
    //   } else {
    // no autoexit -> process forward
    item = {
      action: this,
      execTime: new Date().getTime(),
      next: async (process: Process) => {
        return process.forward();
      },
    };
    // }

    return item;
  }
  /**
   * Provide Subwarp TransactionInstruction[]
   * @returns
   */
  async getInstructions(): Promise<TransactionInstruction[]> {
    return this.dispatcher.sageGameHandler.convertInstructionReturnToTransactionInstruction(
      this.dispatcher.signer.as,
      await this.getInstructionsReturns(),
    );
  }

  async execute(): Promise<Array<DispatcherParsedTransactionWithMeta | SimulatedTransactionResponse | undefined>> {
    let fleetAccount = await this.process.fetchFleetAccount();
    // Check that the fleet is idle, abort if not

    // if (!fleetAccount.state.Idle) {
    //   throw "fleet is expected to be idle before warping";
    // }

    // SubWarp the fleet

    let sector = await this.process.getCurrentSector(fleetAccount);
    let sectorFrom = [new BN(sector.x), new BN(sector.y)]; // [fX, fY]

    let sectorTo: [BN, BN];
    if (this.coordinates.isShipCenter) {
      // ADD From current location ( ship centered coordinate submission )
      sectorTo = [sectorFrom[0].add(new BN(this.coordinates.x)), sectorFrom[1].add(new BN(this.coordinates.y))]; // [fX+x, fY+y]
    } else {
      sectorTo = [new BN(this.coordinates.x), new BN(this.coordinates.y)];
    }
    this.process.logger.crit(
      this.process.fleetName,
      `{ ${sectorFrom[0]}, ${sectorFrom[1]}}`,
      "--SubWarp->",
      `{ ${sectorTo[0]}, ${sectorTo[1]}}`,
    );

    // Save fuel database distance
    // to decide movement directions and availability
    // Trigger validation if need ( default = true )
    if (this.isSafeMove) {
      if (await this.isSafeGoingTo(new Coordinates(sectorTo[0], sectorTo[1]))) {
        this.process.logger.log(`{${this.process.fleetName}} SubWarp move is safe.`);
      } else {
        throw new NotSafeMovement(this.process.fleetName, new Coordinates(sectorTo[0], sectorTo[1]), "SubWarp");
      }
    }
    // Move instructions
    let rx = await this.dispatcher.signAndSend(await this.getInstructionsReturns(), false, this.priorityFeeConfig, {
      retryOnTimeout: async (_d, e) => {
        await new Promise((resolve) => setTimeout(resolve, 4000));
        return !(await this.verifyExecution(e));
      },
      signals: this.signals,
    });
    // await new Promise((resolve) => setTimeout(resolve, 1 * 1000)); // wait 2 seconds before fetch new data
    await this.process.fetchFleetAccount();
    // let exitTime = await this.getTravelingTimeLeft(); // [s -> ms]
    if (this.process.fleetAccount?.state.MoveSubwarp) {
      let results = MoveAction.calcMoveCosts(
        this.process.fleetAccount.data.stats as ShipStats,
        this.process.fleetAccount.state.MoveSubwarp.fromSector as [BN, BN],
        this.process.fleetAccount.state.MoveSubwarp.toSector as [BN, BN],
      );
      this.results.timeCost = results.subWarpTime;
      this.timeCost = results.subWarpTime;
      this.r4cost.fuel = results.subWarpFuelBurn;
    }
    this.process.logger.info("Arrival time after ", (await this.getTimeCost()) / 60, "[minutes]");
    // this.process.logger.info("Subwarp Finish at:", new Date((await this.getTimeCost()) * 1000 + new Date().getTime()), "now:", new Date());

    return rx;
  }

  async display(verbose = false): Promise<string> {
    let display =
      `SubwarpAction: T<${this.getTransactionCount()}> ` +
      (this.from ? `from: ${this.from?.toSectorKey()}` : "") +
      `toSector: ${this.coordinates.toSectorKey()} ` +
      "SafeMode: " +
      this.isSafeMove;
    verbose && this.process.logger.info(display);

    return display;
  }

  getTransactionCount() {
    return SubwarpAction.transactionsCount;
  }

  async verifyExecution(args: any): Promise<boolean> {
    let fa = await this.process.fetchFleetAccount();
    this.process.logger.log("Verifying Subwarp execution, fleet state:", fa.state, args);
    if (fa.state.Respawn) {
      this.signals.abort.data = {
        type: "Fleet was DESTROYED!",
        message: `Fleet was destroyed during Subwarp!`,
      };
      this.signals.abort.state = true;
      return false;
    }

    if (fa.state.MoveSubwarp) {
      return true;
    } else {
      return false;
    }
  }

  /**@inheritdoc */
  async export(type: string = "", data: any = {}): Promise<string> {
    return await MoveAction.prototype.export.bind(this)(type, {
      from: this.from,
      coordinates: this.coordinates,
      isWarpMove: this.isWarpMove,
      isSafeMove: this.isSafeMove,
      ...data,
    });
  }
}
