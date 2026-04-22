import { Coordinates } from "../../src/Model/MoveAction";
import { FleetProcess as Process } from "../../src/Model/FleetProcess";

/**
 *  Provide Transfer resources between CSS and UST-2 with mining on UST-2 before go back
 *    - Layer2 - using process generator
 */
async function run() {
  const saveStarbaseName = "ust1";
  /** Provide pointer reference to handlers */
  let proc = await Process.build(undefined, saveStarbaseName);
  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation

  // await Process.buildAndAppendActions(
  //   proc,
  //   "biomass",
  //   "ust2",
  //   {
  //     // miningTimes: 1,
  //     miningTimes: 0,
  //     movementMode: "Hybrid",
  //     pathToMiningStarbase: [new Coordinates(42, 34), new Coordinates(42, 35)],
  //     transportToMiningBase: [{ resourceName: "electromagnet", percent: 1 }],
  //     pathToSafeStarbase: [new Coordinates(40, 31), new Coordinates(40, 30)],
  //     transportToSafeStarbase: [{ resourceName: "biomass", percent: 1 }],

  //     // transportToSafeStarbase: [{ resourceName: "carbon", amount: 1 }],
  //     // fuelTankToMiningBase: true,
  //     // ammoBankToSaveStarbase: true,
  //   },
  //   1
  // );

  await Process.buildAndAppendActions(
    proc,
    "biomass",
    "ust2",
    {
      // miningTimes: 1,
      miningTimes: 1,
      movementMode: "Hybrid",
      // pathToMiningStarbase: [new Coordinates(42, 34), new Coordinates(42, 35)],
      transportToMiningBase: [{ resourceName: "electronics", percent: 1 }],
      pathToSafeStarbase: [new Coordinates(40, 31), new Coordinates(40, 30)],
      // transportToSafeStarbase: [{ resourceName: "biomass", percent: 1 }],

      // transportToSafeStarbase: [{ resourceName: "carbon", amount: 1 }],
      // fuelTankToMiningBase: true,
      // ammoBankToSaveStarbase: true,
    },
    1,
  );
  await proc.repeat();
}
run().catch((err) => {
  console.error(err);
  process.exit(1);
});
