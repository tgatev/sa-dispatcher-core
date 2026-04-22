import { Coordinates } from "../../../src/Model/MoveAction";
import { DispatcherHolosim, Fleet, ProcessHolosim, SageGameHandler, ShipStats } from "../../../src/holoHandlers/HolosimMintsImporter";
import { FightLifecycleContext, FleetRoles, PatrolLifecycleEvent, PublicKey, RoleHookResult, createKamikazeMinerFightOptions } from "../../../src/Model/Patrol";
import { fight } from "../../FightOn";
import { argv } from "../../../src/holoHandlers/HolosimMintsImporter";
import { cliIcons } from "../../../src/utils";
import { log } from "../../../src/Common/PatchConsoleLog";
import { StartMiningAction } from "../../../src/Model/StartMiningAction";
import { SubwarpAction } from "../../../src/Model/SubwarpAction";
import { buildLootRetrieveHealerActions } from "../../../src/Model/FleetProcess";

/**
 * This file Describe a behavior for Kamikaze fleets as Komar [mosquito] sector, which are used for testing and demonstration purposes. The fleet will fight normally when there are targets, but if there is no target for N cycles, it will execute a custom mining flow (defined in createKamikazeHooks) until it finds a target again. You can customize the mining flow by changing the options passed to generateMiningProcessSteps or by providing a custom sequence of actions.
 *
 * Useful mode for small fleets reviving fast, with mining rate - they can mine and go to fight
 */
let sector = argv.sector || "22,5";
let parsedSector = sector.split(",").map((x: string) => parseInt(x.trim()));
let location = { x: parsedSector[0], y: parsedSector[1] };
let prefix = argv.prefix || "bv-komar-";
let dispatcher: DispatcherHolosim = await DispatcherHolosim.build({ useLookupTables: true });
const DEFAULT_MINING_DATA = { baseName: "", resourceName: "" }; //|| { baseName: "mrz23", resourceName: "iron_ore" };

const MINER_DANGER_RADIUS = Number(argv.dangerRadius || 1);
const MINER_MIN_HP_RATIO = Number(argv.dangerHpRatio || 0.45);
const MINER_MIN_SP_RATIO = Number(argv.dangerSpRatio || 0.2);
const MINER_MIN_AP = Number(argv.dangerMinAp || 0);
/**
 * Manage verbosity of injected profiles here, so that we can have detailed logs for debugging when needed without spamming logs when not needed.
 */
dispatcher.logger.setVerbosity(3);

async function run() {
  const fleetSelector = async (
    dispatcher: DispatcherHolosim,
    profileKey: PublicKey,
    opts: { namePrefix?: string; location?: Coordinates; customFilter?: (fa: Fleet) => Promise<boolean> },
  ) => {
    let fas = await dispatcher.sageGameHandler.getPlayerProfileFleetsAccounts(profileKey);
    let result: {
      name: string;
      data: Fleet;
    }[] = [];

    for (let f of fas) {
      let name = String.fromCharCode(...f.data.fleetLabel)
        .trim()
        .replaceAll(/\u0000/g, "");
      // log("1: ", name, opts.namePrefix);
      if (opts.namePrefix && !name.startsWith(opts.namePrefix)) {
        continue;
      }

      if (opts.location) {
        let location = await dispatcher.sageGameHandler.sageFleetHandler.getCurrentSector(f);
        if (location.x !== opts.location.x || location.y !== opts.location.y) {
          continue;
        }
      }

      if (opts.customFilter) {
        let pass = await opts.customFilter(f as unknown as Fleet);
        if (!pass) {
          continue;
        }
      }
      result.push({ name, data: f as unknown as Fleet });
    }

    return result;
  };

  /**
   * BEGINNING
   */
  let playerProfile = await dispatcher.playerProfile;
  let fleets = await fleetSelector(dispatcher, playerProfile, {
    namePrefix: prefix, // + "4"
    // location: location,
  });

  let sectors = { home: location, battle: location };
  // (miningSB, miningResource);
  // log(fleets.length, "fleets found:", fleets);
  // sectors = { home: { x: 40, y: 30 }, battle: { x: 40, y: 30 } };
  // sectors = { home: { x: 23, y: -12 }, battle: { x: 23, y: -12 } };
  log(
    "Selected fleets for fight:",
    fleets.map((f) => f.name),
  );
  // throw "STOP ME";
  await Promise.all([
    // allFighters(await holoProfilesInjector.k0p, sectors2, k0p),
    allFighters(
      dispatcher,
      sectors,
      fleets.map((v) => v.name),
      FleetRoles.KamikazeMiner,
    ),
  ]);
}

