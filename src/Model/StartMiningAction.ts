import { Fleet, ShipStats } from "@staratlas/sage-main";
import { NotEnoughResources, iError } from "../Error/ErrorHandlers";
import { Action, iActionR4Cost, iSimpleAction } from "./Action";
import { FleetProcess as Process } from "./FleetProcess";
import { DispatcherParsedTransactionWithMeta, SageGameHandler } from "../..";
import { InstructionReturn } from "@staratlas/data-source";
import { SimulatedTransactionResponse, TransactionInstruction } from "@solana/web3.js";
import { iQueueItem } from "./Queue";
import { StopMiningAction } from "./StopMining";

export type iStartMiningOptions = {
  miningTime?: number;
  autoStop?: boolean;
};

/**
 * Implements start mining
 *  [x] Validate before start mining
 *  [x] Automatic mining time calculation based on free cargo Space
 *  [x] Costs calculation
 *
 * new StartMiningAction(process: Process, resourceName: string, onHardnesss: number, onRichness: number, miningTime?: number)
 */
export class StartMiningAction extends Action implements iSimpleAction {
  resourceName: string;
  onHardness: number;
  onRichness: number;
  options: iStartMiningOptions;
  static accumulatedTransactionCost = 0;
  static accumulatedRunTime = 0;
  static transactionsCount: number = 1;

  constructor(
    process: Process,
    resourceName: string,
    onHardness: number,
    onRichness: number,
    options: {
      miningTime?: number;
      autoStop?: boolean;
    } = { autoStop: false },
  ) {
    super(process);
    this.resourceName = resourceName;
    this.onHardness = onHardness;
    this.onRichness = onRichness;
    this.options = options;
  }

  accumulateFees() {
    this.results.execution.forEach((trx) => {
      //@ts-ignore
      this.results.transactionFees += trx?.meta?.fee || 0;
      StartMiningAction.accumulatedTransactionCost += this.results.transactionFees || 0;
    });

    StartMiningAction.accumulatedRunTime += this.results.runTime || 0;
    super.accumulateFees();
  }

  async getQueueItem(executionTime: number = new Date().getTime()): Promise<iQueueItem> {
    this.waitTimeCostAfter = false;
    // iSimpleAction;
    return {
      action: this,
      execTime: executionTime,
      // if auto stop - push stop item to queue - else process.forward.
      next: this.options.autoStop
        ? async (process: Process) => {
            // Duration of mining, after that call Stop Mining
            let waitTime = this.options.miningTime || (await this.getTimeCost());
            await this.dispatcher.queue.queue([await new StopMiningAction(process).getQueueItem(waitTime)]);
          }
        : async (process: Process) => {
            return process.forward(); // go back to process chain forwarding
          },
    } as iQueueItem;
  }

  /**
   * Provide Start Mining InstructionReturn[]
   *
   * @returns
   */
  async getInstructionsReturns(): Promise<InstructionReturn[]> {
    let instructions = await this.handleExitMovement();
    instructions = instructions.concat(
      await this.dispatcher.sageFleetHandler.ixStartMining(
        await this.process.fetchFleetPublicKey(),
        this.dispatcher.signer.as,
        this.dispatcher.funderPermissionIdex,
        this.resourceName,
      ),
    );
    return instructions;
  }

  /**
   * Provide Start Mining TransactionInstruction[]
   *
   * @returns
   */
  async getInstructions(): Promise<TransactionInstruction[]> {
    return this.dispatcher.sageGameHandler.convertInstructionReturnToTransactionInstruction(
      this.dispatcher.signer.as,
      await this.getInstructionsReturns(),
    );
  }

