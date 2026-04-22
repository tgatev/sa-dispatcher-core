import { PublicKey } from "@solana/web3.js";
import { BN, Coder, Program, Provider } from "@staratlas/anchor";
import {
  AnchorTypes,
  ExtractArrayType,
  ListenProgram,
  ListenProgramStatic,
  ProgramMethods,
  generateErrorMap,
  staticImplements,
} from "@staratlas/data-source";
import { CombatConfig, PlayerCrewRecord } from "@staratlas/holosim";
import { CraftingInstance } from "@staratlas/holosim";
import { DisbandedFleet } from "@staratlas/holosim";
import { Fleet } from "@staratlas/holosim";
import { FleetShips } from "@staratlas/holosim";
import { Game } from "@staratlas/holosim";
import { GameState } from "@staratlas/holosim";
// import { IDL as SAGE_IDL, Sage as SageIDL } from "./idl/sage";
import { Loot } from "@staratlas/holosim";
import { MineItem } from "@staratlas/holosim";
import { Planet } from "@staratlas/holosim";
import {} from "@staratlas/holosim";
import { ProgressionConfig } from "@staratlas/holosim";
import { Resource } from "@staratlas/holosim";
import { SageCrewConfig } from "@staratlas/holosim";
import { SagePlayerProfile } from "@staratlas/holosim";
import { Sector } from "@staratlas/holosim";
import { Ship } from "@staratlas/holosim";
import { Star } from "@staratlas/holosim";
import { Starbase } from "@staratlas/holosim";
import { StarbasePlayer } from "@staratlas/holosim";
import { SurveyDataUnitTracker } from "@staratlas/holosim";
// import { SAGE_IDL } from "./sage-holo";

export const EMPTY_CRAFTING_SPEED_PER_TIER: number[] = [0.0, 0.2, 0.275, 0.35, 0.425, 0.5, 0.5];

// import { type SageIDL, SAGE_IDL } from "./sage-holo-c2";
import { type SageIDL, SAGE_IDL as RAW_SAGE_IDL } from "./sage-holo-c2";

function normalizeSageIdl(rawIdl: SageIDL): SageIDL {
  const idl: any = { ...rawIdl };
  const types: any[] = Array.isArray(idl.types) ? [...idl.types] : [];
  const hasCombatParticipantType = types.some((t) => t?.name === "CombatParticipant");

  if (!hasCombatParticipantType && Array.isArray(idl.events)) {
    const combatParticipantEvent = idl.events.find((e: any) => e?.name === "CombatParticipant");
    if (combatParticipantEvent && Array.isArray(combatParticipantEvent.fields)) {
      types.push({
        name: "CombatParticipant",
        type: {
          kind: "struct",
          fields: combatParticipantEvent.fields.map((f: any) => ({
            name: f.name,
            type: f.type,
          })),
        },
      });
      idl.types = types;
    }
  }

  return idl as SageIDL;
}

export const SAGE_IDL: SageIDL = normalizeSageIdl(RAW_SAGE_IDL as SageIDL);
export { SageIDL };

export type SageAccountsArray = ExtractArrayType<SageIDL["accounts"]>["name"];
export type SageTypesArray = ExtractArrayType<SageIDL["types"]>["name"];
export const sageErrorMap = generateErrorMap(SAGE_IDL as any);

export type SageIDLProgram = ProgramMethods<SageIDL>;
export type SageCoder = Coder<SageAccountsArray, SageTypesArray>;

export type SageTypes = AnchorTypes<SageIDL>;

