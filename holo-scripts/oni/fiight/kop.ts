import { log } from "../../../src/Common/PatchConsoleLog";
import { Coordinates, MoveAction } from "../../../src/Model/MoveAction";
import { TransferCargoAction } from "../../../src/Model/TransferCargoAction";
import { argv } from "../../../src/gameHandlers/GameHandler";
import { DispatcherHolosim, ProcessHolosim as Process } from "../../../src/holoHandlers/HolosimMintsImporter";
import { Fleet } from "../../../src/holoHandlers/mod/fleet";
import { formatTimePeriod } from "../../../src/utils";
import { PublicKey } from "@solana/web3.js";
import { ShipStats } from "@staratlas/holosim";
import { AttackAction } from "../../../src/Model/AttackAction";
import { prompt } from "../../../src/Common/prompt";
const options = {
  preventSuicide: true, // Prevent attack if after attack fleet will be destroyed
  preventTargetDead: false, // Prevent attack if after attack target will be destroyed
  preventTargetShieldBreak: true, // Prevent attack if after attack target shield will be broken
  preventAttackerShieldBrake: false, // Prevent attack if after attack attacker shield will be broken
  protected: [
    // MONI
    "3mV3xnxHTEpbJBfZmc6J2jPKfiPeReDg6B2bfsDtjiT2",
  ] as string[], // List of protected fleet public keys
};
/**
 *  Provide mining Hydrogen on Ustur CSS
 *    - Layer1 - using base actions flowing
 */
