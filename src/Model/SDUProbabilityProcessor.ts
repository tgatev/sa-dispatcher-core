import { Connection, Context, Logs, PublicKey } from "@solana/web3.js";
import { log } from "../Common/PatchConsoleLog";

// in Seconds
const SECTOR_DATA_EXPIRE_AFTER = 120 * 60;
export interface iSectorData {
  sduChance: number;
  timestamp: number;
  success: boolean;
}
export interface iSectorCalculations {
  last: number;
  average: number;
  av3: number;
  av5: number;
  av10: number;
  av2min: number;
  av5min: number;
  av10min: number;
  av20min: number;
  av30min: number;
  av40min: number;
  av50min: number;
  av60min: number;
  found: number;
}

export interface iParsedScanLog {
  sector: string;
  data: iSectorData;
}

export interface iSectorScanLog {}
export class SDUProbabilityProcessor {
  sectorDataLimit: number = 30;
  data: Map<string, iSectorData[]> = new Map<string, iSectorData[]>();
  calculated: Map<string, iSectorCalculations> = new Map<string, iSectorCalculations>();
  surveyDataUnitTracker: PublicKey = new PublicKey("23MZ2crHoWKJ6rvZz8B7fEJchvFNHcq6HMBrFabEksrK");
  logsListenerStatus: "Active" | "Inactive" = "Inactive";
  connection: Connection = new Connection(process.env["SOLANA_RPC_URL"] || "", {
    wsEndpoint: process.env["SOLANA_RPC_URL"] || "wss://api.mainnet-beta.solana.com",
    commitment: "confirmed",
  });
  static processor: SDUProbabilityProcessor;
  constructor() {
    if (!SDUProbabilityProcessor.processor) {
      SDUProbabilityProcessor.processor = this;
    }

    return SDUProbabilityProcessor.processor;
  }

  async onLogs(logs: Logs, context: Context) {
    // // console.log(logs);
    let rawLogs = await this.before(logs);
    // log("SDU Logs:", rawLogs);
    let parsedData = SDUProbabilityProcessor.parseSduLogs(rawLogs);
    // console.log(parsedData);
    if (parsedData && parsedData.data.sduChance) {
      let list = this.data.get(parsedData.sector);
      if (!list) {
        list = [parsedData.data];
        this.data.set(parsedData.sector, list);
      } else {
        // Ordered list by timestamp
        list.unshift(parsedData.data);
        if (list.length > this.sectorDataLimit) {
          list.pop();
        }
        this.data.set(parsedData.sector, list);
      }
      let calcs = SDUProbabilityProcessor.calcSectorData(list);
      this.calculated.set(parsedData.sector, calcs);
      // log(calcs, parsedData, "ScanDataParsedOutput");
      await this.after(parsedData, calcs);
    }
  }

  /**
   * Initialize log listener when this.logsListenerStatus === "Inactive"
   */
  async startListener() {
    if (this.logsListenerStatus === "Inactive") {
      this.connection.onLogs(this.surveyDataUnitTracker, (logs: Logs, context: Context) => this.onLogs(logs, context), "confirmed");
      this.logsListenerStatus = "Active";
    }
    console.error("State", this.logsListenerStatus);
  }

  // @ts-ignore -> not used variables
  async after(parsedData: parsedData, calcs: iSectorCalculations) {
    return;
  }

  async before(logs: Logs) {
    return logs.logs;
  }

  getSectorData(sectorKey: string) {
    let raw = this.data.get(sectorKey) || [];
    let calculated = SDUProbabilityProcessor.calcSectorData(raw);
    this.calculated.set(sectorKey, calculated);

    return { raw: raw, calculated: calculated };
  }

  /**
   *
   * @param list iSectorData[] List of sector data
   * @param expirePeriodLength number - Expiration time lenght
   * @returns
   */
  static calcSectorData(list: iSectorData[], expirePeriodLength = SECTOR_DATA_EXPIRE_AFTER): iSectorCalculations {
    let calcs = {
      last: 0,
      av3: 0,
      av5: 0,
      average: 0,
      av2min: 0,
      av5min: 0,
      av10min: 0,
      av20min: 0,
      av30min: 0,
      av40min: 0,
      av50min: 0,
      av60min: 0,
    } as iSectorCalculations;
    let timestamp = new Date().getTime() / 1000;

    let sum = 0;
    let items = 0;
    calcs.last = list[0]?.sduChance || 0;
    for (let iterator = 0; iterator < list.length; iterator++) {
      // if data is older then expiration time -> skip
      if (list[iterator].timestamp < timestamp - expirePeriodLength) {
        continue;
      }
      sum += list[iterator].sduChance;
      switch (iterator) {
        case 3:
          calcs.av3 = sum / (iterator + 1);
        // break; - no brakes make all values filled allways
        case 5:
          calcs.av5 = sum / (iterator + 1);
        // break;
        case 10:
          calcs.av10 = sum / (iterator + 1);
        // break;
        default:
          break;
      }

      // let timeInterval = timestamp - list[iterator].timestamp;
      // // 2 Mins
      // if (timeInterval < 120) {
      //   calcs.av2min = sum / (iterator + 1);
      // }
      // // 5 mins
      // if (timeInterval < 300) {
      //   calcs.av5min = sum / (iterator + 1);
      // }
      // // 10 mins
      // if (timeInterval < 600) {
      //   calcs.av10min = sum / (iterator + 1);
      // }
      // // 20 mins
      // if (timeInterval < 1200) {
      //   calcs.av20min = sum / (iterator + 1);
      // }

      // // 30 mins
      // if (timeInterval < 1800) {
      //   calcs.av30min = sum / (iterator + 1);
      // }

      // // 40 mins
      // if (timeInterval < 2400) {
      //   calcs.av40min = sum / (iterator + 1);
      // }

      // // 50 mins
      // if (timeInterval < 3000) {
      //   calcs.av50min = sum / (iterator + 1);
      // }

      // // 60 mins
      // if (timeInterval < 3600) {
      //   calcs.av60min = sum / (iterator + 1);
      // }
      items += 1;
    }

    calcs.average = sum / (items || 1);

    /**
     * Make faktoriel Multiplier to make early data more important
     * (n * chance  + n-1 * chance + n-2 * chance + ... + 1 * chance) / (N + (N-1) + (N-2) + ...)
     */
    let periods: { [key: string]: number } = {
      av2min: 120,
      av5min: 300,
      av10min: 600,
      av20min: 1200,
      av30min: 1800,
      av40min: 2400,
      av50min: 3000,
      av60min: 3600,
    };
    let now = new Date().getTime() / 1000;
    for (const key of Object.keys(periods) as Array<keyof iSectorCalculations>) {
      const time = periods[key as keyof typeof periods];
      calcs[key] = SDUProbabilityProcessor.weightedAverageByChance(list, now - time);
    }

    return calcs;
  }

