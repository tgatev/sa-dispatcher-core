import { Coordinates } from "../../../src/Model/MoveAction";
import { DispatcherHolosim, ProcessHolosim as Process } from "../../../src/holoHandlers/HolosimMintsImporter";
import { fight } from "../../FightOn";
const options = {
  preventSuicide: true, // Prevent attack if after attack fleet will be destroyed
  preventTargetDead: true, // Prevent attack if after attack target will be destroyed
  preventTargetShieldBreak: true, // Prevent attack if after attack target shield will be broken
  preventAttackerShieldBrake: false, // Prevent attack if after attack attacker shield will be broken
  protected: [
    // KOP
    "4JxR1fXQ8SNox8WgNvhETRE6yefBpHeiE6znSaY5uDrf",
  ] as string[], // List of protected fleet public keys
};
/**
 *  Provide mining Hydrogen on Ustur CSS
 *    - Layer1 - using base actions flowing
 */
async function run() {
  console.time("init_dispatcher");
  const dispatcher = await DispatcherHolosim.build({ useLookupTables: true });
  let fleets = ["AT2", "AT1", "AT3", "AT5"];
  // ("Sheep Fleet");
  let fights = [];
  for (let index in fleets) {
    let fleetName = fleets[index];
    fights.push(
      new Promise(async () => {
        await fight(dispatcher, fleetName, {
          preventProtected: true, // Don't Attack protected fleets

          home: new Coordinates(-8, 35), // MRZ-33
          // battle: new Coordinates(-8, 46), // between MRZ-33 and MRZ-30
          // battle: new Coordinates(-2, 40), // between MRZ-33 and MRZ-30
          // battle: new Coordinates(-8, 45), // between MRZ-33 and MRZ-30
          battle: new Coordinates(-8, 35), // between MRZ-33 and MRZ-30
          // battle: new Coordinates(-40, 30), // between MRZ-33 and MRZ-30
          preventSuicide: true,
          preventTargetDead: true,
          preventTargetShieldBreak: true,
          preventAttackerShieldBrake: true,
          protected: options.protected,
          movementModeTo: "Hybrid",
          hybridSubWarpTo: 1,
          movementModeBack: "Hybrid",
          hybridSubWarpBack: 10, // 1.5,
          leaveOnNonProtectedInvasion: false,
          withToolkits: false,
          withRepair: true,
          noTargetsTimeout: 20, // 30 sec min
          onWarningAlert: {
            actionFallBack: (proc: Process) => {
              // proc.moveAction = MoveAction.ReturnToBase;
            }, // "ReturnToBase" | "WaitAtPlace" | "Continue"
          },
        }).catch((err) => {
          console.error(err);
          console.log("Error in fight, continue with next fleet");
        });
      })
    );
  }
  console.timeEnd("init_dispatcher");
  console.time("Full execution tme");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
