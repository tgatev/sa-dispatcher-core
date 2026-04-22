import { Process } from "../../src/Model/FleetProcess";
import { SageGameHandler, StarbaseMapItem, argv } from "../../src/gameHandlers/GameHandler";

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
  let proc = await Process.build(undefined, "mrz22");
  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation

  /**
   * Transport FUEL for Food
   *  : Fuel to UST-1
   *  : Food to MRZ-21
   */
  await Process.buildAndAppendActions(
    proc,
    "iron_ore",
    "ust4",
    {
      miningTimes: 0,
      movementMode: "Subwarp",
      transportToMiningBase: [{ resourceName: "electromagnet", percent: 1 }],
      transportToSafeStarbase: [{ resourceName: "iron_ore", percent: 1 }],
      // ammoBankToMiningBase: true,
    },
    1
  );

  //await  Process.buildAndAppendActions(
  //   proc,
  //   "hydrogen",
  //   "mrz21",
  //   {
  //     miningTimes: 1,
  //     movementMode: "Subwarp",
  //     transportToMiningBase: [{ resourceName: "carbon", percent: 1 }],
  //     // transportToSafeStarbase: [{ resourceName: "iron_ore", percent: 1 }],
  //     ammoBankToMiningBase: true,
  //     fuelTankToSaveStarbase: true,
  //   },
  //   1
  // );
  await proc.repeat(repeat);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
