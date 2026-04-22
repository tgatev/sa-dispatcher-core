import { FleetProcess as Process } from "../../src/Model/FleetProcess";

async function run() {
  const saveStarbaseName = "ust1";
  /** Provide pointer reference to handlers */
  let proc = await Process.build(undefined, saveStarbaseName);
  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation

  await Process.buildAndAppendActions(proc, "iron_ore", "ust4", {
    miningTimes: 0,
    movementMode: "Subwarp",
    transportToMiningBase: [{ resourceName: "framework", percent: 1 }],
    transportToSafeStarbase: [{ resourceName: "iron_ore", percent: 1 }],
    ammoBankToMiningBase: true,
    fuelTankToMiningBase: true,
  });
  await proc.repeat();
  throw "DDD";
}
run().catch((err) => {
  console.error(err);
  process.exit(1);
});
