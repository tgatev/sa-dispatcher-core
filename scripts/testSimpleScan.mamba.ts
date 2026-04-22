import Dispatcher from "../src/Model/Dispatcher";
import { iScanConfig } from "../src/Model/ScanAction";
import { iScanArrayElement, ScanProcess } from "../src/Model/ScanProcess";
import { Coordinates } from "../src/Model/MoveAction";
// process.env['TRANSACTION_PRIORITY_FEE_LIMIT'] = "5000";
// process.env['TRANSACTION_PRIORITY_FEE_CAP'] = "100000";
// process.env["TRANSACTION_PRIORITY_FEE_MIN_CHANCE"] = "70";
// process.env["TRANSACTION_PRIORITY_FEE_INCREASE_STEP"] = "10000";
// process.env["TRANSACTION_PRIORITY_FEE_INCREASE_BASE_FEE"] = "100";
// process.env.DEBUG = "1";
const argv = require("yargs").argv;

async function run() {
  console.time("init_dispatcher");
  const dispatcher = await Dispatcher.build();
  dispatcher.logger.setVerbosity(4);
  console.timeEnd("init_dispatcher");
  console.time("Full execution tme");

  // dispatcher.sageFleetHandler.getFleetAccount()
  /** Provide pointer reference to handlers */
  let fleetsScanArray = new Map<string, iScanArrayElement>();
  fleetsScanArray.set("MambaEx", {
    fleetName: "MambaEx",
    // saveStarbase: new Coordinates(16, -5),
    saveStarbase: new Coordinates(25, 14),
    scanConfig: {
      stopOnRefill: false,
      // Min Percent for scanning
      minChance: 0.29, // 25,30%
      // Listening area range (max-distance) for sector chances for find new sector
      targetAreaSize: 12,
      // Form of area
      targetAreaType: "Square",
      // Center point of area
      targetSector: new Coordinates(8, 4),
      // Start Scanning Sector -> first relocation is by relocate mode . After that on refill will be used initial mode of movement types
      // scanSector: new Coordinates(15, 10),
      movementTypes: {
        initial: "Subwarp",
        relocate: "Subwarp",
      },
      // Look around after {trigger} amount of scans for sector with chance difference bigger then {diff}, with area {size}, relocated by {moveType}
      // On move after found -> when found SDU - fleet will trigger look around for better sector where to go on better chance
      lookAround: {
        diff: 0.1,
        size: 1,
        trigger: 10,
        moveType: "Subwarp",
        moveAfterFound: true,
      },
    } as iScanConfig,
  } as iScanArrayElement);

  // fleetsScanArray.set("Copepod Fleet", {
  //   fleetName: "Copepod Fleet",
  //   // saveStarbase: new Coordinates(16, -5),
  //   saveStarbase: new Coordinates(25, 14),
  //   scanConfig: {
  //     // Min Percent for scanning
  //     minChance: 0.25, // 25,30%
  //     // Listening area range (max-distance) for sector chances for find new sector
  //     targetAreaSize: 16,
  //     // Form of area
  //     targetAreaType: "Square",
  //     // Center point of area
  //     targetSector: new Coordinates(10, 10),
  //     // Start Scanning Sector -> first relocation is by relocate mode . After that on refill will be used initial mode of movement types
  //     // scanSector: new Coordinates(15, 10),
  //     movementTypes: {
  //       initial: "Subwarp",
  //       relocate: "Subwarp",
  //     },
  //     // Look around after {trigger} amount of scans for sector with chance difference bigger then {diff}, with area {size}, relocated by {moveType}
  //     // On move after found -> when found SDU - fleet will trigger look around for better sector where to go on better chance
  //     lookAround: {
  //       diff: 0.05,
  //       size: 1,
  //       trigger: 5,
  //       moveType: "Subwarp",
  //       moveAfterFound: false,
  //     },
  //   } as iScanConfig,
  // } as iScanArrayElement);

  // fleetsScanArray.set("pernik", {
  //   fleetName: "pernik",
  //   scanConfig: {
  //     minChance: 0.22, // 25,30%
  //     targetAreaSize: 10,
  //     targetSector: new Coordinates(18, 18),
  //     // scanSector: new Coordinates(11, 18),
  //     movementTypes: {
  //       initial: "Subwarp",
  //       relocate: "Subwarp",
  //     },
  //   } as iScanConfig,
  //   saveStarbase: new Coordinates(17, 21),
  // } as iScanArrayElement);
  let lll = async (data: any) => {
    console.log("XXXX DB XXXX", data);
  };
  let scanProcess = new ScanProcess(dispatcher, fleetsScanArray, lll, {
    enable: true,
    limit: 5000,
    cap: 10000,
    minChance: 80,
    increaseStep: 5000,
    increaseBaseFee: 5,
    lockbackSlots: 150,
  });

  // await new Promise((resolve) => setTimeout(resolve, 1 * 60 * 1000));

  scanProcess._sectorDefaultChance = 0.2; // predicted SDU chance for sectors whithout data from SDU Parser
  scanProcess._maxOwnerFleetsInSector = 1; // Number - how much fleets i could have in a single sector
  scanProcess._scannerRunPeriod = 10; // 10 seconds - Timer how often is run process for a fleet - each 10 secs process is started to decide what happens and what to do
  scanProcess._sectorDataFreshPeriod = 20 * 60; // 5 minutes - SDU Processor - do not use old data as SDU Chance for flat value
  scanProcess._sectorFleetsCountRefreshPeriod = 5 * 60; // 5 minutes - expire time validity of data for count of fleets in current sector

  // 1 hour -> after leave a sector as low chance disable sector to not be lested when search new sector
  // Note! Bigger then _waitBeforeMove
  scanProcess._sectorDisableTime = 15 * 60;
  scanProcess._waitBeforeMove = 6 * 60; // 4 minutes - after cooldown expire waite sector chance to rise up
  // !!! IF THIS VALUE IS > _waitBeforeMove -> process will detect sector as diabled and will force moving without sector disable
  scanProcess._defaultBonusTimeWaitingAfterSuccess = 2 * 60;
  // When is low chance and fleet is alone on sector - leave after first simulation
  scanProcess._triggerFastMoveOnBadSector = false;
  scanProcess._fuelPercentToForceStarbaseOrientation = 0.45;
  // let p = new Process(dispatcher, "s1", new Coordinates(17, 21));
  // p.addAction(new SubwarpAction(p, new Coordinates(9, 22), true));
  // await p.start();

  await scanProcess.start();
  console.log("Script End ");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