// Accounts
export type SageIDLAccounts = SageTypes["Accounts"];
export type SagePlayerProfileAccount = SageIDLAccounts["SagePlayerProfile"];
export type StarbaseAccount = SageIDLAccounts["Starbase"];
export type MineItemAccount = SageIDLAccounts["MineItem"];
export type ResourceAccount = SageIDLAccounts["Resource"];
export type FleetAccount = SageIDLAccounts["Fleet"];
export type FleetShipsAccount = SageIDLAccounts["FleetShips"];
export type DisbandedFleetAccount = SageIDLAccounts["DisbandedFleet"];
export type StarbasePlayerAccount = SageIDLAccounts["StarbasePlayer"];
export type CraftingInstanceAccount = SageIDLAccounts["CraftingInstance"];
export type ShipAccount = SageIDLAccounts["Ship"];
export type GameAccount = SageIDLAccounts["Game"];
export type GameStateAccount = SageIDLAccounts["GameState"];
export type PlanetAccount = SageIDLAccounts["Planet"];
export type SectorAccount = SageIDLAccounts["Sector"];
export type StarAccount = SageIDLAccounts["Star"];
export type SurveyDataUnitTrackerAccount = SageIDLAccounts["SurveyDataUnitTracker"];
export type ProgressionConfigAccount = SageIDLAccounts["ProgressionConfig"];
export type SageCrewConfigAccount = SageIDLAccounts["SageCrewConfig"];
export type PlayerCrewRecordAccount = SageIDLAccounts["PlayerCrewRecord"];
export type CombatConfigAccount = SageIDLAccounts["CombatConfig"];
export type BaseLootAccount = SageIDLAccounts["Loot"];

