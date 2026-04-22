import { SimulatedTransactionResponse, TransactionInstruction } from "@solana/web3.js";
import { Action, iAction, iActionR4Cost } from "./Action";
import { FleetProcess as Process } from "./FleetProcess";
import { iQueueItem } from "./Queue";
import { iParsedScanLog, SDUProbabilityProcessor } from "./SDUProbabilityProcessor";
import { iCoordinates } from "./MoveAction";
import { ExitSubwarpAction } from "./ExitSubwarpAction";
import { ExitWarpAction } from "./ExitWarpAction";
import { InstructionReturn, createAssociatedTokenAccountIdempotent } from "@staratlas/data-source";
import { ShipStats } from "@staratlas/sage-main";
import { clone } from "lodash";
import Dispatcher, { DispatcherParsedTransactionWithMeta, iPriorityFeeConfig } from "./Dispatcher";
import { iActionSignals } from "../Common/Interfaces";
export const DEFAULT_LOOK_AROUND_RANGE = 0;
export const DEFAULT_LOOK_AROUND_SCANS_TRIGGER = 1;
export const DEFAULT_LOOK_AROUND_MIN_DIFF = 8;
export const DEFAULT_LOOK_AROUND_MOVE_TYPE = "Subwarp";
export interface iScanConfig {
  minChance: number;
  secondsLimiter: number; // 10
  targetAreaSize: number; // 3
  // Point center for AreaSize
  targetSector: iCoordinates; // { x: 10; y: 15 };
  targetAreaType: "Square" | "Circle";
  scanSector?: iCoordinates;
  lookAround?: { size?: number; trigger?: number; diff?: number; moveType: "Warp" | "Subwarp" | "Hybrid"; moveAfterFound: boolean };
  movementTypes: {
    initial: "Warp" | "Subwarp" | "Hybrid";
    relocate: "Warp" | "Subwarp" | "Hybrid";
  };
  stopOnRefill: boolean;
  actionSignals?: iActionSignals;
}

export type ParsedScanResult = {
  fleet: string;
  timeCost: number;
  type: string;
  simulation: boolean;
  r4cost: iActionR4Cost;
  transactionsCost: number;
  scanResult: iParsedScanLog;
  txSignature: string;
  prioritySetting: iPriorityFeeConfig;
  totalRetries: number;
  donation: number;
  priorityApplied: number;
  accounts: number;
};

export const BASE_SCAN_CONFIG = {
  minChance: 0.1,
  secondsLimiter: 10,
  targetAreaSize: 3,
  targetSector: { x: 0, y: 0 },
  targetAreaType: "Square",
  lookAround: {
    size: DEFAULT_LOOK_AROUND_RANGE,
    trigger: DEFAULT_LOOK_AROUND_SCANS_TRIGGER,
    diff: DEFAULT_LOOK_AROUND_MIN_DIFF,
    moveType: DEFAULT_LOOK_AROUND_MOVE_TYPE,
    moveAfterFound: false,
  },
  movementTypes: {
    initial: "Subwarp",
    relocate: "Subwarp",
  },
  stopOnRefill: false,
} as iScanConfig;
/**
 * Provide scan action mechanic
 */
export class ScanAction extends Action implements iAction {
  scanConfig: iScanConfig;
  static accumulatedTransactionCost = 0;
  static accumulatedRunTime = 0;
  static transactionsCount: number = 1;
  doNotSimulate: boolean = true;

  constructor(process: Process, scanConfig: iScanConfig) {
    super(process);
    this.scanConfig = scanConfig;
  }

  accumulateFees() {
    this.results.execution.forEach((trx) => {
      //@ts-ignore
      this.results.transactionFees += trx?.meta?.fee || 0;
      ScanAction.accumulatedTransactionCost += this.results.transactionFees || 0;
    });

    ScanAction.accumulatedRunTime += this.results.runTime || 0;
    super.accumulateFees();
  }

