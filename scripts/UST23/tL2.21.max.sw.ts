import { FleetProcess as Process } from "../../src/Model/FleetProcess";

async function run() {
  const saveStarbaseName = "mrz23";
  /** Provide pointer reference to handlers */
  let proc = await Process.build(undefined, saveStarbaseName);
  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation

  await Process.buildAndAppendActions(proc, "hydrogen", "mrz21", {
    miningTimes: 0,
    movementMode: "Subwarp",
    transportToMiningBase: [{ resourceName: "food", percent: 1 }],
    transportToSafeStarbase: [{ resourceName: "fuel", percent: 1 }],
    // ammoBankToSaveStarbase: true,
    fuelTankToSaveStarbase: true,
    loadTravelingFuelOnMiningBase: true,
  });
  await proc.repeat();
  throw "DDD";
}
run().catch((err) => {
  console.error(err);
  process.exit(1);
});