// Instruction Contexts
export type SageInstructions = SageTypes["Instructions"];
export type RegisterMineItem = SageInstructions["registerMineItem"];
export type UpdateMineItem = SageInstructions["updateMineItem"];
export type DeregisterMineItem = SageInstructions["deregisterMineItem"];
export type RegisterResource = SageInstructions["registerResource"];
export type UpdateResource = SageInstructions["updateResource"];
export type DeregisterResource = SageInstructions["deregisterResource"];
export type RegisterSagePlayerProfile = SageInstructions["registerSagePlayerProfile"];
export type AddShipEscrow = SageInstructions["addShipEscrow"];
export type UpdateShipEscrow = SageInstructions["updateShipEscrow"];
export type RemoveShipEscrow = SageInstructions["removeShipEscrow"];
export type RemoveInvalidShipEscrow = SageInstructions["removeInvalidShipEscrow"];
export type RegisterStarbasePlayer = SageInstructions["registerStarbasePlayer"];
export type RegisterStarbase = SageInstructions["registerStarbase"];
export type UpdateStarbase = SageInstructions["updateStarbase"];
export type LoadingBayToIdle = SageInstructions["loadingBayToIdle"];
export type IdleToLoadingBay = SageInstructions["idleToLoadingBay"];
export type IdleToRespawn = SageInstructions["idleToRespawn"];
export type StarbaseCreateCraftingProcess = SageInstructions["createCraftingProcess"];
export type StarbaseDepositCraftingIngredient = SageInstructions["depositCraftingIngredient"];
export type StarbaseWithdrawCraftingIngredient = SageInstructions["withdrawCraftingIngredient"];
export type StarbaseStartCraftingProcess = SageInstructions["startCraftingProcess"];
export type StarbaseCancelCraftingProcess = SageInstructions["cancelCraftingProcess"];
export type StarbaseClaimCraftingOutputs = SageInstructions["claimCraftingOutputs"];
export type StarbaseClaimCraftingNonConsumables = SageInstructions["claimCraftingNonConsumables"];
export type StarbaseCloseCraftingProcess = SageInstructions["closeCraftingProcess"];
export type StarbaseCreateCargoPod = SageInstructions["createCargoPod"];
export type StarbaseDepositCargoToGame = SageInstructions["depositCargoToGame"];
export type StarbaseWithdrawCargoFromGame = SageInstructions["withdrawCargoFromGame"];
export type TransferCargoAtStarbase = SageInstructions["transferCargoAtStarbase"];
export type CloseStarbaseCargoTokenAccount = SageInstructions["closeStarbaseCargoTokenAccount"];
export type CreateCertificateMint = SageInstructions["createCertificateMint"];
export type MintCertificate = SageInstructions["mintCertificate"];
export type RedeemCertificate = SageInstructions["redeemCertificate"];
export type StarbaseRemoveCargoPod = SageInstructions["removeCargoPod"];
export type CreateFleet = SageInstructions["createFleet"];
export type AddShipToFleet = SageInstructions["addShipToFleet"];
// export type AdminCreateFleet = SageInstructions["adminCreateFleet"];
// export type AdminRemoveFleet = SageInstructions["adminRemoveFleet"];
// export type AdminDepositCargoToFleet = SageInstructions["adminDepositCargoToFleet"];
// export type AdminDepositCargoToStarbase = SageInstructions["adminDepositCargoToStarbase"];
export type UpdateShipInFleet = SageInstructions["updateShipInFleet"];
export type DisbandFleet = SageInstructions["disbandFleet"];
export type ForceDisbandFleet = SageInstructions["forceDisbandFleet"];
export type DisbandedFleetToEscrow = SageInstructions["disbandedFleetToEscrow"];
export type CloseDisbandedFleet = SageInstructions["closeDisbandedFleet"];
export type WarpToCoordinate = SageInstructions["warpToCoordinate"];
export type WarpLane = SageInstructions["warpLane"];
export type DepositCargoToFleet = SageInstructions["depositCargoToFleet"];
export type TransferCargoWithinFleet = SageInstructions["transferCargoWithinFleet"];
export type WithdrawCargoFromFleet = SageInstructions["withdrawCargoFromFleet"];
export type CloseFleetCargoPodTokenAccount = SageInstructions["closeFleetCargoPodTokenAccount"];
export type StartSubwarp = SageInstructions["startSubwarp"];
export type StopSubwarp = SageInstructions["stopSubwarp"];
export type StartMiningAsteroid = SageInstructions["startMiningAsteroid"];
export type StopMiningAsteroid = SageInstructions["stopMiningAsteroid"];
export type MineAsteroidToRespawn = SageInstructions["mineAsteroidToRespawn"];
export type InitGame = SageInstructions["initGame"];
export type UpdateGame = SageInstructions["updateGame"];
export type InitGameState = SageInstructions["initGameState"];
export type UpdateGameState = SageInstructions["updateGameState"];
export type ActivateGameState = SageInstructions["activateGameState"];
export type CopyGameState = SageInstructions["copyGameState"];
export type RegisterShip = SageInstructions["registerShip"];
export type UpdateShip = SageInstructions["updateShip"];
export type InvalidateShip = SageInstructions["invalidateShip"];
export type SetNextShip = SageInstructions["setNextShip"];
export type RegisterStar = SageInstructions["registerStar"];
export type UpdateStar = SageInstructions["updateStar"];
export type RegisterPlanet = SageInstructions["registerPlanet"];
export type UpdatePlanet = SageInstructions["updatePlanet"];
export type RegisterSurveyDataUnitTracker = SageInstructions["registerSurveyDataUnitTracker"];
export type UpdateSurveyDataUnitTracker = SageInstructions["updateSurveyDataUnitTracker"];
export type DrainSurveyDataUnitsBank = SageInstructions["drainSurveyDataUnitsBank"];
export type DeregisterSurveyDataUnitTracker = SageInstructions["deregisterSurveyDataUnitTracker"];
export type ScanForSurveyDataUnits = SageInstructions["scanForSurveyDataUnits"];
export type SubmitStarbaseUpgradeResource = SageInstructions["submitStarbaseUpgradeResource"];
export type DepositStarbaseUpkeepResource = SageInstructions["depositStarbaseUpkeepResource"];
export type RegisterProgressionConfig = SageInstructions["registerProgressionConfig"];
export type RegisterSageCrewConfig = SageInstructions["registerSageCrewConfig"];
export type ClosePlayerCrewRecord = SageInstructions["closePlayerCrewRecord"];
export type AddCrewToGame = SageInstructions["addCrewToGame"];
export type RemoveCrewFromGame = SageInstructions["removeCrewFromGame"];
export type LoadFleetCrew = SageInstructions["loadFleetCrew"];
export type UnloadFleetCrew = SageInstructions["unloadFleetCrew"];
export type RegisterCombatConfig = SageInstructions["registerCombatConfig"];
export type UpdateCombatConfig = SageInstructions["updateCombatConfig"];
export type DeregisterCombatConfig = SageInstructions["deregisterCombatConfig"];
export type AttackFleet = SageInstructions["attackFleet"];
export type RepairIdleFleet = SageInstructions["repairIdleFleet"];
export type RepairDockedFleet = SageInstructions["repairDockedFleet"];
export type ReloadFleetAbilityPower = SageInstructions["reloadFleetAbilityPower"];
export type RetrieveLoot = SageInstructions["retrieveLoot"];

