import { PublicKey } from "@solana/web3.js";
import { log } from "../../src/Common/PatchConsoleLog";
import { DispatcherHolosim as Dispatcher } from "../../src/holoHandlers/HolosimMintsImporter";
import { prompt } from "../../src/Common/prompt";
import { BN } from "@project-serum/anchor";
import { getAssociatedTokenAddress } from "@solana/spl-token";

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
  const walletShips = await dispatcher.sageGameHandler.getShipsInWallet(new PublicKey(process.env["OWNER_WALLET"] || ""));
  let shipAccounts = await dispatcher.sageGameHandler.getShipsAccounts();

  log("Total ship mints in wallet:", walletShips.length, " Total ship accounts in game:", shipAccounts.length);
  let sagePLayerProfile = await dispatcher.sageGameHandler.getSagePlayerProfileAddress(playerProfile);
  console.log("Wallet Mints: ");
  console.table(
    walletShips.map((m) => {
      return {
        label: Unit8toString(new Uint8Array(dispatcher.sageGameHandler.findShipByMint(m.mint)?.data.data.name)),
        mint: m.mint.toBase58(),
        amount: m.amount,
        account: m.accountKey.toBase58(),
        updateId: Number(dispatcher.sageGameHandler.findShipByMint(m.mint)?.data.data.updateId),
      };
    })
  );

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
    startbaseAccount.data.seqId
  );
  let starbasePlayerAccount = await dispatcher.sageGameHandler.getStarbasePlayerAccount(playerProfile, starbaseAddresses);

  log("Starbase account:", starbaseAddresses.toBase58());
  log(starbasePlayerAccount);
  log("Starbase player address:", starbasePlayerAddress.toBase58());
  let escrowShips = starbasePlayerAccount.wrappedShipEscrows;

  /**
   * Ships in base
   */
  let sortedIn = escrowShips
    .toSorted((a, b) => b.amount - a.amount)
    .map((s) => {
      // log(s);
      return { accounts: s.ship, amount: s.amount, mint: dispatcher.sageGameHandler.findShipByAccount(s.ship)?.data.data.mint || null };
    });
  // log("Sorted escrows:", sortedIn);
  let Instructions = [];
  let keys = new Set([
    ...sortedIn.filter((s) => s.mint !== null).map((s) => s.mint?.toBase58()),
    ...walletShips.map((s) => s.mint.toBase58()),
  ]);

  log("Total different ship mints both side:", keys.size);
  let bothSideOrderedKeys = Array.from(keys).sort((a, b) => {
    let inGameA = sortedIn.find((e) => e.mint?.toBase58() === a);
    let inWalletA = walletShips.find((e) => e.mint.toBase58() === a);
    let totalA = inGameA ? inGameA.amount : 0 + (inWalletA ? inWalletA.amount : 0);

    let inGameB = sortedIn.find((e) => e.mint?.toBase58() === b);
    let inWalletB = walletShips.find((e) => e.mint.toBase58() === b);
    let totalB = inGameB ? inGameB.amount : 0 + (inWalletB ? inWalletB.amount : 0);
    log(a, b, totalA, totalB, "=>", totalB - totalA);

    return totalB - totalA;
  });
  log("Total different ship Sorted:", bothSideOrderedKeys.length);

  /**
   * Prepare data for display with bothSide data
   */
  let displayTableData: {
    wallet: number;
    mint: string;
    shipKey: string;
    css: number;
    label: string;
    cssAccount: string;
    walletAccount: string;
  }[] = [];

  for (let key of bothSideOrderedKeys) {
    let shipDataWallet = walletShips.find((s) => s.mint.toBase58() === key);
    let shipDataCSS = sortedIn.find((s) => {
      return s.mint?.toBase58() === key;
    });
    let ship = dispatcher.sageGameHandler.findShipByMint(new PublicKey(key || ""));
    displayTableData.push({
      wallet: shipDataWallet ? Number(shipDataWallet.amount) : 0,
      mint: key || "Unknown",
      shipKey: ship.data.key.toBase58() || "Unknown",
      css: shipDataCSS ? Number(shipDataCSS.amount) : 0,
      walletAccount:
        shipDataWallet?.accountKey.toBase58() ||
        "[U] " + (await getAssociatedTokenAddress(new PublicKey(key || ""), sagePLayerProfile, true)).toBase58(),
      cssAccount:
        shipDataCSS?.accounts.toBase58() ||
        "[U] " + (await getAssociatedTokenAddress(new PublicKey(key || ""), playerProfile, true)).toBase58(),
      label: Unit8toString(new Uint8Array(ship?.data.data.name ?? [])) || "Unknown",
    });
  }

  /**
   * Display table and ask what to do with each ship
   */
  console.table(mintsTable);
  console.table(displayTableData);

  /**
   * Generate instructions to submit
   */
  loop: for (let shipData of displayTableData) {
    log(
      shipData.wallet,
      shipData.mint,
      shipData.wallet,
      shipData.css,
      "Label:",
      Unit8toString(new Uint8Array(dispatcher.sageGameHandler.findShipByMint(new PublicKey(shipData.mint))?.data.data.name ?? [])) ||
        "Unknown"
    );
    let inputData = (await prompt(" (I)mport / (S)kip / (Q)uit / (E)xport? {all}")).trim().toLowerCase();
    switch (inputData) {
      case "i": {
        Instructions.push(
          ...(await dispatcher.sageFleetHandler.addShipToEscrow(
            playerProfile,
            new PublicKey(shipData.mint),
            shipData.wallet,
            dispatcher.signer.as,
            0
          ))
        );
        break;
      }
      case "q": {
        {
          break loop;
        }
        break;
      }
      case "e": {
        log("Exporting ", shipData.mint, " amount:", shipData.css);
        Instructions.push(
          ...(await dispatcher.sageFleetHandler.removeShipToEscrow(
            playerProfile,
            new PublicKey(shipData.mint),
            shipData.css,
            dispatcher.signer.as,
            0
          ))
        );
        // log("Exported data:", JSON.stringify(Instructions, null, 2));
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

// 104 4w7CuGChEMxkMuym3AfSVMzRNxePhFBJaHVs3euHHrHM 104 0 Label: Fimbul Airbike
//  (I)mport / (S)kip / (Q)uit / (E)xport? {all}I
//  for coordinates:  [ "BN( 40 )", "BN( 30 )" ] Starbase Address:  42nMwz3mfKA5SFPKrb2cpJHBeeWBGEDLB2pfudDjo6hZ
// {
//   fameProgram: "PublicKey( SAgEeT8u14TE69JXtanGSgNkEdoPUcLabeyZD2uw8x9 )", //!
//   playerProfile: "PublicKey( 4JxR1fXQ8SNox8WgNvhETRE6yefBpHeiE6znSaY5uDrf )", // !
//   profileFactionAddressKey: "PublicKey( 5CDSj4gS5CRm6o9bRbz3FAdtyWjFQsmgde9FfUf5p2Mo )",//!
//   sagePlayerProfile: "PublicKey( 9kzu4rLamfMa7vFqBFw2YDzx4EUed7WmBnsyXXHx9pV6 )",//!
//   funder: "PublicKey( FCNVJjPWARrB8TT8FwsErB9dGnAFDjUPDtS8JWG4rXdT )", //!
//   shipTokenAccountAddressFrom: "PublicKey( Adcv3MegTU3P3rfiktGoXszDoT1PrdVFPbZQ2h7zWVJG )", // ! origin token account
//   shipMint: "PublicKey( 4w7CuGChEMxkMuym3AfSVMzRNxePhFBJaHVs3euHHrHM )", // ! ship account
//   _shipEscrowTokenAccount: "PublicKey( 8hoYteGpgfin2CWnAZeBFCy52W4ih1D3mgiBfEiUuXA8 )", //! escrow token account //Aw2AUtRtXV5mT9ytZymADkCV1ZB4rqZyY2YtH6dhonv7
//   starbasePlayer: "PublicKey( E9KPPenuAU4nmRrKCCUSygE5vDsSmxxF4VeHU7KyDSh2 )",//!
//   starbase: "PublicKey( 42nMwz3mfKA5SFPKrb2cpJHBeeWBGEDLB2pfudDjo6hZ )", //!
//   gameId: "PublicKey( GAmEqxNYaUqLmLkXGhzUvv4Ud8FotnWPLj6ChdBkUh9j )",//!
//   gameState: "PublicKey( HKoaRAogfunbRbrTos4Lz3134gZ8RbKfDcJ3z5HpXbh1 )",// !
//   input: {
//     keyIndex: 0,
//     shipAmount: "BN( 104 )",
//   },
// } <<<addShipToEscrow>>>
// 0 F7Qm2PsZQcfb1wNqzMCSiKUwa3Zzd3SivYu7BL6RvgHP 0 2 Label: Ogrika Tursic
//  (I)mport / (S)kip / (Q)uit / (E)xport? {all}q
// Crew: Busy/Total  BN( 0 ) / 330
// Updated Ship escrow:  10 / 10
// Sending Transaction ....  2  instructions
// {} [ "INFO" ] Transaction size: 659 bytes with 2 instructions, 0 lookup tables and 16 unique keys.
// {} [ "INFO" ] --- Prepared 1 instruction chunks for transactions.
// 2025-10-02T00:55:45.831Z [ "[WARN]" ]

/***
 * 
 * Program	
SAgEeT8u14TE69JXtanGSgNkEdoPUcLabeyZD2uw8x9
Account #1
WritableSigner	
FCNVJjPWARrB8TT8FwsErB9dGnAFDjUPDtS8JWG4rXdT

Account #2
Writable	
9kzu4rLamfMa7vFqBFw2YDzx4EUed7WmBnsyXXHx9pV6

Account #3
Writable	
Adcv3MegTU3P3rfiktGoXszDoT1PrdVFPbZQ2h7zWVJG

Account #4
	
8hoYteGpgfin2CWnAZeBFCy52W4ih1D3mgiBfEiUuXA8

Account #5
Writable	
Aw2AUtRtXV5mT9ytZymADkCV1ZB4rqZyY2YtH6dhonv7 //!

Account #6
	
42nMwz3mfKA5SFPKrb2cpJHBeeWBGEDLB2pfudDjo6hZ

Account #7
Writable	
E9KPPenuAU4nmRrKCCUSygE5vDsSmxxF4VeHU7KyDSh2
Account #8
WritableSigner	
FCNVJjPWARrB8TT8FwsErB9dGnAFDjUPDtS8JWG4rXdT
Account #9
	
4JxR1fXQ8SNox8WgNvhETRE6yefBpHeiE6znSaY5uDrf
Account #10
	
5CDSj4gS5CRm6o9bRbz3FAdtyWjFQsmgde9FfUf5p2Mo
Account #11
	
GAmEqxNYaUqLmLkXGhzUvv4Ud8FotnWPLj6ChdBkUh9j
Account #12
	
HKoaRAogfunbRbrTos4Lz3134gZ8RbKfDcJ3z5HpXbh1
Account #13
	
Token Program
Account #14
	
System Program
 */
