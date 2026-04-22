import Dispatcher from "../src/Model/Dispatcher";
import ResourceAggregator from "../src/Model/ResourceAggregator";
run().catch((err) => {
  console.error(err);
  process.exit(1);
});
async function run() {
  console.time("init_dispatcher");
  const dispatcher = await Dispatcher.build({ useLookupTables: true });
  console.timeEnd("init_dispatcher");
  console.time("Full execution tme");

  dispatcher.sageGameHandler.logger.setVerbosity(-1);
  let aggregator = await ResourceAggregator.getInstance(dispatcher);
  await aggregator.dump();
  throw "END";
}
