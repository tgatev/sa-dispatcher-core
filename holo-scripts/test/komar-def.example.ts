import { Coordinates } from "../../src/Model/MoveAction";
import { DispatcherHolosim } from "../../src/holoHandlers/HolosimMintsImporter";
import { FleetRoles, createDefaultFightOptions } from "../../src/Model/Patrol";
import { fight } from "../FightOn";
import { holoProfilesInjector } from "../ignoreDI";

/**
 * Manage verbosity of injected profiles here, so that we can have detailed logs for debugging when needed without spamming logs when not needed.
 */
Object.entries(holoProfilesInjector).forEach(([key, value]) => {
  value.logger.setVerbosity(3);
});

async function run() {
  const k0p: string[] = [
    // "FIGHTER_1",
    // "OI",
    // "FU5",
    // "FU6",
    // "FU7",
    // "FU8",
    // "FU9",
    "xxl0",
  ];
  const bv: string[] = [
    // "FIGHTER_2",
    "FU1-BV",
    "FU2-BV",
    "FU3-BV",
    "FU4-BV",
  ];
  const mw: string[] = [
    // "FIGHTER_3",
    "FU1-MW",
    "FU2-MW",
    "FU3",
  ];
  const it: string[] = [
    // "FIGHTER_4",
    "FU1-IT",
    "FU2-IT",
    "FU3-IT",
    "FU4-IT",
    "m1",
  ];
  const p: string[] = [
    // "FIGHTER_5",
    "FU1-P",
    "FU2-P",
    "FU3-P",
    "m1",

    // "p-cm2",
  ];
  const g: string[] = [
    // "FIGHTER_5",
    "FU1-G",
    "m1",
  ];
  let sectors = { home: { x: 13, y: 37 }, battle: { x: 13, y: 37 } };
  sectors = { home: { x: 23, y: -12 }, battle: { x: 23, y: -12 } };

  // sectors = { home: { x: 2, y: 26 }, battle: { x: 2, y: 26 } };
  // sectors = { home: { x: 2, y: 26 }, battle: { x: -9, y: 24 } };
  // sectors = { home: { x: 17, y: 21 }, battle: { x: 2, y: 26 } };
  // sectors = { home: { x: 35, y: 16 }, battle: { x: 25, y: 14 } };
  // sectors = { home: { x: 13, y: 37 }, battle: { x: 13, y: 37 } };
  await Promise.all([
    allFighters(await holoProfilesInjector.k0p, sectors, k0p)
      .catch((err) => {
        console.error("<<--kopEnds", err);
      })
      .finally(() => {}),
    ,
    allFighters(await holoProfilesInjector.bv, sectors, bv)
      .catch((err) => {
        console.error("<<--bvEnds", err);
      })
      .finally(() => {}),
    allFighters(await holoProfilesInjector.mw, sectors, mw)
      .catch((err) => {
        console.error("<<--mwEnds", err);
      })
      .finally(() => {}),
    ,
    allFighters(await holoProfilesInjector.it, sectors, it)
      .catch((err) => {
        console.error("<<--itEnds", err);
      })
      .finally(() => {}),
    ,
    allFighters(await holoProfilesInjector.p, sectors, p)
      .catch((err) => {
        console.error("<<--pEnds", err);
      })
      .finally(() => {}),
    allFighters(await holoProfilesInjector.g, sectors, g)
      .catch((err) => {
        console.error("<<--pEnds", err);
      })
      .finally(() => {}),
    ,
  ]);
}

async function allFighters(
  dispatcher: DispatcherHolosim,
  s: { home: { x: number; y: number }; battle: { x: number; y: number } },

  fleetNames: string[] = [],
  role = FleetRoles.Fighter,
) {
  const opsFighter = createDefaultFightOptions();
  opsFighter.fleetMode = role;
  opsFighter.home = new Coordinates(s.home.x, s.home.y);
  opsFighter.battle = new Coordinates(s.battle.x, s.battle.y);
  opsFighter.noTargetsTimeout = 5;
  opsFighter.healThreshold = 0.99;
  opsFighter.preventProtected = false;
  opsFighter.preventSuicide = true;
  opsFighter.hybridSubWarpBack = 1;
  opsFighter.hybridSubWarpTo = 1;
  opsFighter.preventAttackerShieldBrake = false;
  opsFighter.waitShieldUpBeforeUndock = true;
  opsFighter.withRepair = true;
  opsFighter.targetCoordinatorDistributionMode = "focus";
  opsFighter.preferredTargetProfileKeys = [
    // "  ",
  ];
  opsFighter.protected = [
    // "PROFILE_KEY_1",
  ];
  // Prioritize targets with high AP and low HP+SP (cooldown ignored).
  opsFighter.ratings = {
    mining: 1,
    ap: 10,
    hp: 1,
    sp: 1,
    repairRate: 1,
    preferredProfile: 1,
  };
  opsFighter.ratingFormula = (input, w) => {
    const dpsProxy = Math.max(0, input.ap) / (1 + Math.max(0, input.apCooldownFullSec)); // AP с penalty за cooldown
    const ehp = Math.max(1, Math.max(0, input.hp) + Math.max(0, input.sp)); // HP+SP
    const preferred = input.preferredProfile ? w.preferredProfile || 0 : 0;
    const score = (w.ap * dpsProxy + preferred) / (1 + w.hp * (input.hp / ehp) + w.sp * (input.sp / ehp));
    return -score;
  };
  return await Promise.all(
    fleetNames.map((fleetName) =>
      fight(dispatcher, fleetName, opsFighter).catch((err) => {
        console.error("fight.example.fighter", fleetName, err);
      }),
    ),
  );
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
