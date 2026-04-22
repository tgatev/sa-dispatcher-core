import { Coordinates } from "../../src/Model/MoveAction";
import { DispatcherHolosim } from "../../src/holoHandlers/HolosimMintsImporter";
import { FleetRoles, createDefaultFightOptions } from "../../src/Model/Patrol";
import { fight } from "../FightOn";

async function run() {
  console.time("init_dispatcher");
  const dispatcher = await DispatcherHolosim.build({ useLookupTables: true });
  console.timeEnd("init_dispatcher");

  const ops = createDefaultFightOptions();
  ops.fleetMode = FleetRoles.CombatMinerSwitcher;
  ops.home = new Coordinates(2, 26);
  ops.battle = new Coordinates(2, 26);
  ops.noTargetsTimeout = 10;
  ops.healThreshold = 0.5;
  ops.preventProtected = true;
  ops.protected = [
    // "PROFILE_KEY_1",
  ];

  ops.switcherConfig.combatFleetIds = [
    // "COMBAT_ESCORT_1",
    // "COMBAT_ESCORT_2",
    // "COMBAT_ESCORT_3",
  ];
  ops.switcherConfig.threatPerCombatFleet = 2;
  ops.switcherConfig.minCombatFleetsPerResponse = 1;
  ops.switcherConfig.maxCombatFleetsPerResponse = 3;
  ops.switcherConfig.triggerOnAnyEnemy = true;

  ops.roleHooks[FleetRoles.CombatMinerSwitcher] = {
    onEvent: async (ctx, event) => {
      if (event.type === "onFight") {
        const state = ctx.switchManager.getAssignments(ctx.fleetId);
        ctx.logger?.("Switcher state", ctx.fleetId, state);
      }
    },
  };

  ops.switcherPolicy = {
    getAvailableCombatFleetIds: async () => ops.switcherConfig.combatFleetIds,
    getDesiredCombatFleetCount: async (ctx) => {
      const threat = Number((await ctx.getThreatLevel?.()) || 0);
      if (threat <= 0) return 0;
      if (threat >= 5) return 3;
      if (threat >= 3) return 2;
      return 1;
    },
    onPlanComputed: async (ctx, plan) => {
      ctx.logger?.("Switcher plan", ctx.fleetId, plan);
    },
    shouldResumeMining: async (_ctx, plan) => {
      return plan.threatLevel <= 0;
    },
    onResumeMining: async (ctx) => {
      ctx.logger?.("Resume mining", ctx.fleetId);
    },
  };

  const fleets = [
    // "MINER_PARENT_1",
  ];

  await Promise.all(
    fleets.map((fleetName) =>
      fight(dispatcher, fleetName, ops).catch((err) => {
        console.error("fight.example.combat-miner-switcher", fleetName, err);
      }),
    ),
  );
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
