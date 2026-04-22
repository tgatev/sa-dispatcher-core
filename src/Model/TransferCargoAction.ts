import { InstructionReturn, ixToIxReturn } from "@staratlas/data-source";
import { BN } from "@project-serum/anchor";
import { PublicKey, SimulatedTransactionResponse, TransactionInstruction } from "@solana/web3.js";
import { Fleet, ShipStats } from "@staratlas/sage-main";
import { DockAction, StopMiningAction } from "../..";
import { iError, IncorrectFleetStateError } from "../Error/ErrorHandlers";
import { Action, iAction, iSimpleAction } from "./Action";
import { FleetProcess as Process } from "./FleetProcess";
import { Account as TokenAccount } from "@solana/spl-token";
import { iQueueItem } from "./Queue";
import chalk from "chalk";
import Dispatcher, { DispatcherParsedTransactionWithMeta } from "./Dispatcher";
import { formatTimePeriod } from "../utils";
import _ from "lodash";
import { CleanupCargoPodsAction } from "./CleanupCargoPodsAction";

/**
 *  TransferCargoAction
 * Define how to be transferred some amount from cargo A to cargo B
 * 
 * @property string cargoType string: contains fuel and ammo could be transferred to fuelTank/ammoBank or to cargoHold
 *                      null value is default for cargoHold
 *           when this property is used can transfer only fuel/ammo to the specific accounts.
 *  ---------------------------------------------------------------
 *          Tested Process of iCargoTransferData[]
// transfer ammunition to ammo bank account (additional cargo space)
// { amount: 120, cargoType: "ammoBank" , conditionCallback: (action) => {} }, // Ammo

    // [X] the Simple Case transfer 14 food to fleet cargoHold
   {isImportToFleet: true, resourceName: "food", amount: 14 },
    // [X] transfer 14 food to Starbase cargo cargoHold
   {isImportToFleet: false, resourceName: "food", amount: 14 },

    // [X] transfer fuel to cargo hold account as any other resource
   {isImportToFleet: true, amount: 120, resourceName: "fuel", cargoType: "cargoHold" },

    // [X] importToFleet cargo hold  5 fuel in cargoHold when in cargo hold have less then 5
   {isImportToFleet: true, resourceName: "fuel", amount: 5, condition: { whenLessThen: 5 } },

    // [X] Refill fuelTank with 445 when have less then 5
   {isImportToFleet: true, resourceName: "fuel", amount: 445, cargoType: "fuelTank", condition: { whenLessThen: 5 } },
   {isImportToFleet: true, resourceName: "ammunitions", amount: 50, cargoType: "ammoBank", condition: { whenMoreThen: 5 } },

    // [X] Refill ammoBank with 50 when have more then 50 in Starbase
   {isImportToFleet: true, resourceName: "ammunitions", amount: 50, cargoType: "ammoBank", condition: { whenMoreThen: 50 } },

    // [X] Transfer 50 Ammo from fleet ammoBank when have more then 50 in fleet
   {isImportToFleet: false, resourceName: "ammunitions", amount: 50, cargoType: "ammoBank", condition: { whenMoreThen: 5 } },

    // [X] Transfer All Cargo to fleet cargoHolds
   {isImportToFleet: false, resourceName: "ALL", amount: "MAX", cargoType: "cargoHold" },

   */
export class TransferCargoAction extends Action implements iAction, iSimpleAction {
  resources: iCargoTransferData[];
  static accumulatedTransactionCost = 0;
  static accumulatedRunTime = 0;
  transactionsCount: number = 1;
  waitCargoSupply: number = 150; // 2.5 minutes - retry to load cargo after waitCargoSupply [s]
  private stateBefore: string = ""; // Hash to validate state changes
  prepareInstructionCallback: ((action: TransferCargoAction) => Promise<iCargoTransferData[]>) | undefined;
  lastTransferAmounts = {
    import: {} as { [key: string]: number },
    export: {} as { [key: string]: number },
    total: {} as { [key: string]: any },
    byCargo: {} as { [key: string]: { [key: string]: number } },
  };

  constructor(
    process: Process,
    data: iCargoTransferData[],
    prepareInstructionCallback: ((action: TransferCargoAction) => Promise<iCargoTransferData[]>) | undefined = undefined,
  ) {
    super(process);
    this.resources = data;
    this.waitBeforeExecute = 2;
    this.prepareInstructionCallback = prepareInstructionCallback;
    // Define expected transactions count - todo: change after lookup tables are activated.
    this.transactionsCount = Math.ceil(data.length / 3);
  }

  accumulateFees() {
    this.results.execution.forEach((trx) => {
      //@ts-ignore
      this.results.transactionFees += trx?.meta?.fee || 0;
      TransferCargoAction.accumulatedTransactionCost += this.results.transactionFees || 0;
    });

    TransferCargoAction.accumulatedRunTime += this.results.runTime || 0;
    super.accumulateFees();
  }

  async buildAppendInstruction(callback: (process: Process) => Promise<iCargoTransferData[]>) {
    return await callback(this.process);
  }

