import { SimulatedTransactionResponse } from "@solana/web3.js";
import { Fleet, ShipStats } from "./../holoHandlers/HolosimMintsImporter"; // ! may need to be changed soon :)
import { Action, DispatcherParsedTransactionWithMeta, FleetProcess } from "../..";
import { RepairDockedFLeetAction } from "./RepairDockedFLeetAction";
import { cliIcons } from "../utils";
import { getFleetExtendedViewState, getFleetShortViewState } from "../Common/Helper";
import { FleetPreview } from "../Common/types";
export class CustomCombatLogAction extends Action {
  flags = {
    waitShieldUp: true, // Wait for shield to be repaired before next combat action
    waitApReload: true, // Wait for AP to be reloaded before next combat action
    recommendRepair: true, // Provide recommendation to repair fleet if HP is low and pendingHp is 0 ( means that fleet is not
    // currently being repaired )
  };
  constructor(process: FleetProcess, flags?: Partial<CustomCombatLogAction["flags"]>) {
    super(process);
    if (flags) this.flags = { ...this.flags, ...flags };
  }
  async wrapBeforeExecute(action: Action): Promise<void> {
    console.log("Before executing action:", action.constructor.name);
  }

  async collectStatuses(fev: FleetPreview, now: number = Math.round(Date.now() / 1000)): Promise<any> {
    return {
      before: `${now - fev.lastCombat}`,
      // Current AP, HP, SP values are POSITIVE INT - replace undefined with -1 for better visibility in console
      ap: fev.AP || -1, // - become 0 when cooldown is not expired
      hp: fev.HP || -1,
      sp: fev.SP || -1,
      pendingHp: fev.pendingHp, // stay 0 all the time - when shield was not broken  - suppose that is pending REGENERATION HP ( AKA May be max HEALING UP HP - when fleet was repaired )
      SP_UP_s: Math.max(fev.shieldUpAfter || -1, fev.brokenShieldUpAfter || -1), // Time in seconds until shield is fully recharged or repaired ( if broken )
      AP_UP_s: fev.reloadAfter || -1,
      repairTime: (fev.pendingHp || 0) / ((fev.repair || 1) / 100) || "N/A", // Calculate estimated repair time based on pendingHp and hpRepairRate, if pendingHp is 0, return "N/A"
      /** This is fleet default / max stats  */
      t_ap: fev.tAP || -1,
      t_hp: fev.tHP || -1,
      t_sp: fev.tSP || -1,
    };
  }

