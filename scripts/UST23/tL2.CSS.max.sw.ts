import { FleetProcess as Process } from "../../src/Model/FleetProcess";

async function run() {
  const saveStarbaseName = "mrz23";
  /** Provide pointer reference to handlers */
  let proc = await Process.build(undefined, saveStarbaseName);
  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation

  await Process.buildAndAppendActions(proc, "hydrogen", "ust1", {
    miningTimes: 0,
    movementMode: "Subwarp",
    transportToMiningBase: [{ resourceName: "titanium_ore", percent: 1 }],
    transportToSafeStarbase: [{ resourceName: "copper_wire", percent: 1 }],
    ammoBankToSaveStarbase: true,
    fuelTankToSaveStarbase: true,
  });
  await proc.repeat();
  throw "DDD";
}
run().catch((err) => {
  console.error(err);
  process.exit(1);
});
