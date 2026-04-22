import { FleetProcess as Process } from "../../src/Model/FleetProcess";

/**
 *  Provide Transfer resources between CSS and UST-21 with mining on UST-21 by Hybrid Mode and Process.generatePathActions()
 *    - Layer1 - using Base Actions chain
 */

async function run() {
  console.time("init_dispatcher");
  // const dispatcher = await Dispatcher.build({ useLookupTables: true });
  console.timeEnd("init_dispatcher");
  console.time("Full execution tme");

  /** Provide pointer reference to handlers */
  // let proc = new Process(dispatcher, "pernik", new Coordinates(25, 14));
  let proc = await Process.build(undefined, "mrz21");
  // let fleetAccount = await proc.fetchFleetAccount();
  // let fleetStats = fleetAccount.data.stats as ShipStats;
  // let cargoSize: number = fleetStats.cargoStats.cargoCapacity as number;

  // 1 Carbon
  await Process.buildAndAppendActions(proc, "copper_ore", "mrz15", {
    miningTimes: 0,
    movementMode: "Subwarp",
    transportToMiningBase: [{ resourceName: "electronics", percent: 1 }],
    transportToSafeStarbase: [{ resourceName: "copper_ore", percent: 1 }],
    fuelTankToMiningBase: true,
    // ammoBankToSaveStarbase: true,
  });

  await proc.repeat();
}

// Start execution
run().catch((err) => {
  console.error(err);
  process.exit(1);
});
