import { PublicKey } from "@solana/web3.js";
import Dispatcher from "../src/Model/Dispatcher";
import { Coordinates } from "../src/Model/MoveAction";
import { FleetProcess as Process } from "../src/Model/FleetProcess";
import { StartMiningAction } from "../src/Model/StartMiningAction";
import * as tm from "../src/Model/StartMiningAction";
import { iScanConfig, ScanAction } from "../src/Model/ScanAction";
import { SubwarpAction } from "../src/Model/SubwarpAction";

const tickSec = 5;
const lifeTime = {
  fromStart: 0,
};
const lifeTimeInterval = setInterval((e) => {
  lifeTime.fromStart += tickSec;
  console.log(["Now:"], lifeTime.fromStart);
}, tickSec * 1000);

console.log(tm);
console.log(tm.StartMiningAction.prototype.run.toString());

async function run() {
  console.time("init_dispatcher");
  console.log("TYPE:", typeof true);

  // let action = new StartMiningAction(proc, "hydrogen", 1, 1);
  // action.wrapAroundExecute = async (action) => {
  //   console.log("priorityFeeConfig", action.priorityFeeConfig);
  // };

  const proc = await Process.build("test", "mrz17");

  proc.logger.setVerbosity(-1);
  let action = new SubwarpAction(proc, new Coordinates(14, -6));
  let _pSubWarpRun = action
    .run()
    .catch(async (e) => {
      // throw new Error("ActionCatch");
    })
    .finally(() => console.log("Finaly Catcher"));

  // _pSubWarpRun;

  // proc.addAction(action);
  await new Promise((r, re) => {
    setTimeout(() => {
      action.signals.abort.state = true;
      r("");
    }, 10 * 1000);
  });
  // await proc.start(0);

  console.log("Abort Signal", (action.signals.abort.state = true));
  // await _pSubWarpRun.finally(() => console.log("Finally"));

  await new Promise((r, re) => {
    setTimeout(r, 30 * 1000);
  });
  console.log("ACTION RESULT", action.results);

  // await _pSubWarpRun;

  await new Promise((r, re) => {
    setTimeout(r, 30 * 1000);
  });
  // throw "DDDD";

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
