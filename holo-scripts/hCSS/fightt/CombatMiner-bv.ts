import { Coordinates } from "../../../src/Model/MoveAction";
import { DispatcherHolosim, Fleet, ProcessHolosim, SageGameHandler, ShipStats } from "../../../src/holoHandlers/HolosimMintsImporter";
import {
  FightLifecycleContext,
  FleetRoles,
  PatrolLifecycleEvent,
  PublicKey,
  RoleHookResult,
  createDefaultFightOptions,
} from "../../../src/Model/Patrol";
import { fight } from "../../FightOn";
import { argv } from "../../../src/holoHandlers/HolosimMintsImporter";
import { cliIcons } from "../../../src/utils";
import { log } from "../../../src/Common/PatchConsoleLog";
import { TransferCargoAction } from "../../../src/Model/TransferCargoAction";
import { StopMiningAction } from "../../../src/Model/StopMining";
import { UnDockAction } from "../../../src/Model/UndockAction";
import { iAction } from "../../..";

/**
 * This file Describe a behavior for Kamikaze fleets as Komar [mosquito] sector, which are used for testing and demonstration purposes. The fleet will fight normally when there are targets, but if there is no target for N cycles, it will execute a custom mining flow (defined in createKamikazeHooks) until it finds a target again. You can customize the mining flow by changing the options passed to generateMiningProcessSteps or by providing a custom sequence of actions.
 *
 * Useful mode for small fleets reviving fast, with mining rate - they can mine and go to fight
 */
let sector = argv.sector || "49,20";
let parsedSector = sector.split(",").map((x: string) => parseInt(x.trim()));
let location = { x: parsedSector[0], y: parsedSector[1] };
let prefix = argv.prefix || "bv-komar-";
let dispatcher: DispatcherHolosim = await DispatcherHolosim.build({ useLookupTables: true });
const DEFAULT_MINING_DATA = { baseName: "", resourceName: "" }; //|| { baseName: "mrz23", resourceName: "iron_ore" };
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
   * BEGINING
   */
  prefix = "";
  let playerProfile = await dispatcher.playerProfile;
  let fleets = await fleetSelector(dispatcher, playerProfile, {
    namePrefix: prefix, // + "4"
    // location: location,
  });

  let sectors = { home: location, battle: location };
  // (miningSB, miningResource);
  // log(fleets.length, "fleets found:", fleets);
  // sectors = { home: { x: 44, y: 10 }, battle: { x: 44, y: 8 } };
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
      fleets.filter((v) => !v.name.startsWith("bv-komar")).map((v) => v.name),
      FleetRoles.Kamikaze,
    ),
  ]);
}

