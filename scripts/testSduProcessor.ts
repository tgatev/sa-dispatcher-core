run().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { SDUProbabilityProcessor } from "../src/Model/SDUProbabilityProcessor";
async function run() {
  console.log("Subscribtion Test");

  let processor = new SDUProbabilityProcessor();
  processor.startListener();
  processor.sectorDataLimit = 100;
  console.log("Continue ... ");
}
