import { Action } from "./Action";
import { FleetProcess as Process } from "./FleetProcess";
import { PublicKey, SimulatedTransactionResponse, TransactionInstruction } from "@solana/web3.js";
import { DispatcherParsedTransactionWithMeta } from "./Dispatcher";
import { iError } from "../Error/ErrorHandlers";
import { SageFleetHandler } from "../holoHandlers/FleetHandler";
import { LootDetails } from "../Common/types";
import { InstructionReturn } from "@staratlas/data-source";
import { log } from "../Common/PatchConsoleLog";
import { SageGameHandler } from "../holoHandlers/GameHandler";
import { UnDockAction } from "./UndockAction";

/**
 * Implements wait until warp could is loaded
 */
export class RetrieveLootAction extends Action {
  static transactionsCount: number = 0;
  private txsCount = 0;
  public waitOnNoLoot = 90; // seconds to wait when no loot is available before checking again
  constructor(
    process: Process,
    private retrieve_mode: "ONCE" | "FILL_CARGO" = "ONCE",
    private processLimit: number = 1,
    // Loot is result of loot search that should, number should match the number of parallel processes - cargo amount of that should be validated to avoid errors
    private loots = (async () => {
      return [] as LootDetails[];
    })(),
  ) {
    super(process);
    this.waitAfterExecute = 0.5;
    this.waitTimeCostAfter = true;

    if (retrieve_mode === "ONCE") {
      this.processLimit = 1;
    }
  }
  async refreshLoots(profile: undefined | PublicKey = undefined): Promise<LootDetails[]> {
    let GH = this.dispatcher.sageGameHandler as unknown as SageGameHandler;
    let FH = this.dispatcher.sageFleetHandler as unknown as SageFleetHandler;

    this.loots = this.process.fetchFleetAccount().then(async (fa) => {
      if (GH.logger.verbose == -1) console.time("refreshLoots");
      if (!profile) profile = await GH.getFleetPlayerProfile(fa as any);

      // Handle exit movement if needed before retrieve loot
      if (fa.state.MoveSubwarp || fa.state.MoveWarp) {
        let ixs = await this.handleExitMovement();
        await this.dispatcher.signAndSend(ixs, false, this.priorityFeeConfig);
        this.txsCount++;
        this.dispatcher.logger.log("Executed exit movement instructions before retrieve loot");
      }
      // force refetch of fleet account to get updated position after exit movement
      let location = await FH.getCurrentSector(await this.process.fetchFleetPublicKey());
      let lootsList = await GH.listRetrievableLoot(location.x, location.y, this.processLimit, profile);
      if (GH.logger.verbose == -1) console.timeEnd("refreshLoots");
      console.log(
        "---> Loots in sector",
        location.toSectorKey(),
        lootsList.retrievableByAnyone.length,
        lootsList.retrievableByOwner.length,
        // limit: this.processLimit,
      );

      return [...lootsList.retrievableByAnyone, ...lootsList.retrievableByOwner] as LootDetails[];
    });

    return await this.loots;
  }

  /**
   * Provide Exit Warp InstructionReturn[]
   * @returns
   */
  async getInstructionsReturns(): Promise<InstructionReturn[]> {
    if (this.retrieve_mode === "FILL_CARGO") {
      throw "UNPROCESSABLE STATE";
    }

    // prevent transaction sending -> but with parallel transactions in they often being sent ... cause we do not count loot weight in front of the transaction
    let [cargoSpace, loots] = await Promise.all([this.dispatcher.sageFleetHandler.getFleetFreeCargoSpaces(await this.process.fetchFleetAccount()), this.loots]);
    if (cargoSpace.cargoHold <= 0) {
      // Cargo is full - cannot retrieve loot - end process or wait until cargo space is available based on retrieve mode
      this.dispatcher.logger.warn("Cannot retrieve loot - cargo is full");
      return [];
    }

    let loot = loots.shift();
    this.loots = Promise.resolve(loots);

    let instructions = await this.handleExitMovement();
    let sfh = this.dispatcher.sageFleetHandler as unknown as SageFleetHandler;

    let fa = this.process.fleetAccount!;
    if (fa.state.StarbaseLoadingBay) {
      // In this case instructions is empty
      let udixs = await new UnDockAction(this.process).getInstructionsReturns();
      instructions.push(...udixs);
    } else {
      let udixs = await this.handleExitMovement();
      instructions.push(...udixs);
    }

    let ixsPrepared = await sfh.ixRetrieveLoot(
      await this.process.fetchFleetPublicKey(),
      this.process.dispatcher.signer.as,
      this.dispatcher.funderPermissionIdex,
      loot,
    );
    let now = Date.now() / 1000;
    this.dispatcher.logger.dbg(
      ixsPrepared.dataPreparedForIx?.loot,
      "<--- Prepared retrieve loot instruction with data:",
      now - Number(ixsPrepared.dataPreparedForIx?.loot.activeItem.exclusivityUnlockTime),
    );
    instructions = instructions.concat(ixsPrepared.ixs);

    return instructions;
  }

  /**
   * Provide Exit Warp TransactionInstruction[]
   * @returns
   */
  async getInstructions(): Promise<TransactionInstruction[]> {
    return await this.dispatcher.sageGameHandler.convertInstructionReturnToTransactionInstruction(
      this.process.dispatcher.signer.as,
      await this.getInstructionsReturns(),
    );
  }

