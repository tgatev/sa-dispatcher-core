import { MiningBuildOptions, Process } from "../../src/Model/FleetProcess";
import { SageGameHandler, StarbaseMapItem, argv } from "../../src/gameHandlers/GameHandler";

process.env["TRANSACTION_PRIORITY_FEE_LIMIT"] = "10000";
process.env["TRANSACTION_PRIORITY_FEE_CAP"] = "100000";
process.env["TRANSACTION_PRIORITY_FEE_MIN_CHANCE"] = "90";
process.env["TRANSACTION_PRIORITY_FEE_INCREASE_STEP"] = "10000";
process.env["TRANSACTION_PRIORITY_FEE_INCREASE_BASE_FEE"] = "10000";

async function run() {
  /**
   * Mining 21 Hydro - fill fuel buffer
   */
  /** Provide pointer reference to handlers */
  let proc = await Process.build(undefined, "mrz28");
  // if (!argv.startStep) await proc.validateEmptyCargo(); // Process need empty cargo for right calculation

  let miningBaseLumanite = await SageGameHandler.readStarbaseByName("mrz34");
  let miningBase28: StarbaseMapItem = await SageGameHandler.readStarbaseByName("mrz28");
  let miningBase21: StarbaseMapItem = await SageGameHandler.readStarbaseByName("mrz21");

  let lumananite34 = await SageGameHandler.readStarbaseResource(miningBaseLumanite, "lumanite");
  let carbon28 = await SageGameHandler.readStarbaseResource(miningBase28, "carbon");
  let hydrogen28 = await SageGameHandler.readStarbaseResource(miningBase21, "hydrogen");
  let hydrogen21 = await SageGameHandler.readStarbaseResource(miningBase28, "hydrogen");

  let options28 = {
    miningTimes: 5,
  } as MiningBuildOptions;

  let options28_34 = {
    miningTimes: 1,
    movementMode: "Hybrid",
    subwarpDistance: 1,
  } as MiningBuildOptions;

  let options21 = {
    miningTimes: 5,
    movementMode: "Hybrid",
    subwarpDistance: 1,
    transportToMiningBase: [
      {
        resourceName: "polymer",
        percent: 1,
      },
    ],
    transportToSafeStarbase: [{ resourceName: "fuel", percent: 1 }],
    fuelTankToSaveStarbase: true,
    loadMiningFuelOnMiningBase: true,
    loadMiningFoodOnMiningBase: true,
    loadMiningAmmoOnMiningBase: true,
  } as MiningBuildOptions;
  /**
   * Mining Lumanite two times and transport to 28
   */
  proc.actionsChain.push(...(await proc.generateMiningProcessSteps(miningBaseLumanite, lumananite34, options28_34)).actions);
  proc.actionsChain.push(...(await proc.generateMiningProcessSteps(miningBaseLumanite, lumananite34, options28_34)).actions);
  /**
   * Mining 28 Carbon for Powersource craft
   */
  proc.actionsChain.push(...(await proc.generateMiningProcessSteps(miningBase28, carbon28, options28)).actions);
  // proc.actionsChain.push(...(await proc.generateMiningProcessSteps(miningBase28, hydrogen28, { miningTimes: 4 })).actions);
  proc.actionsChain.push(...(await proc.generateMiningProcessSteps(miningBase28, carbon28, options28)).actions);

  /**
   * 1 Transfer PowerSource to 21
   * 2 Minie hydrogen for fuel
   * 3 Transfer Fuel to 28
   */
  // proc.actionsChain.push(...(await proc.generateMiningProcessSteps(miningBase21, hydrogen21, options21)).actions);

  // Also use the same process - so the generated action chain is double length
  // use the same config with hydrogen mining, just mine carbon

  /**
   * Loop the process N times
   * params?
   *  1: undefined - to wait user input for times to repeat
   *                    by this way you are able to read and check process steps chain in console
   *  2: argv.startStep - is an option to start the script after brake point, from the chosen iteration step
   */
  await proc.repeat(undefined, argv.startStep);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
