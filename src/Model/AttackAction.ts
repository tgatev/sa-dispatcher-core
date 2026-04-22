import { PublicKey, SimulatedTransactionResponse, TransactionInstruction } from "@solana/web3.js";
import { InstructionReturn } from "@staratlas/data-source";
import { Action, iAction, iSimpleAction } from "./Action";
import { FleetProcess as Process } from "./FleetProcess";
import { iQueueItem } from "./Queue";
import { Coordinates, iCoordinates } from "./MoveAction";
import { clone } from "lodash";
import { DispatcherParsedTransactionWithMeta } from "./Dispatcher";
import { log } from "../Common/PatchConsoleLog";
import { Fleet } from "@staratlas/sage-main";
import { Fleet as HCombatFleet, ShipStats as HShipStats } from "@staratlas/holosim";
import { u8aToString } from "../utils";

export interface iTargetFleetSortInfo {
  fleetAccount: HCombatFleet;
  location: Coordinates;
  label: string;
  inRange: boolean;
  attackable: boolean;
}

export type TargetFleetData = {
  fleetAccount: HCombatFleet;
  i: number;
  rate: number;
  hp: number;
  pendingHp: number;
  sp: number;
  ap: number;
  name: number[];
  key: Readonly<PublicKey>;
  state: string;
  attackCD: number;
  apCD: number;
  stats: HShipStats;
  faction: number;
};

/**
 * Implements undock fleet action
 */
export class AttackAction extends Action implements iSimpleAction {
  static accumulatedTransactionCost = 0;
  static accumulatedRunTime = 0;
  static transactionsCount: number = 1;
  targetFleetPubkey: Promise<Fleet>;
  sector: iCoordinates;
  executionTime: number = 0;
  onNoAmmo(proc: Process): Promise<void> {
    proc.dispatcher.logger.error(this.attackCheck, "No attacks available - stopping process");
    throw new Error("No Ammo FALLBACK.");
  }
  attackCheck: {
    canAttack: boolean;
    ixr: InstructionReturn[];
    ixrAttackOnly: InstructionReturn[];
    delay: number;
    attacksAvailable: number;
    sateLabels: string[];
    lootAccountKey: PublicKey | undefined;
  } = { canAttack: false, ixr: [], attacksAvailable: 0, sateLabels: [], lootAccountKey: undefined, delay: 0, ixrAttackOnly: [] };
  rxs: Promise<Array<DispatcherParsedTransactionWithMeta | SimulatedTransactionResponse | undefined>>[] = [];
  constructor(process: Process, targetFleetPubkey: PublicKey | Fleet, sector = new Coordinates(0, 0)) {
    super(process);
    this.sector = clone(sector);

    log(
      "Initializing AttackAction on Attacker fleet:",
      this.process.fleetAccount ? this.process.fleetAccount.key.toBase58() : "Unknown (fleet account not fetched yet)",
    );
    log("Initializing AttackAction on target fleet:", targetFleetPubkey instanceof PublicKey ? targetFleetPubkey.toBase58() : targetFleetPubkey.key.toBase58());
    if (targetFleetPubkey instanceof PublicKey) {
      this.targetFleetPubkey = process.dispatcher.sageGameHandler.getFleetAccount(targetFleetPubkey);
    } else {
      this.targetFleetPubkey = Promise.resolve(targetFleetPubkey);
    }
  }
  // Queue item for undock action - execute after fleet is un-docked
  async getQueueItem(): Promise<iQueueItem<iAction>> {
    let item = {
      action: this,
      execTime: new Date().getTime(),
      next: async (process: Process) => {
        // After fleet is un-docked - then continue processing
        return process.forward();
      },
    } as iQueueItem<iAction>;

    return item;
  }