  accumulateTransferredResources(cargo: string, resource: string, amount: number, type: "import" | "export") {
    if (!(cargo && resource && amount && type)) return;
    if (type == "import") {
      this.lastTransferAmounts.total[resource] = (this.lastTransferAmounts.total[resource] || 0) + amount;
      this.lastTransferAmounts.import[resource] = (this.lastTransferAmounts.import[resource] || 0) + amount;
      if (!this.lastTransferAmounts.byCargo[cargo]) {
        this.lastTransferAmounts.byCargo[cargo] = {};
      }
      this.lastTransferAmounts.byCargo[cargo][resource] = (this.lastTransferAmounts.byCargo[cargo][resource] || 0) + amount;
    } else {
      this.lastTransferAmounts.total[resource] = (this.lastTransferAmounts.total[resource] || 0) - amount;
      this.lastTransferAmounts.export[resource] = (this.lastTransferAmounts.export[resource] || 0) - amount;
      if (!this.lastTransferAmounts.byCargo[cargo]) {
        this.lastTransferAmounts.byCargo[cargo] = {};
      }
      this.lastTransferAmounts.byCargo[cargo][resource] = (this.lastTransferAmounts.byCargo[cargo][resource] || 0) - amount;
    }
  }

  async getQueueItem(executionTime: number = new Date().getTime()): Promise<iQueueItem<Action>> {
    //(Most often previous item is dock/transfer and next is undock )
    // Before queue item is generated could me dae additional checks
    return {
      action: this, // this.run will be executed by the queue processor
      execTime: executionTime, // Time to call exit warp
      // Action after execution // Could contain validations
      next: async (process: Process) => {
        // Could Set validations here
        return process.forward(); // go back to process chain forwarding
      },
    } as iQueueItem<Action>;
  }