// Instruction Specific Accounts
export type RegisterMineItemInput = RegisterMineItem["args"][1];
export type UpdateMineItemInput = UpdateMineItem["args"][1];
export type DeregisterMineItemInput = DeregisterMineItem["args"][1];
export type DeregisterResourceInput = DeregisterResource["args"][1];
export type AddShipEscrowInput = AddShipEscrow["args"][1];
export type UpdateShipEscrowInput = UpdateShipEscrow["args"][1];
export type RemoveShipEscrowInput = RemoveShipEscrow["args"][1];
export type RegisterStarbaseInput = RegisterStarbase["args"][1];
export type LoadingBayToIdleInput = LoadingBayToIdle["args"][1];
export type IdleToLoadingBayInput = IdleToLoadingBay["args"][1];
export type IdleToRespawnInput = IdleToRespawn["args"][1];
export type StarbaseCreateCraftingProcessInput = StarbaseCreateCraftingProcess["args"][1];
export type StarbaseDepositCraftingIngredientInput = StarbaseDepositCraftingIngredient["args"][1];
export type StarbaseWithdrawCraftingIngredientInput = StarbaseWithdrawCraftingIngredient["args"][1];
export type StarbaseStartCraftingProcessInput = StarbaseStartCraftingProcess["args"][1];
export type StarbaseCancelCraftingProcessInput = StarbaseCancelCraftingProcess["args"][1];
export type StarbaseCloseCraftingProcessInput = StarbaseCloseCraftingProcess["args"][1];
export type StarbaseClaimCraftingOutputsInput = StarbaseClaimCraftingOutputs["args"][1];
export type StarbaseClaimCraftingNonConsumablesInput = StarbaseClaimCraftingNonConsumables["args"][1];
export type StarbaseCreateCargoPodInput = StarbaseCreateCargoPod["args"][1];
export type StarbaseDepositCargoToGameInput = StarbaseDepositCargoToGame["args"][1];
export type StarbaseWithdrawCargoFromGameInput = StarbaseWithdrawCargoFromGame["args"][1];
export type CloseStarbaseCargoTokenAccountInput = CloseStarbaseCargoTokenAccount["args"][1];
export type TransferCargoAtStarbaseInput = TransferCargoAtStarbase["args"][1];
export type StarbaseRemoveCargoPodInput = StarbaseRemoveCargoPod["args"][1];
export type DepositCargoToFleetInput = DepositCargoToFleet["args"][1];
export type TransferCargoWithinFleetInput = TransferCargoWithinFleet["args"][1];
export type WithdrawCargoFromFleetInput = WithdrawCargoFromFleet["args"][1];
export type CloseFleetCargoPodTokenAccountInput = CloseFleetCargoPodTokenAccount["args"][1];
export type CreateFleetInput = CreateFleet["args"][1];
export type AddShipToFleetInput = AddShipToFleet["args"][1];
// export type AdminCreateFleetInput = AdminCreateFleet["args"][1];
// export type AdminRemoveFleetInput = AdminRemoveFleet["args"][1];
// export type AdminDepositCargoToFleetInput = AdminDepositCargoToFleet["args"][1];
// export type AdminDepositCargoToStarbaseInput = AdminDepositCargoToStarbase["args"][1];
export type UpdateShipInFleetInput = UpdateShipInFleet["args"][1];
export type DisbandFleetInput = DisbandFleet["args"][1];
export type ForceDisbandFleetInput = ForceDisbandFleet["args"][1];
export type DisbandedFleetToEscrowInput = DisbandedFleetToEscrow["args"][1];
export type CloseDisbandedFleetInput = CloseDisbandedFleet["args"][1];
export type WarpToCoordinateInput = WarpToCoordinate["args"][1];
export type WarpLaneInput = WarpLane["args"][1];
export type StartSubwarpInput = StartSubwarp["args"][1];
export type StopSubwarpInput = StopSubwarp["args"][1];
export type StartMiningAsteroidInput = StartMiningAsteroid["args"][1];
export type StopMiningAsteroidInput = StopMiningAsteroid["args"][1];
export type MineAsteroidToRespawnInput = MineAsteroidToRespawn["args"][1];
export type UpdateGameInput = UpdateGame["args"][1];
export type InitGameStateInput = InitGameState["args"][1];
export type UpdateGameStateInput = UpdateGameState["args"][0];
export type ManageGameInput = ActivateGameState["args"][1];
export type RegisterSurveyDataUnitTrackerInput = RegisterSurveyDataUnitTracker["args"][1];
export type UpdateSurveyDataUnitTrackerInput = UpdateSurveyDataUnitTracker["args"][1];
export type DrainSurveyDataUnitsBankInput = DrainSurveyDataUnitsBank["args"][1];
export type DeregisterSurveyDataUnitTrackerInput = DeregisterSurveyDataUnitTracker["args"][1];
export type ScanForSurveyDataUnitsInput = ScanForSurveyDataUnits["args"][1];
export type SubmitStarbaseUpgradeResourceInput = SubmitStarbaseUpgradeResource["args"][1];
export type RegisterSageCrewConfigInput = RegisterSageCrewConfig["args"][1];
export type ClosePlayerCrewRecordInput = ClosePlayerCrewRecord["args"][1];
export type LoadFleetCrewInput = LoadFleetCrew["args"][1];
export type UnloadFleetCrewInput = UnloadFleetCrew["args"][1];
export type BaseRemoveCrewFromGameInput = RemoveCrewFromGame["args"][1];
export type RegisterCombatConfigInput = RegisterCombatConfig["args"][1];
export type BaseUpdateCombatConfigInput = UpdateCombatConfig["args"][1];
export type DeregisterCombatConfigInput = DeregisterCombatConfig["args"][1];
export type BaseAttackFleetInput = AttackFleet["args"][1];
export type BaseRepairIdleFleetInput = RepairIdleFleet["args"][1];
export type BaseRepairDockedFleetInput = RepairDockedFleet["args"][1];
export type ReloadFleetAbilityPowerInput = ReloadFleetAbilityPower["args"][1];
export type BaseRetrieveLootInput = RetrieveLoot["args"][1];

