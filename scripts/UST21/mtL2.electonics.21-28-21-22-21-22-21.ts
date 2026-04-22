import { Coordinates } from "../../src/Model/MoveAction";
import { MiningBuildOptions, FleetProcess as Process } from "../../src/Model/FleetProcess";
import { SageGameHandler, argv } from "../../src/gameHandlers/GameHandler";
import { prompt } from "../../src/Common/prompt";

process.env["TRANSACTION_PRIORITY_FEE_LIMIT"] = "10000";
process.env["TRANSACTION_PRIORITY_FEE_CAP"] = "100000";
process.env["TRANSACTION_PRIORITY_FEE_MIN_CHANCE"] = "90";
process.env["TRANSACTION_PRIORITY_FEE_INCREASE_STEP"] = "10000";
process.env["TRANSACTION_PRIORITY_FEE_INCREASE_BASE_FEE"] = "1001";
// process.env["SOLANA_RPC_URL"] = process.env.SOLANA_RPC_TRANSACTION_URL;

const fleetName = argv.fleetName;
let cicle = argv.startCicle || "hydrogen";
let movementMode = "Hybrid";

async function run() {
  let limit = 100;
  for (let iter = 1; iter <= limit; iter++) {
    console.log(`======= MINING === CICLE === ${iter} [${limit}] === START `);

    switch (cicle) {
      case "hydrogen": {
        console.log("<<<<<<<<<<<<<<< Hydrogen Cicle >>>>>>>>>>>>>>>");
        let proc = await gen28Cicle(fleetName, "hydrogen");
        await proc.start(argv.startStep);
        argv.startStep = 0;
      }
      case "carbon": {
        console.log("<<<<<<<<<<<<<<< Carbon Cicle >>>>>>>>>>>>>>>");
        let proc = await gen28Cicle(fleetName, "carbon");
        await proc.start(argv.startStep);
        argv.startStep = 0;
      }
      case "copper1": {
        console.log("<<<<<<<<<<<<<<< Copper Ore Cicle >>>>>>>>>>>>>>>");
        let proc = await gen22Cicle(fleetName, "copper_ore");
        await proc.start(argv.startStep);
        argv.startStep = 0;
      }
      case "copper2": {
        console.log("<<<<<<<<<<<<<<< Copper Ore 2Cicle >>>>>>>>>>>>>>>");
        let proc = await gen22Cicle(fleetName, "copper_ore");
        await proc.start(argv.startStep);
        argv.startStep = 0;
      }
      case "hydrogen21": {
        console.log("<<<<<<<<<<<<<<< Hydrogen[FUEL] 21  >>>>>>>>>>>>>>>");
        let proc = await gen21Cicle(fleetName);
        await proc.start(argv.startStep);
        argv.startStep = 0;
      }
    }
    console.time(`======= MINING === CICLE === ${iter} [${limit}] === END `);
    cicle = "hydrogen";
    console.timeEnd(`======= MINING === CICLE === ${iter} [${limit}] === END `);
  }
}
run().catch((err) => {
  console.error(err);
  process.exit(1);
});

