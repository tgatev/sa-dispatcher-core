import { Coordinates } from "../src/Model/MoveAction";
import { FleetProcess as Process } from "../src/Model/FleetProcess";
import { SubwarpAction } from "../src/Model/SubwarpAction";
import { WarpAction } from "../src/Model/WarpAction";
import { DockAction } from "../src/Model/DockAction";
import { UnDockAction } from "../src/Model/UndockAction";
import { LoadCrewAction } from "../src/Model/LoadCrewAction";
import { UnloadCrewAction } from "../src/Model/UnloadCrewAction";
import { BASE_SCAN_CONFIG, ScanAction } from "../src/Model/ScanAction";
import { TransferCargoAction } from "../src/Model/TransferCargoAction";

async function run() {
  console.time("init_dispatcher");

  // let action = new StartMiningAction(proc, "hydrogen", 1, 1);
  // action.wrapAroundExecute = async (action) => {
  //   console.log("priorityFeeConfig", action.priorityFeeConfig);
  // };

  const proc = await Process.build("test", "mrz21");

  proc.logger.setVerbosity(-1);
  proc.addAction(new WarpAction(proc, new Coordinates(14, -6)));

  proc.addAction(new DockAction(proc, new Coordinates(25, 14)));
  proc.addAction(new UnDockAction(proc, new Coordinates(25, 14)));
  proc.addAction(new LoadCrewAction(proc, 5, new Coordinates(25, 14)));
  proc.addAction(new UnloadCrewAction(proc, 5, new Coordinates(25, 14)));
  proc.addAction(new WarpAction(proc, new Coordinates(0, 0), new Coordinates(5, 5)));
  proc.addAction(new SubwarpAction(proc, new Coordinates(0, 0), new Coordinates(5, 5)));
  proc.addAction(new ScanAction(proc, { ...BASE_SCAN_CONFIG, minChance: 0.2 }));
  proc.addAction(
    new TransferCargoAction(proc, [{ resourceName: "food", amount: "max", isImportToFleet: true, cargoType: "cargoHold", condition: { whenLessThen: 5 } }]),
  );

  // console.log(await proc.actionsChain[0].export({}));
  let e = [];
  for (let i of proc.actionsChain) {
    e.push(await i.export({}));

    // console.log(e[e.length - 1]);
  }
  console.log(JSON.stringify(e));
  // let _pSubWarpRun = action
  //   .run()
  //   .catch(async (e) => {
  //     // throw new Error("ActionCatch");
  //   })
  //   .finally(() => console.log("Finally Catcher"));

  console.timeEnd("init_dispatcher");
  console.time("Full execution tme");
}
try {
  run()
    .catch((err) => {
      console.error(["MAIN CATCHER"], err);
      process.exit(1);
    })
    .finally(() => console.log("[MAIN] Finally"));
} catch (e) {
  console.log("CATCH ON RUN ", e);
}
//
