import { MiningBuildOptions } from "../src/Model/FleetProcess";
import { SageGameHandler, prompt, argv } from "../src/holoHandlers/GameHandler";
import { ProcessHolosim } from "../src/holoHandlers/HolosimMintsImporter";
import { log } from "../src/Common/PatchConsoleLog";
// process.env['TRANSACTION_PRIORITY_FEE_LIMIT'] = "5000";
// process.env['TRANSACTION_PRIORITY_FEE_CAP'] = "100000";
// process.env["TRANSACTION_PRIORITY_FEE_MIN_CHANCE"] = "80";
// process.env["TRANSACTION_PRIORITY_FEE_INCREASE_STEP"] = "10000";
// process.env["TRANSACTION_PRIORITY_FEE_INCREASE_BASE_FEE"] = "101";
// process.env["SOLANA_RPC_URL"] = process.env.SOLANA_RPC_TRANSACTION_URL;

const fleetName = argv.fleetName || "test";
const resource = argv.resource;
const saveStarbaseName = argv.saveStarbaseName;
const miningStarbaseName = argv.saveMiningStarbaseName;
let movementMode = argv.movementMode;

async function run() {
  // console.time("init_dispatcher");
  // const dispatcher = await DispatcherHolosim.build();
  // console.timeEnd("init_dispatcher");
  console.time("Full execution tme");

  /** Provide pointer reference to handlers */
  let proc = await ProcessHolosim.build(fleetName, saveStarbaseName);
  // await proc.validateEmptyCargo();
  let miningBase = await SageGameHandler.readStarbaseByName(miningStarbaseName, "Mining starbase");
  let miningResource = await SageGameHandler.readStarbaseResource(miningBase, resource);
  let fAccount = await proc.fetchFleetAccount();
  log("FleetState:", fAccount.state);
  if (!movementMode && !miningBase.location.equals(proc.saveStarbase)) {
    movementMode = (await prompt("Set movement mode [ Warp | Subwarp | Hybrid ] ")).toString().trim();
  }

  let options = {
    miningTimes: 2,
    movementMode: movementMode,
  } as MiningBuildOptions;

  if (!proc.saveStarbase.equals(miningBase.location)) {
    options.transportToSafeStarbase = await transferDefinitionsInput("to Mining Starbase");
    options.transportToSafeStarbase = await transferDefinitionsInput("to Save Starbase");
  }

  // reload fuel on ming starbase -> need from long traveling
  options.loadTravelingFuelOnMiningBase = false;
  // load minig resources on mining starbase - means use more cargo for transer in direction to mining base
  options.loadMiningAmmoOnMiningBase = false;
  options.loadMiningFuelOnMiningBase = false;
  options.loadMiningFoodOnMiningBase = false;

  // Use thanks for transfer fuel and ammo
  options.fuelTankToMiningBase = false;
  options.ammoBankToMiningBase = false;

  options.fuelTankToSaveStarbase = false;
  options.ammoBankToSaveStarbase = false;

  console.log(options);
  console.log(JSON.stringify(options));
  await proc.generateMiningProcessSteps(miningBase, miningResource, options);
  await proc.repeat();
}

async function transferDefinitionsInput(label = "") {
  // Transfer Cargo between Starbases
  let definitions = [];
  while ((await prompt("Add Transfer Cargo definition - " + label)) || 0) {
    let definition = {} as {
      resourceName: string;
      percent?: number | undefined;
      amount?: number | undefined;
    };
    definition.resourceName = await prompt("Resource name: ");
    if (!SageGameHandler.SAGE_RESOURCES_MINTS[definition.resourceName]) {
      console.error("<SkipDefinition> Can't find resource name: " + definition.resourceName);
      continue;
    }
    let amountType = await prompt(" [({p})ercent | (a)mount ]");
    switch (amountType) {
      case "p": {
        definition.percent = Number(await prompt("Percent of cargo: 0.01 to 1: "));
        if (!definition.percent) {
          console.error("<SkipDefinition> Missing value: " + definition.percent);
          continue;
        }
        break;
      }
      case "a": {
        definition.amount = Number(await prompt("Resource amount: "));
        if (!definition.amount) {
          console.error("<SkipDefinition> Missing value: " + definition.amount);
          continue;
        }
        break;
      }

      default:
        console.error("<SkipDefinition> Unknoun Value Type: " + definition.amount);
        break;
    }
    definitions.push(definition);
    console.log("Currnet state: ", definitions);

    return definitions;
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
