import { PublicKey, SimulatedTransactionResponse, TransactionError } from "@solana/web3.js";
import { iCoordinates } from "../Model/MoveAction";
import { FleetStateData } from "@staratlas/sage-main";
import { formatTimePeriod, logger, u8aToString } from "../utils";
import { log } from "../Common/PatchConsoleLog";
export interface iError {
  message?: string;
  options: any;
  code: string;
}
export class AbortTrigger extends Error implements iError {
  options: any;
  code: string = this.constructor.name;

  constructor(data: any) {
    const message = data?.reason || data?.message || data?.actionType || "Abort signal received";

    super(`AbortSignalReceived: ${message}`);
    this.options = data;
  }
}

export class FleetCargoTransferError extends Error implements iError {
  options: any;
  code: string;
  constructor(
    message: string | undefined,
    options: {
      amount?: bigint;
      fleet?: PublicKey;
      cargo?: PublicKey;
      tokenAccount?: PublicKey;
      resourceMint?: PublicKey;
      starbaseCargo?: PublicKey;
      timestamp?: number;
    },
  ) {
    super(message);
    this.options = options;
    this.code = this.constructor.name;
  }
}
export class FleetRespawnOnCooldownError extends Error implements iError {
  options: any;
  code: string = this.constructor.name;
  respawnCD: number;
  constructor(state: string, respawnCD: number) {
    super(`Fleet State is ${state}. Respawn cooldown ${respawnCD} seconds.`);
    this.respawnCD = respawnCD;
  }
}

export class AttackCooldownNotExpiredError extends Error implements iError {
  options: any;
  code: string = this.constructor.name;
  constructor(fleetKey: string, time?: number) {
    super(`Fleet ${fleetKey} attack cooldown not expired. ${formatTimePeriod(time || 0)}`);
    this.options = { fleetKey, time };
  }
}

export class MissingFleetConfig extends Error implements iError {
  options: any;
  code: string = this.constructor.name;

  constructor(fleetName: string) {
    super(`Fleet Config is missing for ${fleetName}`);
  }
}
export class CantFetchFleetStatuses extends Error implements iError {
  options: any;
  code: string = this.constructor.name;

  constructor(fleetName: string) {
    super(`Can't fetch statuses for ${fleetName}`);
  }
}

export class MaxDistanceStepUnderMinLimit extends Error implements iError {
  code: string = this.constructor.name;
  options: any;

  constructor() {
    super(`Max distance step is under minimum value (1)`);
  }
}

export class ScanMissingSduTokenInFleet extends Error implements iError {
  code: string = this.constructor.name;
  options: any;
  cargoPod: PublicKey;
  mint: PublicKey;
  fleet: PublicKey;
  constructor(fleet: PublicKey, cargoPod: PublicKey, mintSdu: PublicKey) {
    super(`${fleet.toBase58()} Missing SDU token account in cargo. Please create new one.`);
    this.cargoPod = cargoPod;
    this.mint = mintSdu;
    this.fleet = fleet;
  }
}

export class NotPermittedKeypair extends Error implements iError {
  options: any;
  code: string = this.constructor.name;
  owner: string;
  signerPublic: string;
  constructor(owner: string, signer: string) {
    super(`Signer ${signer} have no delegated access to owner's [${owner}] sage profile.`);
    this.owner = owner;
    this.signerPublic = signer;
  }
}

export class SimulationError extends Error implements iError {
  options: any;
  code: string = this.constructor.name;
  trErr: SimulatedTransactionResponse;

  constructor(trErr: SimulatedTransactionResponse) {
    super(`Transaction simulation error: ${trErr.err?.toString()}`);
    logger.err(trErr.logs, trErr.err);
    this.trErr = trErr;
  }
}

export class CantTransferCrewToFleetError extends Error implements iError {
  options: any;
  code: string = this.constructor.name;
  amount: number;
  free: number;

  constructor(amount: number, free: number) {
    super(`Can't transfer ${amount} crew to fleet! Free crew on starbase is ${free}`);
    this.free = free;
    this.amount = amount;
  }
}

export class IncorrectFleetStateError extends Error implements iError {
  options: any;
  code: string = this.constructor.name;

  constructor(expectedState: string, f: any = {}, label: string = "") {
    let stateLabels = Object.keys(f.state || {}).join(",");
    if (!label && f.data?.fleetLabel) label = u8aToString(f.data.fleetLabel.filter((b: number) => b > 0));
    super(`Fleet State is not ${expectedState}. [f:${label}][s:${stateLabels}]`);
  }
}

export class UnknownFleetState extends Error implements iError {
  options: any;
  code: string = this.constructor.name;

  constructor(state: FleetStateData) {
    super(`Unknown Fleet State. State is ` + Object.keys(state).join(","));
    // console.log(state);
  }
}

export class TransactionPreBuildError extends Error implements iError {
  options: any;
  code: string = this.constructor.name;

  constructor(reason: string) {
    super(`Cant prepare transaction! Reason: ${reason}.`);
  }
}

export class PlayerProfileNotFoundError extends Error implements iError {
  options: any;
  code: string = this.constructor.name;

  constructor(playerPubkey: string) {
    super(`Player profile not found for ${playerPubkey}.`);
  }
}

export class NotOutOfBaseError extends Error implements iError {
  options: any;
  code: string = this.constructor.name;

  constructor(state: FleetStateData) {
    super(`Fleet is not Out of base.` + Object.keys(state).join(","));
  }
}

export class CantFindRecipeError extends Error implements iError {
  options: any;
  code: string = this.constructor.name;

  constructor(recipeName: string) {
    super(`Cant find recipe for ${recipeName}.`);
  }
}
export class InsufficientAmountOfError extends Error implements iError {
  options: any;
  code: string = this.constructor.name;

  constructor(resourceName: string, currentAmount?: number, options: { min?: number; max?: number } = {}) {
    const { min, max } = options;
    super(
      `Insufficient amount of ${resourceName} [${currentAmount}] for this operation.` +
        (min !== undefined ? ` Min: ${min}` : "") +
        (max !== undefined ? ` Max: ${max}` : ""),
    );
  }
}

export class NotEnoughResources extends Error implements iError {
  options: any;
  code: string = this.constructor.name;
  constructor(resourceName: string, amount: number, expected: number) {
    super(`Not enough ${resourceName} (${amount} < ${expected})`);
  }
}

export class NotSafeMovement extends Error implements iError {
  code: string = this.constructor.name;
  options: any;

  constructor(fleetName: string, sector: iCoordinates, moveMode: "Warp" | "SubWarp") {
    super(`${fleetName} cant go to {${sector.x},${sector.y}} by ${moveMode}`);
  }
}

export class FuelThankNotEnough extends Error implements iError {
  options: any;
  code: string = this.constructor.name;
  constructor(ops: { fleetName: string; fuelTankSize: number; expected: number; path?: string[]; mode?: string }) {
    super(
      `${ops.fleetName}, can't load ${ops.expected} fuel into tank with size ${ops.fuelTankSize}.` +
        (ops.path ? ` Path: ${ops.path.join("-->")}` : "") +
        (ops.mode ? ` Mode: ${ops.mode}` : ""),
    );
  }
}