const fleetName = argv.fleetName || "kamikadze1"; // Kamikadze - pernik - test
const hybridSubWarp = argv.sw || 1;
async function run() {
  console.time("init_dispatcher");
  const dispatcher = await DispatcherHolosim.build({ useLookupTables: true });
  console.timeEnd("init_dispatcher");
  console.time("Full execution tme");
  const starbaseLocation = new Coordinates(-19, 40);
  const battleLocation = new Coordinates(0, 62);

  /** Provide pointer reference to handlers */
  let proc = new Process(dispatcher, fleetName, starbaseLocation); // new Coordinates(40, 30)
  proc.dispatcher.donate = false;
  let fa = await proc.fetchFleetAccount();

  //@ts-ignore
  let fs = fa.data.stats as ShipStats;
  let toBattleData = await generateTraveling(proc, starbaseLocation, battleLocation, "Hybrid");
  let toHomeData = await generateTraveling(proc, battleLocation, starbaseLocation, "Subwarp");
  log(`Travel to Battle ${toBattleData.path.length} actions, fuelCost:${toBattleData.fuelCost}, time:${toBattleData.times}`);
  log(`Travel to Home   ${toHomeData.path.length} actions, fuelCost:${toHomeData.fuelCost}, time:${toHomeData.times}`);
  log(await proc.dispatcher.sageFleetHandler.canAttack(fa));

  if (toBattleData.fuelCost + toHomeData.fuelCost > fs.cargoStats.fuelCapacity) {
    console.error("Not enough fuel capacity in the tank to reach battle and return. Need:" + (toBattleData.fuelCost + toHomeData.fuelCost));
  }

  let approve = await prompt(
    "Fuel Cost to Battle " +
      toBattleData.fuelCost +
      " to home " +
      toHomeData.fuelCost +
      " total " +
      (toBattleData.fuelCost + toHomeData.fuelCost) +
      " from fuel capacity " +
      fs.cargoStats.fuelCapacity +
      ". Approve?"
  );
  if (!approve) {
    return;
  }

  while (true) {
    if (!proc.fleetAccount) {
      throw new Error("Cant find fleet account!");
    }

    if (!proc.fleetPubkey) {
      throw new Error("Cant find fleet KEY!");
    }
    let currentSector = await proc.dispatcher.sageFleetHandler.getCurrentSector(proc.fleetAccount); // ! REFRESH SECTOR
    log("Current sector", currentSector);

    /**
     * On Starbase
     */
    if (currentSector.x == starbaseLocation.x && currentSector.y == starbaseLocation.y) {
      log("At starbase location. Unloading Cargo");
      await unload(proc);
      log("At starbase location. Loading Cargo" + (toBattleData.fuelCost + toHomeData.fuelCost));
      await prompt("wait approve load");
      await load(proc, toBattleData.fuelCost + toHomeData.fuelCost);
      let state = await proc.dispatcher.sageGameHandler.sageFleetHandler.canAttack(proc.fleetPubkey, {
        funder: proc.dispatcher.signer.as,
        funderPermissionIdex: 0,
      });

      log("Can attack state", { attacks: state.attacksAvailable, canAttack: state.canAttack, reason: state.sateLabels.join(", ") });
      for (let act of toBattleData.path) {
        await act.execute();
      }
      console.error("Arrived to battle location");
      fa = await proc.fetchFleetAccount();
    }

    if (currentSector.x != battleLocation.x || currentSector.y != battleLocation.y) {
      let actions = await generateTraveling(proc, currentSector, battleLocation, "Hybrid");
      log(`Travel to Battle ${actions.path.length} actions, fuelCost:${actions.fuelCost}, time:${actions.times}`);
      // let actions = Process.generatePathActions(proc, path.path, "Hybrid", currentSector, true);
      for (let act of actions.path) {
        log("Traveling to battle", act.constructor.name);
        await act.execute();
      }
    }
    // if (fa.state.MoveSubwarp) {
    //   await new ExitSubwarpAction(proc).execute();
    // } else if (fa.state.MoveWarp) {
    //   await new ExitWarpAction(proc).execute();
    // } else {3
    //   throw "Fleet is not in warp or subwarp after travel to battle";
    // }

    while (1) {
      console.error(" ----------- ");
      let state = await proc.dispatcher.sageGameHandler.sageFleetHandler.canAttack(proc.fleetPubkey, {
        funder: proc.dispatcher.signer.as,
        funderPermissionIdex: 0,
      });

      log("Can attack state", { attacks: state.attacksAvailable, canAttack: state.canAttack, reason: state.sateLabels });
      if (state.delay > 0) {
        console.log("Waiting for attack CD:", formatTimePeriod(Math.ceil(state.delay / 1000))), "[ BEFORE Target Selection!]";
        await new Promise((resolve) => setTimeout(resolve, Math.max(state.delay, 1500)));
      }
      /**
       * ! FIND TARGETS
       */
      let targets = await findTargets(proc);
      log("Targets in sector:", targets.length);
      // targets = targets.reverse(); // attack weakest first
      let tgtAccount: Fleet | undefined = targets[0]?.fa;

      while (tgtAccount) {
        let targetData = targets.shift();
        tgtAccount = targetData?.fa;
        log({ ...targetData, fa: fa.state, stats: targetData?.stats.combatStats });
        if (!tgtAccount) break;
        if (tgtAccount) {
          let player = await proc.dispatcher.sageGameHandler.getFleetPlayerProfile(tgtAccount as any);
          let found = options.protected.find((p) => p === player.toBase58());
          if (found) {
            console.error("Fleet is protected: ", player.toBase58());
            if (options.preventTargetShieldBreak && !(await preventTargetRepair(proc.fleetAccount as any, tgtAccount))) {
              tgtAccount = undefined;
              console.error("Prevent target shield break");
              continue;
            }
            if (options.preventTargetDead && !(await preventTargetDead(proc.fleetAccount as any, tgtAccount))) {
              tgtAccount = undefined;
              console.error("Prevent target dead");
              continue;
            }
          }
        }

        if (options.preventSuicide && !(await preventSuicide(proc.fleetAccount as any, tgtAccount))) {
          console.error("[SKIP TARGET] Prevent SUICIDE");
          continue;
        }

        if (options.preventTargetDead && !(await preventAttackerShieldBrake(proc.fleetAccount as any, tgtAccount))) {
          console.error("[SKIP TARGET] Prevent PREVENT SELF SHIELD BREAK"); // ! Problem in real battle
          continue;
        }
        break;
      }

      if (!tgtAccount) {
        console.error("No valid targets found, waiting 1 min");
        await new Promise((resolve) => setTimeout(resolve, 1 * 30 * 1000)); // wait 30 sec
        continue;
      }

      if (!tgtAccount) {
        console.error("No targets found, waiting 1 min");
        await new Promise((resolve) => setTimeout(resolve, 1 * 30 * 1000));
        fa = await proc.fetchFleetAccount();
        continue;
      }
      log("Targets:", targets.length);
      // await prompt("Attack fleet " + tgtAccount.data.ap + " AP, " + tgtAccount.data.sp + " SP" + tgtAccount.data.hp + " ?");
      log("TargetAccount:", tgtAccount.key.toBase58());
      log("TargetAccount Sae:", tgtAccount.state);
      console.error("Attacking target:", tgtAccount.key.toBase58());

      /**
       * ! Attack
       */
      if (tgtAccount) {
        let noAmoState = false;
        console.error("Attacking target:", tgtAccount.key.toBase58());

        let action = new AttackAction(proc, tgtAccount as any);

        action.priorityFeeConfig = {
          enable: true,
          increaseBaseFee: 200,
        };

        action.onNoAmmo = async () => {
          console.error("No ammo to attack, aborting");
          // throw new Error("No ammo to attack, aborting");
          // noAmoState = Boolean(await prompt("No ammo to attack, press enter to continue"));
          noAmoState = true;
        };

        await action.run();

        let myFleetStats = await syncFleetData(proc, tgtAccount!.key);
        console.error(
          myFleetStats.delay,
          " Attack AGAIN",
          myFleetStats.canAttack,
          myFleetStats.attacksAvailable,
          myFleetStats.sateLabels.join(", ")
        );
        log("attacks av", myFleetStats.attacksAvailable, " ----------- ");
        if (noAmoState) break;
        // if (!myFleetStats.canAttack || myFleetStats.attacksAvailable < 0) break;
      }
    }

    //* Attack Targets until out of ammo

    /** Go Home To refill */
    for (let act of toHomeData.path) {
      await act.run();
    }
  }
}
run().catch((err) => {
  console.error(err);
  process.exit(1);
});

