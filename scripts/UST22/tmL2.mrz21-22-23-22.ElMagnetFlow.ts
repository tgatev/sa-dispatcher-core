import { clone } from "lodash";
import { MiningBuildOptions, Process } from "../../src/Model/FleetProcess";
import { SageGameHandler } from "../../src/gameHandlers/GameHandler";

process.env["TRANSACTION_PRIORITY_FEE_LIMIT"] = "15000";
process.env["TRANSACTION_PRIORITY_FEE_CAP"] = "100000";
process.env["TRANSACTION_PRIORITY_FEE_MIN_CHANCE"] = "85";
process.env["TRANSACTION_PRIORITY_FEE_INCREASE_STEP"] = "20000";
process.env["TRANSACTION_PRIORITY_FEE_INCREASE_BASE_FEE"] = "10000";
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
  let iron_ore = await SageGameHandler.readStarbaseResource(miningBase23, "iron_ore");
  /**
   * Mining 28 Hydrogen and transfer
   *  : Fuel to 28
   *  : polymer or electronics to 21
   */

  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation
  // hydro 5*(13.5 + 7) + 7 *35 copper_ore + 2* (35 + 7) Iron_ore
  let options21 = {
    miningTimes: 6,
    movementMode: "Hybrid",
    subwarpDistance: 1,
    loadMiningFoodOnMiningBase: true,
    // loadMiningAmmoOnMiningBase: true,
    loadTravelingFuelOnMiningBase: true,
    fuelTankToSaveStarbase: true,
    transportToMiningBase: [{ resourceName: "copper_ore", percent: 1 }],
    transportToSafeStarbase: [{ resourceName: "fuel", percent: 1 }],
  } as MiningBuildOptions;

  let options22 = {
    miningTimes: 1,
  } as MiningBuildOptions;

  let options23 = {
    miningTimes: 1,
    movementMode: "Hybrid",
    subwarpDistance: 1,
    loadMiningFoodOnMiningBase: true,
    // fuelTankToMiningBase: true,
    transportToMiningBase: [{ resourceName: "copper_ore", percent: 1 }],
    // return iron_ore to save base
  } as MiningBuildOptions;

  // await proc.validateEmptyCargo();
  // cooper (2+5)*  36 min  = 108
  // Fuel mining 2*(5* 14 + 2*8) = 172
  // Iron
  // 4* cooper 36 min = 144
  let flow22 = await proc.generateMiningProcessSteps(miningBase22, copper_ore, options22);
  let flow21 = await proc.generateMiningProcessSteps(miningBase21, hydrogen, options21);
  let flow23 = await proc.generateMiningProcessSteps(miningBase23, iron_ore, options23);
  console.log("<<<<<<< Flow 21 Data >>>>>");
  displayProcessData(flow21);
  console.log("<<<<<<< Flow 22 Data >>>>>");
  displayProcessData(flow22);
  console.log("<<<<<<< Flow 23 Data >>>>>");
  displayProcessData(flow23);

  proc.actionsChain.push(...flow22.actions);
  proc.actionsChain.push(...flow21.actions);

  proc.actionsChain.push(...flow22.actions);
  proc.actionsChain.push(...flow23.actions);

  proc.actionsChain.push(...flow22.actions);
  proc.actionsChain.push(...flow21.actions);

  proc.actionsChain.push(...flow22.actions);
  proc.actionsChain.push(...flow23.actions);

  proc.actionsChain.push(...flow22.actions);
  proc.actionsChain.push(...flow22.actions);

  proc.actionsChain.push(...flow22.actions);
  proc.actionsChain.push(...flow22.actions);

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
