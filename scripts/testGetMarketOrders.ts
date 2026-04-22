import Dispatcher from "../src/Model/Dispatcher";
import { iTransferStarbaseConfig, TransportAction } from "../src/Model/TransportAction";
import { PublicKey } from "@solana/web3.js";

async function run() {
  console.time("init_dispatcher");
  const dispatcher = await Dispatcher.build();
  console.time("Full execution tme");

  let orders = await dispatcher.sageMarketHandler.getOpenOrders({
    asset: new PublicKey("4ns3shP4WunCtJbr2HFu31RjjxSJxDymEFcBZxiHr11s"),
    currency: new PublicKey("ATLASXmbPQxBUYbxPsV97usA3fPQYEqzQBUHgiFCUsXx"),
  });
  let sorted = orders.sort((a, b) => (Number(a.account.price) > Number(b.account.price) ? -1 : 1));
  console.log(await dispatcher.sageMarketHandler.convertValues(sorted[0]));
  console.log(orders.length);
}
run().catch((err) => {
  console.error(err);
  process.exit(1);
});
