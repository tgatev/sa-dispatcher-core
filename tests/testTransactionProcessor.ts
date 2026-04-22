run().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { TransactionProcessor } from "../src/Model/TransactionProcessor";
async function run() {
  console.log("Subscription Test");

  let processor = new TransactionProcessor();
  processor.startLogsListener();
  // processor.sectorDataLimit = 100;
  console.log("Continue ... ");
}
