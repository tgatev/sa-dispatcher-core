import { MiningBuildOptions, Process } from "../../src/Model/FleetProcess";
import { SageGameHandler, StarbaseMapItem } from "../../src/gameHandlers/GameHandler";
import { prompt } from "../../src/Common/prompt";
// process.env['TRANSACTION_PRIORITY_FEE_LIMIT'] = "10000";
// process.env['TRANSACTION_PRIORITY_FEE_CAP'] = "100000";
// process.env["TRANSACTION_PRIORITY_FEE_MIN_CHANCE"] = "90";
// process.env["TRANSACTION_PRIORITY_FEE_INCREASE_STEP"] = "10000";
// process.env["TRANSACTION_PRIORITY_FEE_INCREASE_BASE_FEE"] = "10000";

export async function run(repeat: number | undefined = undefined) {
  /**
   * Mining 22 Graphene/Ammo for Resource
   */
  /** Provide pointer reference to handlers */
  let proc = await Process.build(undefined, "mrz23");
  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation

  /**
   * Transport FUEL for Food
   *  : Fuel to UST-1
   *  : Food to MRZ-21
   */
  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation
  let miningBaseUST23: StarbaseMapItem = await SageGameHandler.readStarbaseByName("mrz23");
  let miningBaseUST16: StarbaseMapItem = await SageGameHandler.readStarbaseByName("mrz16");
  // Need for definition only but not used
  let miningResourceUST16 = await SageGameHandler.readStarbaseResource(miningBaseUST16); //, "titanium_ore"
  console.log(["Transport only [23->16->23]"]);
  let movementMode = await SageGameHandler.readMovementMode();
  let subwarpDistance: number | string = 2.3;
  if (movementMode == "Hybrid") {
    console.log("....");
    subwarpDistance = (await prompt(`subwarpDistance[${subwarpDistance}]`)) || subwarpDistance;
    if (!subwarpDistance) throw "Incorrect Subwarp Distance: " + subwarpDistance;
  }
  let optionsUST16 = {
    miningTimes: 0,
    movementMode: movementMode,
    subwarpDistance: Number(subwarpDistance),
    // pathToMiningStarbase: [new Coordinates(40, 1), miningBaseUST16.location],
    // pathToSafeStarbase: [new Coordinates(43, 8), miningBaseUST23.location],
    fuelTankToMiningBase: true,
    ammoBankToMiningBase: true,
    transportToMiningBase: [{ resourceName: "electromagnet", percent: 1 }],
    transportToSafeStarbase: [{ resourceName: "titanium_ore", percent: 1 }],
    // loadTravelingFuelOnMiningBase: true,
    // fuelTankToSaveStarbase: false,
    // ammoBankToSaveStarbase: false,
  } as MiningBuildOptions;

  let gen = await proc.generateMiningProcessSteps(miningBaseUST16, miningResourceUST16, optionsUST16);

  proc.actionsChain.push(...gen.actions);
  proc.actionsChain.push(...gen.actions);
  // let miningTimes = Number(argv.mine) || 0;

  let miningTimes = Number(await prompt("How much Mining steps to add on MRZ-23 Iron Ore after transport? [(0)|1|2|...]:")) || 0;
  let miningResourceUST23 = await SageGameHandler.readStarbaseResource(miningBaseUST23, "iron_ore");
  let mine;
  while (miningResourceUST23 && miningTimes-- > 0) {
    let optionsUST23 = {
      miningTimes: 1,
    } as MiningBuildOptions;
    if (!mine) mine = await proc.generateMiningProcessSteps(miningBaseUST23, miningResourceUST23, optionsUST23);
    proc.actionsChain.push(...mine.actions);
  }
  /**
   * Loop the process N times
   */
  await proc.repeat(repeat);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
