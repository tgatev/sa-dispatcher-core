import Dispatcher from "../src/Model/Dispatcher";
import { DockAction } from "../src/Model/DockAction";
import { Coordinates } from "../src/Model/MoveAction";
import { FleetProcess as Process } from "../src/Model/FleetProcess";
import { iScanConfig } from "../src/Model/ScanAction";
import { ScanProcess, iScanArrayElement } from "../src/Model/ScanProcess";
import { StartMiningAction } from "../src/Model/StartMiningAction";
import { StopMiningAction } from "../src/Model/StopMining";
import { TransferCargoAction } from "../src/Model/TransferCargoAction";
import { UnDockAction } from "../src/Model/UndockAction";
import { argv } from "../src/gameHandlers/GameHandler";

interface iMiningProcessDefinition {
  fleetName: string;
  resourceName: string;
  resourceHardness: number;
  resourceRichness: number;
  miningTIme?: number;
  saveStarbase: Coordinates;
  foodCost?: number;
  fuelCost?: number;
  ammoCost?: number;
}

async function run() {
  console.time("init_dispatcher");
  const dispatcher = await Dispatcher.build();
  console.timeEnd("init_dispatcher");
  console.time("Full execution tme");
  // dispatcher.sageFleetHandler.getFleetAccount()

  let fleetsScanArray = new Map<string, iScanArrayElement>();
  let scanDef = {
    fleetName: "s1",
    saveStarbase: new Coordinates(15, 14),
    scanConfig: {
      minChance: 0.35, // 25,30%
      targetAreaSize: 8,
      targetSector: new Coordinates(17, 7),
      // scanSector: new Coordinates(8, 11),
      movementTypes: {
        initial: "Subwarp",
        relocate: "Subwarp",
      },
      // scanSector: new Coordinates(18, 13),
    } as iScanConfig,
  } as iScanArrayElement;
  fleetsScanArray.set(scanDef.fleetName, scanDef);

  // Defining Scan process is running SDUProcessor
  let scanProcess = new ScanProcess(dispatcher, fleetsScanArray);

  let limit = 1000;
  for (let iter = 1; iter <= limit; iter++) {
    console.log(`======= MINING === CICLE === ${iter} [${limit}] === START `);
    let miningDef: iMiningProcessDefinition = {
      fleetName: "s1",
      resourceName: argv.resourceName || "hydrogen",
      resourceHardness: 1,
      resourceRichness: 2,
      saveStarbase: new Coordinates(15, 14),
    };

    //   console.time(`======= MINING === CICLE === ${iter} [${limit}] === END `);
    // Mine hydro by default
    let proc = await buildMiningProcess(dispatcher, miningDef);
    await proc.start(argv.startStep);
    argv.startStep = 0;

    //   miningDef.resourceName = "carbon";
    //   proc = await buildMiningProcess(dispatcher, miningDef);
    //   await proc.start(argv.startStep);

    console.timeEnd(`======= MINING === CICLE === ${iter} [${limit}] === END `);

    // // check for good sectors in area;
    // When There is No
    //  -> continue mining
    // else
    //  -> load Food and Fuel
    //  -> Go to scan
    // Set time Out and check to force stop Scanning
    console.log("wait time .... ");
    // await new Promise((resolve) => setTimeout(resolve, 2 * 60 * 1000));
    await goToScan(scanProcess, scanDef.fleetName);
    throw "1 Iteration Done !";
    // Await new Promise Resolve when after force stop
  }
}
run().catch((err) => {
  console.error(err);
  process.exit(1);
});