async function syncFleetData(proc: Process, target?: PublicKey) {
  let accounts: Promise<Fleet>[] = [];
  // @ts-ignore
  accounts.push(proc.fetchFleetAccount()!);
  // @ts-ignore
  if (target) accounts.push(proc.dispatcher.sageGameHandler.getFleetAccount(target));
  let fas = await Promise.all(accounts);
  let faStates = await Promise.all(
    fas.map(async (a) => {
      return proc.dispatcher.sageFleetHandler.canAttack(a as any); // ! sage Fleet not assignable to holo Fleet
    })
  );

  for (let i in fas) {
    let fAcc = fas[i];
    let fState = faStates[i];
    log(" >>> >>>> Fleet", fAcc.data.fleetLabel, getTimeString(fAcc.data.lastCombatUpdate), "ago");
    log(
      " >>>  Stats >>> SP:",
      fAcc.data.sp,
      "/",
      (fAcc.data.stats as ShipStats).combatStats.sp,
      " HP:",
      fAcc.data.hp,
      "/",
      "AP:",
      fAcc.data.ap,
      "/",
      (fAcc.data.stats as ShipStats).combatStats.ap,
      " Shield Expire:",
      " t->",
      getTimeString(fAcc.data.shieldBreakDelayExpiresAt),
      "ago"
    );
    let missingShield = (fAcc.data.stats as ShipStats).combatStats.sp - fAcc.data.sp;
    let missingHp = (fAcc.data.stats as ShipStats).combatStats.hp - fAcc.data.hp;
    let missingAp = (fAcc.data.stats as ShipStats).combatStats.ap - fAcc.data.ap;
    //fAcc.data.shieldBreakDelayExpiresAt
    log(
      " >>> REGEN >>> SP:",
      missingShield,
      " rate:",
      (fAcc.data.stats as ShipStats).combatStats.shieldRechargeRate,
      "time:",
      missingShield / (fAcc.data.stats as ShipStats).combatStats.shieldRechargeRate,
      "recharge after: ",
      getTimeString(missingShield / (fAcc.data.stats as ShipStats).combatStats.shieldRechargeRate)
    );
    log(
      " >>> REGEN >>> HP:",
      missingHp,
      " rate:",
      (fAcc.data.stats as ShipStats).combatStats.repairRate,
      (fAcc.data.stats as ShipStats).combatStats.repairAbility,
      (fAcc.data.stats as ShipStats).combatStats.repairEfficiency,
      " after time:",
      getTimeString(
        (missingHp / (fAcc.data.stats as ShipStats).combatStats.repairRate) *
          (fAcc.data.stats as ShipStats).combatStats.repairEfficiency *
          (fAcc.data.stats as ShipStats).combatStats.repairAbility
      )
    );
    log(
      " >>> REGEN >>> AP:",
      "MISSING:",
      missingAp,
      " rate:",
      (fAcc.data.stats as ShipStats).combatStats.apRegenRate,
      "time:",
      fAcc.data.ap / (fAcc.data.stats as ShipStats).combatStats.apRegenRate,
      "recharge after: ",
      getTimeString(fAcc.data.ap / (fAcc.data.stats as ShipStats).combatStats.apRegenRate / 100)
    );

    log(
      "Can attack state",
      `attacks: ${fState.attacksAvailable}, canAttack: ${fState.canAttack}, reason: [${fState.sateLabels.join(", ")}]`
    );
  }

  return faStates[0];
}
function getTimeString(timeStamp: number) {
  return formatTimePeriod(Math.round(timeStamp - new Date().getTime() / 1000));
}
async function generateTraveling(proc: Process, from: Coordinates, to: Coordinates, moveType: "Warp" | "Subwarp" | "Hybrid") {
  let fa = await proc.fetchFleetAccount();
  let path: Coordinates[] = [];
  // @ts-ignore
  let fs = fa.data.stats as ShipStats;
  let warpDistance = (fs as ShipStats).movementStats.maxWarpDistance / 100;
  if (moveType === "Subwarp") {
    path.push(to);
  } else if (moveType === "Warp") {
    path = MoveAction.calcWarpPath(
      from,
      to,
      // @ts-ignore
      warpDistance,
      0, // moveType == "Hybrid" ? hybridSubWarp : (fs as ShipStats).movementStats.maxWarpDistance,
      false
    );
  } else if (moveType === "Hybrid") {
    log("Generating Hybrid path with subwarp jump distance:", hybridSubWarp);
    path = MoveAction.calcWarpPath(
      from,
      to,
      // @ts-ignore
      warpDistance,
      hybridSubWarp,
      false
    );
  }
  log(warpDistance, "Generated path:", moveType, `length:`, path.length, path.map((p) => p.x + "," + p.y).join(" -> "));
  let costs = MoveAction.calcPathCosts(fs, from, path, moveType);
  let fCost = costs.reduce((a, b) => a + b.fuel, 0) + costs.length;
  let tCost = costs.reduce((a, b) => a + b.time, 0) + costs.length;
  log(`${moveType} Estimated travel time: ${formatTimePeriod(tCost)} Fuel Cost: ${fCost}`);

  return {
    path: Process.generatePathActions(proc, path, moveType, from, true),
    fuelCost: fCost,
    times: tCost,
  };
}

