import {
  PublicKey,
  AddressLookupTableProgram,
  SystemProgram,
  TransactionInstruction,
  CloseLookupTableParams,
  VersionedTransactionResponse,
  DeactivateLookupTableParams,
  AddressLookupTableAccount,
  ParsedTransactionWithMeta,
} from "@solana/web3.js";
import fs from "fs";
import Dispatcher from "./Dispatcher";

export const MAX_TABLE_SIZE = 256;
/**
 * Provide interface to create / update / close LookupTables
 */
export class LookupTable {
  accounts: Map<string, PublicKey> = new Map<string, PublicKey>();
  address?: PublicKey;
  dispatcher: Dispatcher;
  account: AddressLookupTableAccount | null = null;
  constructor(dispatcher: Dispatcher, address: PublicKey | undefined = undefined) {
    this.address = address;
    this.dispatcher = dispatcher;
  }

  async build(withAddresses: PublicKey[] = []) {
    if (this.address) {
      // Load lookup table data and reset accounts in map
      await this.fetchAccountData();
      if (this.account?.isActive()) {
        console.log("Build [load] Active lookup table: " + this.address.toBase58());
        if (withAddresses.length > 0) {
          await this.addAddresses(withAddresses);
        }
      } else {
        // Close inactive tables to free solana
        try {
          console.log("Close LookupTable: " + this.address.toBase58());
          await this.close();
        } catch (e) {
          console.log(e);
          console.error("Cant close lookup table:", [this.address]);
          console.log("RETRY ...");
          await this.close();
        }
      }
    } else {
      // create;
      console.log("Create new lookup table.");
      await this.create(withAddresses);
    }

    return this;
  }

  /**
   * Create LookupTable on chain with initial addresses
   *
   * @param addresses addreses to add in table
   *
   * Note! upto 20 address can be processed on create
   */
  async create(addresses: PublicKey[]) {
    let rx: ParsedTransactionWithMeta | null = null;
    if (!this.address) {
      console.log("[onChain] Create new lookup table.");
      const slot = await this.dispatcher.sageGameHandler.connection.getSlot();
      let instructions: TransactionInstruction[] = [];
      const [lookupTableInst, lookupTableAddress] = AddressLookupTableProgram.createLookupTable({
        authority: this.dispatcher.signer.kp.publicKey,
        payer: this.dispatcher.signer.kp.publicKey,
        recentSlot: slot,
      });
      instructions.push(lookupTableInst);

      if (addresses) {
        instructions.push(
          AddressLookupTableProgram.extendLookupTable({
            payer: this.dispatcher.signer.kp.publicKey,
            authority: this.dispatcher.signer.kp.publicKey,
            lookupTable: lookupTableAddress,
            addresses: [
              this.dispatcher.signer.kp.publicKey,
              SystemProgram.programId,
              // list more `publicKey` addresses here
              ...addresses,
            ],
          })
        );
      }

      this.address = lookupTableAddress;
      console.log("lookup table address:", this.address.toBase58());
      console.log("sign and send transaction ...");
      this.dispatcher.donate = false;
      let tx = await this.dispatcher.v0Transaction(instructions, null, false, 0, false);
      rx = await this.dispatcher.v0SignAndSend(tx.transaction, tx.strategy);
      console.log("created lookup table:", this.address.toBase58());
      console.log(rx);

      let filePath = this.dispatcher.lookupTablesStorage + this.address + ".lt";
      console.log("Create LT file:", filePath);
      fs.writeFileSync(filePath, JSON.stringify(rx));

      addresses.forEach((address) => {
        this.accounts.set(address.toBase58(), address);
      });

      // Wait after execution to be sure it is applyed on chain
      await this.dispatcher.waitForNewBlock(50);
      await this.fetchAccountData();
    }

    return rx;
  }
  /**
   * Fetch account data and sett acouunts in map
   * @returns
   */
  async fetchAccountData() {
    console.log("Fetch lookup table data:", this.address?.toBase58());
    if (this.address) {
      this.account = (await this.dispatcher.sageGameHandler.connection.getAddressLookupTable(this.address)).value;
      // reset addresses list
      this.account?.state.addresses.forEach((address) => this.accounts.set(address.toBase58(), address));
      console.log("Data Sizes after fetch: ", this.account?.state.addresses.length, ">=<", this.accounts.size);
    }
    return this.account;
  }