async function allFighters(
  dispatcher: DispatcherHolosim,
  s: { home: { x: number; y: number }; battle: { x: number; y: number } },

  fleetNames: string[] = [],
  role = FleetRoles.Kamikaze,
) {
  const createFleetOptions = () => {
    const opsFighter = createDefaultFightOptions();
    opsFighter.fleetMode = role;
    opsFighter.home = new Coordinates(s.home.x, s.home.y);
    opsFighter.battle = new Coordinates(s.battle.x, s.battle.y);
    opsFighter.noTargetsTimeout = 6;
    opsFighter.healThreshold = 0.5;
    opsFighter.preventSuicide = true;
    opsFighter.preventAttackerShieldBrake = true;
    opsFighter.withRepair = true;
    opsFighter.withToolkits = false;
    // opsFighter.preventAttackerShieldBrake = true;
    opsFighter.waitShieldUpBeforeUndock = true;
    opsFighter.targetCoordinatorDistributionMode = "focus";
    opsFighter.preferredTargetProfileKeys = [
      // "  ",
    ];
    opsFighter.protected = [
      // "PROFILE_KEY_1",
      // "DYUDRKkiVs8RhurbvSBhzZgyUjvQa3EjZhTJUb6vPR2r", // NPC-MUD
      // "2PmLyxgKjUpmh1Havb9C4X23g2cTWkz1qap9P3BMLs2o", // NPC-MUD
      // "AnSByEse1eWjeusPp5uQmZz5sKHVMgFLRNAaVpaHFDXK", // NPC-Ustur
      // "6rGk9hYEjZVYNY5iua496tWYkkBFZ7U7EtAdmYdJZx16", // NPC-ONI
    ];
    opsFighter.preventProtected = true;

    // Important: each fleet gets its own hook instance and isolated state.
    opsFighter.roleHooks = {
      Kamikaze: createKamikazeHooks(),
    };
    // Prioritize targets with high AP and low HP+SP (cooldown ignored).
    // opsFighter.ratings = {
    //   mining: 0,
    //   ap: 1,
    //   hp: 1,
    //   sp: 1,
    //   repairRate: 0,
    //   preferredProfile: 1,
    // };

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
  onEvent?: (ctx: FightLifecycleContext, event: PatrolLifecycleEvent) => Promise<RoleHookResult | void>;
  onReturn?: (ctx: FightLifecycleContext) => Promise<RoleHookResult | void>;
};

/**
 * Kamikaze Miners -> is a micro fleet with fast respawn time
 * @param noTargetsTimeoutSec
 * @returns
 */
function createKamikazeHooks(): KamikazeHooks {
  let cyclesWithoutTargets = 0;
  let miningProcess: ProcessHolosim | null = null;
  let invadersMinAmount = 5; // Will be used to set have invasion to true

  return {
    // 1) state handling at the beginning of the fight ( aka on boot load)
    onLoad: async (_ctx: FightLifecycleContext) => {
      return { skipDefault: false }; // do not skip default load, otherwise fleets in respawn state will not be able to respawn and will be stuck
    },
    // 2) Fight hook: if there is no target for N cycles execute a sequence of Mining Steps steps
    onFight: async (ctx: FightLifecycleContext) => {
      if (ctx.fightContext === "travel-subwarp") {
        // Travel interrupt context: allow default attack selector, but skip mining side-flow.
        return { skipDefault: false };
      }
      const threat = Number((await ctx.getThreatLevel?.()) || 0);
      if (threat > 0) {
        // Ima targeti -> normalen fight
        cyclesWithoutTargets = 0;
        return; // skipDefault = false (default flow continue normal Kamikaze fight)
      }
      let logPrefix = "[Kamikaze][Fight][" + ctx.proc.fleetName + "]";

      // Count There is not targets State
      cyclesWithoutTargets += 1;
      ctx.logger?.(logPrefix, " No targets cycle:", cyclesWithoutTargets);

      // ! How much time should have no targets before custom flow starts
      if (cyclesWithoutTargets < 2) {
        // Skip Default will brake all the fight flow and force returning back here we return back to normal fight flow until we reach the no targets timeout threshold
        return { skipDefault: false };
      }

      // There is not targets for N cycles -> execute custom logic

      let fa = (await ctx.proc.fetchFleetAccount()) as unknown as Fleet;
      if ((fa.data.stats as ShipStats).cargoStats.miningRate > 0) {
        let gh = ctx.proc.dispatcher.sageGameHandler as unknown as SageGameHandler;
        let fh = gh.sageFleetHandler;
        let location = await fh.getCurrentSector(ctx.proc.fleetAccount as any);
        let miningSBKeyFound;
        for (const sbKey of await gh.asStatic().getStarbaseMapKeys()) {
          let tmpSB = gh.asStatic().starbaseMap[sbKey];
          if (tmpSB.location.x === location.x && tmpSB.location.y === location.y) {
            miningSBKeyFound = sbKey;
            break;
          }
        }
        // Fetch starbase account to ensue ownership
        let starbasesAccountAddress = await gh.getStarbaseAddress(location.toBN());
        let starbasesAccount = await gh.getStarbaseAccount(starbasesAccountAddress);

        // Prevent Try to mine on empty sectors
        if (!starbasesAccount) {
          ctx.proc.logger.info(
            logPrefix,
            cliIcons.error.repeat(4) + "No Starbase found in current location, cannot execute mining flow" + cliIcons.error.repeat(4),
          );
        } else if (starbasesAccount.data.faction !== fa.data.faction) {
          ctx.proc.logger.info(
            logPrefix,
            cliIcons.error.repeat(4) + "Starbase found but not owned by the Faction, cannot execute mining flow" + cliIcons.error.repeat(4),
            { baseFaction: starbasesAccount.data.faction, fleetFaction: fa.data.faction },
          );
        }

        if (miningProcess == null) {
          // generate mining process steps
          // If there is no mining flow - loop all base resources
          if (!(DEFAULT_MINING_DATA.baseName && DEFAULT_MINING_DATA.resourceName)) {
            if (!miningSBKeyFound) {
              console.error(logPrefix, cliIcons.error.repeat(4) + "No Starbase found in current location, cannot generate mining flow");
              return; // Continue DEFAULT fight flow (wait)
            }
            let b = gh.asStatic().starbaseMap[miningSBKeyFound];
            miningProcess = new ProcessHolosim(ctx.proc.dispatcher, ctx.proc.fleetName, location);
            for (const res of b.resources) {
              // miningFlow = { baseName: "mrz23", resourceName: res.resourceName };
              const result = await miningProcess.generateMiningProcessSteps(b, res, { miningTimes: 1 });
              miningProcess.actionsChain.push(...result.actions);
            }
          } else {
            // let miningFlow = DEFAULT_MINING_DATA || undefined;
            let b = gh.asStatic().starbaseMap[DEFAULT_MINING_DATA.baseName];

            miningProcess = new ProcessHolosim(ctx.proc.dispatcher, ctx.proc.fleetName, location);
            await ProcessHolosim.buildAndAppendActions(miningProcess, DEFAULT_MINING_DATA.resourceName, DEFAULT_MINING_DATA.baseName, {
              miningTimes: 1,
              bundleDockUndock: true,
            });
          }

          // Attach Hooks to brake mining on invasion and fast return in combat mode
          // ! TO BE CHANGED WIth EVENt emmiting on ENEMY WARP on the sector
          // ! now we implement counting enemy not protected fleets in the current sector and Brake on 5 enemies detected
          for (let action of miningProcess.actionsChain) {
            action.onBeforeExecute = async (a: iAction) => {
              /**
               * * On Invasion we are leaving mining flow - ensure that we are becoming in combat ready state
               */
              if ((await ctx.hasSectorInvasion?.(invadersMinAmount)) == true) {
                console.error("RED-ALERT! >> ENEMY INVASION DETECTED << RED-ALERT!", (a.process as ProcessHolosim).fleetName);
                console.error("RED-ALERT! >> ENEMY INVASION DETECTED << RED-ALERT!", (a.process as ProcessHolosim).fleetName);
                console.error("RED-ALERT! >> ENEMY INVASION DETECTED << RED-ALERT!", (a.process as ProcessHolosim).fleetName);
                console.error("RED-ALERT! >> ENEMY INVASION DETECTED << RED-ALERT!", (a.process as ProcessHolosim).fleetName);

                ctx.logger?.(
                  logPrefix,
                  cliIcons.warning.repeat(2) +
                    cliIcons.combat.repeat(2) +
                    "Sector Invasion detected during mining process, abort mining and return to fight mode" +
                    cliIcons.combat.repeat(2) +
                    cliIcons.warning.repeat(2),
                );
                a.signals.abort.beforeAbort = async () => {
                  let p = a.process as ProcessHolosim;
                  let fa = (await p.fetchFleetAccount()) as unknown as Fleet;
                  if (fa.state.MineAsteroid) {
                    if (p.fleetAccount!.state.MineAsteroid) {
                      await new StopMiningAction(p).run();
                    }

                    // Double check if we are still alive :D:D:D
                    fa = (await p.fetchFleetAccount()) as unknown as Fleet;
                    // We are ALIVE
                    if (!fa.state.Respawn) {
                      // All other states compatible with transfer cargo / dock is handled fleet movements and so on
                      // ! Unload fuel and "This is SPARTA !!!" :D:D:D
                      await new TransferCargoAction(p, [
                        {
                          isImportToFleet: false,
                          resourceName: "ALL",
                          cargoType: "cargoHold",
                          amount: "max",
                        },
                        { isImportToFleet: false, resourceName: "fuel", cargoType: "fuelTank", amount: "max" },
                      ]).run();
                      await new UnDockAction(p).run(); // Undock to be able to Attack ASAP
                    }
                  }
                }; // Signal to stop mining process

                // Force Process Exiting from any flow and action and return to fight mode
                a.signals.abort.state = true; // Signal to stop mining process
              }
            };
          }
        }

        if (miningProcess) {
          ctx.logger?.(
            cliIcons.mining.repeat(3) + logPrefix,
            "No targets for " + cyclesWithoutTargets + " cycles, execute custom mining flow" + cliIcons.mining.repeat(3),
          );
          try {
            await new TransferCargoAction(ctx.proc, [
              {
                isImportToFleet: false,
                resourceName: "ALL",
                cargoType: "cargoHold",
                amount: "max",
              },
            ]).run(); // Unload all cargo before mining, to free up space for mined resources and avoid potential issues with full cargo hold during mining process
            await miningProcess.repeat(1, 0);
          } catch (err) {
            ctx.logger?.(
              logPrefix,
              cliIcons.error.repeat(3) +
                "Error executing mining flow: " +
                (err instanceof Error ? err.message : String(err)) +
                cliIcons.error.repeat(3),
            );
            // Abort signal may be triggered on Invasion
          }
        }
        ctx.logger?.(logPrefix, " combatMining flow -> MINING COMPLETED, continue ....");
        // let steps = await ctx.proc.generateMiningProcessSteps(miningSB, miningResource, options);
      }

      return { skipDefault: false };
    },

    onEvent: async (ctx: FightLifecycleContext, event) => {
      if (event.type === "onFight") {
        ctx.logger?.("[Kamikaze] onFight event done");
      }
    },

    // onReturn: async (_ctx) => {
    //   // optional
    // },
  };
}