const buildMiningProcess = async (disp: Dispatcher, definitions: iMiningProcessDefinition): Promise<Process> => {
  let proc = new Process(disp, definitions.fleetName, definitions.saveStarbase);
  console.log("buildMiningProcess", definitions.fleetName);
  let startMinig = new StartMiningAction(proc, definitions.resourceName, definitions.resourceHardness, definitions.resourceRichness, {
    miningTime: definitions.miningTIme,
    autoStop: false,
  });

  let miningCosts = await startMinig.calcMiningTimesCosts();
  console.log(miningCosts);
  let fleetReload = new TransferCargoAction(proc, [
    {
      isImportToFleet: true,
      resourceName: "fuel",
      amount: definitions.fuelCost || "max", // if no passed fuel cost force to max
      cargoType: "fuelTank",
      // if no fuel cost use calculated costs
      condition: { whenLessThen: (definitions.fuelCost || miningCosts.fuel || 0) + 1 },
    },
    {
      isImportToFleet: true,
      resourceName: "food",
      amount: definitions.foodCost || (miningCosts.food as number),
      // cargoType: "cargoHold", // this is default value // food is only in cargoHold
      condition: { whenLessThen: miningCosts.food },
    },
    {
      // Miners do not get ammo to mine but its nice to have opened token account for ammo cause stop mining expect it ( todo: update instruction to check and create associated
      //    token account for ammo in the cargo hold)
      isImportToFleet: true,
      resourceName: "ammunitions",
      amount: definitions.ammoCost == undefined ? "max" : definitions.ammoCost,
      cargoType: "ammoBank", // this is default value // food is only in cargoHold
      condition: { whenLessThen: miningCosts.ammunitions },
    },
  ]);

  let depositCargoToStarbase = new TransferCargoAction(proc, [{ isImportToFleet: false, resourceName: definitions.resourceName, amount: "max" }]);

  //--startStep 0
  proc.addAction(fleetReload);
  //--startStep 1
  proc.addAction(new UnDockAction(proc));
  //--startStep 2
  proc.addAction(startMinig);
  //--startStep 3
  proc.addAction(new StopMiningAction(proc));
  //--startStep 4
  proc.addAction(new DockAction(proc));
  //--startStep 5
  proc.addAction(depositCargoToStarbase);

  return proc;
};

/**
 * Flow:
 *  1. use ScanProcess to check sectors in scanning area and find sector
 *  2. if there is no sectors - return;
 *     else ->
 *  3. transfer food and fuel to fleet
 *  4. undock.
 *  5. Start Scanning with start sector find on 2.
 *  6. Wait Scanning to complete
 *  7. Dock
 *  8. Transfer Cargo, but leave 1 Sdu in fleet
 *  9. retur
 *
 * @returns
 */
const goToScan = async (scanProcess: ScanProcess, fleetKey: string) => {
  let fsConfig = scanProcess.scanArray.get(fleetKey) as iScanArrayElement;
  let fleetProcess = scanProcess.getFleetProcess(fleetKey);
  let fleetAccount = await fleetProcess.fetchFleetAccount();
  let fss = await scanProcess.scanDll.getStatus(fleetAccount, fsConfig?.scanConfig);
  // Search Look For sectors based on scan config, closer to starbase
  let sector = await scanProcess.findNewSector(fleetKey, true, fsConfig);

  // There is no GOOD Sectors Found ?
  if (!sector) return;

  if (!fleetAccount.state.StarbaseLoadingBay) throw "Fleet is not docked!";

  // Run Cargo loading
  await new TransferCargoAction(fleetProcess, [
    {
      isImportToFleet: true,
      amount: "max",
      resourceName: "fuel",
      cargoType: "fuelTank",
    },
    {
      isImportToFleet: true,
      amount: "max",
      resourceName: "food",
    },
  ]).run();

  // Run Undock
  await new UnDockAction(fleetProcess).run();

  // Go To scan on sector found
  fsConfig.scanConfig.scanSector = sector.coordinates;
  await scanProcess.start();
  console.log(" !!!!!!!!!!!!! Scan Completed !!!!!!!!!!! No good sectors Aroud !!!!!!");

  // We are in front of starbase

  await new DockAction(fleetProcess).run();
  // refresh data
  fss = await scanProcess.scanDll.getStatus(fleetAccount, fsConfig?.scanConfig);
  await new TransferCargoAction(fleetProcess, [
    {
      isImportToFleet: false,
      resourceName: "food",
      amount: "max",
    },
    {
      isImportToFleet: false,
      resourceName: "sdu",
      amount: fss.sduAmount - 1,
    },
  ]).run();
  return;
};
