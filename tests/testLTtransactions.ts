import { slice } from "lodash";
import Dispatcher from "../src/Model/Dispatcher";
import { DockAction } from "../src/Model/DockAction";
import { FleetProcess as Process } from "../src/Model/FleetProcess";
import { ScanAction } from "../src/Model/ScanAction";
import { TransactionInstruction } from "@solana/web3.js";
import { Coordinates } from "../src/Model/MoveAction";

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
async function run() {
  console.time("init_dispatcher");
  const dispatcher = await Dispatcher.build();
  console.timeEnd("init_dispatcher");
  console.time("Full execution tme");
  console.log(dispatcher.lookupTables[0].accounts.size);

  let maxProcess = new Process(dispatcher, "max", new Coordinates(17, 21));

  let s4Process = new Process(dispatcher, "s4", new Coordinates(17, 21));

  // Fetch instruction publick keys
  // const undock = new UnDockAction(maxProcess);
  const scan = new ScanAction(maxProcess);
  console.time("InstructionReturns");
  const maxTis = await scan.getInstructions();
  console.timeEnd("InstructionReturns");
  console.time("InstructionReturns");
  const s4Tis = await new DockAction(s4Process).getInstructions();
  console.timeEnd("InstructionReturns");
  // console.time("Convert Returns");
  // let ixs: TransactionInstruction[] = await dispatcher.sageGameHandler.convertInstructionReturnToTransactionInstruction(maxIxrs);
  // console.timeEnd("Convert Returns");

  let tis: TransactionInstruction[] = [...maxTis, ...s4Tis];

  let v0Transaction = await dispatcher.v0Transaction(tis);
  let transactionSimulationResponce = await dispatcher.v0Simulate(v0Transaction);
  console.log(transactionSimulationResponce);

  await dispatcher.v0SignAndSend(v0Transaction);
}