export interface FleetShipsInfo {
  ship: PublicKey;
  amount: BN;
  updateId: BN;
}

export interface WrappedShipEscrow {
  ship: PublicKey;
  amount: BN;
  updateId: BN;
}

// Named Types
export type SageNamedTypes = SageTypes["Defined"];
// FleetStateData
export type StarbaseLoadingBay = SageNamedTypes["StarbaseLoadingBay"];
export type Idle = SageNamedTypes["Idle"];
export type MineAsteroid = SageNamedTypes["MineAsteroid"];
export type MoveWarp = SageNamedTypes["MoveWarp"];
export type MoveSubwarp = SageNamedTypes["MoveSubwarp"];
export type Respawn = SageNamedTypes["Respawn"];

export type MovementStats = SageNamedTypes["MovementStats"];
export type CargoStats = SageNamedTypes["CargoStats"];
export type CombatStats = SageNamedTypes["CombatStats"];
export type MiscStats = SageNamedTypes["MiscStats"];
export type BaseShipStats = SageNamedTypes["ShipStats"];

export type StarbaseLevelInfo = SageNamedTypes["StarbaseLevelInfo"];
export type SagePointsCategory = SageNamedTypes["SagePointsCategory"];
export type Mints = SageNamedTypes["Mints"];
export type Vaults = SageNamedTypes["Vaults"];
export type Points = {
  combatXpCategory: SagePointsCategory;
  councilRankXpCategory: SagePointsCategory;
  craftingXpCategory: SagePointsCategory;
  dataRunningXpCategory: SagePointsCategory;
  lpCategory: SagePointsCategory;
  miningXpCategory: SagePointsCategory;
  pilotXpCategory: SagePointsCategory;
};
export type Crafting = SageNamedTypes["Crafting"];
export type Cargo = SageNamedTypes["Cargo"];
export type MiscVariables = SageNamedTypes["MiscVariables"];
export type MiscVariablesInput = SageNamedTypes["MiscVariablesInput"];