  //
  async getQueueItem(): Promise<iQueueItem<iAction>> {
    // Provide item to execute scan by action.run
    let item = {
      action: this,
      execTime: new Date().getTime(),
      next: async (process: Process) => {
        return process.forward();
      },
    } as iQueueItem<iAction>;
    return item;
  }

  /**
   * Provide Scan InstructionReturn[]
   * @returns
   */
  async getInstructionsReturns(): Promise<InstructionReturn[]> {
    let ixs = await this.dispatcher.sageFleetHandler.ixSduSectorScan(
      await this.process.fetchFleetPublicKey(),
      this.process.dispatcher.signer.as,
      this.dispatcher.funderPermissionIdex,
    );
    this.process.logger.log("IXS RETURNS ", ixs.length);

    return ixs;
  }

  /**
   * Provide Scan TransactionInstruction[]
   * @returns
   */
  async getInstructions(): Promise<TransactionInstruction[]> {
    return await this.dispatcher.sageGameHandler.convertInstructionReturnToTransactionInstruction(
      this.process.dispatcher.signer.as,
      await this.getInstructionsReturns(),
    );
  }

  async execute(): Promise<Array<DispatcherParsedTransactionWithMeta | SimulatedTransactionResponse | undefined>> {
    let fleetAccount = await this.process.fetchFleetAccount();
    if (fleetAccount.data.scanCooldownExpiresAt * 1000 < new Date().getTime()) {
      await new Promise((resolve) => setTimeout(resolve, fleetAccount.data.scanCooldownExpiresAt * 1000 - new Date().getTime()));
    }

    if (fleetAccount.state.MoveSubwarp) {
      // console.log(">>> EXIT SUBWARP <<<");
      await new ExitSubwarpAction(this.process).run();
    } else if (fleetAccount.state.MoveWarp) {
      // console.log(">>> EXIT WARP <<<");
      await new ExitWarpAction(this.process).run();
    }

    if (!this.scanConfig) {
      this.scanConfig = BASE_SCAN_CONFIG;
    }

    let scanRequest = async () => {
      let dispatcher = clone(this.dispatcher);
      dispatcher.donate = false;
      let doNotSimulate = this.doNotSimulate;
      if (doNotSimulate == false) {
        doNotSimulate = this.scanConfig?.minChance > 0 ? false : true;
      }
      console.log(">>> <<<<<SEND SCAN REQUEST>>>>> <<<", { doNotSimulate, minChance: this.scanConfig?.minChance });
      let rx = await dispatcher.signAndSend(await this.getInstructionsReturns(), false, this.priorityFeeConfig, {
        signals: this.signals,
        doNotSimulate: doNotSimulate, // Skip simulation when minChance is not set - assume that user want to execute all scans without checking chances
      });
      // console.log(">>> SCAN REQUEST DONE <<<");
      // Always 1 transaction
      let trx = rx[rx.length - 1];
      let logs = trx.meta?.logMessages || [];
      let results = SDUProbabilityProcessor.parseSduLogs(logs);
      // console.log(">>> SCAN REQUEST RESULT <<<", results);
      this.process.logger.log(this.process.fleetName, "Scan Result:", results);
      // console.error("rx", rx);
      return rx;
    };

    try {
      let result;
      let ixs = await this.getInstructions();
      let execStatus = true;

      // try to turn of scan simulation
      // this.scanConfig.minChance = -0.1;
      // let tx = await this.dispatcher.v0Transaction(ixs, [], false);
      // execute simulation before time end of the minute -> possibly reduce scan rate per minute if simulation is too slow
      if (this.scanConfig?.minChance && Number(this.scanConfig?.minChance) > 0 && this.doNotSimulate != true) {
        let tx = await this.dispatcher.v0Transaction(ixs, [], false, 0, false);
        // this.process.logger.log("<<<< Simulation Scan >>>", tx);
        let srx = await this.dispatcher.v0Simulate(tx.transaction);
        // Simulation Logs
        result = SDUProbabilityProcessor.parseSduLogs(srx.value.logs || []);
        this.process.logger.log("*** SCAN *** Simulation *** ", result);
        console.log(">>> SIMULATION SCAN RESULT <<<", srx.value.logs, result);
        // console.log(
        //   " CHECK ??? result?.data.sduChance < this.scanConfig?.minChance",
        //   Number(result?.data.sduChance) < Number(this.scanConfig?.minChance || 0)
        // );
        if (result?.sector == "") {
          execStatus = true; /// Force executions when sector is missing
          // result.data.sduChance = 1;
        }
        if (Number(result?.data.sduChance) < Number(this.scanConfig?.minChance || 0)) {
          execStatus = false;
          return [srx.value];
        }
      }
      if (execStatus) {
        // console.log(">>> EXECUTE SCAN <<<");
        return await scanRequest();
      }
    } catch (e: any) {
      console.error(" >>> ScanAction error catch: ", e.constructor.name);
      if (e.constructor.name === "ScanMissingSduTokenInFleet") {
        // Create SDU token account - cant be in the same instruction with the scanning
        const ataSduTokenTo = await createAssociatedTokenAccountIdempotent(e.mint, e.cargoPod, true);
        // @ts-ignore - assign new value
        let instructions = ataSduTokenTo.instructions;
        //@ts-ignore
        await this.dispatcher.signAndSend([instructions], false, this.priorityFeeConfig);
        return await scanRequest();
      }
      console.error(e);
    }
    return [];
  }

