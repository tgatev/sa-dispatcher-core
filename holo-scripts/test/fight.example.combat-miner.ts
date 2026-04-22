import { Coordinates } from "../../src/Model/MoveAction";
import { DispatcherHolosim } from "../../src/holoHandlers/HolosimMintsImporter";
import { FleetRoles, createDefaultFightOptions } from "../../src/Model/Patrol";
import { fight } from "../FightOn";

async function run() {
  console.time("init_dispatcher");
  const dispatcher = await DispatcherHolosim.build({ useLookupTables: true });
  console.timeEnd("init_dispatcher");

  const ops = createDefaultFightOptions();
  ops.fleetMode = FleetRoles.CombatMiner;
  ops.home = new Coordinates(2, 26);
  ops.battle = new Coordinates(2, 26);
  ops.noTargetsTimeout = 15;
  ops.healThreshold = 0.55;
  ops.withRepair = true;
  ops.withToolkits = false;
  ops.preventProtected = true;
  ops.protected = [
    // "PROFILE_KEY_1",
  ];

  ops.roleHooks[FleetRoles.CombatMiner] = {
    onFight: async (ctx) => {
      ctx.logger?.("CombatMiner fight phase", ctx.fleetId);
    },
    onReturn: async (ctx) => {
      ctx.logger?.("CombatMiner return phase", ctx.fleetId);
    },
  };

  const fleets = [
    // "COMBAT_MINER_1",
  ];

  await Promise.all(
    fleets.map((fleetName) =>
      fight(dispatcher, fleetName, ops).catch((err) => {
        console.error("fight.example.combat-miner", fleetName, err);
      }),
    ),
  );
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