  async getInstructionsReturns(): Promise<InstructionReturn[]> {
    let onFleet = await this.process.fetchFleetAccount();
    let stats: ShipStats = onFleet.data.stats;
    //@ts-ignore
    let ixs: InstructionReturn[] = [];

    let freeSpaces = await this.process.getFleetFreeSpaces();
    this.dispatcher.logger.dbg("Transfer From Fleet States:", Object.keys(onFleet.state));

    if (onFleet.state.StarbaseLoadingBay) {
      // no need additional instructions
    } else if (onFleet.state.Idle || onFleet.state.MoveWarp || onFleet.state.MoveSubwarp) {
      let da = new DockAction(this.process); // Dock Handles Fleet Movement sates as well
      ixs.push(...(await da.getInstructionsReturns()));
      if (onFleet.state.MoveSubwarp) {
        this.process.logger.log("Exclude burning fuel on exitSubwarp.", Number(onFleet.state.MoveSubwarp.fuelExpenditure));
        freeSpaces.fuelTank += Number(onFleet.state.MoveSubwarp.fuelExpenditure) || 0; // This fuel will burn on execution of the exit Subwarp
      }
    } else if (onFleet.state.MineAsteroid) {
      let exitMiningFallback = new StopMiningAction(this.process).getInstructionsReturns();
      ixs.push(...(await exitMiningFallback));
      let da = new DockAction(this.process); // Dock Handles Fleet Movement sates as well
      ixs.push(...(await da.getInstructionsReturns()));
    } else {
      throw new IncorrectFleetStateError("starbase loading bay", onFleet);
    }

    let cargoAmountsPerMint = await this.dispatcher.sageGameHandler.getAmountsByMints(onFleet.data.cargoHold);
    for (let cargoTransferData of this.resources) {
      // Todo: prepare callback  definitions - provide flow for NOT Previously generated instruction [#FLEXIBILITY]
      // if(cargoTransferData.amount.constructor.name === 'AsyncFunction'){
      //     // @ ts-ignore
      //     cargoTransferData.amount = await cargoTransferData.amount();
      // }

      // Check Transfer condition
      // If condition return false - should not transfer data
      if (cargoTransferData.condition) {
        let condition = new CargoCondition(cargoTransferData.condition);
        if (condition) {
          // this.process.logger.log("Condition created -> comparing data ...");
          let compareStatus = await condition.compare(this, cargoTransferData, onFleet);
          if (false === compareStatus) {
            // this.process.logger.log(" Skip Execution <COMPARETION_FAILED>");
            continue;
          }
        }
      }

      let resourceMint = this.dispatcher.sageGameHandler.getResourceMintAddress(cargoTransferData.resourceName);
      let weight = this.dispatcher.sageGameHandler.recourseWight.get(resourceMint);
      // cargoTransferData.condition
      this.process.logger.log("ImportToFleet:", cargoTransferData.isImportToFleet);
      let amount: number = 0;

      /**
       * ! IMPORTANT ! -  there is implemented check in transaction instruction if amount is bigger then existing to transfer existing amount
       */
      if (cargoTransferData.isImportToFleet) {
        // Cargo types to prepare
        switch (cargoTransferData.cargoType) {
          case "ammoBank":
            {
              amount = cargoTransferData.amount === "max" ? Math.floor(freeSpaces.ammoBank / (weight || 1)) : cargoTransferData.amount;
              if (amount > 0)
                // Transfer ammunitions to ammo bank account ( Ammo Only )
                ixs = ixs.concat(
                  await this.dispatcher.sageFleetHandler.ixDepositCargoToFleet(
                    onFleet.key,
                    onFleet.data.ammoBank,
                    this.dispatcher.sageGameHandler.getResourceMintAddress(cargoTransferData.resourceName),
                    new BN(amount),
                    this.dispatcher.signer.as,
                    this.dispatcher.funderPermissionIdex,
                  ),
                );
              this.accumulateTransferredResources(
                "ammoBank",
                cargoTransferData.resourceName,
                amount,
                cargoTransferData.isImportToFleet ? "import" : "export",
              );
            }
            break;
          case "fuelTank":
            {
              amount = cargoTransferData.amount === "max" ? Math.floor(freeSpaces.fuelTank / (weight || 1)) : cargoTransferData.amount;
              if (amount > 0)
                ixs = ixs.concat(
                  await this.dispatcher.sageFleetHandler.ixDepositCargoToFleet(
                    onFleet.key,
                    onFleet.data.fuelTank,
                    this.dispatcher.sageGameHandler.getResourceMintAddress(cargoTransferData.resourceName),
                    new BN(amount),
                    this.dispatcher.signer.as,
                    this.dispatcher.funderPermissionIdex,
                  ),
                );

              this.accumulateTransferredResources(
                "fuelTank",
                cargoTransferData.resourceName,
                amount,
                cargoTransferData.isImportToFleet ? "import" : "export",
              );
            }
            break;
          case "passengers":
            {
              amount =
                cargoTransferData.amount === "max"
                  ? stats.miscStats.passengerCapacity + stats.miscStats.requiredCrew - stats.miscStats.crewCount
                  : cargoTransferData.amount;
              if (amount > 0)
                ixs = ixs.concat(
                  await this.dispatcher.sageFleetHandler.ixLoadFleetCrew(
                    onFleet.key,
                    new BN(amount),
                    this.dispatcher.signer.as,
                    this.dispatcher.funderPermissionIdex,
                  ),
                );
              this.accumulateTransferredResources(
                "passengers",
                cargoTransferData.resourceName || "passenger",
                amount,
                cargoTransferData.isImportToFleet ? "import" : "export",
              );
            }
            break;
          default:
            {
              // Process resources to cargoHold all types of resources could be putted here
              this.process.logger.log(
                "import ",
                cargoTransferData.resourceName,
                ":",
                freeSpaces.cargoHold,
                Math.floor(freeSpaces.cargoHold / (weight || 1)),
                cargoTransferData.amount,
              );
              // onFleet.state.StarbaseLoadingBay?.starbase
              // Get Starbase Player Cargo Pod  and check amount
              amount = cargoTransferData.amount === "max" ? Math.floor(freeSpaces.cargoHold / (weight || 1)) : cargoTransferData.amount;
              if (amount > 0)
                ixs = ixs.concat(
                  await this.dispatcher.sageFleetHandler.ixDepositCargoToFleet(
                    onFleet.key,
                    onFleet.data.cargoHold,
                    this.dispatcher.sageGameHandler.getResourceMintAddress(cargoTransferData.resourceName),
                    new BN(amount),
                    this.dispatcher.signer.as,
                    this.dispatcher.funderPermissionIdex,
                  ),
                );
              this.accumulateTransferredResources(
                "cargoHold",
                cargoTransferData.resourceName || "passenger",
                amount,
                cargoTransferData.isImportToFleet ? "import" : "export",
              );
            }
            break;
        }
      } else {
        /***
         * ! isImportToFleet = false  - means transfer from fleet to starbase cargo pods or to specific starbase accounts (fuelTank/ammoBank)
         */
        // Process Export From Fleet
        let amountsPerMint: Map<string, number>;
        if (
          (cargoTransferData.resourceName.toUpperCase() == "ALL" && cargoTransferData.cargoType == "cargoHold") ||
          cargoTransferData.amount == "max"
        ) {
          // max Means max amount of the resource
          // There is implemented check in transaction instruction if amount is bigger then existing to transfer existing amount
          // That mean we could use the cargo capacity for amount
          // cargoTransferData.amount = Number.MAX_SAFE_INTEGER;
          this.process.logger.log("Instruction to unload on max..!");
        }
        // process export
        // from cargo type to starbase cargo
        switch (cargoTransferData.cargoType) {
          case "ammoBank":
            {
              // Instruct the fleet to deposit the mined resources (note, use very large amount to deposit all)
              amountsPerMint = await this.dispatcher.sageGameHandler.getAmountsByMints(onFleet.data.ammoBank, [resourceMint]);
              if (amountsPerMint.get(resourceMint.toBase58()) === 0) {
                break;
              }
              this.process.logger.log("ammoBank:", amountsPerMint);

              amount = cargoTransferData.amount === "max" ? amountsPerMint.get(resourceMint.toBase58()) || 0 : cargoTransferData.amount;
              if (amount > 0)
                ixs = ixs.concat(
                  await this.dispatcher.sageFleetHandler.ixWithdrawCargoFromFleet(
                    onFleet.key,
                    resourceMint,
                    new BN(amount), // new BN(9_999_999),
                    onFleet.data.ammoBank, // Fleet  Cargo account,
                    this.dispatcher.signer.as,
                    this.dispatcher.funderPermissionIdex,
                  ),
                );

              this.accumulateTransferredResources(
                "ammoBank",
                cargoTransferData.resourceName,
                amount,
                cargoTransferData.isImportToFleet ? "import" : "export",
              );
              // Transfer ammunitions to ammo bank account
            }
            break;

          case "fuelTank": {
            amountsPerMint = await this.dispatcher.sageGameHandler.getAmountsByMints(onFleet.data.fuelTank, [resourceMint]);
            if (amountsPerMint.get(resourceMint.toBase58()) === 0) {
              break;
            }
            this.process.logger.log("fuelTank:", amountsPerMint);
            // Transfer fuel to fuel thank account
            amount = cargoTransferData.amount === "max" ? amountsPerMint.get(resourceMint.toBase58()) || 0 : cargoTransferData.amount;

            ixs = ixs.concat(
              await this.dispatcher.sageFleetHandler.ixWithdrawCargoFromFleet(
                onFleet.key,
                resourceMint,
                new BN(amount), // new BN(9_999_999),
                onFleet.data.fuelTank, // Fleet Cargo account
                this.dispatcher.signer.as,
                this.dispatcher.funderPermissionIdex,
              ),
            );
            this.accumulateTransferredResources(
              "fuelTank",
              cargoTransferData.resourceName,
              amount,
              cargoTransferData.isImportToFleet ? "import" : "export",
            );
            break;
          }
          case "passengers":
            {
              let amount =
                cargoTransferData.amount === "max" ? stats.miscStats.crewCount - stats.miscStats.requiredCrew : cargoTransferData.amount;
              if (amount > 0)
                ixs = ixs.concat(
                  await this.dispatcher.sageFleetHandler.ixUnloadFleetCrew(
                    onFleet.key,
                    new BN(amount),
                    this.dispatcher.signer.as,
                    this.dispatcher.funderPermissionIdex,
                  ),
                );
              this.accumulateTransferredResources(
                "passengers",
                cargoTransferData.resourceName,
                amount,
                cargoTransferData.isImportToFleet ? "import" : "export",
              );
            }
            break;
          default:
            {
              if (cargoTransferData.resourceName.toUpperCase() == "ALL") {
                if (cargoTransferData.amount == "max" || cargoTransferData.percent == 1) {
                  for (let [mint, a] of cargoAmountsPerMint) {
                    if (a > 0) {
                      ixs = ixs.concat(
                        await this.dispatcher.sageFleetHandler.ixWithdrawCargoFromFleet(
                          onFleet.key,
                          new PublicKey(mint),
                          new BN(a), // new BN(9_999_999),
                          onFleet.data.cargoHold, // Fleet Cargo account
                          this.dispatcher.signer.as,
                          this.dispatcher.funderPermissionIdex,
                        ),
                      );
                      this.accumulateTransferredResources(
                        "cargoHold",
                        this.dispatcher.sageGameHandler.getResourceNameByMint(new PublicKey(mint)),
                        a,
                        cargoTransferData.isImportToFleet ? "import" : "export",
                      );

                      cargoAmountsPerMint.set(mint, 0); // set to 0 to prevent double counting if multiple ALL instructions exist - to be sure that all resources will be transfered in case of multiple ALL instructions with different conditions - protect instruction mishmash
                    }
                  }
                } else if (cargoTransferData.percent && cargoTransferData.percent > 0 && cargoTransferData.percent < 1) {
                  for (let [mint, a] of cargoAmountsPerMint) {
                    // Transfer 1 more if possible - to avoid import to fleet space calculation problems problems
                    let amountToTransfer = Math.ceil(a * cargoTransferData.percent);
                    if (amountToTransfer > 0) {
                      ixs = ixs.concat(
                        await this.dispatcher.sageFleetHandler.ixWithdrawCargoFromFleet(
                          onFleet.key,
                          new PublicKey(mint),
                          new BN(amountToTransfer), // new BN(9_999_999),
                          onFleet.data.cargoHold, // Fleet Cargo account
                          this.dispatcher.signer.as,
                          this.dispatcher.funderPermissionIdex,
                        ),
                      );

                      this.accumulateTransferredResources(
                        "cargoHold",
                        this.dispatcher.sageGameHandler.getResourceNameByMint(new PublicKey(mint)),
                        amount,
                        cargoTransferData.isImportToFleet ? "import" : "export",
                      );
                      cargoAmountsPerMint.set(mint, Math.max(0, a - amountToTransfer)); // set to 0 to prevent double counting if multiple ALL instructions exist - to be sure that all resources will be transfered in case of multiple ALL instructions with different conditions - protect instruction mishmash
                    }
                  }
                } else {
                  throw new Error("Invalid amount or percent for Export ALL resources instruction.");
                }
                continue;
              } else {
                // Move Out to reduce Costs
                amountsPerMint = cargoAmountsPerMint;
                this.process.logger.log("CargoHold: amountsPerMint", amountsPerMint);
                this.process.logger.log("CargoHold: resource mint", resourceMint, amountsPerMint.get(resourceMint.toBase58()) === 0);
                if (amountsPerMint.get(resourceMint.toBase58()) === 0) {
                  break;
                }

                // Take Priority on top of flat amounts
                if (cargoTransferData.percent && cargoTransferData.percent > 0 && cargoTransferData.percent < 1) {
                  // ! Percent is based on cargo capacity
                  amount = Math.ceil(stats.cargoStats.cargoCapacity * cargoTransferData.percent);
                } else {
                  // Process resources to
                  amount = cargoTransferData.amount === "max" ? amountsPerMint.get(resourceMint.toBase58()) || 0 : cargoTransferData.amount;
                }

                // Track exported amount - always positive or 0
                amountsPerMint.set(resourceMint.toBase58(), Math.max(0, (amountsPerMint.get(resourceMint.toBase58()) || 0) - amount));
                // prevent fake instructions with 0 amount - keep transaction light
                if (amount > 0)
                  ixs = ixs.concat(
                    await this.dispatcher.sageFleetHandler.ixWithdrawCargoFromFleet(
                      onFleet.key,
                      resourceMint,
                      new BN(amount), // new BN(9_999_999),
                      onFleet.data.cargoHold, // Fleet Cargo account

                      this.dispatcher.signer.as,
                      this.dispatcher.funderPermissionIdex,
                    ),
                  );
                this.accumulateTransferredResources(
                  "cargoHold",
                  cargoTransferData.resourceName,
                  amount,
                  cargoTransferData.isImportToFleet ? "import" : "export",
                );
              }
            }
            break;
        }
      }
    }

    return ixs;
  }