  async execute(): Promise<Array<DispatcherParsedTransactionWithMeta | SimulatedTransactionResponse | undefined>> {
    await this.process.fetchFleetAccount();
    // this.process.logger.log(fleetAccount.state, "<--- Fleet state before retrieve loot action execution");

    let rx = await this.dispatcher.signAndSend(await this.getInstructionsReturns(), true, this.priorityFeeConfig, {
      retryOnTimeout: async (d, e) => {
        // if (e.trErr?.err?.InstructionError[1]?.Custom) {
        //   console.error("Attack failed with errorCode:", e.trErr?.err?.InstructionError[1]?.Custom);
        // }
        // switch (e.trErr?.err?.InstructionError[1]?.Custom) {
        //   case 6098: {
        //     // AP No reload
        //     let fa = await this.process.fetchFleetAccount();
        //     let cds = await this.process.dispatcher.sageFleetHandler.getCooldown(fa);
        //     this.waitTimeProgress(Math.max((cds.attackCooldown + 0.5) * 1000, 100), "Waiting for AP reload", 100);
        //     return true;
        //   }
        //   default: {
        //   }
        // }
        if (e.sim.value.err) {
          // console.error("Error executing retrieve loot action ------------- ", e.sim.value.err);
          // await new Promise((resolve) => setTimeout(resolve, 2000));
          // return false;
          // this.continueOnError = true; // Continue to next action on error
        }
        console.error("Error executing retrieve loot action ------------- ", e);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return false;
        // return !(await this.verifyExecution({}));
      },
      continueOnError: true,
      signals: this.signals,
    });

    return rx;
  }
  async verifyExecution(data: any): Promise<boolean> {
    return true;
  }

  async getTimeCost(): Promise<number> {
    return 0;
  }

  async display(verbose = false): Promise<string> {
    let display = `RetrieveLootAction: T<${this.getTransactionCount()}>`;
    verbose && this.process.logger.info(display);

    return display;
  }

  getTransactionCount() {
    return RetrieveLootAction.transactionsCount;
  }

  /**@inheritdoc */
  async export(type: string = "", data: any = {}): Promise<string> {
    return await Action.prototype.export.bind(this)(type, {
      waitAfterExecute: this.waitAfterExecute,
      waitTimeCostAfter: this.waitTimeCostAfter,
      ...data,
    });
  }

  async run(): Promise<boolean | iError> {
    // When Loots Are ready
    let loots = await this.loots;
    if (loots.length === 0) {
      this.dispatcher.logger.warn("No loot available to retrieve in current sector");
      loots = await this.refreshLoots();
    }
    let FH = this.dispatcher.sageFleetHandler as unknown as SageFleetHandler;

    if (this.retrieve_mode === "ONCE") {
      return await super.run();
    } else if (this.retrieve_mode === "FILL_CARGO") {
      //  Validate Cargo Space
      let tmpLoot = loots.shift();
      let promises = [];
      // Collect all listed loots
      //@ts-ignore - type is compatible
      let cargoSpace = await FH.getFleetFreeCargoSpaces(await this.process.fetchFleetAccount());

      while (tmpLoot) {
        if (cargoSpace.cargoHold <= 0) {
          this.dispatcher.logger.warn("Cannot retrieve loot - cargo is full");
          break;
        }
        let action = new RetrieveLootAction(this.process, "ONCE", 1, Promise.resolve([tmpLoot])).run().catch((err) => {
          this.dispatcher.logger.err("Error retrieving loot in FILL_CARGO mode", err);
        });
        promises.push(action);

        tmpLoot = loots.shift();
      }

      // empty after execution
      this.loots = Promise.resolve([]);

      // TODO: handle transaction count and cost and logs to be collected properly from each parallel action
      await Promise.all(promises).catch((err) => {
        this.dispatcher.logger.err("Error retrieving loot in FILL_CARGO mode", err);
      });

      //@ts-ignore - type is compatible
      cargoSpace = await FH.getFleetFreeCargoSpaces(await this.process.fetchFleetAccount());
      if (cargoSpace.cargoHold > 0) {
        this.dispatcher.logger.warn("Finished retrieving all listed loot but cargo is not full ... REPEATING - checking for new loot", this.processLimit);
        // Fetch new loots and repeat
        await this.refreshLoots();
        loots = await this.loots;
        if (loots.length === 0) {
          console.warn("No loot Found after refreshing");
          if (this.waitOnNoLoot > 0) {
            console.warn(`Waiting for ${this.waitOnNoLoot} seconds before checking for new loot...`);
            // Wait 30 seconds and check again for new loot
            await new Promise((resolve) => setTimeout(resolve, this.waitOnNoLoot * 1000));

            // ! This hack decrease Memory usage
            this.process.currentStep--; // Instead of recursion - decrease step to repeat the same step with new loots
            // return await this.run();

            return true;
          } else {
            // TO NOT BLOCK action execution when there is not set loot time  we continue to the next action ...
            // This means: HERE WE exit with not full cargo - just a part of it
            return true;
          }
        }
      }
      // EXIT STATE - Cargo is full or no more loot available
      return true;
    }
    throw "Unsupported retrieve loot mode!";
  }
}