async function gen28Cicle(fleetName: string, resource: "hydrogen" | "carbon") {
  const saveStarbaseName = "mrz21";
  /** Provide pointer reference to handlers */
  let proc = await Process.build(fleetName, saveStarbaseName);
  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation

  let miningBase = await SageGameHandler.readStarbaseByName("mrz28");
  let miningResource = await SageGameHandler.readStarbaseResource(miningBase, resource);
  if (!movementMode) {
    movementMode = (await prompt("Set movement mode [ Warp | Subwarp | Hybrid ] ")).toString().trim();
  }

  let options = {
    miningTimes: 4,
  } as MiningBuildOptions;
  if (movementMode == "Subwarp") {
    options.pathToMiningStarbase = [miningBase.location];
    options.pathToSafeStarbase = [proc.saveStarbase];
  } else if (movementMode == "Warp" || movementMode == "Hybrid") {
    // options.pathToMiningStarbase = MoveAction.calcWarpPath(
    //   proc.saveStarbase,
    //   miningBase.location,
    //   fStats.movementStats.maxWarpDistance / 100
    // );
    options.pathToMiningStarbase = [new Coordinates(20, 19), new Coordinates(19, 19), new Coordinates(17, 21)];

    // options.pathToSafeStarbase = MoveAction.calcWarpPath(
    //   miningBase.location,
    //   proc.saveStarbase,
    //   fStats.movementStats.maxWarpDistance / 100
    // );
    options.pathToSafeStarbase = [new Coordinates(22, 16), new Coordinates(23, 16), new Coordinates(25, 14)];
  } else {
    throw "Unknown movemnet mode: " + movementMode;
  }
  // Transfer Cargo between Starbases
  options.transportToMiningBase = [{ resourceName: "copper_ore", percent: 1 }];

  options.transportToSafeStarbase = [{ resourceName: "polymer", percent: 1 }];

  // reload fuel on ming starbase -> need from long traveling
  options.loadTravelingFuelOnMiningBase = false;
  // load minig resources on mining starbase - means use more cargo for transer in direction to mining base
  options.loadMiningAmmoOnMiningBase = false;
  options.loadMiningFuelOnMiningBase = false;
  options.loadMiningFoodOnMiningBase = false;

  // Use thanks for transfer fuel and ammo
  options.fuelTankToMiningBase = true;
  options.ammoBankToMiningBase = false;

  options.fuelTankToSaveStarbase = false;
  options.ammoBankToSaveStarbase = false;

  console.log(options);
  console.log(JSON.stringify(options));
  await proc.generateMiningProcessSteps(miningBase, miningResource, options);

  return proc;
}

async function gen22Cicle(fleetName: string, resource: "copper_ore" | "carbon" = "copper_ore") {
  const saveStarbaseName = "mrz21";
  /** Provide pointer reference to handlers */
  let proc = await Process.build(fleetName, saveStarbaseName);
  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation

  let miningBase = await SageGameHandler.readStarbaseByName("mrz22");
  let miningResource = await SageGameHandler.readStarbaseResource(miningBase, resource);
  if (!movementMode) {
    movementMode = (await prompt("Set movement mode [ Warp | Subwarp | Hybrid ] ")).toString().trim();
  }

  let options = {
    miningTimes: 2,
  } as MiningBuildOptions;
  if (movementMode == "Subwarp") {
    options.pathToMiningStarbase = [miningBase.location];
    options.pathToSafeStarbase = [proc.saveStarbase];
  } else if (movementMode == "Warp" || movementMode == "Hybrid") {
    options.pathToMiningStarbase = [new Coordinates(32, 15), new Coordinates(33, 15), new Coordinates(35, 16)];
    options.pathToSafeStarbase = [new Coordinates(28, 15), new Coordinates(27, 15), new Coordinates(25, 14)];
  } else {
    throw "Unknown movemnet mode: " + movementMode;
  }
  // Transfer Cargo between Starbases
  options.transportToMiningBase = [{ resourceName: "polymer", percent: 1 }];

  // options.transportToSafeStarbase = [{ resourceName: "polymer", percent: 1 }];

  // reload fuel on ming starbase -> need from long traveling
  options.loadTravelingFuelOnMiningBase = false;
  // load minig resources on mining starbase - means use more cargo for transer in direction to mining base
  options.loadMiningAmmoOnMiningBase = false;
  options.loadMiningFuelOnMiningBase = false;
  options.loadMiningFoodOnMiningBase = false;

  // Use thanks for transfer fuel and ammo
  options.fuelTankToMiningBase = true;
  options.ammoBankToMiningBase = false;

  options.fuelTankToSaveStarbase = false;
  options.ammoBankToSaveStarbase = false;

  console.log(JSON.stringify(options));
  await proc.generateMiningProcessSteps(miningBase, miningResource, options);

  return proc;
}

async function gen21Cicle(fleetName: string) {
  const saveStarbaseName = "mrz21";
  /** Provide pointer reference to handlers */
  let proc = await Process.build(fleetName, saveStarbaseName);
  let resource = "hydrogen";
  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation

  let miningBase = await SageGameHandler.readStarbaseByName("mrz21");
  let miningResource = await SageGameHandler.readStarbaseResource(miningBase, resource);

  let options = {
    miningTimes: 4,
  } as MiningBuildOptions;

  await proc.generateMiningProcessSteps(miningBase, miningResource, options);

  return proc;
}