  async getInstructions(): Promise<TransactionInstruction[]> {
    if (this.prepareInstructionCallback) this.resources.push(...(await this.prepareInstructionCallback(this)));
    let ixs = await this.getInstructionsReturns();
    if (ixs.length > 0) {
      return await this.dispatcher.sageGameHandler.convertInstructionReturnToTransactionInstruction(this.dispatcher.signer.as, ixs);
    }
    return [];
  }

  /**
   * Execute transfer:
   *  - !!! R4 costs calculation sign is like:
   *     '+' on cargo load to fleet,
   *     '-' deposit cargo to starbase.
   *
   * @param onFleet
   * @return
   */
  async execute(): Promise<Array<DispatcherParsedTransactionWithMeta | SimulatedTransactionResponse | undefined>> {
    let ixs = [] as InstructionReturn[];
    let rx: DispatcherParsedTransactionWithMeta[] = [];

    let fleetAccount = this.process.fleetAccount || (await this.process.fetchFleetAccount());

    /**
     * Provide Instruction at runtime
     *   -- If can't supply resource from starbase to fleet wait and retry to generate instructions
     */
    while (1) {
      try {
        // This Check Could me moved in CATCH Block
        if (fleetAccount.state.StarbaseLoadingBay?.starbase) {
          // this.dispatcher.logger.log("---------- * TransferCargo::Execute * ------------");
          // let cleanupInstructions = await this.dispatcher.sageGameHandler.ixCleanUpStarbaseCargoPods(
          //   // this.dispatcher.playerProfile,
          //   // this.dispatcher.signer.as,
          //   // this.dispatcher.funderPermissionIdex
          //   fleetAccount.state.StarbaseLoadingBay.starbase,
          //   this.dispatcher.sageGameHandler.getFleetPlayerProfile(fleetAccount),
          //   this.dispatcher.signer.as,
          //   this.dispatcher.funderPermissionIdex
          // );
          // this.dispatcher.logger.log("---------- * TransferCargo::Execute * ------------");
          // this.dispatcher.logger.log("POD CLEANUPS ", cleanupInstructions.length);
          // this.dispatcher.logger.log("---------- * TransferCargo::Execute * ------------");
          // if (cleanupInstructions && cleanupInstructions.length > 0) {
          //   try {
          //     let r = await this.dispatcher.signAndSend(cleanupInstructions, true, this.priorityFeeConfig || undefined); // send empty transaction to avoid 'Transaction too old' error on long operations
          //     this.dispatcher.logger.log("Pod Cleanup transaction", r.length);
          //   } catch (e) {
          //     this.dispatcher.logger.err("Pod Cleanup transaction", String(e)); // cut long error messages
          //   }
          // }

          // ! Merge cargo pods before transfer to avoid missing resources
          let rx_0 = await new CleanupCargoPodsAction(this.process).execute();
          rx.push(rx_0 as unknown as DispatcherParsedTransactionWithMeta);
        }

        ixs = await this.getInstructionsReturns();
        // if (fleetAccount.state.StarbaseLoadingBay?.starbase) {
        //   let handleStarbaseState = await this.dispatcher.sageFleetHandler.ixFleetStateStarbaseHandler(fleetAccount.key);

        //   ixs.unshift(...handleStarbaseState);
        // }
        break; // exit loop on success
      } catch (err) {
        // When cant supply cargo to fleet -> may wait until cargo is loaded.
        if (this.waitCargoSupply && this.waitCargoSupply > 0) {
          this.process.dispatcher.logger.err(String(err));
          this.process.dispatcher.logger.info("Repeat after: ", formatTimePeriod(this.waitCargoSupply));

          await new Promise((resolve) => setTimeout(resolve, this.waitCargoSupply * 1000));
          continue;
        } else {
          throw err;
        }
      }
    }
    // send transaction
    if (ixs.length > 0) {
      this.stateBefore = JSON.stringify(await this.process.fetchCargoStates());
      //! Pre Chunking Instructions to have a single transaction response - Important for validation to be able to verify after 'false timeout'
      // let ixsChunks = _.chunk(ixs, this.dispatcher.maxInstructions || 100); //
      // Get Chunks mainly to use the chunk sizing
      let chunks = await this.dispatcher.prepareInstructionChunks(ixs, !!this.priorityFeeConfig.enable);
      for (let i = 0; i < chunks.length; i++) {
        // Convert to InstructionReturn ix.signers is the same as Dispatcher.signer.as
        let ixReturnChunk = chunks[i].instructions.map((ix) => {
          return ixToIxReturn(ix.instruction, ix.signers);
        }); // To avoid unused variable warning
        // let ixChunk =
        try {
          rx.push(
            ...(await this.dispatcher.signAndSend(ixReturnChunk, false, this.priorityFeeConfig, {
              //@ts-ignore args not used
              retryOnTimeout: async (d: Dispatcher, e) => {
                // ! 6096 - FLeet destroyed - cant reload don't repeat
                if (e.trErr?.err?.InstructionError[1]?.Custom == 6096) {
                  // ! This action case  will be aborted with abort signal
                  this.signals.abort.state = true;
                  this.signals.abort.data.reason = "Fleet is destroyed - can't reload cargo";
                  this.signals.abort.data.message = "Fleet is destroyed - can't reload cargo";
                  return true; // False means - Do Not Repeat
                }

                // Wait new block before validation - 1 block is around 3 seconds
                await new Promise((resolve) => setTimeout(resolve, 4000));
                this.dispatcher.logger.err("VALIDATE-TIMEOUT: TRANSFER-CARGO:", "this.stateBefore", this.stateBefore);
                let executed: boolean = this.stateBefore !== JSON.stringify(await this.process.fetchCargoStates());
                // If the state is not the same as before transaction start then transactions is executed
                this.dispatcher.logger.err(
                  "VALIDATE-TIMEOUT: TRANSFER-CARGO:",
                  "executed",
                  executed,
                  executed ? "Transaction was Executed" : "NOT Executed - retrying ...",
                );
                return !executed; // False means - Do Not Repeat timeout is 'false timeout' so continue script execution
              },
              signals: this.signals,
            })),
          );
          // rx[0].transaction.signatures
          // refresh state and continue iterations
          this.stateBefore = JSON.stringify(await this.process.fetchCargoStates());
        } catch (e) {
          this.dispatcher.logger.err("---------- * TransferCargo::Execute CATCH * ------------");
          this.dispatcher.logger.err(e);
          this.dispatcher.logger.err("---------- * TransferCargo::Execute CATCH * ------------");
          // throw e;
        }
      }

      return rx;
    }

    return [];
  }

