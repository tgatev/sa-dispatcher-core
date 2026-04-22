import { MiningBuildOptions, Process } from "../../src/Model/FleetProcess";

/**
 *  Provide Transfer resources between CSS and UST-4 with mining on UST-4
 *    mining times 1 and unload mined cargo on CSS
 *    - Layer2 - using process generator and process.build()
 */

// Overwrite env values
/**
 *  Provide Transfer resources between CSS and UST-4 with mining on UST-4
 *    mining times 1 and unload mined cargo on CSS
 *    - Layer2 - using process generator and process.build()
 */
// Overwrite env values
process.env["TRANSACTION_PRIORITY_FEE_LIMIT"] = "10000";
process.env["TRANSACTION_PRIORITY_FEE_CAP"] = "20000";
process.env["TRANSACTION_PRIORITY_FEE_MIN_CHANCE"] = "89";
process.env["TRANSACTION_PRIORITY_FEE_INCREASE_STEP"] = "3000";
process.env["TRANSACTION_PRIORITY_FEE_INCREASE_BASE_FEE"] = "100";
process.env["SOLANA_RPC_URL"] = process.env["SLY"];

// const resource = argv.resourceName || "iron_ore";
// const movementMode: "Warp" | "Subwarp" = "Warp";
async function run() {
  const saveStarbaseName = "mrz21";
  /** Provide pointer reference to handlers */
  let proc = await Process.build(undefined, saveStarbaseName);
  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation

  //! // // 21->17->21
  await Process.buildAndAppendActions(proc, "arco", "mrz17", {
    miningTimes: 0,
    movementMode: "Subwarp",
    transportToMiningBase: [{ resourceName: "fuel", percent: 1 }],
    transportToSafeStarbase: [{ resourceName: "arco", percent: 1 }],
    fuelTankToMiningBase: true,
    // ammoBankToMiningBase: true,
  } as MiningBuildOptions);
  //! 21->22->1->22->-21

  //! // 21->22: Fuel: 3,731 Time: 25m, 23s
  // proc.addAction(
  //   new TransferCargoAction(proc, [
  //     { isImportToFleet: true, resourceName: "hydrogen", amount: "max" },
  //     { isImportToFleet: true, resourceName: "fuel", amount: "max", cargoType: "fuelTank" },
  //   ])
  // );
  // proc.addAction(new UnDockAction(proc));
  // proc.addAction(new SubwarpAction(proc, new Coordinates(35, 16)));
  // proc.addAction(new DockAction(proc));
  // // 22->1:  Fuel: 5438 Time: 36m, 59s
  // proc.addAction(
  //   new TransferCargoAction(proc, [
  //     { isImportToFleet: false, resourceName: "hydrogen", amount: "max", condition: { whenMoreThen: 0 } },
  //     { isImportToFleet: true, resourceName: "copper_ore", amount: 79380 },
  //   ])
  // );
  // proc.addAction(new UnDockAction(proc));
  // proc.addAction(new SubwarpAction(proc, new Coordinates(40, 30)));
  // proc.addAction(new DockAction(proc));
  // // 1->22: Fuel: 5438 Time: 36m, 59s
  // proc.addAction(
  //   new TransferCargoAction(proc, [
  //     { isImportToFleet: false, resourceName: "fuel", amount: 23060, cargoType: "fuelTank", condition: { whenMoreThen: 0 } },
  //     { isImportToFleet: false, resourceName: "copper_ore", amount: "max", condition: { whenMoreThen: 0 } },
  //     { isImportToFleet: true, resourceName: "ammunitions", amount: 79380 },
  //     { isImportToFleet: true, resourceName: "ammunitions", amount: "max", cargoType: "ammoBank" },
  //   ])
  // );
  // proc.addAction(new UnDockAction(proc));
  // proc.addAction(new SubwarpAction(proc, new Coordinates(35, 16)));
  // proc.addAction(new DockAction(proc));

  // // 22->21: Fuel: 3,731 Time: 25m, 23s
  // proc.addAction(
  //   new TransferCargoAction(proc, [
  //     { isImportToFleet: false, resourceName: "ammunitions", amount: 10367, cargoType: "ammoBank", condition: { whenMoreThen: 10367 } },
  //     { isImportToFleet: false, resourceName: "ammunitions", amount: "max", condition: { whenMoreThen: 0 } },
  //     { isImportToFleet: true, resourceName: "energy_substrate", amount: 19845 },
  //   ])
  // );
  // proc.addAction(new UnDockAction(proc));
  // proc.addAction(new SubwarpAction(proc, new Coordinates(25, 14)));
  // proc.addAction(new DockAction(proc));
  // // Unload On 21
  // proc.addAction(
  //   new TransferCargoAction(proc, [
  //     { isImportToFleet: false, resourceName: "energy_substrate", amount: 19845, condition: { whenMoreThen: 0 } },
  //     { isImportToFleet: true, resourceName: "fuel", amount: "max", cargoType: "fuelTank" },
  //   ])
  // );

  await proc.repeat();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
// let options = {
//   miningTimes: 1,
//   movementMode: "Warp",
//   pathToMiningStarbase: [new Coordinates(38, 25)],
//   pathToSafeStarbase: [new Coordinates(40, 30)],
//   transportToMiningBase: [{ resourceName: "electromagnet", percent: 1 }],
//   transportToSafeStarbase: [{ resourceName: "iron", percent: 1 }],
//   loadTravelingFuelOnMiningBase: false,
//   // load mining resources on mining starbase - means use more cargo for transfer in direction to mining base
//   loadMiningAmmoOnMiningBase: false,
//   loadMiningFuelOnMiningBase: false,
//   loadMiningFoodOnMiningBase: false,

//   // Use thanks for transfer fuel and ammo
//   fuelTankToMiningBase: false,
//   ammoBankToMiningBase: false,

//   fuelTankToSaveStarbase: false,
//   ammoBankToSaveStarbase: false,
// } as MiningBuildOptions;
