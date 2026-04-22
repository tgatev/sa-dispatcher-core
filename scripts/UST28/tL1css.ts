import { ShipStats } from "@staratlas/sage-main";
import { DockAction } from "../../src/Model/DockAction";
import { Coordinates } from "../../src/Model/MoveAction";
import { Process } from "../../src/Model/FleetProcess";
import { SubwarpAction } from "../../src/Model/SubwarpAction";
import { TransferCargoAction } from "../../src/Model/TransferCargoAction";
import { UnDockAction } from "../../src/Model/UndockAction";
import { SageGameHandler, StarbaseMapItem, argv } from "../../src/gameHandlers/GameHandler";

// process.env['TRANSACTION_PRIORITY_FEE_LIMIT'] = "10000";
// process.env['TRANSACTION_PRIORITY_FEE_CAP'] = "100000";
// process.env["TRANSACTION_PRIORITY_FEE_MIN_CHANCE"] = "90";
// process.env["TRANSACTION_PRIORITY_FEE_INCREASE_STEP"] = "10000";
// process.env["TRANSACTION_PRIORITY_FEE_INCREASE_BASE_FEE"] = "10000";

async function run() {
  /**
   * Mining 21 Hydro - fill fuel buffer
   */
  /** Provide pointer reference to handlers */
  let proc = await Process.build(undefined, "mrz28");
  // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation

  // let miningBase = await SageGameHandler.readStarbaseByName("mrz28");

  // /**
  //  * Transport FUEL for Food
  //  *  : Fuel to UST-1
  //  *  : Food to MRZ-21
  //  */

  // // await proc.validateEmptyCargo(); // Process need empty cargo for right calculation
  // let miningBaseUST1: StarbaseMapItem = await SageGameHandler.readStarbaseByName("ust1");
  // // Need for definition only but not used
  // let miningResourceUST1 = await SageGameHandler.readStarbaseResource(miningBaseUST1, "hydrogen");

  // let optionsUST1 = {
  //   miningTimes: 0,
  //   movementMode: "Subwarp",
  //   // subwarpDistance: 2.5,
  //   fuelTankToMiningBase: true,
  //   // loadTravelingFuelOnMiningBase: true,
  //   transportToMiningBase: [{ resourceName: "polymer", percent: 1 }],
  //   transportToSafeStarbase: [{ resourceName: "food", percent: 1 }],
  // } as MiningBuildOptions;

  // let gen = await proc.generateMiningProcessSteps(miningBaseUST1, miningResourceUST1, optionsUST1);

  // proc.actionsChain.push(...gen.actions);
  let fa = await proc.fetchFleetAccount();
  let fs: ShipStats = fa.data.stats;
  proc.addAction(
    new TransferCargoAction(proc, [
      {
        isImportToFleet: false,
        resourceName: "electromagnet",
        amount: "max",
        condition: { whenMoreThen: 0 },
      },
      {
        isImportToFleet: true,
        resourceName: "fuel",
        amount: "max",
        cargoType: "fuelTank",
      },
      {
        isImportToFleet: true,
        resourceName: "polymer",
        amount: fs.cargoStats.cargoCapacity,
        cargoType: "cargoHold",
      },
    ])
  );

  proc.addAction(new UnDockAction(proc));
  proc.addAction(new SubwarpAction(proc, new Coordinates(40, 30)));
  proc.addAction(new DockAction(proc));
  proc.addAction(
    new TransferCargoAction(proc, [
      {
        isImportToFleet: false,
        resourceName: "polymer",
        amount: fs.cargoStats.cargoCapacity,
        cargoType: "cargoHold",
        condition: { whenMoreThen: 0 },
      },
      {
        isImportToFleet: false,
        resourceName: "fuel",
        amount: 5184,
        cargoType: "fuelTank",
      },
      {
        isImportToFleet: true,
        resourceName: "electromagnet",
        amount: Math.floor(fs.cargoStats.cargoCapacity / 4),
        cargoType: "cargoHold",
      },
    ])
  );
  proc.addAction(new UnDockAction(proc));
  proc.addAction(new SubwarpAction(proc, new Coordinates(17, 21)));
  proc.addAction(new DockAction(proc));

  /**
   * Loop the process N times
   */
  await proc.repeat();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
