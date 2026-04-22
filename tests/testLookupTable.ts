import Dispatcher from "../src/Model/Dispatcher";
import { LookupTable } from "../src/Model/LookupTable";
import { Coordinates } from "../src/Model/MoveAction";
import { FleetProcess as Process } from "../src/Model/FleetProcess";
import { StopMiningAction } from "../src/Model/StopMining";
import { UnDockAction } from "../src/Model/UndockAction";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
run().catch((err) => {
  console.error(err);
  process.exit(1);
});
async function run() {
  console.time("init_dispatcher");
  const dispatcher = await Dispatcher.build({ useLookupTables: true });
  console.timeEnd("init_dispatcher");
  console.time("Full execution tme");
  // // dispatcher.sageFleetHandler.getFleetAccount()

  let maxProcess = new Process(dispatcher, "max", new Coordinates(17, 21));

  // Fetch instruction publick keys
  let undock = new UnDockAction(maxProcess);
  console.time("InstructionReturns");
  let ixrs = await undock.getInstructionsReturns();
  console.timeEnd("InstructionReturns");

  console.time("Convert Returns");
  let ixs: TransactionInstruction[] = await dispatcher.sageGameHandler.convertInstructionReturnToTransactionInstruction(ixrs);
  console.timeEnd("Convert Returns");
  await undock.run();

  let keys: PublicKey[] = [];
  ixs.forEach((element) => {
    element.keys.forEach((k) => keys.push(k.pubkey));
  });

  let lookupTable = new LookupTable(dispatcher);

  console.time("Create Lookup Table");
  await lookupTable.create(keys); // optional - add upto 20 keys on create
  console.timeEnd("Create Lookup Table");

  // Load Lookup Table from publick key of First One
  let lookupTable2 = new LookupTable(dispatcher, lookupTable.address);
  // Wait netweork to process
  await dispatcher.waitForNewBlock(100);

  console.time("Load Addresses");
  await lookupTable2.fetchAccountData();
  console.timeEnd("Load Addresses");

  ///// This steps are available only for owned by yourselfe lookup tables.
  /////    - Right now we are using 3th oparty lookup tables
  // console.time("Deactivate Address");
  // await lookupTable2.deactivate();
  // console.timeEnd("Deactivate Address");
  // // Wait netweork to process
  // // Why taking 2 to 5 minutes to deactivate?
  // await dispatcher.waitForNewBlock(500);

  // console.time("Close Address");
  // await lookupTable2.close();
  // console.timeEnd("Close Address");
}
