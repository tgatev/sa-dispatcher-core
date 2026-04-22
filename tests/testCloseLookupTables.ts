import Dispatcher from "../src/Model/Dispatcher";
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
  const dispatcher = await Dispatcher.build({ useLookupTables: true });
  console.timeEnd("init_dispatcher");
  console.time("Full execution time");
  // // dispatcher.sageFleetHandler.getFleetAccount()
  for (const lt of dispatcher.lookupTables) {
    await lt.fetchAccountData();
    if (lt.account?.isActive()) {
      await lt.deactivate();
      // wait to bede deactivated
      await lt.dispatcher.waitForNewBlock(100);
    }
    // await lt.fetchAccountData();
    // // TODO: Why throw error [simulation failed] ? ? ? it should not
    // //    Transaction simulation failed: Error processing Instruction 0: invalid program argument
    // // BUT: when we run the same metod on the next execution address will be closed cause is inactive
    // // this account will be closed on the next run
    // if (!lt.account?.isActive()) {
    //   try {
    //     await lt.close();
    //   } catch (e) {
    //     console.error(e);
    //     console.log("RETRY ...");
    //     await lt.close();
    //   }
    // }
  }

  console.timeEnd("Full execution time");
}