  /**
   * Verify action execution
   * @param args
   * @returns
   */
  //@ts-ignore args not used
  async verifyExecution(args: any) {
    // console.log("TransferCargoAction::verifyExecution::", this.results.execution.length, this.results.execution[this.results.execution.length - 1]);
    if (
      this.results.execution &&
      this.results.execution.length &&
      this.results.execution[this.results.execution.length - 1] === undefined
    ) {
      return false;
    }
    return true;
  }

  async validate(): Promise<boolean | iError> {
    // To Do
    // check Fleet Existence
    // check Fleet state to be docked in starbase
    // Has Needed amount
    // Have enough cargo space
    return await super.validate();
  }

  async display(verbose = false): Promise<string> {
    let display = "";
    let counter = 0;

    this.resources.forEach((e) => {
      display +=
        (e.isImportToFleet ? chalk.green("\tImport") : chalk.red("\tExport")) +
        ` resource: ${chalk.yellowBright(chalk.underline(chalk.bold(e.resourceName)))}, ${chalk.magentaBright(
          e.amount,
        )}, cargo: ${chalk.cyan(e.cargoType || "cargoHold")} ` +
        (e.condition?.whenLessThen != undefined ? `<whenLessThen> {${chalk.cyanBright(e.condition?.whenLessThen)}}` : ``) +
        (e.condition?.whenMoreThen != undefined ? `<whenMoreThen> {${chalk.cyanBright(e.condition?.whenMoreThen)}}` : ``) +
        `\n`;
      if (++counter >= 3) {
        this.transactionsCount++;
        counter = 0;
      }
    });

    verbose && this.process.logger.info(display);
    display = `TransferCargoAction: T<${this.getTransactionCount()}> \n` + display;

    return display;
  }

