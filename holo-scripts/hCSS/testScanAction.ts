// import Dispatcher from "../../src/Model/Dispatcher";
import { Coordinates } from "../../src/Model/MoveAction";
import { FleetProcess as Process } from "../../src/Model/FleetProcess";
import { ScanAction } from "../../src/Model/ScanAction";
import { DispatcherHolosim } from "../../src/holoHandlers/HolosimMintsImporter";

/**
 *  Provide mining Hydrogen on Ustur CSS
 *    - Layer1 - using base actions flowing
 */
const fleetName = "test";

async function run() {
  console.time("init_dispatcher");
  const dispatcher = await DispatcherHolosim.build({ useLookupTables: false });
  console.timeEnd("init_dispatcher");
  console.time("Full execution tme");
  // dispatcher.sageFleetHandler.getFleetAccount()

  /** Provide pointer reference to handlers */
  let proc = new Process(dispatcher, fleetName, new Coordinates(40, 30));
  proc.dispatcher.donate = false;

  proc.addAction(new ScanAction(proc, { minChance: 0.01 } as any));

  proc.repeat();
}
run().catch((err) => {
  console.error(err);
  process.exit(1);
});
