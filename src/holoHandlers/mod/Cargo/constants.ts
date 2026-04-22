import { PublicKey } from "@solana/web3.js";
import { Coder, Program, Provider } from "@staratlas/anchor";
import {
  AnchorTypes,
  ExtractArrayType,
  ListenProgram,
  ListenProgramStatic,
  ProgramMethods,
  generateErrorMap,
  staticImplements,
} from "@staratlas/data-source";
import { CargoPod } from "./cargoPod";
import { CargoType } from "./cargoType";
import { IDL as CARGO_IDL, Cargo as CargoIDL } from "./idl/cargo";
import { CargoStatsDefinition } from "./statsDefinition";

export { IDL as CARGO_IDL } from "./idl/cargo";
export type { Cargo as CargoIDL } from "./idl/cargo";

export type CargoAccountsArray = ExtractArrayType<CargoIDL["accounts"]>["name"];
export const cargoErrorMap = generateErrorMap(CARGO_IDL);

export type CargoIDLProgram = ProgramMethods<CargoIDL>;
export type CargoCoder = Coder<CargoAccountsArray>;

export type CargoTypes = AnchorTypes<CargoIDL>;

export type CargoIDLAccounts = CargoTypes["Accounts"];
export type CargoPodAccount = CargoIDLAccounts["CargoPod"];
export type CargoStatsDefinitionAccount = CargoIDLAccounts["CargoStatsDefinition"];
export type CargoTypeAccount = CargoIDLAccounts["CargoType"];

// Instruction Contexts
export type CargoInstructions = CargoTypes["Instructions"];
export type InitDefinition = CargoInstructions["initDefinition"];
export type UpdateDefinition = CargoInstructions["updateDefinition"];
export type InitCargoType = CargoInstructions["initCargoType"];
export type InitCargoTypeFromOldCargoType = CargoInstructions["initCargoTypeFromOldCargoType"];
export type InitCargoTypeForNextSeqId = CargoInstructions["initCargoTypeForNextSeqId"];

// Instruction Specific Accounts
export type InitDefinitionInput = InitDefinition["args"][1];
export type UpdateDefinitionInput = UpdateDefinition["args"][1];
export type InitCargoTypeInput = InitCargoType["args"][1];
export type InitCargoTypeFromOldCargoTypeInput = InitCargoTypeFromOldCargoType["args"][1];
export type InitCargoTypeForNextSeqIdInput = InitCargoTypeForNextSeqId["args"][1];

export type CargoAccounts = {
  cargoPod: CargoPod;
  cargoType: CargoType;
  cargoStatsDefinition: CargoStatsDefinition;
};

@staticImplements<ListenProgramStatic<CargoProgram, CargoAccounts, CargoIDL>>()
export class CargoProgram extends ListenProgram<CargoAccounts, CargoIDL> {
  constructor(program: CargoIDLProgram) {
    super(program, {
      cargoPod: CargoPod,
      cargoType: CargoType,
      cargoStatsDefinition: CargoStatsDefinition,
    });
  }

  static buildProgram(programId: PublicKey, provider?: Provider, coder?: Coder): CargoIDLProgram {
    return new Program(CARGO_IDL, programId, provider, coder);
  }
}