// Game Fleet Info
export type FleetInfo = SageNamedTypes["FleetInfo"];
export type ShipCounts = SageNamedTypes["ShipCounts"];
// Risk Zones related types
export type RiskZonesData = SageNamedTypes["RiskZonesData"];
export type RiskZoneData = SageNamedTypes["RiskZoneData"];
// Others
export type StarbaseUpkeepInfo = SageNamedTypes["StarbaseUpkeepInfo"];
export type StarbaseUpkeepLevels = {
  level0: StarbaseUpkeepInfo;
  level1: StarbaseUpkeepInfo;
  level2: StarbaseUpkeepInfo;
  level3: StarbaseUpkeepInfo;
  level4: StarbaseUpkeepInfo;
  level5: StarbaseUpkeepInfo;
  level6: StarbaseUpkeepInfo;
};
export type ProgressionItem = SageNamedTypes["ProgressionItem"];
export type LootInfo = SageNamedTypes["LootInfo"];

export type SageAccounts = {
  combatConfig: CombatConfig;
  craftingInstance: CraftingInstance;
  disbandedFleet: DisbandedFleet;
  fleet: Fleet;
  fleetShips: FleetShips;
  game: Game;
  gameState: GameState;
  loot: Loot;
  mineItem: MineItem;
  planet: Planet;
  playerCrewRecord: PlayerCrewRecord;
  progressionConfig: ProgressionConfig;
  resource: Resource;
  sageCrewConfig: SageCrewConfig;
  sagePlayerProfile: SagePlayerProfile;
  sector: Sector;
  ship: Ship;
  star: Star;
  starbase: Starbase;
  starbasePlayer: StarbasePlayer;
  surveyDataUnitTracker: SurveyDataUnitTracker;
};

// @staticImplements<ListenProgramStatic<SageProgram, SageAccounts, SageIDL>>()
// export class SageProgram extends ListenProgram<SageAccounts, SageIDL> {
//   constructor(program: SageIDLProgram) {
//     super(program, {
//       //@ ts-ignore
//       combatConfig: CombatConfig,
//       craftingInstance: CraftingInstance,
//       disbandedFleet: DisbandedFleet,
//       fleet: Fleet,
//       fleetShips: FleetShips,
//       game: Game,
//       gameState: GameState,
//       loot: Loot,
//       mineItem: MineItem,
//       planet: Planet,
//       playerCrewRecord: PlayerCrewRecord,
//       progressionConfig: ProgressionConfig,
//       resource: Resource,
//       sageCrewConfig: SageCrewConfig,
//       sagePlayerProfile: SagePlayerProfile,
//       sector: Sector,
//       ship: Ship,
//       star: Star,
//       starbase: Starbase,
//       starbasePlayer: StarbasePlayer,
//       surveyDataUnitTracker: SurveyDataUnitTracker,
//     });
//   }

//   static buildProgram(programId: PublicKey, provider?: Provider, coder?: Coder): SageIDLProgram {
//     return new Program(SAGE_IDL as any, programId, provider, coder);
//   }
// }