  getTransactionCount() {
    return TransferCargoAction.transactionsCount;
  }

  /**@inheritdoc */
  async export(type: string = "", data: any = {}): Promise<string> {
    return await Action.prototype.export.bind(this)(type, {
      resources: this.resources,
      transactionsCount: this.transactionsCount,
      waitCargoSupply: this.waitCargoSupply, // 2.5 minutes - retry to load cargo after waitCargoSupply [s]
      ...data,
    });
  }
}

export interface iCargoCondition {
  whenMoreThen?: number; // cargo from is more then
  whenLessThen?: number | "max"; // Cargo to is less then
  callback?: (action: TransferCargoAction, resourceData: iCargoTransferData, onFleet: Fleet) => Promise<boolean>;
}

export interface iCargoTransferData {
  amount: number | "max";
  resourceName: string | "ALL";
  resourceMint?: PublicKey;
  isImportToFleet: boolean;
  // percent: boolean;
  cargoType?: "ammoBank" | "fuelTank" | "cargoHold" | "passengers";
  condition?: iCargoCondition;
  percent?: number; // 0-1 - percent of free space or amount to transfer - optional
}

/**
 * Provide conditions for cargo loadings
 *
 */
export class CargoCondition implements iCargoCondition {
  whenMoreThen?: number;
  whenLessThen?: number | "max";
  callback?: (action: TransferCargoAction, resourceData: iCargoTransferData, onFleet: Fleet) => Promise<boolean>;