  /**
   * Add list of addresses into lookup table
   *
   * @param addresses array of acount addresses to be added in lookupTable
   * @returns
   */
  async addAddresses(addresses: PublicKey[]): Promise<ParsedTransactionWithMeta | null> {
    let rx: ParsedTransactionWithMeta | null = null;
    if (this.address) {
      // add addresses to the `lookupTableAddress` table via an `extend` instruction
      // Append only missing addresses
      console.log("addAddresses: filter addreses");
      await this.fetchAccountData();
      let addList: PublicKey[] = [];
      for (const iterator of addresses) {
        if (!this.accounts.has(iterator.toBase58())) {
          console.log("addAddresses::MissingAddress:", iterator.toBase58());
          addList.push(iterator);
        }
      }
      console.log("addAddresses: after filter List length ", addList.length, addresses.length);
      // There is new addresses in the collection
      if (addList.length > 0) {
        //Todo Split list to Batches, add fallback when to many addresses to add new table
        const extendInstruction = AddressLookupTableProgram.extendLookupTable({
          payer: this.dispatcher.signer.kp.publicKey,
          authority: this.dispatcher.signer.kp.publicKey,
          lookupTable: this.address,
          addresses: [
            // this.dispatcher.signer.kp.publicKey,
            // SystemProgram.programId,
            // list more `publicKey` addresses here
            ...addList,
          ],
        });

        let tx = await this.dispatcher.v0Transaction([extendInstruction], null, false, 0, false);
        console.log(".v0SignAndSend() ...");

        rx = await this.dispatcher.v0SignAndSend(tx.transaction, tx.strategy);
        if (rx.meta?.err) {
          throw rx.meta.err;
        }
        // Rload addresses after appending list of accounts
        await this.fetchAccountData();
      }
    }

    return rx;
  }

  /**
   * deactivate lookup table and receive solana back
   *
   * @returns transaction id
   */
  async deactivate() {
    console.log("Deactivating Lookup Table", this.address?.toBase58(), " ... ");
    let tx,
      rx,
      params = {
        /** Address lookup table account to deactivate. */
        lookupTable: this.address,
        /** Account which is the current authority. */
        authority: this.dispatcher.signer.kp.publicKey,
      } as DeactivateLookupTableParams;

    console.time("Deactivate lookup table: " + this.address?.toBase58());
    tx = await this.dispatcher.v0Transaction([AddressLookupTableProgram.deactivateLookupTable(params)], null, false, 0, false);
    rx = await this.dispatcher.v0SignAndSend(tx.transaction, tx.strategy);
    console.timeEnd("Deactivate lookup table: " + this.address?.toBase58());
  }

  /**
   * Close lookup table and receive solana back
   *  NOTE! Transaction Fail if lookup is not fulli deactivated
   *  should wait
   * @returns transaction id
   */
  async close(): Promise<ParsedTransactionWithMeta> {
    console.log("Closing lookup table", this.address?.toBase58(), " ... ");
    let tx,
      rx,
      params = {
        /** Address lookup table account to close. */
        lookupTable: this.address,
        /** Account which is the current authority. */
        authority: this.dispatcher.signer.kp.publicKey,
        /** Recipient of closed account lamports. */
        recipient: this.dispatcher.signer.kp.publicKey,
      } as CloseLookupTableParams;

    console.time("Close lookup table: " + this.address?.toBase58());
    tx = await this.dispatcher.v0Transaction([AddressLookupTableProgram.closeLookupTable(params)], null, false, 0, false);
    rx = await this.dispatcher.v0SignAndSend(tx.transaction, tx.strategy);
    if (rx.meta?.err) throw rx.meta?.err;
    fs.unlinkSync(this.dispatcher.lookupTablesStorage + this.address?.toBase58() + ".lt");
    console.timeEnd("Close lookup table: " + this.address?.toBase58());
    return rx;
  }
}
