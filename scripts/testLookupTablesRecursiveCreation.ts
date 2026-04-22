import { TransactionInstruction } from "@solana/web3.js";
import Dispatcher from "../src/Model/Dispatcher";
import { FleetProcess as Process } from "../src/Model/FleetProcess";
import { ScanAction } from "../src/Model/ScanAction";
run().catch((err) => {
  console.error(err);
  process.exit(1);
});
async function run() {
  console.time("init_dispatcher");
  /**
   * Dispatcher build will initialize existing tables in scripts/data/<key>.lt
   *  - if there is deactivated acounts they will be closed to free solana
   *  - if there is no active acount will create new one
   */
  const dispatcher = await Dispatcher.build();
  console.timeEnd("init_dispatcher");
  console.time("Full execution time");

  let maxProcess = new Process(dispatcher, "max", {
    x: 17,
    y: 21,
    isShipCenter: false,
  });

  let s4Process = new Process(dispatcher, "s4", {
    x: 17,
    y: 21,
    isShipCenter: false,
  });

  let s1Process = new Process(dispatcher, "s1", {
    x: 17,
    y: 21,
    isShipCenter: false,
  });

  let s2Process = new Process(dispatcher, "s2", {
    x: 17,
    y: 21,
    isShipCenter: false,
  });
  let s3Process = new Process(dispatcher, "s3", {
    x: 17,
    y: 21,
    isShipCenter: false,
  });

  let s14Process = new Process(dispatcher, "s3", {
    x: 17,
    y: 21,
    isShipCenter: false,
  });
  let instructions: TransactionInstruction[] = [];
  console.log("I1");
  // instructions.push(
  //   ...(await new TransferCargoAction(s1Process, [{ isImportToFleet: true, resourceName: "toolkit", amount: 2000 }]).getInstructions())
  // );
  console.log("I2");
  // instructions.push(
  //   ...(await new TransferCargoAction(s2Process, [{ isImportToFleet: true, resourceName: "toolkit", amount: 2000 }]).getInstructions())
  // );
  console.log("I3");
  // instructions.push(
  //   ...(await new TransferCargoAction(s3Process, [{ isImportToFleet: true, resourceName: "toolkit", amount: 2000 }]).getInstructions())
  // );
  console.log("I4");
  instructions.push(...(await new ScanAction(s4Process).getInstructions()));
  console.log("I5");
  instructions.push(...(await new ScanAction(maxProcess).getInstructions()));
  console.log("Instructions length:", instructions.length);

  let accounts = await dispatcher.getMissingKeysInLookupTables(instructions);
  console.log(accounts.length);

  await dispatcher.appendLookupTables(instructions);
  let tx = await dispatcher.v0Transaction(instructions);
  let res = await dispatcher.v0Simulate(tx);
  let e = res.value.err;
  if (e) {
    console.log(e);
  }
  console.log(res);
  await dispatcher.v0SignAndSend(tx);
  // // dispatcher.sageFleetHandler.getFleetAccount()
  // dispatcher.lookupTables.forEach(async (lt) => {
  //   await lt.fetchAccountData();
  //   if (lt.account?.isActive()) {
  //     await lt.deactivate();
  //     // wait to bede deactivated
  //     await lt.dispatcher.waitForNewBlock(100);
  //   }
  //   await lt.fetchAccountData();
  //   // TODO: Why throw error [simulation failed] ? ? ? it should not
  //   //    Transaction simulation failed: Error processing Instruction 0: invalid program argument
  //   // BUT: when we run the same metod on the next execution address will be closed cause is inactive
  //   // this account will be closed on the next run
  //   if (!lt.account?.isActive()) {
  //     try {
  //       await lt.close();
  //     } catch (e) {
  //       console.error(e);
  //       console.log("RETRY ...");
  //       await lt.close();
  //     }
  //   }
  // });

  console.timeEnd("Full execution time");
}
