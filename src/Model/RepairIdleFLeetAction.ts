import { PublicKey, SimulatedTransactionResponse, TransactionInstruction } from "@solana/web3.js";
import { InstructionReturn } from "@staratlas/data-source";
import { Action, iSimpleAction } from "./Action";
import { FleetProcess as Process } from "./FleetProcess";
import { iQueueItem } from "./Queue";
import { Coordinates, iCoordinates } from "./MoveAction";
import { clone } from "lodash";
import { DispatcherParsedTransactionWithMeta } from "./Dispatcher";
import { iError } from "../Error/ErrorHandlers";
import { Fleet, SageGameHandler, ShipStats } from "../holoHandlers/HolosimMintsImporter";
import { SageFleetHandler } from "../holoHandlers/FleetHandler";
import { getFleetExtendedViewState, getFleetShortViewState } from "../../src/Common/Helper";
import { log } from "../Common/PatchConsoleLog";

import { prompt } from "../Common/prompt";
import { formatTimePeriod, shortify } from "../utils";
/**
 * Implements undock fleet action
 */
export class RepairIdleFLeetAction extends Action implements iSimpleAction {
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

  async scaoutLocation(coordinates: Coordinates): Promise<{ tgtFa: Fleet; amount: number }> {
    let fa = (await this.process.fleetAccount!) as unknown as Fleet;
    //
    let fh = this.dispatcher.sageFleetHandler as unknown as SageFleetHandler;
    let gh = this.dispatcher.sageGameHandler as unknown as SageGameHandler;
    // let ownerProfile = await gh.getFleetPlayerProfile(fa);

    let fleetsOnSector = await gh.getSectorFleets(coordinates.x, coordinates.y, { mining: true });
    // let fleetPreview = await getFleetExtendedViewState(fa as any, gh);

    // let fleetPreviewShort = await getFleetShortViewState(fleetPreview);
    let [
      // owned,
      friendly,
    ] = [
      // fleetsOnSector.filter((f) => gh.getFleetPlayerProfile(f).equals(ownerProfile)),
      fleetsOnSector
        .filter((f) => f.data.faction == fa.data.faction && !(f.state.Respawn || f.state.StarbaseLoadingBay))
        .sort(
          // sort friendly by HP stats ascending
          (a, b) => {
            let aTHP = (a.data.stats as ShipStats).combatStats.hp;
            let bTHP = (b.data.stats as ShipStats).combatStats.hp;
            let aMissingHp = aTHP - (Number(a.data.hp || 0) + Number(a.data.pendingHp || 0));
            let bMissingHp = bTHP - (Number(b.data.hp || 0) + Number(b.data.pendingHp || 0));

            return bMissingHp / bTHP - aMissingHp / aTHP;
          },
        ),
    ];
    // let cargoItems = fh.getCargoItems(fa as any);
    // await cargoItems;
    // log("Fleets on sector:", fleetsOnSector.length);
    // console.table(fleetPreviewShort);
    // log("Cargo items:");
    // console.table((await cargoItems).map((i) => ({ ...i, mint: shortify(i.mint.toBase58()) })));
    // log("Owned fleets on sector:", owned.length);
    // console.table(await Promise.all(owned.map((f) => getFleetExtendedViewState(f as any, gh).then((v) => getFleetShortViewState(v)))));

    // log("Friendly fleets on sector:", friendly.length);
    // console.table(await Promise.all(friendly.map((f) => getFleetExtendedViewState(f as any, gh).then((v) => getFleetShortViewState(v)))));

    // // log("Enemy fleets on sector:");
    // // console.table( await enemies.map(f => getFleetExtendedViewState(f as any, gh).then((v) => getFleetShortViewState(v )) ));

    // // await prompt("Press enter to continue...");

    // // let index = await prompt("Enter fleet index to repair ( from owned fleets list )").then((res) => parseInt(res.trim()));
    // // let amount = await prompt("Enter repair asmount ( 0 for max )").then((res) => parseInt(res.trim()));

    let tgtFa = friendly[0];
    let tgtFs = tgtFa.data.stats as ShipStats;
    let missingHP = tgtFa
      ? tgtFa.data.hp + tgtFa.data.pendingHp < tgtFs.combatStats.hp
        ? tgtFs.combatStats.hp - (tgtFa.data.hp + tgtFa.data.pendingHp)
        : 0
      : 0; // repair to max if there is any damage, otherwise 0
    return { tgtFa, amount: missingHP };
  }
  async findTarget() {
    let fa = await this.process.fetchFleetAccount();
    let currentSector = await (this.dispatcher.sageFleetHandler as unknown as SageFleetHandler).getCurrentSector(fa as any);

    return this.scaoutLocation(currentSector);
  }
  async execute(): Promise<Array<DispatcherParsedTransactionWithMeta | SimulatedTransactionResponse | undefined>> {
    let fh = this.dispatcher.sageFleetHandler as unknown as SageFleetHandler;
    let gh = this.dispatcher.sageGameHandler as unknown as SageGameHandler;

    let fa = (await this.process.fetchFleetAccount()) as unknown as Fleet;
    let fs = fa.data.stats as ShipStats;

    let currentSector = await fh.getCurrentSector(fa);

    let mode = this.target ? "selected" : "auto";
    if (mode === "auto") {
      let { tgtFa, amount } = await this.scaoutLocation(currentSector);

      if (amount > 0) {
        this.target = tgtFa.key;
        log("Selected fleet for repair: ", tgtFa.data.fleetLabel, " Minising HP [after pending]: ", amount);
      } else {
        console.error("Skipping RepairIdleFleetAction execution! - - - No fleet found that requires repair in current sector.");
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
    let fa = await this.process.fetchFleetAccount();
    let ixs: InstructionReturn[] = [];
    ixs = ixs.concat(await this.dispatcher.sageFleetHandler.ixFleetStateStarbaseHandler(fa.key));
    ixs = ixs.concat(
      await this.dispatcher.sageFleetHandler.ixRepairIdleFleet(
        await this.process.fetchFleetPublicKey(),
        this.target || fa.key,
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
      RepairIdleFLeetAction.accumulatedTransactionCost += this.results.transactionFees || 0;
    });

    RepairIdleFLeetAction.accumulatedRunTime += this.results.runTime || 0;
    super.accumulateFees();
  }

  async display(verbose = false): Promise<string> {
    let display = `RepairDockedFLeetAction: T<${this.getTransactionCount()}> ` + (this.sector ? `sector: ${this.sector.toSectorKey()} ` : "");
    verbose && this.process.logger.info(display);

    return display;
  }

  getTransactionCount() {
    return RepairIdleFLeetAction.transactionsCount;
  }

  async verifyExecution(args: any): Promise<boolean> {
    this.dispatcher.logger.dbg("Verifying RepairDockedFLeetAction execution with args:", args);
    // Force always true for now - but can add some verification logic based on expected fleet HP after repair and check if it matches the actual HP after action execution
    return true;
  }

  /**@inheritdoc */
  async export(type: string = "", data: any = {}): Promise<string> {
    return await Action.prototype.export.bind(this)(type, { sector: this.sector, ...data });
  }
}