  /**
   * Start fleet mining and wait X of time to fill the cargo space before return
   * @returns
   */
  async execute(): Promise<Array<DispatcherParsedTransactionWithMeta | SimulatedTransactionResponse | undefined>> {
    this.process.logger.log("ResourceName:", this.resourceName);
    this.process.logger.log("r4cost:", await this.getResourceCost());
    let resourceCosts = await this.calcMiningTimesCosts(1);
    this.process.logger.log("calcCosts:", resourceCosts);
    // Execute transaction with all instructions
    let rx: Array<DispatcherParsedTransactionWithMeta | SimulatedTransactionResponse | undefined> = await this.dispatcher.signAndSend(
      await this.getInstructionsReturns(),
      false,
      this.priorityFeeConfig,
      {
        retryOnTimeout: async () => {
          await new Promise((resolve) => setTimeout(resolve, 4000));
          return !(await this.verifyExecution({}));
        },
        signals: this.signals,
      },
    );
    // R4 resources will be calculated on Cargo Load steps
    // Always 1 transaction

    if (!this.options.miningTime) {
      let baseTime = await this.getTimeCost();
      // Add time to mine free space after food consumption
      let addTime = await this.getTimeCost(resourceCosts.food);
      this.options.miningTime = baseTime + addTime;
    }
    let fleetAccount = await this.process.fetchFleetAccount();
    this.process.logger.log("Mining Mint:", this.resourceName, fleetAccount.state.MineAsteroid?.resource.toBase58());
    this.process.logger.log("State Start Mining:", Number(fleetAccount.state.MineAsteroid?.start));
    this.process.logger.log("State End Mining:", Number(fleetAccount.state.MineAsteroid?.end));
    this.process.logger.log("Mining time: ", this.options.miningTime / 60, "minutes.");
    this.process.logger.log("Auto Stop:", this.options.autoStop);
    this.process.logger.log("Wait until: ", new Date(new Date().getTime() + this.options.miningTime * 1000));

    if (this.options.autoStop) {
      await this.waitingTimeCost();
      let rs = await new StopMiningAction(this.process).execute();
      rx = rx.concat(rs);
    }

    return rx;
  }

  /**
   * This method provide amount of resources to load
   *  for mining N-times by single loading of resources
   *
   * @returns time: number - time to provide full cargo
   */
  async calcMiningTimesCosts(n: number = 1): Promise<iActionR4Cost> {
    let fleetAccount = this.process.fleetAccount || (await this.process.fetchFleetAccount());
    let fleetStats: ShipStats = fleetAccount.data.stats;
    let totalCost = { food: 0, fuel: 0, ammunitions: 0, tool: 0 };
    // let baseCost = await this.getResourceCost(await this.getTimeCost(fleetStats.cargoStats.cargoCapacity));

    for (let i = 0; n > i; i++) {
      // Food reduce mining cargo - that affect time and resources that will be consumed
      let cargoToMine = fleetStats.cargoStats.cargoCapacity - totalCost.food;
      let cargoTime = await this.getTimeCost(cargoToMine);
      let iterationCost = await this.getResourceCost(cargoTime);

      totalCost = {
        food: totalCost.food + Math.floor(iterationCost.food || 0),
        fuel: totalCost.fuel + Math.ceil(iterationCost.fuel || 0),
        ammunitions: totalCost.ammunitions + Math.ceil(iterationCost.ammunitions || 0),
        tool: totalCost.tool + Math.ceil(iterationCost.tool || 0),
      };
    }

    // totalCost = {
    //   food: totalCost.food + Math.round(iterationCost.food || 0),
    //   fuel: totalCost.fuel + Math.ceil(iterationCost.fuel || 0),
    //   ammunitions: totalCost.ammunitions + Math.ceil(iterationCost.ammunitions || 0),
    //   tool: totalCost.tool + Math.ceil(iterationCost.tool || 0),
    // };
    return totalCost;
  }

  /**
   *  Provide mining time to fill the Free Space in Cargo
   *    used to define how much the proccess should wait
   *    when is not provided a value
   *
   * @returns number [ time in seconds ]
   */
  async getTimeCost(amount: number = 0): Promise<number> {
    if (this.options.miningTime) return this.options.miningTime;

    let fleet = await this.process.fetchFleetAccount();
    // hardness * cargoCap = richness*rate * time
    // hardness * cargoCap / richness* rate = time
    let freeSpaces = amount || (await this.dispatcher.sageFleetHandler.getFleetFreeCargoSpaces(fleet)).cargoHold;
    // @ts-ignore
    // let cargoHold = fleet.data.stats.cargoStats.cargoCapacity;
    return Math.ceil(
      Fleet.calculateAsteroidMiningResourceExtractionDurationBareBones(
        fleet.data.stats,
        this.onHardness,
        this.onRichness,
        //@ts-ignore - always have
        freeSpaces,
      ),
    );
  }

