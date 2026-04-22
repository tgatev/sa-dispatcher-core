import { clone } from "lodash";
import { MiningBuildOptions, Process } from "../../src/Model/FleetProcess";
import { SageGameHandler } from "../../src/gameHandlers/GameHandler";
import { Coordinates } from "../../src/Model/MoveAction";

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
  let proc = await Process.build(undefined, "mrz21");
  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation

  let miningBase21 = await SageGameHandler.readStarbaseByName("mrz21");
  let miningBase22 = await SageGameHandler.readStarbaseByName("mrz22");
  let miningBase28 = await SageGameHandler.readStarbaseByName("mrz28");
  let hydrogen = await SageGameHandler.readStarbaseResource(miningBase21, "hydrogen");
  let copper_ore = await SageGameHandler.readStarbaseResource(miningBase22, "copper_ore");
  let carbon28 = await SageGameHandler.readStarbaseResource(miningBase28, "carbon");
  let hydrogen28 = await SageGameHandler.readStarbaseResource(miningBase28, "hydrogen");
  /**
   * Mining 28 Hydrogen and transfer
   *  : Fuel to 28
   *  : polymer or electronics to 21
   */

  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation
  // hydro 5*(13.5 + 7) + 7 *35 copper_ore + 2* (35 + 7) Iron_ore
  let options21 = {
    miningTimes: 6,
  } as MiningBuildOptions;

  let options22 = {
    miningTimes: 1,
    movementMode: "Hybrid",
    subwarpDistance: 1,
    fuelTankToMiningBase: true,
    transportToMiningBase: [{ resourceName: "fuel", percent: 1 }],
  } as MiningBuildOptions;

  let options28 = {
    miningTimes: 4,
    movementMode: "Hybrid",
    subwarpDistance: 1,
    fuelTankToMiningBase: true,
    transportToMiningBase: [{ resourceName: "fuel", percent: 1 }],
    transportToSafeStarbase: [{ resourceName: "polymer", percent: 1 }],

    pathToMiningStarbase: [new Coordinates(20, 19), new Coordinates(19, 19), new Coordinates(17, 21)],

    pathToSafeStarbase: [new Coordinates(22, 16), new Coordinates(23, 16), new Coordinates(25, 14)],
    // return iron_ore to save base
  } as MiningBuildOptions;

  // await proc.validateEmptyCargo();
  // cooper (2+5)*  36 min  = 108
  // Fuel mining 2*(5* 14 + 2*8) = 172
  // Iron
  // 4* cooper 36 min = 144
  let flow28c = await proc.generateMiningProcessSteps(miningBase28, carbon28, options28);
  let flow28h = await proc.generateMiningProcessSteps(miningBase28, hydrogen28, options28);

  let flow22 = await proc.generateMiningProcessSteps(miningBase22, copper_ore, options22);
  let flow21 = await proc.generateMiningProcessSteps(miningBase21, hydrogen, options21);
  console.log("<<<<<<< Flow 28c Data >>>>>");
  displayProcessData(flow28c);
  console.log("<<<<<<< Flow 28h Data >>>>>");
  displayProcessData(flow28h);
  console.log("<<<<<<< Flow 21 Data >>>>>");
  displayProcessData(flow21);
  console.log("<<<<<<< Flow 22 Data >>>>>");
  displayProcessData(flow21);

  proc.actionsChain.push(...flow28c.actions);
  proc.actionsChain.push(...flow28h.actions);

  proc.actionsChain.push(...flow21.actions);
  proc.actionsChain.push(...flow21.actions);
  proc.actionsChain.push(...flow21.actions);

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
