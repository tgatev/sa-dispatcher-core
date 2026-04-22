import { BN } from "@project-serum/anchor";
import { NotSafeMovement } from "../Error/ErrorHandlers";
import { iSimpleAction } from "./Action";
import { Coordinates, MoveAction, iCoordinates } from "./MoveAction";
import { FleetProcess as Process } from "./FleetProcess";
import { WaitWarpCooldownAction } from "./WaitWarpCooldownAction";
import { SimulatedTransactionResponse, TransactionInstruction } from "@solana/web3.js";
import { InstructionReturn } from "@staratlas/data-source";
import { iQueueItem } from "./Queue";
import { clone } from "lodash";
import { ShipStats } from "@staratlas/sage-main";
import { DispatcherParsedTransactionWithMeta } from "./Dispatcher";
import { Action } from "./Action";
export class WarpAction extends MoveAction implements iSimpleAction {
  static accumulatedTransactionCost = 0;
  static accumulatedRunTime = 0;
  static transactionsCount: number = 1;
  coordinates: iCoordinates;
  isWarpMove: boolean;
  from?: iCoordinates;

  constructor(process: Process, coordinates: iCoordinates, from: iCoordinates | undefined = undefined) {
    super(process, coordinates, true);
    this.coordinates = coordinates;
    this.isWarpMove = true;
    this.from = clone(from);
    if (!this.coordinates.exitWrapDelay) this.coordinates.exitWrapDelay = 0;
  }

  /**
   * Provide queue item to be added, when execTime exceed queue will process the action, after that the next() is called
   * @returns
   */
  async getQueueItem(executionTime: number = new Date().getTime()) {
    // await new WaitWarpCooldownAction(this.process).run();
    let item: iQueueItem<Action>;

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
    let instructions = await this.handleExitMovement();
    instructions = instructions.concat(
      await this.dispatcher.sageFleetHandler.ixWarpToCoordinate(
        await this.process.fetchFleetPublicKey(),
        [new BN(this.coordinates.x), new BN(this.coordinates.y)],
        this.dispatcher.signer.as,
        this.dispatcher.funderPermissionIdex,
      ),
    );
    return instructions;
  }

  /**
   * Provide Warp TransactionInstruction[]
   *
   * @returns
   */
  async getInstructions(): Promise<TransactionInstruction[]> {
    return this.dispatcher.sageGameHandler.convertInstructionReturnToTransactionInstruction(
      this.dispatcher.signer.as,
      await this.getInstructionsReturns(),
    );
  }

  async execute(): Promise<Array<DispatcherParsedTransactionWithMeta | SimulatedTransactionResponse | undefined>> {
    await new WaitWarpCooldownAction(this.process).run();
    let fleetAccount = await this.process.fetchFleetAccount();

    // Warp the fleet
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
      `${this.process.fleetName} { ${sectorFrom[0]}, ${sectorFrom[1]}}`,
      "--Warp->",
      `{ ${sectorTo[0]}, ${sectorTo[1]}}`,
    );

    // Save fuel database distance
    // to decide movement directions and availability
    // trigger validation before go to sector when need ( default = true )
    if (this.isSafeMove) {
      if (await this.isSafeGoingTo(new Coordinates(sectorTo[0], sectorTo[1]))) {
        this.process.logger.crit(`{${this.process.fleetName}} Warp move is safe.`);
      } else {
        throw new NotSafeMovement(this.process.fleetName, new Coordinates(sectorTo[0], sectorTo[1]), "Warp");
      }
    }

    let rx = await this.dispatcher.signAndSend(await this.getInstructionsReturns(), false, this.priorityFeeConfig, {
      retryOnTimeout: async () => {
        await new Promise((resolve) => setTimeout(resolve, 4000));
        return !(await this.verifyExecution({}));
      },
      signals: this.signals,
    });
    // await new Promise((resolve) => setTimeout(resolve, 2 * 1000)); // wait 2 seconds before fetch new data

    await this.process.fetchFleetAccount();
    if (this.process.fleetAccount?.state.MoveWarp) {
      let results = MoveAction.calcMoveCosts(
        this.process.fleetAccount.data.stats as ShipStats,
        this.process.fleetAccount.state.MoveWarp.fromSector as [BN, BN],
        this.process.fleetAccount.state.MoveWarp.toSector as [BN, BN],
      );
      this.results.timeCost = results.warpTime;
      this.timeCost = results.warpTime;
      this.r4cost.fuel = results.warpFuelBurn;
    }

    this.process.logger.info("Arrival time after ", (await this.getTimeCost()) / 60, "[minutes]");
    // this.process.logger.info("Warp Finish at:", new Date((await this.getTimeCost()) * 1000 + new Date().getTime()), "now:", new Date());

    return rx;
  }

  accumulateFees() {
    this.results.execution.forEach((trx) => {
      //@ts-ignore
      this.results.transactionFees += trx?.meta?.fee || 0;
      WarpAction.accumulatedTransactionCost += this.results.transactionFees || 0;
    });

    WarpAction.accumulatedRunTime += this.results.runTime || 0;
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

  async display(verbose = false): Promise<string> {
    let display =
      `WarpAction: T<${this.getTransactionCount()}> ` +
      (this.from ? `from: ${this.from?.toSectorKey()} ` : "") +
      `toSector: ${this.coordinates.toSectorKey()} ` +
      "SafeMode: " +
      this.isSafeMove;
    verbose && this.process.logger.info(display);

    return display;
  }

  getTransactionCount() {
    return WarpAction.transactionsCount;
  }

  //@ts-ignore
  async verifyExecution(args: any): Promise<boolean> {
    let fa = await this.process.fetchFleetAccount();
    if (fa.state.MoveWarp) {
      return true;
    } else {
      return false;
    }
  }
  toJson() {}

  /**@inheritdoc */
  async export(type: string = "", data: any = {}): Promise<string> {
    return await MoveAction.prototype.export.bind(this)(type, {
      coordinates: this.coordinates,
      from: this.from,
      isWarpMove: this.isWarpMove,
      isSafeMove: this.isSafeMove,
      ...data,
    });
  }
}