  /**
   * Provide costs
   *  based on Time and free cargo space
   *  If time is not passed will be calculated based on the free space
   *
   *  Method is used in validate()
   * @returns iActionR4Cost
   */
  async getResourceCost(time: number = 0): Promise<iActionR4Cost> {
    let fleetAccount = await this.process.fetchFleetAccount();
    let fleetStats: ShipStats = fleetAccount.data.stats;
    let rate = Fleet.calculateAsteroidMiningEmissionRateBareBones(fleetStats, this.onHardness, this.onRichness);
    if (rate <= 0) throw "Mining Rate could not be negative or 0: " + rate;
    if (!time) {
      let freeSpace = fleetStats.cargoStats.cargoCapacity;
      // let freeSpaces = await this.dispatcher.sageFleetHandler.getFleetFreeCargoSpaces(fleetAccount);
      time = freeSpace / rate;
    }
    // console.log(time, fleetStats.cargoStats.foodConsumptionRate / 10000, time * (fleetStats.cargoStats.foodConsumptionRate / 10000));
    // throw "DDDD";
    // time*food consumption
    return {
      //@ts-ignore type never planetExitFuelAmount
      fuel: fleetAccount.data.stats.movementStats.planetExitFuelAmount,
      //@ts-ignore type never foodConsumptionRate
      food: Math.floor(Fleet.calculateAsteroidMiningFoodToConsume(fleetStats, 10000000, time)), // (time * Math.round(fleetStats.cargoStats.foodConsumptionRate / 10)) / 1000, //
      //@ts-ignore type never ammoConsumptionRate
      ammunitions: Fleet.calculateAsteroidMiningAmmoToConsume(fleetStats, 10000000, time),
      tool: 0,
    } as iActionR4Cost;
  }

  /**
   * Validate method is used in .run() before execute
   *    Validate is there enough resources to finish mining (fuel, ammo, food)
   * to provide optimal results
   *
   * @returns true or trow an error
   */
  async validate(): Promise<boolean | iError> {
    let fleet = await this.process.fetchFleetAccount();
    let costs = await this.getResourceCost(this.options.miningTime || undefined);
    // let food = await this.dispatcher.sageGameHandler.getTokenAccountMintAmount(
    //   fleet.data.cargoHold,
    //    this.dispatcher.sageGameHandler.getResourceMintAddress("food")
    // );

    // if (food < (costs.food || 0) - 1) {
    //   throw new NotEnoughResources("food", food, costs.food || 0 - 1);
    // }
    let ammo = await this.dispatcher.sageGameHandler.getTokenAccountMintAmount(
      fleet.data.ammoBank,
      this.dispatcher.sageGameHandler.getResourceMintAddress("ammunitions"),
    );

    if (ammo < (costs.ammunitions || 0) - 1) {
      throw new NotEnoughResources("ammunitions", ammo, costs.ammunitions || 0 - 1);
    }

    let fuel = await this.process.getFuelAmount();
    if (fuel < (costs.fuel || 0)) {
      throw new NotEnoughResources("fuel", fuel, costs.fuel || 0);
    }
    return true;
  }

  async display(verbose = false): Promise<string> {
    let display = `StartMining: T<${this.getTransactionCount()}> resource: ${this.resourceName} ${this.onRichness}/${this.onHardness} `;
    verbose && this.process.logger.info(display);

    return display;
  }

  getTransactionCount() {
    return StartMiningAction.transactionsCount;
  }

  // @ts-ignore ars not used
  async verifyExecution(args: any): Promise<boolean> {
    let fa = await this.process.fetchFleetAccount();
    if (fa.state.MineAsteroid) {
      return true;
    } else {
      return false;
    }
  }

  /**@inheritdoc */
  async export(type: string = "", data: any = {}): Promise<string> {
    return await Action.prototype.export.bind(this)(type, {
      resourceName: this.resourceName,
      onHardness: this.onHardness,
      onRichness: this.onRichness,
      options: this.options,
      ...data,
    });
  }
}
