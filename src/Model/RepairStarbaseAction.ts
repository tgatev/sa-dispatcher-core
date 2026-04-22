import { PublicKey, SimulatedTransactionResponse, TransactionInstruction } from "@solana/web3.js";
import { byteArrayToString, InstructionReturn } from "@staratlas/data-source";
import { Action, iSimpleAction } from "./Action";
import { FleetProcess as Process } from "./FleetProcess";
import { iQueueItem } from "./Queue";
import { Coordinates, iCoordinates } from "./MoveAction";
import { clone } from "lodash";
import { DispatcherParsedTransactionWithMeta } from "./Dispatcher";
import { iError } from "../Error/ErrorHandlers";
import { Fleet, SageGameHandler, SageFleetHandler } from "../holoHandlers/HolosimMintsImporter";
import { log } from "../Common/PatchConsoleLog";
/**
 * Implements undock fleet action
 */
export class RepairStarbaseAction extends Action implements iSimpleAction {
  static accumulatedTransactionCost = 0;
  static accumulatedRunTime = 0;
  static transactionsCount: number = 1;
  sector: iCoordinates;
  constructor(
    process: Process,
    public waitOnNoRepairTargetMs: number = 30, // Wait time in seconds before retrying to find a repair target if none is found in the current sector
    public amount?: number,
    public target?: PublicKey,
    sector = new Coordinates(0, 0),
  ) {
    super(process);
    this.sector = clone(sector);
    this.waitAfterExecute = waitOnNoRepairTargetMs; // Convert to milliseconds
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

  async scaoutLocation(coordinates: Coordinates): Promise<{ tgtBase?: PublicKey; amount?: number }> {
    let fa = this.process.fleetAccount! as unknown as Fleet;
    //
    let fh: SageFleetHandler = this.dispatcher.sageFleetHandler;
    let gh: SageGameHandler = this.dispatcher.sageGameHandler;

    let cargoItems = fh.getCargoItems(fa as any);

    let tgtBase = gh.getStarbaseAddress(coordinates.toBN());
    let tgtBaseAccount = await gh.getStarbaseAccount(tgtBase);
    if (tgtBaseAccount?.data?.faction !== fa.data.faction) {
      return {}; // ! Early return if the starbase is not friendly to avoid unnecessary transaction execution and fees
    }
    log(tgtBaseAccount);
    let amount = 1;
    let cargoToolkitAmount = (await cargoItems).find((i) => i.mint.equals(gh.asStatic().SAGE_RESOURCES_MINTS["toolkit"]))?.amount;
    if (!cargoToolkitAmount) {
      this.dispatcher.logger.dbg("No toolkits found in cargo for repair. Cannot execute repair action without toolkits.");
      return {}; // ! Early return if there are no toolkits in cargo to avoid unnecessary transaction execution and fees
    }

    if (this.amount === undefined) {
      amount = cargoToolkitAmount || 0;
    } else {
      amount = Math.max(1, this.amount);
      // Get toolkits amount in cargo and limit the repair amount to available toolkits to avoid transaction failure due to insufficient resources
      amount = Math.min(amount, cargoToolkitAmount);
    }

    amount = Math.floor(Number(amount || 0));
    if (amount < 1) {
      this.dispatcher.logger.dbg("RepairStarbaseAction scout found no valid toolkit amount > 0");
      return {};
    }

    log("Cargo Toolkit Amount:", amount);
    console.table({
      Name: byteArrayToString(tgtBaseAccount.data.name),
      Level: tgtBaseAccount.data.level,

      tgtBase: tgtBaseAccount.key.toBase58(),
      Faction: tgtBaseAccount.data.faction,
      HP: tgtBaseAccount.data.hp.toNumber(),
      SP: tgtBaseAccount.data.sp.toNumber(),
    });
    return { tgtBase, amount };
  }

  async findTarget() {
    let fa = (await this.process.fetchFleetAccount()) as unknown as Fleet;
    let currentSector = await this.dispatcher.sageFleetHandler.getCurrentSector(fa as any);

    return this.scaoutLocation(currentSector);
  }
  async execute(): Promise<Array<DispatcherParsedTransactionWithMeta | SimulatedTransactionResponse | undefined>> {
    let mode = this.target ? "selected" : "auto";
    if (mode === "auto") {
      let { tgtBase, amount } = await this.findTarget();

      if (tgtBase) {
        this.target = tgtBase;
        this.amount = Math.max(1, Math.floor(Number(amount || 0)));
        if (!Number.isFinite(this.amount) || this.amount < 1) {
          this.dispatcher.logger.dbg("Skipping RepairStarbaseAction execution! Invalid toolkit amount in auto mode:", amount);
          this.target = undefined;
          this.amount = undefined;
          return [];
        }
        this.dispatcher.logger.dbg("Selected STARBASE for repair: ", tgtBase.toBase58(), " Ammount Passed: ", amount);
      } else {
        this.dispatcher.logger.dbg("Skipping RepairStarbaseFleetAction execution! ");
        return []; // ! Early return if there is no fleet that requires repair to avoid unnecessary transaction execution and fees
      }
    }

    // owned
    //     let now = Date.now()/ 1000;
    // //  let restoreHP = Math.min(amount || (tgtFs.combatStats.hp - tgtFa.data.hp), tgtFs.combatStats.hp - tgtFa.data.hp);
    //     let tgtToRestore = (tgtFs.combatStats.hp - tgtFa.data.hp);
    //     let tgtRestoreRate = tgtFs.combatStats.repairRate / 100;
    //     let meRepairRate = fs.combatStats.repairRate / 100;

    // console.table({
    //   lastCombat: formatTimePeriod( tgtFa.data.lastCombatUpdate-now),
    //   hpMaxRestore: Math.max(0, tgtToRestore),
    //   repairRateOwn: tgtRestoreRate ,
    //   repairCostUnitsOwn: Math.max(0, tgtToRestore / tgtRestoreRate ), // suppose that repair cost is 10 units of resource per HP repaired
    //   repairTimeOwn: Math.max(0, tgtToRestore /  tgtRestoreRate),
    //   repairEfficiencyOwn: tgtFs.combatStats.repairEfficiency,
    //   repairAbilityOwn: tgtFs.combatStats.repairAbility,
    //   repairRate: meRepairRate,
    //   repairTime: Math.max(0, tgtToRestore / meRepairRate ),
    //   repairCostUnits: Math.max(0, tgtToRestore / meRepairRate ), // suppose that repair cost is 10 units of resource per HP repaired
    //   repairEfficiency: fs.combatStats.repairEfficiency,
    //   repairAbility: fs.combatStats.repairAbility,
    // });

    let rx = await this.dispatcher.signAndSend(await this.getInstructionsReturns(), true, this.priorityFeeConfig, {
      retryOnTimeout: async () => {
        // Check 'e' for validation state error -> handle state
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return !(await this.verifyExecution({}));
      },
      continueOnError: true,
      signals: this.signals,
    });

    if (mode === "auto") {
      log("Repair action executed in auto mode. Resetting target for next auto repair...");
      this.target = undefined; // reset target to allow scouting for next repair in the following execution
      this.amount = undefined;
    }
    return rx;
    // return [];
  }

  /**
   * Provide Undock InstructionReturn[]
   *
   * @returns
   */
  async getInstructionsReturns(): Promise<InstructionReturn[]> {
    let ixs: InstructionReturn[] = [];
    log("Getting instructions for RepairStarbaseAction with target:", this.target?.toBase58(), " amount:", this.amount);
    if (this.target) {
      const validAmount = Number.isFinite(Number(this.amount)) ? Math.floor(Number(this.amount)) : 0;
      if (validAmount < 1) {
        this.dispatcher.logger.dbg("Skip ixRepairStarbase: invalid amount", this.amount);
        return ixs;
      }
      ixs = ixs.concat(
        await this.dispatcher.sageFleetHandler.ixRepairStarbase(
          await this.process.fetchFleetPublicKey(),
          this.target,
          validAmount,
          this.dispatcher.signer.as,
          this.dispatcher.funderPermissionIdex,
        ),
      );
    }

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
      RepairStarbaseAction.accumulatedTransactionCost += this.results.transactionFees || 0;
    });

    RepairStarbaseAction.accumulatedRunTime += this.results.runTime || 0;
    super.accumulateFees();
  }

  async display(verbose = false): Promise<string> {
    let display = `RepairStarbaseAction: T<${this.getTransactionCount()}> ` + (this.sector ? `sector: ${this.sector.toSectorKey()} ` : "");
    verbose && this.process.logger.info(display);

    return display;
  }

  getTransactionCount() {
    return RepairStarbaseAction.transactionsCount;
  }

  async verifyExecution(args: any): Promise<boolean> {
    this.dispatcher.logger.dbg("Verifying RepairStarbaseAction execution with args:", args);
    // Force always true for now - but can add some verification logic based on expected fleet HP after repair and check if it matches the actual HP after action execution
    return true;
  }

  /**@inheritdoc */
  async export(type: string = "", data: any = {}): Promise<string> {
    return await Action.prototype.export.bind(this)(type, { sector: this.sector, ...data });
  }
}