async function allFighters(
  dispatcher: DispatcherHolosim,
  s: { home: { x: number; y: number }; battle: { x: number; y: number } },

  fleetNames: string[] = [],
  role = FleetRoles.KamikazeMiner,
) {
  const createFleetOptions = () => {
    const opsFighter = createKamikazeMinerFightOptions();
    opsFighter.fleetMode = role;
    opsFighter.home = new Coordinates(s.home.x, s.home.y);
    opsFighter.battle = new Coordinates(s.battle.x, s.battle.y);
    opsFighter.noTargetsTimeout = 3;
    opsFighter.healThreshold = 0.5;
    opsFighter.preventSuicide = true;
    opsFighter.preventAttackerShieldBrake = false;
    opsFighter.withToolkits = false;
    // opsFighter.preventAttackerShieldBrake = true;
    opsFighter.waitShieldUpBeforeUndock = false;
    opsFighter.targetCoordinatorDistributionMode = "spread";
    opsFighter.preferredTargetProfileKeys = [
      // "  ",
    ];
    opsFighter.protected = [
      // "PROFILE_KEY_1",
      "DYUDRKkiVs8RhurbvSBhzZgyUjvQa3EjZhTJUb6vPR2r", // NPC-MUD
      "2PmLyxgKjUpmh1Havb9C4X23g2cTWkz1qap9P3BMLs2o", // NPC-MUD
      "AnSByEse1eWjeusPp5uQmZz5sKHVMgFLRNAaVpaHFDXK", // NPC-Ustur
      "6rGk9hYEjZVYNY5iua496tWYkkBFZ7U7EtAdmYdJZx16", // NPC-ONI
    ];
    opsFighter.preventProtected = true;

    // Important: each fleet gets its own hook instance and isolated state.
    opsFighter.roleHooks = {
      KamikazeMiner: createKamikazeHooks(),
    };

    opsFighter.miner = {
      ...opsFighter.miner,
      enabled: true,
      invasionMinEnemies: 5,
      onInvasionDefaultAction: "none",
      miningProcessFactory: async ({ proc, battleLocation }) => {
        return await buildMinerProcessForBattle(proc, battleLocation);
      },
    };

    // Prioritize targets with high AP and low HP+SP (cooldown ignored).
    opsFighter.ratings = {
      mining: 0,
      ap: 1,
      hp: 1,
      sp: 1,
      repairRate: 0,
      preferredProfile: 1,
    };

    // opsFighter.ratingFormula = (input, weights) => {
    //   const ehp = weights.hp * Math.max(0, input.hp) + weights.sp * Math.max(0, input.sp);
    //   const ap = Math.max(1, weights.ap * Math.max(0, input.ap));
    //   const preferredMultiplier = 1 + Math.max(0, weights.preferredProfile || 0) * Math.max(0, input.preferredProfile || 0);
    //   return ehp / (ap * preferredMultiplier);
    // };

    return opsFighter;
  };

  return await Promise.all(
    fleetNames.map((fleetName) =>
      fight(dispatcher, fleetName, createFleetOptions()).catch((err) => {
        console.error("fight.example.fighter", fleetName, err);
      }),
    ),
  );
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

type KamikazeHooks = {
  onInit?: (ctx: FightLifecycleContext) => Promise<RoleHookResult | void>;
  onLoad?: (ctx: FightLifecycleContext) => Promise<RoleHookResult | void>;
  onFight?: (ctx: FightLifecycleContext) => Promise<RoleHookResult | void>;
  onInvasion?: (ctx: FightLifecycleContext) => Promise<RoleHookResult | void>;
  onEvent?: (ctx: FightLifecycleContext, event: PatrolLifecycleEvent) => Promise<RoleHookResult | void>;
  onReturn?: (ctx: FightLifecycleContext) => Promise<RoleHookResult | void>;
};

/**
 * Build mining process for current battle location. The process is generated once per fleet and reused.
 */
async function buildMinerProcessForBattle(proc: ProcessHolosim, battleLocation: Coordinates) {
  const fleet = (await proc.fetchFleetAccount()) as unknown as Fleet;
  if ((fleet.data.stats as ShipStats).cargoStats.miningRate <= 0) {
    return null;
  }
  // let fa = (proc.fleetAccount! as unknown as Fleet); // ensure type for mining process factory, can be used later for more customized mining processes based on fleet stats or loadout
  // fa.data.apReloadExpiresAt
  const gh = proc.dispatcher.sageGameHandler as unknown as SageGameHandler;
  const location = new Coordinates(battleLocation.x, battleLocation.y);
  let miningSBKeyFound: string | undefined;
  for (const sbKey of await gh.asStatic().getStarbaseMapKeys()) {
    let tmpSB = gh.asStatic().starbaseMap[sbKey];
    if (tmpSB.location.x === location.x && tmpSB.location.y === location.y) {
      miningSBKeyFound = sbKey;
      break;
    }
  }

  if (!(DEFAULT_MINING_DATA.baseName && DEFAULT_MINING_DATA.resourceName) && !miningSBKeyFound) {
    log("[KamikazeMiner] No starbase found in battle location, cannot generate mining process");
    return null;
  }

  const miningProcess = new ProcessHolosim(proc.dispatcher, proc.fleetName, location);
  miningProcess.watchDangerWhileAwaitingAction({
    actionFilter: (action) => action instanceof StartMiningAction || action instanceof SubwarpAction,
    maxEnemyDistance: MINER_DANGER_RADIUS,
    minHpRatio: MINER_MIN_HP_RATIO,
    minSpRatio: MINER_MIN_SP_RATIO,
    minAp: MINER_MIN_AP,
    logger: (...args) => log(...args),
    onDanger: async (danger) => {
      const ts = new Date().toISOString();
      log(
        cliIcons.warning.repeat(10),
        `[KamikazeMiner][Danger][${proc.fleetName}] @ ${ts}`,
        "\n  type    :",
        danger.type,
        "\n  action  :",
        danger.action.constructor.name,
        "\n  message :",
        danger.message,
        ...(danger.distance !== undefined ? ["\n  distance:", danger.distance] : []),
        ...(danger.otherSnapshot ? ["\n  enemy   :", danger.otherSnapshot.pubkey, "at", danger.otherSnapshot.position] : []),
        ...(danger.ownSnapshot ? ["\n  ownPos  :", danger.ownSnapshot.position] : []),
        cliIcons.warning.repeat(10),
      );
    },
  });

  if (!(DEFAULT_MINING_DATA.baseName && DEFAULT_MINING_DATA.resourceName)) {
    const b = gh.asStatic().starbaseMap[miningSBKeyFound!];
    for (const res of b.resources) {
      const result = await miningProcess.generateMiningProcessSteps(b, res, { miningTimes: 1 });
      miningProcess.actionsChain.push(...result.actions);
      await buildLootRetrieveHealerActions(miningProcess, 0);
    }
  } else {
    await ProcessHolosim.buildAndAppendActions(miningProcess, DEFAULT_MINING_DATA.resourceName, DEFAULT_MINING_DATA.baseName, {
      miningTimes: 1,
      bundleDockUndock: true,
    });
    // Mining Phase - Wait for shield up
    await buildLootRetrieveHealerActions(miningProcess, 0);
  }

  return miningProcess;
}

/**
 * Kamikaze miner custom hooks. Core mining/fight lifecycle is handled by role behavior.
 */
function createKamikazeHooks(): KamikazeHooks {
  return {
    onLoad: async (_ctx: FightLifecycleContext) => {
      return { skipDefault: false };
    },
    onInvasion: async (ctx: FightLifecycleContext) => {
      ctx.logger?.(cliIcons.warning.repeat(2), `[KamikazeMiner][${ctx.proc.fleetName}] invasion detected`, cliIcons.warning.repeat(2));
      return { skipDefault: false };
    },

    onEvent: async (ctx: FightLifecycleContext, event) => {
      if (event.type === "onFight") {
        ctx.logger?.("[KamikazeMiner] onFight event done");
      }
    },
  };
}
