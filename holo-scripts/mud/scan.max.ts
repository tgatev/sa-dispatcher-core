import { DispatcherHolosim as Dispatcher } from "../../src/holoHandlers/HolosimMintsImporter";
import { iScanConfig } from "../../src/Model/ScanAction";
import { iScanArrayElement, ScanProcess } from "../../src/Model/ScanProcess";
import { Coordinates } from "../../src/Model/MoveAction";
import { HolosimSDUProbabilityProcessor } from "../../";
process.env["TRANSACTION_PRIORITY_FEE_LIMIT"] = "1000";
process.env["TRANSACTION_PRIORITY_FEE_CAP"] = "40000";
process.env["TRANSACTION_PRIORITY_FEE_MIN_CHANCE"] = "80";
process.env["TRANSACTION_PRIORITY_FEE_INCREASE_STEP"] = "5000";
process.env["TRANSACTION_PRIORITY_FEE_INCREASE_BASE_FEE"] = "100";
// process.env.DEBUG = "1";
//process.env["SOLANA_RPC_URL"] = "https://solana-api.instantnodes.io/token-XuaXdMRJM20okWngqjvDqSOSURajwWN2";
const argv = require("yargs").argv;

async function run() {
  console.time("init_dispatcher");
  const dispatcher = await Dispatcher.build({ useLookupTables: false });
  dispatcher.logger.setVerbosity(4);
  console.timeEnd("init_dispatcher");
  console.time("Full execution tme");
  //  ! Replace SOLANA SDU Processor with HOLOSIM SDU Processor
  let sduProcessor = new HolosimSDUProbabilityProcessor(); // Singleton init
  // sduProcessor.connection = dispatcher.sageGameHandler.connection;
  // sduProcessor.surveyDataUnitTracker = new PublicKey("DXPsKQPMyaDtunxDWqiKTGWbQga3Wihck8zb8iSLATJQ"); //

  // dispatcher.sageFleetHandler.getFleetAccount()
  /** Provide pointer reference to handlers */
  let minChance = 0.1;
  let targetSector = new Coordinates(0, -29);
  let saveBase = new Coordinates(0, -39); // MRZ-23
  let fleetsScanArray = new Map<string, iScanArrayElement>();
  for (let i = 0; i <= 2; i++) {
    fleetsScanArray.set("scan" + (i || ""), {
      fleetName: "scan" + (i || ""),
      saveStarbase: saveBase,
      // saveStarbase: new Coordinates(25, 14),
      scanConfig: {
        stopOnRefill: false,
        // Min Percent for scanning
        minChance: minChance, // 25,30%
        // Listening area range (max-distance) for sector chances for find new sector
        targetAreaSize: 10,
        // Form of area
        targetAreaType: "Square",
        // Center point of area
        targetSector: new Coordinates(targetSector.x + i, targetSector.y - i),
        // scanSector: new Coordinates(22, 8),
        // targetSector: new Coordinates(8, 4),
        // Start Scanning Sector -> first relocation is by relocate mode . After that on refill will be used initial mode of movement types
        // scanSector: new Coordinates(15, 10),
        movementTypes: {
          initial: "Subwarp",
          relocate: "Subwarp",
        },
        // Look around after {trigger} amount of scans for sector with chance difference bigger then {diff}, with area {size}, relocated by {moveType}
        // On move after found -> when found SDU - fleet will trigger look around for better sector where to go on better chance
        lookAround: {
          diff: 0.01,
          size: 2,
          trigger: 10,
          moveType: "Warp",
          moveAfterFound: false,
        },
      } as iScanConfig,
    } as iScanArrayElement);
  }

  //! ##########################################

  let lll = async (data: any) => {
    // console.log("XXXX DB XXXX", data);
  };
  let scanProcess = new ScanProcess(
    dispatcher,
    fleetsScanArray,
    lll,
    {
      enable: false,
      limit: 2000,
      cap: 10000,
      minChance: 100,
      increaseStep: 1000,
      increaseBaseFee: 100,
      lockbackSlots: 150,
    },
    { sduProcessor: sduProcessor }
  );

  scanProcess.scaleFactor = 1000; // !! HOLOSIM SETUP
  // await new Promise((resolve) => setTimeout(resolve, 1 * 60 * 1000));

  scanProcess._sectorDefaultChance = minChance + 0.02; // predicted SDU chance for sectors without data from SDU Parser
  scanProcess._maxOwnerFleetsInSector = 1; // Number - how much fleets i could have in a single sector
  scanProcess._scannerRunPeriod = 3; // 10 seconds - Timer how often is run process for a fleet - each 10 secs process is started to decide what happens and what to do
  scanProcess._sectorDataFreshPeriod = 30 * 60 * 12; // 60 minutes - SDU Processor - do not use old data as SDU Chance for flat value
  scanProcess._sectorFleetsCountRefreshPeriod = 5000 * 600; // 5 minutes - expire time validity of data for count of fleets in current sector

  // 1 hour -> after leave a sector as low chance disable sector to not be listed when search new sector
  // Note! Bigger then _waitBeforeMove
  scanProcess._sectorDisableTime = 4 * 60 * 60;
  scanProcess._waitBeforeMove = 5; // 5 seconds - after cooldown expire waite sector chance to rise up
  // !!! IF THIS VALUE IS > _waitBeforeMove -> process will detect sector as disabled and will force moving without sector disable
  scanProcess._defaultBonusTimeWaitingAfterSuccess = 0 * 60;
  // When is low chance and fleet is alone on sector - leave after first simulation
  scanProcess._triggerFastMoveOnBadSector = true;
  scanProcess._fuelPercentToForceStarbaseOrientation = 0.5;
  // let p = new Process(dispatcher, "scan", new Coordinates(17, 21));

  // p.addAction(new SubwarpAction(p, new Coordinates(9, 22), true));
  // await p.start();

  await scanProcess.start();
  console.log("Script End ");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