async function load(proc: Process, fuelCost: number) {
  let act = new TransferCargoAction(proc, [
    {
      isImportToFleet: true,
      resourceName: "fuel",
      // amount: 26696,
      cargoType: "fuelTank",
      amount: "max",
      // amount: fuelCost,
    },
    {
      isImportToFleet: true,
      resourceName: "ammunitions",
      cargoType: "ammoBank",
      amount: "max",
    },
  ]);
  return await act.execute();
}

async function unload(proc: Process) {
  // Check for loots and unload all
  let act = new TransferCargoAction(proc, [
    {
      isImportToFleet: false,
      cargoType: "fuelTank",
      resourceName: "fuel",
      // amount: 26696,
      amount: "max",
      condition: { whenMoreThen: 0 },
    },
    {
      isImportToFleet: false,
      resourceName: "food",
      amount: "max",
      condition: { whenMoreThen: 0 },
    },
    // {
    //   // Miners do not get ammo to mine but its nice to have opened token account for ammo cause stop mining expect it ( todo: update instruction to check and create associated
    //   //    token account for ammo in the cargo hold)
    //   isImportToFleet: false,
    //   cargoType: "ammoBank", // this is default value // food is only in cargoHold
    //   resourceName: "ammunitions",
    //   amount: "max",
    //   condition: { whenMoreThen: 0 },
    // },
    // {
    //   isImportToFleet: false,
    //   cargoType: "cargoHold",
    //   resourceName: "food",
    //   // amount: 26696,
    //   amount: "max",
    // },
  ]);
  return await act.execute();
}

