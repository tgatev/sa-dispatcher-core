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
    "7mEQhCDr1Pg7tA9MmEkz5eT57nYrtUNfSnTAXoWS8TDr", // MUTRATA
  ] as string[], // List of protected fleet public keys
};
/**
 *  Provide mining Hydrogen on Ustur CSS
 *    - Layer1 - using base actions flowing
 */
async function run() {
  console.time("init_dispatcher");
  const dispatcher = await DispatcherHolosim.build({ useLookupTables: true });
  let fleets = ["kamikadze1"];
  let fights = [];
  for (let index in fleets) {
    let fleetName = fleets[index];
    fights.push(
      new Promise(async () => {
        await fight(dispatcher, fleetName, {
          home: new Coordinates(-19, 40), // MRZ-33
          battle: new Coordinates(2, 46), // between MRZ-33 and MRZ-30
          // battle: new Coordinates(-19, 40),
          preventSuicide: true,
          preventTargetDead: true,
          preventTargetShieldBreak: true,
          preventAttackerShieldBrake: true,
          protected: options.protected,
          preventProtected: true, // Don't Attack protected fleets
          movementModeTo: "Hybrid",
          hybridSubWarpTo: 1,
          movementModeBack: "Hybrid",
          hybridSubWarpBack: 1.5,
          leaveOnNonProtectedInvasion: false,
          withToolkits: false,
          withRepair: false,
          noTargetsTimeout: 30, // 30 sec min
          onWarningAlert: {
            actionFallBack: (proc: Process) => {}, // "ReturnToBase" | "WaitAtPlace" | "Continue"
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