  async validate(): Promise<boolean> {
    this.dispatcher.logger.log("Preparing attack instructions...");
    let attackData = await this.dispatcher.sageFleetHandler.ixAttackFleet(
      await this.process.fetchFleetPublicKey(),
      await this.targetFleetPubkey,
      this.dispatcher.signer.as,
      this.dispatcher.funderPermissionIdex,
    );

    this.attackCheck = attackData;

    log("[AttackAction] Attack check:", this.attackCheck);
    // log("[A] Attack check:", this.attackCheck);

    if ((this.attackCheck?.attacksAvailable || 0) < 1) {
      this.onNoAmmo(this.process);
      this.attackCheck.ixr = [];
      return false;
    }

    if (this.attackCheck?.delay > 0) {
      // this.dispatcher.logger.log("Attack delayed by ", this.attackCheck.delay / 1000, "s due to fleet state");
      this.waitTimeProgress(this.attackCheck.delay, "Waiting before attack, Delay received" + Math.round(this.attackCheck.delay) / 100 + "s", 100);
    }

    if (this.attackCheck?.ixr.length > 0) {
      this.dispatcher.logger.log("PreAttack instructions Handle Exit Sates, sending...");
      this.rxs.push(
        this.dispatcher.signAndSend(await this.attackCheck.ixr, false, this.priorityFeeConfig, {
          retryOnTimeout: async (d, e) => {
            if (e.trErr?.err?.InstructionError[1]?.Custom) {
              console.error("Attack failed with errorCode:", e.trErr?.err?.InstructionError[1]?.Custom);
            }
            switch (e.trErr?.err?.InstructionError[1]?.Custom) {
              case 6098: {
                // AP No reload
                let fa = await this.process.fetchFleetAccount();
                let cds = await this.process.dispatcher.sageFleetHandler.getCooldown(fa);

                // !!! Try to avoid blocking when some one attack us unpredictably - so we may need to HEAL or something Else
                let attackCd = Math.max((cds.attackCooldown + 0.2) * 1000, 100);
                if (attackCd > 5000) {
                  return false; // Means do not repeat and continue with main flow
                  // Some one hit us before we attack- CONTINUE - to unblock processing.
                }
                // wait small cooldown before retrying attack
                this.waitTimeProgress(attackCd, "Waiting for AP reload", 100);
                return true;
              }
              default: {
              }
            }
            this.process.logger.error(e, " <<---Retrying attack after timeout...", false);
            return false;
            // this.executionTime = new Date().getTime();
            // await new Promise((resolve) => setTimeout(resolve, 200));
            // return !(await this.verifyExecution({}));
          },
          signals: this.signals,
        }),
      );
    }

    this.dispatcher.logger.log("Attacking fleet", (await this.targetFleetPubkey).key.toBase58(), "in sector", this.sector.toSectorKey());
    this.dispatcher.logger.log("attacker Sate Delay|AttackS Available|Labels ", attackData.delay, attackData.attacksAvailable, attackData.sateLabels);
    return true;
  }