  constructor(data: iCargoCondition) {
    this.whenMoreThen = data.whenMoreThen; //Is more then condition applied on Cargo from
    this.whenLessThen = data.whenLessThen; //Is less then condition applied on Cargo to
    this.callback = data.callback;
  }
  private async getOwnerTokenAccountByCargoType(
    cargoType: string | undefined,
    resourceName: string,
    action: TransferCargoAction,
    onFleet: Fleet,
  ): Promise<TokenAccount | undefined> {
    switch (cargoType) {
      // Ammo bank balance is greater then is lower
      case "ammoBank":
        {
          // Amo account in the in fleet ammoBank
          return await action.dispatcher.sageGameHandler.getOwnerTokenAccountByMintForCargo(
            onFleet.data.ammoBank,
            action.dispatcher.sageGameHandler.getResourceMintAddress(resourceName),
          );
        }
        break;
      // Fuel thank balance is greater then is lower
      case "fuelTank": {
        return await action.dispatcher.sageGameHandler.getOwnerTokenAccountByMintForCargo(
          onFleet.data.fuelTank,
          action.dispatcher.sageGameHandler.getResourceMintAddress(resourceName),
        );
        break;
      }
      // CargoHold Or no defined value
      default:
        return await action.dispatcher.sageGameHandler.getOwnerTokenAccountByMintForCargo(
          onFleet.data.cargoHold,
          action.dispatcher.sageGameHandler.getResourceMintAddress(resourceName),
        );
        break;
    }
  }

