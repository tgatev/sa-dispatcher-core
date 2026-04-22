import { PublicKey } from "@solana/web3.js";
import { log } from "../../src/Common/PatchConsoleLog";
import { DispatcherHolosim as Dispatcher } from "../../src/holoHandlers/HolosimMintsImporter";
import { prompt } from "../../src/Common/prompt";
import { BN } from "@project-serum/anchor";
import { InstructionReturn } from "@staratlas/data-source";

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

const Unit8toString = (data: Uint8Array) => {
  return Buffer.from(data).toString().replace(/\0/g, "");
};

async function run() {
  console.time("init_dispatcher");
  // Used o send transactions
  const dispatcher = await Dispatcher.build();
  console.timeEnd("init_dispatcher");
  console.time("Full execution tme");
  dispatcher.donate = false; // do not donate on test scripts
  let playerProfile = new PublicKey("4JxR1fXQ8SNox8WgNvhETRE6yefBpHeiE6znSaY5uDrf");

  // ///
  // const accounts = await dispatcher.transactionConnection.getParsedTokenAccountsByOwner(, {
  //   programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
  // });
  await dispatcher.sageGameHandler.ready;
  let shipAccounts = await dispatcher.sageGameHandler.getShipsAccounts();

  let sagePLayerProfile = await dispatcher.sageGameHandler.getSagePlayerProfileAddress(playerProfile);
  let mintsTable = shipAccounts.map((s) => {
    let data = s.data.data;
    let key = s.key.toBase58();

    return {
      key,
      mint: data.mint.toBase58(),
      label: Unit8toString(new Uint8Array(data.name)),
      size: data.sizeClass,
      version: data.version,
      updateId: Number(data.updateId),
      g: data.gameId?.toBase58() || "N/A",
      // gameId: data.gameId.toBase58(),
    };
  });
  console.table(mintsTable);

  /**
   * Css Location && Starbase Data
   */
  let starbaseAddresses = await dispatcher.sageGameHandler.getStarbaseAddress([new BN(40), new BN(30)]);
  let startbaseAccount = await dispatcher.sageGameHandler.getStarbaseAccount(starbaseAddresses);
  log("Starbase account:", starbaseAddresses.toBase58());
  log(startbaseAccount);

  let starbasePlayerAddress = await dispatcher.sageGameHandler.getStarbasePlayerAddress(
    starbaseAddresses,
    sagePLayerProfile,
    startbaseAccount.data.seqId,
  );
  let starbasePlayerAccount = await dispatcher.sageGameHandler.getStarbasePlayerAccount(playerProfile, starbaseAddresses);

  log("Starbase account:", starbaseAddresses.toBase58());
  log("Starbase player address:", starbasePlayerAddress.toBase58());
  log(starbasePlayerAccount);
  let escrowShips = starbasePlayerAccount.wrappedShipEscrows;

  /**
   * Ships in base
   */
  let sortedIn = escrowShips
    .toSorted((a, b) => b.amount - a.amount)
    .map((s) => {
      let sh = dispatcher.sageGameHandler.findShipByAccount(s.ship);
      // log(s);
      return {
        accounts: s.ship,
        amount: s.amount,
        mint: sh?.data.data.mint || null,
        label: Unit8toString(new Uint8Array(sh?.data.data.name || new Uint8Array())) || "N/A",
      };
    });
  // log("Sorted escrows:", sortedIn);

  /**
   * Prepare data for display with bothSide data
   */
  let displayTableData: {
    mint: string;
    shipKey: string;
    css: number;
    label: string;
    cssAccount: string;
  }[] = [];

  for (let i in sortedIn) {
    let shipData = sortedIn[i];
    displayTableData.push({
      css: shipData.amount,
      mint: shipData.mint?.toBase58() || "N/A",
      shipKey: shipData.accounts.toBase58(),
      label: shipData.label,
      cssAccount: shipData.accounts.toBase58(),
    });
  }
  /**
   * Display table and ask what to do with each ship
   */
  console.table(displayTableData);

  let Instructions: InstructionReturn[] = [];
  /**
   * Generate instructions to submit
   */
  loop: for (let i in displayTableData) {
    let shipData = displayTableData[i];
    log(shipData.mint, shipData.css, "Label:", shipData.label);
    let inputData = (await prompt(" (A)Add / (S)kip / (Q)uit  {all}")).trim().toLowerCase();
    switch (inputData) {
      case "a": {
        let amount = Number(await prompt("Amount[number]: "));

        if (isNaN(amount) || amount <= 0) {
          log("Invalid amount, skip");
          continue loop;
        }
        if (amount > shipData.css) {
          log("Not enough ships in escrow, skip");
          continue loop;
        }
        Instructions.push(
          ...(
            await dispatcher.sageFleetHandler.ixCreateFleet(
              playerProfile,
              starbaseAddresses,
              "TEST_FLEET_CREATE",
              new PublicKey(shipData.mint),
              amount,
              dispatcher.signer.as,
              dispatcher.funderPermissionIdex,
            )
          ).instructions,
        );
        break;
      }
      case "q": {
        {
          break loop;
        }
        break;
      }
      case "s": {
        continue loop;
      }
      default:
        log("Unknown input, skip");
        continue loop;
    }
  }

  log("Crew: Busy/Total ", starbasePlayerAccount.data.busyCrew, "/", starbasePlayerAccount.totalCrew(true));
  log("Updated Ship escrow: ", starbasePlayerAccount.data.updatedShipEscrowCount, "/", starbasePlayerAccount.data.shipEscrowCount);
  log("Sending Transaction .... ", Instructions.length, " instructions");
  // throw " WE ARE HERE ";
  let rxs = await dispatcher.signAndSend(Instructions, true, undefined, { retryOnTimeout: false });
  log(rxs, "Transaction result End");
}

function onScriptExit() {
  console.timeEnd("Full execution tme");
}
process.on("exit", onScriptExit);
process.on("uncaughtException", (err) => {
  log("Uncaught Exception:", err);
  onScriptExit();
  process.exit(1);
});
process.on("SIGINT", () => {
  log("Script interrupted");
  onScriptExit();
  process.exit(1);
});