  /**
   * 
   * No success 
   * 
v1 [
    "Program SAGEqqFewepDHH6hMDcmWy7yjHPpyKLDnRXKb3Ki8e6 invoke [1]", 
    "Program log: Instruction: ScanForSurveyDataUnits",
    "Program log: Sector: [-2, 6]", 
    "Program log: SDU probability: 0.061953842643679834",
    ...
    ]
v1 [
    "Program SAGEqqFewepDHH6hMDcmWy7yjHPpyKLDnRXKb3Ki8e6 invoke [1]", 
    "Program log: Instruction: ScanForSurveyDataUnits",
    "Program log: Sector: [-2, 6]", 
    "Program log: SDU probability: 0.061953842643679834",
    "Program log: SDU Multiplier: 1",
    ...
    ]

    SDU Found
v2 [
     "Program ComputeBudget111111111111111111111111111111 invoke [1]", "Program ComputeBudget111111111111111111111111111111 success",
    "Program SAGEqqFewepDHH6hMDcmWy7yjHPpyKLDnRXKb3Ki8e6 invoke [1]", 
    "Program log: Instruction: ScanForSurveyDataUnits",
    "Program log: Sector: [-2, 6]", 
    "Program log: SDU probability: 0.061953842643679834",
    "Program log: SDU Multiplier: 1",
    ...
    ]
v2 
   * 
   * @param logs 
   */
  static parseSduLogs(logs: string[]): iParsedScanLog | undefined {
    let index = null;
    for (let iterator = 0; logs.length > iterator; iterator++) {
      if (logs[iterator].includes("Instruction: ScanForSurveyDataUnits")) {
        index = iterator;
        break;
      }
    }

    if (index) {
      let data: iSectorData = {} as iSectorData;
      let sector: string = "";
      let match: string[] | null | undefined;

      match = /Sector: \[(-?\d+,\s+-?\d+)\]/.exec(logs[index + 1]);
      if (match) {
        sector = match[1].replace(/\s+/g, "");
      }
      match = /SDU probability: (0.\d+)$/.exec(logs[index + 2]);
      if (match) {
        data.sduChance = Number(match[1]);
      } else {
        data.sduChance = 0.001;
      }

      let foundSDURegex = /(LegitimizeCargo)/;
      let found = logs.find((v) => {
        let res = foundSDURegex.exec(v);
        return res !== null;
      });

      if (found) {
        data.success = true;
      } else {
        data.success = false;
      }

      data.timestamp = new Date().getTime() / 1000;
      return { sector: sector || "", data: data } as iParsedScanLog;
    }
  }
  static weightedAverageByChance(list: iSectorData[], minTimestamp: number): number {
    // Filter by timestamp
    const filtered = list.filter((item) => item.timestamp >= minTimestamp);
    const n = filtered.length + 1;
    if (n === 0) return 0;

    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < n - 1; i++) {
      const weight = n - i;
      numerator += weight * filtered[i].sduChance;
      denominator += weight;
    }
    return numerator / (denominator || 1);
  }
}

export class HolosimSDUProbabilityProcessor extends SDUProbabilityProcessor {
  static processor: HolosimSDUProbabilityProcessor;
  surveyDataUnitTracker: PublicKey = new PublicKey("DXPsKQPMyaDtunxDWqiKTGWbQga3Wihck8zb8iSLATJQ"); //new PublicKey("23MZ2crHoWKJ6rvZz8B7fEJchvFNHcq6HMBrFabEksrK");
  connection: Connection = new Connection(process.env["ATLASNET_RPC_URL"] || "", {
    wsEndpoint: process.env["ATLASNET_RPC_URL"] || "wss://api.mainnet-beta.solana.com",
    commitment: "confirmed",
  });
}