/**
 * AP * attackCounts *( ShieldExpireDelay || 1) / (HP+SP) - focus get
 * @param proc
 * @param verbose
 * @returns
 */
async function findTargets(
  proc: Process,
  verbose: boolean = false
): Promise<
  {
    fa: Fleet;
    i: number;
    rate: number;
    hp: number;
    sp: number;
    ap: number;
    name: number[];
    key: Readonly<PublicKey>;
    state: string;
    attackCD: number;
    apCD: number;
    stats: ShipStats;
    faction: number;
  }[]
> {
  let fh = proc.dispatcher.sageFleetHandler;
  let fleetAccount = proc.fleetAccount!;

  if (!fleetAccount) [];
  // @ts-ignore - undefined not assignable
  let { x, y } = await fh.getCurrentSector(fleetAccount);
  let fleetsKeyedAccountInfo = (await proc.dispatcher.sageGameHandler.getSectorFleets(
    // fX,
    x,
    // fY,
    y,
    true
  )) as unknown as Fleet[];
  let withData = await Promise.all(
    fleetsKeyedAccountInfo.map(async (f) => {
      let s1 = await proc.dispatcher.sageFleetHandler.getCurrentSector(proc.fleetAccount as any);
      let s2 = await proc.dispatcher.sageFleetHandler.getCurrentSector(f as any);
      return {
        fleetAccount: f,
        location: await proc.dispatcher.sageFleetHandler.getCurrentSector(f as any),
        label: `${s1.x},${s1.y} <-> ${s2.x},${s2.y} ` + Object.keys(f.state)[0],
        inRange: await proc.dispatcher.sageFleetHandler.isInAttackRange(fleetAccount as any, f as any, 1),
        canAttack: await proc.dispatcher.sageFleetHandler.canAttack(f as any),
        attackable: await proc.dispatcher.sageFleetHandler.isAttackable(fleetAccount as any, f as any, fleetAccount.data.faction),
      };
    })
  );
  let now = new Date().getTime() / 1000;
  let owner = fleetAccount.data.ownerProfile;
  let fleets = withData
    .filter(
      (f) => {
        return (
          f.fleetAccount.key != fleetAccount.key && // not self
          owner != f.fleetAccount.data.ownerProfile && // not owned
          owner != f.fleetAccount.data.subProfile.key && // not borrowed
          // f.fleetAccount.data.faction != fleetAccount.data.faction &&
          f.inRange &&
          f.attackable
        );
      } // only idle
    )
    .sort((aF, bF) => {
      let a = aF.fleetAccount;
      let b = bF.fleetAccount;
      let aCD = 1 + Math.max(0, a.data.apReloadExpiresAt - now);
      let bCD = 1 + Math.max(0, b.data.apReloadExpiresAt - now);
      return (aCD * a.data.ap) / (a.data.pendingHp + a.data.sp) - (bCD * b.data.ap) / (b.data.pendingHp + b.data.sp);
    })
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
              v.state.MoveWarp?.toSector[0]
            )},${Number(v.state.MoveWarp?.toSector[1])}}`;
          break;
        case Boolean(v.state.MoveSubwarp):
          if (v.state.MoveSubwarp?.departureTime * 1000 > new Date().getTime()) {
            state = "[E] ";
          }
          state +=
            "Subwarp" +
            `{${Number(v.state.MoveSubwarp?.fromSector[0])},${Number(v.state.MoveSubwarp?.fromSector[1])}} --> {${Number(
              v.state.MoveSubwarp?.toSector[0]
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
        fa: v,
        i,
        rate: v.data.ap / (v.data.pendingHp + v.data.sp),
        hp: v.data.pendingHp,
        sp: v.data.sp,
        ap: v.data.ap,
        name: v.data.fleetLabel,
        key: v.key,
        state: state + (v.data.apReloadExpiresAt * 1000 - Date.now() > 0 ? " [AP-CD]" : ""),
        attackCD: Math.max(0, v.data.apReloadExpiresAt * 1000 - Date.now()),
        apCD: (v.data.stats as ShipStats).combatStats.ap / (v.data.stats as ShipStats).combatStats.apRegenRate,
        stats: v.data.stats as ShipStats,
        faction: v.data.faction,
        attackable: v0.attackable,
      };
    });

  if (verbose)
    fleets.forEach((v) => {
      log(
        `#${v.i} ${v.name} [${v.key.toBase58().slice(0, 4)}...] F:${v.faction} HP:${v.hp} SP:${v.sp} AP:${v.ap} CD:${getTimeString(
          v.attackCD / 1000
        )} R:${v.rate.toFixed(3)} -- ${v.state}`
      );
    });

  return fleets;
}

