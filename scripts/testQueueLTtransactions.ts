import Dispatcher from "../src/Model/Dispatcher";
import { FleetProcess as Process } from "../src/Model/FleetProcess";
import { BASE_SCAN_CONFIG, ScanAction } from "../src/Model/ScanAction";
import { iQueueItem } from "../src/Model/Queue";
import { Coordinates } from "../src/Model/MoveAction";
const readline = require("readline");
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.once("close", () => {
  process.exit();
});

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
async function run() {
  console.time("init_dispatcher");
  const dispatcher = await Dispatcher.build();
  console.timeEnd("init_dispatcher");
  console.time("Full execution tme");

  dispatcher.startQueue();

  rl.on("line", async (line: any) => {
    console.log("Comand:", line);
    const addRegex = /qAdd \{?\s*\[\s*(\{.+\}\s*,?)+\s*\]\s*\}?/;
    // console.log("Match:", line.match(addRegex));
    switch (line) {
      case "stop":
        process.exit(1);
        break;
      case "qStop":
        dispatcher.stopQueue();
        break;
      case "qBussyT":
        dispatcher.queue.isBussy = true;
        break;
      case "qBussyF":
        dispatcher.queue.isBussy = false;
        break;
      case "q10": {
        let items = [],
          now = new Date().getTime();
        for (let i = 1; i <= 10; i++) {
          items.push({ execTime: now + i * 1000 } as iQueueItem);
        }
        console.log("Add " + items.length + " items");
        let length = await dispatcher.queue.queue(items);
        console.log("Queue length:", length);
        break;
      }
      case "max": {
        await max(dispatcher);
        break;
      }
      case line.match(addRegex) ? line : null: {
        let j: string = line.substring(4, line.length);

        console.log("Parse:", j);
        console.log(JSON.parse(j));
        dispatcher.queue.queue(JSON.parse(j));
        break;
      }

      default:
        break;
    }
  });

  // console.log(dispatcher.lookupTables[0].accounts.size);

  // let maxProcess = new Process(dispatcher, "max", {
  //   x: 17,
  //   y: 21,
  //   isShipCenter: false,
  // });

  // let s4Process = new Process(dispatcher, "s4", {
  //   x: 17,
  //   y: 21,
  //   isShipCenter: false,
  // });

  // // Fetch instruction publick keys
  // // const undock = new UnDockAction(maxProcess);
  // const scan = new ScanAction(maxProcess);
  // console.time("InstructionReturns");
  // const maxTis = await scan.getInstructions();
  // console.timeEnd("InstructionReturns");
  // console.time("InstructionReturns");
  // const s4Tis = await new DockAction(s4Process).getInstructions();
  // console.timeEnd("InstructionReturns");
  // // console.time("Convert Returns");
  // // let ixs: TransactionInstruction[] = await dispatcher.sageGameHandler.convertInstructionReturnToTransactionInstruction(maxIxrs);
  // // console.timeEnd("Convert Returns");

  // let tis: TransactionInstruction[] = [...maxTis, ...s4Tis];

  // let v0Transaction = await dispatcher.v0Transaction(tis);
  // let transactionSimulationResponce = await dispatcher.v0Simulate(v0Transaction);
  // console.log(transactionSimulationResponce);

  // await dispatcher.v0SignAndSend(v0Transaction);
}

async function max(dispatcher: Dispatcher) {
  console.log("Add Max to que ...");

  let scanFlow = new Process(dispatcher, "max", { x: 17, y: 21, isShipCenter: false } as Coordinates);

  // Example 1 add queue item to execute specific flow
  // let qItem = {
  //   action: new UnDockAction(scanFlow),
  //   execTime: new Date().getTime(),
  //   next: async () => {
  //     console.log("After UnDockAction complete [1]");

  //     // add item to async queue // return Promise<qLength>
  //     // await new Promise((resolve) => setTimeout(resolve, 20 * 1000));
  //     return dispatcher.queue.queue([
  //       {
  //         action: new DockAction(scanFlow),
  //         execTime: new Date().getTime(),
  //         next: async () => {
  //           // await new Promise((resolve) => setTimeout(resolve, 20 * 1000));
  //           console.log("After dock");
  //           return scanFlow.forward() ; // same as next:scanFlow.forward
  //         },
  //       } as iQueueItem,
  //     ]);
  //   },
  // } as iQueueItem;

  // execute by adding in queue
  // dispatcher.queue.queue([qItem]);

  // Example 2 add flow process
  // scanFlow.addAction(new UnDockAction(scanFlow));
  // scanFlow.addAction(new WarpAction(scanFlow, { x: 16, y: 20, isShipCenter: false }));
  // scanFlow.addAction(new ScanAction(scanFlow));
  // scanFlow.addAction(new SubwarpAction(scanFlow, { x: 16, y: 21, isShipCenter: false }));
  scanFlow.addAction(new ScanAction(scanFlow, BASE_SCAN_CONFIG));

  // scanFlow.addAction(new StartMiningAction(scanFlow, "hydrogen", 1, 1.5));
  // scanFlow.addAction(new DockAction(scanFlow));
  // scanFlow.addAction(
  //   new TransferCargoAction(scanFlow, [{ isImportToFleet: false, resourceName: "hydrogen", amount: "max", cargoType: "cargoHold" }])
  // );

  // Start process forwarding
  scanFlow.forward();
}
