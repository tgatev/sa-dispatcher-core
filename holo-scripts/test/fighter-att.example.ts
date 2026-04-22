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
    // "xxl0",
  ];
  const bv: string[] = [
    // "FIGHTER_2",
    "FU1-BV",
    "FU2-BV",
    "FU3-BV",
    "FU4-BV",
    "FU5-BV",
  ];
  const mw: string[] = [
    // "FIGHTER_3",
    "FU1-MW",
    "FU2-MW",
    "FU3-MW",
    "FU4-MW",
  ];
  const it: string[] = [
    // "FIGHTER_4",
    "FU1-IT",
    "FU2-IT",
    "FU3-IT",
    "FU4-IT",
    // "m1",
    "FU5-IT",
  ];
  const p: string[] = [
    // "FIGHTER_5",
    "FU1-P",
    "FU2-P",
    "FU3-P",
    "FU4-P",
    // "m1",
    "FU5-P",

    // "p-cm2",
  ];
  const g: string[] = [
    // "FIGHTER_5",
    "FU1-G",
    "FU2-G",
    // "m1",
    "FU5-G",
  ];
  let sectors = { home: { x: 13, y: 37 }, battle: { x: 13, y: 37 } };
  // sectors = { home: { x: 25, y: 14 }, battle: { x: 25, y: 14 } };
  sectors = { home: { x: 22, y: 5 }, battle: { x: 22, y: 5 } };
  // sectors = { home: { x: 22, y: 5 }, battle: { x: 35, y: -1 } };
  // sectors = { home: { x: 22, y: 5 }, battle: { x: 25, y: 14 } };
  // sectors = { home: { x: 22, y: 5 }, battle: { x: 16, y: -5 } };
  // sectors = { home: { x: 31, y: -19 }, battle: { x: 31, y: -19 } };

  // sectors = { home: { x: 2, y: 26 }, battle: { x: 2, y: 26 } };
  // sectors = { home: { x: 2, y: 26 }, battle: { x: -9, y: 24 } };
  // sectors = { home: { x: 17, y: 21 }, battle: { x: 2, y: 26 } };
  // sectors = { home: { x: 35, y: 16 }, battle: { x: 25, y: 14 } };
  // sectors = { home: { x: 35, y: 16 }, battle: { x: 44, y: 10 } };

  // sectors = { home: { x: 44, y: 10 }, battle: { x: 44, y: 10 } };
  // sectors = { home: { x: 44, y: 10 }, battle: { x: 39, y: -1 } };
  // sectors = { home: { x: 39, y: -1 }, battle: { x: 39, y: -1 } };
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
        console.error("<<--gEnds", err);
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
  //! when true = Attack Starbase first if it's possible, to prevent target from escaping or calling for help.
  opsFighter.forceStarbaseAttackFirst = false;

  opsFighter.fleetMode = role;
  opsFighter.home = new Coordinates(s.home.x, s.home.y);
  opsFighter.battle = new Coordinates(s.battle.x, s.battle.y);
  opsFighter.noTargetsTimeout = 10;
  opsFighter.healThreshold = 0.99;

  opsFighter.hybridSubWarpBack = 1;
  opsFighter.hybridSubWarpTo = 1;
  opsFighter.waitShieldUpBeforeUndock = true;

  opsFighter.withLootRetrieve = true;
  opsFighter.withRepairIdle = true;
  opsFighter.withRepairStarbase = false;
  opsFighter.withRepairDocked = false;
  opsFighter.withToolkits = false;

  opsFighter.preventProtected = false;
  opsFighter.preventAttackerShieldBrake = true;
  opsFighter.preventSuicide = true;
  opsFighter.targetCoordinatorDistributionMode = "focus";

  opsFighter.preferredTargetProfileKeys = [
    // "  ",
    "GsUwZLhj8BaEJgs2wZ77Pi1HDfBj5FivSNgcyyyRs2SC", // "GAMountainMan"
    "7kkS4vqe9cweSovdF5sggJSmanjLTV8uZrF9rtxNTRv9", // Bola
  ];

  // Found profile: "GsUwZLhj8BaEJgs2wZ77Pi1HDfBj5FivSNgcyyyRs2SC" GAMountainMan
  //Found profile: "7kkS4vqe9cweSovdF5sggJSmanjLTV8uZrF9rtxNTRv9" Bola
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
    return score;
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
