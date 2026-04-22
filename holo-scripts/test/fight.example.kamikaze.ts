import { Coordinates } from "../../src/Model/MoveAction";
import { DispatcherHolosim } from "../../src/holoHandlers/HolosimMintsImporter";
import { FleetRoles, createDefaultFightOptions } from "../../src/Model/Patrol";
import { fight } from "../FightOn";

async function run() {
  console.time("init_dispatcher");
  const dispatcher = await DispatcherHolosim.build({ useLookupTables: true });
  console.timeEnd("init_dispatcher");

  const ops = createDefaultFightOptions();
  ops.fleetMode = FleetRoles.Kamikaze;
  ops.home = new Coordinates(2, 26);
  ops.battle = new Coordinates(2, 26);
  ops.preventSuicide = false;
  ops.preventTargetDead = false;
  ops.preventTargetShieldBreak = false;
  ops.preventAttackerShieldBrake = false;
  ops.noTargetsTimeout = 5;
  ops.healThreshold = 0;
  ops.preventProtected = true;
  ops.protected = [
    // "PROFILE_KEY_1",
  ];

  ops.roleHooks[FleetRoles.Kamikaze] = {
    onFight: async (ctx) => {
      ctx.logger?.("Kamikaze phase", ctx.fleetId);
    },
  };

  const fleets: string[] = [
    // "KAMIKAZE_FLEET_1",
  ];

  await Promise.all(
    fleets.map((fleetName) =>
      fight(dispatcher, fleetName, ops).catch((err) => {
        console.error("fight.example.kamikaze", fleetName, err);
      }),
    ),
  );
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