  /**
   *
   * @returns
   */
  async execute(): Promise<Array<DispatcherParsedTransactionWithMeta | SimulatedTransactionResponse | undefined>> {
    // Force test execution of action without validating or executing main instructions, used for testing and debugging
    // await this.forceTest();
    // await this.waitTimeProgress(5000, "SENT TAMPER MONKEY ", 100); //
    // return [];

    this.priorityFeeConfig.enable = true;
    this.priorityFeeConfig.cuLimit = Math.max(this.priorityFeeConfig.cuLimit || 200000, 300000);
    // this.priorityFeeConfig.increaseBaseFee = Math.max(this.priorityFeeConfig.increaseBaseFee || 100, 20000);
    this.priorityFeeConfig.increaseBaseFee = Math.max(20000);
    this.priorityFeeConfig.cap = Math.max(this.priorityFeeConfig.cap || 10000000, 20000000);
    // Await Delay if specified

    if (Number(this.attackCheck.delay) > 0)
      await this.waitTimeProgress(this.attackCheck?.delay || 0, "Waiting before attack " + Math.round(this.attackCheck.delay) / 100 + "s", 100);
    let rx = await this.dispatcher.signAndSend(await this.getInstructionsReturns(), true, this.priorityFeeConfig, {
      retryOnTimeout: async (d, e) => {
        console.error("Attack transaction timeout error:", e);
        console.log(e, "Retrying Exit sates handler...");
        return false;
      },
      signals: this.signals,
      // doNotSimulate: true,
      continueOnError: true,
    });
    //continueOnError ---> force account update -> in combat fresh data is precious
    await this.process.fetchFleetAccount(); // refetch after attack
    // log("AttackAction", rx);
    return rx;
  }
  // async wrapBeforeExecute(action: Action): Promise<void> {
  //   this.executionTime = new Date().getTime();
  // }
  /**
   * Provide Undock InstructionReturn[]
   *
   * @returns
   */
  async getInstructionsReturns(): Promise<InstructionReturn[]> {
    if (!this.attackCheck) {
      await this.validate();
    }
    return this.attackCheck.ixrAttackOnly;
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
      AttackAction.accumulatedTransactionCost += this.results.transactionFees || 0;
    });

    AttackAction.accumulatedRunTime += this.results.runTime || 0;
    super.accumulateFees();
  }

  async display(verbose = false): Promise<string> {
    let display = `Attack: T<${this.getTransactionCount()}> ` + (this.sector ? `sector: ${this.sector.toSectorKey()} ` : "");
    verbose && this.process.logger.info(display);

    return display;
  }

  getTransactionCount() {
    return AttackAction.transactionsCount;
  }

  // @ts-ignore args not used
  async verifyExecution(args: any): Promise<boolean> {
    return true; // Force true State - when attack was not executed - double check enemy, is still there/alive and more many states
    // let fa = await this.process.fetchFleetAccount();
    // //@ts-ignore - //! until missing in sage
    // if (fa.data.apReloadExpiresAt && fa.data.apReloadExpiresAt * 1000 - this.executionTime > 0) {
    //   return true;
    // } else {
    //   return false;
    // }
  }

  /**@inheritdoc */
  async export(type: string = "", data: any = {}): Promise<string> {
    return await Action.prototype.export.bind(this)(type, { sector: this.sector, ...data });
  }

  // static async findMiningFleets();
  static async findEnemyFleetsInSector(
    proc: Process,
    opts: { sector?: iCoordinates; sortTargetsCallback?: (aF: iTargetFleetSortInfo, bF: iTargetFleetSortInfo) => number } = {},
  ): Promise<
    Array<{
      fleetAccount: HCombatFleet;
      i: number;
      rate: number;
      hp: number;
      pendingHp: number;
      sp: number;
      ap: number;
      name: number[];
      key: Readonly<PublicKey>;
      state: string;
      attackCD: number;
      apCD: number;
      stats: HShipStats;
      faction: number;
    }>
  > {
    let fleetAccount = (await proc.fetchFleetAccount()) as unknown as HCombatFleet;
    let location = opts.sector || (await proc.getCurrentSector(fleetAccount as any));
    let fleetsKeyedAccountInfo = (await proc.dispatcher.sageGameHandler.getSectorFleets(location.x, location.y)) as unknown as Fleet[];

    let withData = await Promise.all(
      fleetsKeyedAccountInfo.map(async (f) => {
        let s1 = await proc.dispatcher.sageFleetHandler.getCurrentSector(fleetAccount as any);
        let s2 = await proc.dispatcher.sageFleetHandler.getCurrentSector(f as any);
        return {
          fleetAccount: f as unknown as HCombatFleet,
          location: await proc.dispatcher.sageFleetHandler.getCurrentSector(f as any),
          label: `${s1.x},${s1.y} <-> ${s2.x},${s2.y} ` + Object.keys(f.state)[0],
          inRange: await proc.dispatcher.sageFleetHandler.isInAttackRange(fleetAccount as any, f as any, 1),
          attackable: await proc.dispatcher.sageFleetHandler.isAttackable(fleetAccount as any, f as any, fleetAccount.data.faction),
        };
      }),
    );

    // withData.forEach((f) => {
    //   log(f.label, f.inRange ? " IN RANGE" : "");
    // });
    let now = new Date().getTime() / 1000;

    let sortByFormula = (aF: iTargetFleetSortInfo, bF: iTargetFleetSortInfo) => {
      let a = aF.fleetAccount.data;
      let b = bF.fleetAccount.data;
      let aCD = 1 + Math.max(0, a.apReloadExpiresAt - now);
      let bCD = 1 + Math.max(0, b.apReloadExpiresAt - now);
      return (aCD * a.ap) / (a.pendingHp + a.sp) - (bCD * b.ap) / (b.pendingHp + b.sp);
    };

    let owner = fleetAccount.data.ownerProfile;
    let fleets = withData
      .filter(
        (f) => {
          return (
            f.fleetAccount.key != fleetAccount.key && // not self
            owner != f.fleetAccount.data.ownerProfile && // not owned
            owner != f.fleetAccount.data.subProfile.key && // not borrowed
            f.fleetAccount.data.faction != fleetAccount.data.faction && // not Same faction
            f.inRange &&
            f.attackable
          );
        }, // only idle
      )
      .sort(opts.sortTargetsCallback || sortByFormula) // So Special sort by lowest CD * AP / HP+SP
      .map((v0, i) => {
        let v = v0.fleetAccount;
        let state = "";
        switch (true) {
          case Boolean(v.state.Idle):
            state = "Idle " + `{${Number(v.state.Idle?.sector[0])},${Number(v.state.Idle?.sector[1])}}`;
            break;
          case Boolean(v.state.MoveWarp):
            if (v.state.MoveWarp?.warpFinish * 1000 > new Date().getTime()) {
              state = "[E] ";
            }
            state +=
              "Warping" +
              `{${Number(v.state.MoveWarp?.fromSector[0])},${Number(v.state.MoveWarp?.fromSector[1])}} --> {${Number(
                v.state.MoveWarp?.toSector[0],
              )},${Number(v.state.MoveWarp?.toSector[1])}}`;
            break;
          case Boolean(v.state.MoveSubwarp):
            if (v.state.MoveSubwarp?.departureTime * 1000 > new Date().getTime()) {
              state = "[E] ";
            }
            state +=
              "Subwarp" +
              `{${Number(v.state.MoveSubwarp?.fromSector[0])},${Number(v.state.MoveSubwarp?.fromSector[1])}} --> {${Number(
                v.state.MoveSubwarp?.toSector[0],
              )},${Number(v.state.MoveSubwarp?.toSector[1])}}`;

            break;
          case Boolean(v.state.StarbaseLoadingBay):
            state = "Docked";
            break;
          case Boolean(v.state.MineAsteroid):
            state = "Mining";
            break;
          case Boolean(v.state.Respawn):
            state = "Respawn";
            break;
          default:
            state = "Unknown";
            break;
        }

        return {
          fleetAccount: v,
          i,
          rate: v.data.ap / (v.data.pendingHp + v.data.sp),
          hp: v.data.hp,
          pendingHp: v.data.pendingHp,
          sp: v.data.sp,
          ap: v.data.ap,
          name: v.data.fleetLabel,
          key: v.key,
          state: state + (v.data.apReloadExpiresAt * 1000 - Date.now() > 0 ? " [AP-CD]" : ""),
          attackCD: Math.max(0, v.data.apReloadExpiresAt * 1000 - Date.now()),
          apCD: (v.data.stats as HShipStats).combatStats.ap / (v.data.stats as HShipStats).combatStats.apRegenRate,
          stats: v.data.stats as HShipStats,
          faction: v.data.faction,
        };
      });
    let counter = 0;
    for (let f of fleets) {
      log(`#${f.i} ##### ${f.key}`);
      log(`|[${f.faction}]| State:${f.state} Rate:${Math.floor(f.rate * 100) / 100}`);
      log(
        u8aToString(new Uint8Array(f.name), true),
        `HP/pHP/csHP: ${f.hp}/${f.pendingHp}/${f.stats.combatStats.hp} SP:${f.sp}/${f.stats.combatStats.sp} AP:${f.ap}/${f.stats.combatStats.ap} `,
      );
      log(`${f.attackCD > 0 ? " [CD:" + Math.floor(f.attackCD / 1000) + "s]" : "0 s"}`, "AP CD:" + Math.round(f.apCD * 10000) / 100 + "s");
      log("---------------------------------------------------");
      if (counter++ >= 5) {
        console.error(`[${counter} / ${fleets.length}]`, "Too many attackable fleets in sector, stopping display to avoid spam...");
        break;
      }
    }
    // let index = await (await prompt("Attack.?!")).toString().trim();
    // console.log(fleets[Number(index)], "index", index);

    return fleets;
  }
}