/**
 *
 * @param attacker
 * @param target
 * @returns true means safe to attack
 */
async function preventSuicide(attacker: Fleet, target: Fleet): Promise<boolean> {
  /**
   * (attacker.data.pendingHp || attacker.data.hp) - means: sometimes pendingHp is 0 when on full HP
   *
   * target.data.apReloadExpiresAt * 1000 < new Date().getTime() + 3000 - defender cooldown no loaded
   * ! problem with small cooldowns like 1,2 sec
   */
  return (
    attacker.data.sp + attacker.data.pendingHp > target.data.ap * 1.1 || target.data.apReloadExpiresAt * 1000 < new Date().getTime() + 3000
  );
}

/**
 * Keep target with shield up to prevent need of healing
 * @param attacker
 * @param target true means will not break shield
 */
async function preventTargetRepair(attacker: Fleet, target: Fleet) {
  return attacker.data.ap < target.data.sp; // need to keep shield up
}

/**
 * Keep target with shield up to prevent need of healing
 * @param attacker
 * @param target true means will not kill
 */
async function preventTargetDead(attacker: Fleet, target: Fleet) {
  return attacker.data.ap < target.data.sp + target.data.pendingHp; // need to keep shield up
}
/**
 *
 * @param attacker
 * @param target
 * @returns true means safe to attack
 */
async function preventAttackerShieldBrake(attacker: Fleet, target: Fleet) {
  return attacker.data.sp > target.data.ap; // need to keep shield up
}