  async display(verbose = false): Promise<string> {
    let display = `Scan: T<${this.getTransactionCount()}> minChance: ${this.scanConfig.minChance}`;
    verbose && this.process.logger.info(display);

    return display;
  }

  getTransactionCount() {
    return ScanAction.transactionsCount;
  }

  async getResourceCost(): Promise<iActionR4Cost> {
    let stats = this.process.fleetAccount?.data.stats as ShipStats;

    return { food: Number(stats?.miscStats.scanCost || 0), ammunitions: 0, fuel: 0, tool: 0 } as iActionR4Cost;
  }

  /**
   *
   * @returns Parsed result data after last scan
   */
  async getScanResultParsed(): Promise<ParsedScanResult | undefined> {
    let txData = this.results.execution;
    let i = txData.length - 1;
    if (!txData || i < 0) return undefined;
    //@ts-ignore
    if ((txData[i].logs?.length || 0) > 0) {
      let isSimulation = true;
      let logs = (txData[i] as SimulatedTransactionResponse)?.logs || [];
      let scanResult = SDUProbabilityProcessor.parseSduLogs(logs);

      return {
        fleet: this.process.fleetName,
        timeCost: this.results.runTime,
        type: this.constructor.name,
        simulation: isSimulation,
        // sectorChance:
        r4cost: { fuel: 0, food: 0, toolkit: 0, ammunitions: 0 } as iActionR4Cost,
        transactionsCost: 0, // this.results.transactionFees, // Amount is in solana
        scanResult: scanResult,
        txSignature: "",
        prioritySetting: this.priorityFeeConfig,
        totalRetries: 0,
        donation: 0,
        priorityApplied: 0,
        accounts: 0,
      } as ParsedScanResult;
      //@ts-ignore
    } else if (
      //@ts-ignore meta exists in only one of response types
      txData[i].meta &&
      //@ts-ignore meta exists in only one of response types
      (txData[i].meta?.logMessages?.length || 0) > 0
    ) {
      let isSimulation = false;
      // console.log("FC:", fleetAccount.data.cargoHold.toBase58());

      let logs = (txData[i] as DispatcherParsedTransactionWithMeta)?.meta?.logMessages || [];
      // let meta = (txData[i] as DispatcherParsedTransactionWithMeta).meta;
      // (txData[txDataLength - 1] as DispatcherParsedTransactionWithMeta).transaction.signatures;
      /// ! Info
      // meta?.postTokenBalances?.forEach((tb) => {
      //   console.log("preBalances<<<", tb.owner, tb.mint, tb.uiTokenAmount);
      // });
      // meta?.postTokenBalances?.forEach((tb) => {
      //   console.log("postBalances>>", tb.owner, tb.mint, tb.uiTokenAmount);
      // });
      console.log("LOGS", logs);
      /// !the result
      // preBalances<<< C2478tbSLC1gfcDuCyr4pv66QQiybn77EiR1a4k7htT5 SDUsgfSZaDhhZ76U3ZgvtFiXsfnHbf2VrzYxjBZ5YbM {
      //   amount: "175746630",
      //   decimals: 0,
      //   uiAmount: 175746630,
      //   uiAmountString: "175746630",
      // }
      // preBalances<<< F4cE4RzFF3unP8ZCrbcis3bEUmV34WkQPfZuvJxP3cAX SDUsgfSZaDhhZ76U3ZgvtFiXsfnHbf2VrzYxjBZ5YbM {
      //   amount: "6157",
      //   decimals: 0,
      //   uiAmount: 6157,
      //   uiAmountString: "6157",
      // }
      // preBalances<<< F4cE4RzFF3unP8ZCrbcis3bEUmV34WkQPfZuvJxP3cAX foodQJAztMzX1DKpLaiounNe2BDMds5RNuPC6jsNrDG {
      //   amount: "46907",
      //   decimals: 0,
      //   uiAmount: 46907,
      //   uiAmountString: "46907",
      // }
      // postBalances>> C2478tbSLC1gfcDuCyr4pv66QQiybn77EiR1a4k7htT5 SDUsgfSZaDhhZ76U3ZgvtFiXsfnHbf2VrzYxjBZ5YbM {
      //   amount: "175746630",
      //   decimals: 0,
      //   uiAmount: 175746630,
      //   uiAmountString: "175746630",
      // }
      // postBalances>> F4cE4RzFF3unP8ZCrbcis3bEUmV34WkQPfZuvJxP3cAX SDUsgfSZaDhhZ76U3ZgvtFiXsfnHbf2VrzYxjBZ5YbM {
      //   amount: "6157",
      //   decimals: 0,
      //   uiAmount: 6157,
      //   uiAmountString: "6157",
      // }
      // postBalances>> F4cE4RzFF3unP8ZCrbcis3bEUmV34WkQPfZuvJxP3cAX foodQJAztMzX1DKpLaiounNe2BDMds5RNuPC6jsNrDG {
      //   amount: "46907",
      //   decimals: 0,
      //   uiAmount: 46907,
      //   uiAmountString: "46907",
      // }
      // fps.totalFoodCost = (fps.totalFoodCost || 0) + ((await scanAction.getResourceCost()).food || 0);

      let scanResult = SDUProbabilityProcessor.parseSduLogs(logs);
      let d = txData[i] as DispatcherParsedTransactionWithMeta;
      return {
        fleet: this.process.fleetName,
        timeCost: this.results.runTime,
        type: this.constructor.name,
        simulation: isSimulation,
        r4cost: await this.getResourceCost(),
        transactionsCost: Dispatcher.lanportsToSol(this.results.transactionFees),
        scanResult: scanResult,
        txSignature: d.transaction.signatures[0],
        prioritySetting: d.prioritySetting,
        totalRetries: d.totalRetries,
        donation: d.donation,
        priorityApplied: d.priorityApplied,
        accounts: d.accounts,
      } as ParsedScanResult;
    } else {
      return undefined;
    }
  }
  /**@inheritdoc */
  async export(type: string = "", data: any = {}): Promise<string> {
    return await Action.prototype.export.bind(this)(type, {
      scanConfig: this.scanConfig,
      ...data,
    });
  }
}