  /**
   * Conditions compare useful for transportation tasks
   *
   * @param action
   * @param resourceData
   * @param onFleet
   * @returns
   */
  async compare(action: TransferCargoAction, resourceData: iCargoTransferData, onFleet: Fleet): Promise<boolean | number> {
    if (this.whenLessThen && this.whenMoreThen != undefined) {
      throw "Condition could not contain whenLessThen and whenMoreThen at the same time.";
    }

    // Redirect to callback when exists
    if (this.callback) {
      return await this.callback(action, resourceData, onFleet);
    }

    Dispatcher.Logger.log("   isImportToFleet:", resourceData.isImportToFleet, resourceData.resourceName, ": ", resourceData.amount);
    // Is import to fleet
    if (resourceData.isImportToFleet) {
      // Greater Then - Check Amounts in Starbase Cargo
      if (this.whenMoreThen != undefined) {
        // .condition.whenMoreThen X in cargo from  (Starbase cargo)
        let tokenAccount: TokenAccount | undefined;
        tokenAccount = await action.dispatcher.sageGameHandler.getOwnerTokenAccountByMintForCargo(
          //@ts-ignore - this value is checked earlier
          onFleet.state.StarbaseLoadingBay?.starbase,
          action.dispatcher.sageGameHandler.getResourceMintAddress(resourceData.resourceName),
        );

        Dispatcher.Logger.log("whenMoreThen:");
        Dispatcher.Logger.log(
          "CargoType: ",
          resourceData.cargoType,
          "Resource Name: ",
          resourceData.resourceName,
          "Token Amount: ",
          Number(tokenAccount?.amount),
        );

        let tokenMintAmount: number = parseInt(tokenAccount?.amount.toString() || "0", 10);

        Dispatcher.Logger.log(` * whenMoreThen ( ${tokenMintAmount} > ${this.whenMoreThen} ) - Starbase Account amount is compared`);
        if (tokenMintAmount > this.whenMoreThen) {
          return tokenMintAmount;
        } else {
          return false;
        }
      } else if (this.whenLessThen) {
        // .condition.whenLessThen X in cargo to (FleetCargo(s)) ... context is import to fleet so we compare cargoHold or ammoBank/fuelTank - depends of resourceData.cargoType
        let tokenAccount = await this.getOwnerTokenAccountByCargoType(resourceData.cargoType, resourceData.resourceName, action, onFleet);
        let lessThen: number = 0;
        if (this.whenLessThen === "max") {
          switch (resourceData.cargoType) {
            case "ammoBank":
              //@ts-ignore ammoCapacity, fuelCapacity, cargoCapacity - type never
              lessThen = onFleet.data.stats.cargoStats.ammoCapacity;
              break;
            case "fuelTank":
              //@ts-ignore
              lessThen = onFleet.data.stats.cargoStats.fuelCapacity;
              break;
            default:
              //@ts-ignore
              lessThen = onFleet.data.stats.cargoStats.cargoCapacity;
              break;
          }
        } else {
          lessThen = this.whenLessThen;
        }
        Dispatcher.Logger.log("whenLessThen:");
        Dispatcher.Logger.log(
          "CargoType: ",
          resourceData.cargoType,
          "Resource Name: ",
          resourceData.resourceName,
          "Token Amount: ",
          tokenAccount?.amount,
        );

        let tokenMintAmount: number = parseInt(tokenAccount?.amount.toString() || "0", 10);
        // When Fleet was not exit from subwarp and cargoType is fuelTank - fuel amount is still not spend
        if (resourceData.cargoType == "fuelTank" && onFleet && onFleet.state.MoveSubwarp) {
          tokenMintAmount -= Number(onFleet.state.MoveSubwarp.fuelExpenditure) || 0;
        }

        Dispatcher.Logger.log(` * whenLessThen ( ${tokenMintAmount} < ${lessThen} ) - Fleet Account amount is compared`);
        if (tokenMintAmount < lessThen) {
          return tokenMintAmount;
        } else {
          return false;
        }
      }
    } else {
      // Greater Then
      if (this.whenMoreThen != undefined) {
        //  Cargo to is StarBase , when more then X in cargo from (FleetCargo(s))
        let tokenAccount = await this.getOwnerTokenAccountByCargoType(resourceData.cargoType, resourceData.resourceName, action, onFleet);

        Dispatcher.Logger.log("whenMoreThen:");
        Dispatcher.Logger.log(
          "CargoType: ",
          resourceData.cargoType,
          "Resource Name: ",
          resourceData.resourceName,
          "Token Amount: ",
          tokenAccount?.amount,
        );

        let tokenMintAmount: number = parseInt(tokenAccount?.amount.toString() || "0", 10);

        Dispatcher.Logger.log(` * whenMoreThen ( ${tokenMintAmount} > ${this.whenMoreThen} ) - Starbase Account amount is compared`);

        if (tokenMintAmount > this.whenMoreThen) {
          return tokenMintAmount;
        } else {
          return false;
        }
      } else if (this.whenLessThen) {
        // Cargo to is StarBase , when less then X in cargo to (Starbase)
        let tokenAccount = await action.dispatcher.sageGameHandler.getOwnerTokenAccountByMintForCargo(
          //@ts-ignore - this value is checked earlier
          onFleet.state.StarbaseLoadingBay?.starbase,
          action.dispatcher.sageGameHandler.getResourceMintAddress(resourceData.resourceName),
        );

        let lessThen: number = 0;
        if (this.whenLessThen === "max") {
          switch (resourceData.cargoType) {
            case "ammoBank":
              //@ts-ignore ammoCapacity, fuelCapacity, cargoCapacity - type never
              lessThen = onFleet.data.stats.cargoStats.ammoCapacity;
              break;
            case "fuelTank":
              //@ts-ignore
              lessThen = onFleet.data.stats.cargoStats.fuelCapacity;
              break;
            default:
              //@ts-ignore
              lessThen = onFleet.data.stats.cargoStats.cargoCapacity;
              break;
          }
        } else {
          lessThen = this.whenLessThen;
        }
        Dispatcher.Logger.log("whenLessThen:");
        Dispatcher.Logger.log(
          "CargoType: ",
          resourceData.cargoType,
          "Resource Name: ",
          resourceData.resourceName,
          "Token Amount: ",
          tokenAccount?.amount,
        );

        let tokenMintAmount: number = parseInt(tokenAccount?.amount.toString() || "0", 10);

        Dispatcher.Logger.log(` * whenLessThen ( ${tokenMintAmount} < ${lessThen} ) - Starbase Account amount is compared`);
        // Lower Then
        if (tokenMintAmount < lessThen) {
          return tokenMintAmount;
        } else {
          return false;
        }
      }
    }

    return true;
  }
}