  async execute(): Promise<(DispatcherParsedTransactionWithMeta | SimulatedTransactionResponse | undefined)[]> {
    console.log("Executing custom action");
    let res: (DispatcherParsedTransactionWithMeta | SimulatedTransactionResponse | undefined)[] = [];
    // FLeet Account
    let fa = (await this.process.fetchFleetAccount()) as unknown as Fleet;
    // Fleet Extended VIEW
    let fev = await getFleetExtendedViewState(fa, this.process.dispatcher.sageGameHandler as any);
    // Check Shield Value
    console.log("----------- COMBAT DATA -----------");
    // let apReloadTime = Math.max(0, fev.reloadAfter || 0);
    // let shieldUpTime = Math.max(0, fev.brokenShieldUpAfter || 0, fev.shieldUpAfter || 0);

    let statuses: any = await this.collectStatuses(fev);
    console.table(statuses);

    console.log("----------- COMBAT DATA END -------");
    if (this.flags.recommendRepair && statuses.hp < statuses.t_hp && !statuses.pendingHp) {
      // Should be repaired - but check if fleet is docked before call repair action

      let heal = new RepairDockedFLeetAction(this.process);
      heal
        .run()
        .catch((err) => {
          console.error("Error during fleet repair:", err);
        })
        .finally(() => {
          res.push(...(heal.results.execution || []));
          console.error(" ====== Fleet repair action CALLED.  ======= ");
        });
    }

    // Wait Shield recharge or AP reload before next combat action
    // Provide recommendations based on combat status
    if (statuses.sp < 1000) {
      console.error("WARNING ! LOW SHIELD! Consider repairing or waiting for shield recharge before engaging in combat.");
      console.error(`Time until shield is repaired: ${statuses.SP_UP_s + fev.lastCombat} seconds`);
    }
    // let timeWaited = 0;
    // if (this.flags.waitShieldUp && statuses.SP_UP_s > 0) {
    //   let now = Date.now();
    //   await this.onWaitShieldUp(this, statuses.SP_UP_s, statuses);
    //   timeWaited += Math.round((Date.now() - now) / 1000);
    // }
    // let ap_w8time = statuses.AP_UP_s - timeWaited;
    // if (this.flags.waitApReload && ap_w8time > 0) {
    //   let now = Date.now();
    //   // console.warn(`Waiting for AP to be reloaded in ${statuses.AP_UP_s} seconds before next combat action...`);
    //   await this.onWaitApReload(this, ap_w8time, statuses);
    //   timeWaited += Math.round((Date.now() - now) / 1000);
    // }

    // let hpRepairTime = statuses.repairTime - timeWaited;
    // if (this.flags.recommendRepair && statuses.pendingHp) {
    //   await this.onWaitHpRepair(this, hpRepairTime, statuses);
    // }

    await Promise.all([
      this.flags.waitShieldUp && statuses.SP_UP_s > 0 ? this.onWaitShieldUp(this, statuses.SP_UP_s + fev.lastCombat, statuses) : Promise.resolve(),
      this.flags.waitApReload && statuses.AP_UP_s > 0 ? this.onWaitApReload(this, statuses.AP_UP_s + fev.lastCombat, statuses) : Promise.resolve(),
      // this.flags.recommendRepair && statuses.pendingHp ? this.onWaitHpRepair(this, statuses.repairTime0 + fev.lastCombat, statuses) : Promise.resolve(),
    ]);

    return res;
  }

  /**
   * Wait for shield to be fully recharged before next combat action
   * @param action Current Action
   * @param time wait time in Seconds
   * @param statuses pre calc Data
   */
  async onWaitShieldUp(action: CustomCombatLogAction, time: number, statuses: any): Promise<void> {
    await action.waitTimeProgress(time * 1000, `${this.process.fleetName} ${cliIcons.sp.repeat(5)}`);
  }

  /**
   *
   * @param action current action
   * @param time rest of the time to ap reload
   * @param statuses
   */
  async onWaitApReload(action: CustomCombatLogAction, time: number, statuses: any): Promise<void> {
    await action.waitTimeProgress(time * 1000, `${this.process.fleetName} ${cliIcons.ap.repeat(5)}`);
  }

  /**
   * Wait for HP to be repaired based on pendingHp and repair rate - before next combat action
   * @param action current action
   * @param time rest of the time to HP repair - based on pendingHp and repair rate
   * @param statuses
   */
  async onWaitHpRepair(action: CustomCombatLogAction, time: number, statuses: any): Promise<void> {
    await action.waitTimeProgress(time * 1000, `${this.process.fleetName} ${(cliIcons.repair + cliIcons.hp).repeat(5)}`);
  }
}

/**
 * Use on safe point to decide should proceed scenario to next steps
 */
class PrependScenarionAction extends Action {}

// let options = {
//   miningTimes: 1,
//   movementMode: "Warp",
//   pathToMiningStarbase: [new Coordinates(38, 25)],
//   pathToSafeStarbase: [new Coordinates(40, 300)],
//   transportToMiningBase: [{ resourceName: "electromagnet", percent: 1 }],
//   transportToSafeStarbase: [{ resourceName: "iron", percent: 1 }],
//   loadTravelingFuelOnMiningBase: false,
//   // load minig resources on mining starbase - means use more cargo for transer in direction to mining base
//   loadMiningAmmoOnMiningBase: false,
//   loadMiningFuelOnMiningBase: false,
//   loadMiningFoodOnMiningBase: false,

//   // Use thanks for transfer fuel and ammo
//   fuelTankToMiningBase: false,
//   ammoBankToMiningBase: false,

//   fuelTankToSaveStarbase: false,
//   ammoBankToSaveStarbase: false,
// } as MiningBuildOptions;
