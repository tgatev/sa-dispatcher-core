import { Coordinates } from "../../../src/Model/MoveAction";
import { DispatcherHolosim } from "../../../src/holoHandlers/HolosimMintsImporter";
import { FleetRoles, createDefaultFightOptions } from "../../../src/Model/Patrol";
import { fight } from "../../FightOn";
import { holoProfilesInjector } from "../../ignoreDI";

/**
 * Manage verbosity of injected profiles here, so that we can have detailed logs for debugging when needed without spamming logs when not needed.
 */
// Object.entries(holoProfilesInjector).forEach(([key, value]) => {
//   value.logger.setVerbosity(3);
// });

async function run() {
  // const k0p: string[] = [
  //   // "FIGHTER_1",
  //   "a1",
  //   "a2",
  //   "a3",
  //   "a4",
  //   "a5",
  // ];
  const bv: string[] = [
    // "FIGHTER_2",
    "FU1-BV",
    "FU2-BV",
    "FU3-BV",
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
  ];
  const p: string[] = [
    // "FIGHTER_5",
    "FU1-P",
    "FU2-P",
    // "p-cm2",
  ];

  let sectors = { home: { x: 49, y: 20 }, battle: { x: 49, y: 20 } };

  // sectors = { home: { x: 2, y: 26 }, battle: { x: 2, y: 26 } };
  // sectors = { home: { x: 2, y: 26 }, battle: { x: -9, y: 24 } };
  // sectors = { home: { x: 17, y: 21 }, battle: { x: 17, y: 21 } };
  // sectors = { home: { x: 40, y: 30 }, battle: { x: 40, y: 30 } };
  // let sectors2 = { home: { x: 40, y: 30 }, battle: { x: 40, y: 30 } };
  await Promise.all([
    // allFighters(await holoProfilesInjector.k0p, sectors2, k0p),
    allFighters(await holoProfilesInjector.bv, sectors, bv),
    allFighters(await holoProfilesInjector.mw, sectors, mw),
    allFighters(await holoProfilesInjector.it, sectors, it),
    allFighters(await holoProfilesInjector.p, sectors, p),
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
  opsFighter.noTargetsTimeout = 20;
  opsFighter.healThreshold = 0.99;
  opsFighter.preventProtected = false;
  opsFighter.preventSuicide = true;
  opsFighter.preventAttackerShieldBrake = true;
  opsFighter.waitShieldUpBeforeUndock = true;
  opsFighter.targetCoordinatorDistributionMode = "focus";

  opsFighter.hybridSubWarpBack = 1.6;
  opsFighter.hybridSubWarpTo = 1.6;
  opsFighter.waitShieldUpBeforeUndock = true;
  opsFighter.withRepairIdle = false;
  opsFighter.targetCoordinatorDistributionMode = "focus";
  opsFighter.withToolkits = false;

  opsFighter.preferredTargetProfileKeys = [
    // "  ",
  ];
  opsFighter.protected = [
    // "PROFILE_KEY_1",
  ];
  // Prioritize targets with high AP and low HP+SP (cooldown ignored).
  opsFighter.ratings = {
    mining: 0,
    ap: 1,
    hp: 1,
    sp: 1,
    repairRate: 0,
    preferredProfile: 1,
  };

  opsFighter.ratingFormula = (input, weights) => {
    const ehp = weights.hp * Math.max(0, input.hp) + weights.sp * Math.max(0, input.sp);
    const ap = Math.max(1, weights.ap * Math.max(0, input.ap));
    const preferredMultiplier = 1 + Math.max(0, weights.preferredProfile || 0) * Math.max(0, input.preferredProfile || 0);
    return ehp / (ap * preferredMultiplier);
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
