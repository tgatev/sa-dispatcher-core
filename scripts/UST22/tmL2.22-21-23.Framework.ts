import { clone } from "lodash";
import { MiningBuildOptions, Process } from "../../src/Model/FleetProcess";
import { SageGameHandler } from "../../src/gameHandlers/GameHandler";

/// Solana Cost: [0.000707565]
/// Time: [18680.37s]
process.env["TRANSACTION_PRIORITY_FEE_LIMIT"] = "5000";
process.env["TRANSACTION_PRIORITY_FEE_CAP"] = "100000";
process.env["TRANSACTION_PRIORITY_FEE_MIN_CHANCE"] = "80";
process.env["TRANSACTION_PRIORITY_FEE_INCREASE_STEP"] = "10000";
process.env["TRANSACTION_PRIORITY_FEE_INCREASE_BASE_FEE"] = "100";
// process.env["SOLANA_RPC_URL"] = "https://global.rpc.hellomoon.io/186ec97f-1bc5-4f66-bde3-5d6f11009851";
// process.env.SOLANA_RPC_TRANSACTION_URL = "https://global.rpc.hellomoon.io/186ec97f-1bc5-4f66-bde3-5d6f11009851";
async function run() {
  /**
   * Mining 21 Hydro - fill fuel buffer
   */
  /** Provide pointer reference to handlers */
  let proc = await Process.build(undefined, "mrz22");
  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation

  let miningBase21 = await SageGameHandler.readStarbaseByName("mrz21");
  let miningBase22 = await SageGameHandler.readStarbaseByName("mrz22");
  let miningBase23 = await SageGameHandler.readStarbaseByName("mrz23");
  let hydrogen = await SageGameHandler.readStarbaseResource(miningBase21, "hydrogen");
  let copper_ore = await SageGameHandler.readStarbaseResource(miningBase22, "copper_ore");
  let carbron = await SageGameHandler.readStarbaseResource(miningBase22, "copper_ore");
  let iron_ore = await SageGameHandler.readStarbaseResource(miningBase23, "iron_ore");
  let biomass = await SageGameHandler.readStarbaseResource(miningBase23, "biomass");
  /**
   * Mining 28 Hydrogen and transfer
   *  : Fuel to 28
   *  : polymer or electronics to 21
   */

  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation
  // hydro 5*(13.5 + 7) + 7 *35 copper_ore + 2* (35 + 7) Iron_ore
  let options21 = {
    miningTimes: 6, // 1000 + 800 + 600 +400+200+
    movementMode: "Hybrid",
    subwarpDistance: 1,
    loadMiningFuelOnMiningBase: true,
    loadMiningFoodOnMiningBase: true,
    // loadMiningAmmoOnMiningBase: true,
    loadTravelingFuelOnMiningBase: true,
    ammoBankToMiningBase: true,
    fuelTankToSaveStarbase: true,
    transportToMiningBase: [{ resourceName: "copper_ore", percent: 1 }],
    transportToSafeStarbase: [{ resourceName: "fuel", percent: 1 }],
  } as MiningBuildOptions;

  let options22 = {
    miningTimes: 2,
  } as MiningBuildOptions;

  let options22c = {
    miningTimes: 1,
  } as MiningBuildOptions;

  let options23Framework = {
    miningTimes: 3,
    movementMode: "Hybrid",
    subwarpDistance: 1,
    loadMiningFoodOnMiningBase: true,
    // fuelTankToMiningBase: true,
    ammoBankToMiningBase: true,
    transportToMiningBase: [{ resourceName: "copper_ore", percent: 1 }],
    transportToSafeStarbase: [{ resourceName: "framework", percent: 1 }],

    // return iron_ore to save base
  } as MiningBuildOptions;
  let options23Food = {
    miningTimes: 2,
    movementMode: "Hybrid",
    subwarpDistance: 1,
    loadMiningFoodOnMiningBase: true,
    ammoBankToMiningBase: true,
    // fuelTankToMiningBase: true,
    transportToMiningBase: [{ resourceName: "copper_ore", percent: 1 }],
    transportToSafeStarbase: [{ resourceName: "food", percent: 0.999 }],

    // return iron_ore to save base
  } as MiningBuildOptions;
  // await proc.validateEmptyCargo();
  // cooper (2+5)*  36 min  = 108
  // Fuel mining 2*(5* 14 + 2*8) = 172
  // Iron
  // 4* cooper 36 min = 144
  let flow22 = await proc.generateMiningProcessSteps(miningBase22, copper_ore, options22);
  let flow22c = await proc.generateMiningProcessSteps(miningBase22, carbron, options22c);
  let flow21 = await proc.generateMiningProcessSteps(miningBase21, hydrogen, options21);
  let flow23Framework = await proc.generateMiningProcessSteps(miningBase23, iron_ore, options23Framework);
  let flow23Food = await proc.generateMiningProcessSteps(miningBase23, biomass, options23Food);
  console.log("<<<<<<< Flow 21 Data >>>>>");
  displayProcessData(flow21);
  console.log("<<<<<<< Flow 22 Data >>>>>");
  displayProcessData(flow22);
  console.log("<<<<<<< Flow 23 Framework Data >>>>>");
  displayProcessData(flow23Framework);
  console.log("<<<<<<< Flow 23 Food Data >>>>>");
  displayProcessData(flow23Food);

  proc.actionsChain.push(...flow23Food.actions);
  proc.actionsChain.push(...flow22.actions);
  proc.actionsChain.push(...flow21.actions);
  proc.actionsChain.push(...flow22.actions);
  proc.actionsChain.push(...flow23Framework.actions);
  proc.actionsChain.push(...flow22c.actions);

  /**
   * Loop the process N times
   */
  await proc.repeat();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

function displayProcessData(any: any) {
  let tmpData = clone(any);
  tmpData.actions = tmpData.actions && Array.isArray(tmpData.actions) ? tmpData.actions.length : "";
  console.log(tmpData);
}
