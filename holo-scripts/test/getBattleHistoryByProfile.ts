/**
 * getBattleHistoryByProfile.ts
 *
 * Extracts the battle history for a given player profile from on-chain transactions.
 * Uses CombatXpUserAccount (rather than fleet accounts) because fleets can be disbanded
 * after a battle. Parses CombatLogEvent, BattleLog, CombatLootDropEvent, and
 * StarbaseCombatEvent from the logs of each transaction. For each battle, also resolves
 * the enemy profile directly from the attackFleet instruction within the same transaction.
 *
 * Results are saved to logs/battle-history.<profile>.page-<N>.json
 *
 * Usage:
 *   bun run holo-scripts/test/getBattleHistoryByProfile.ts --profile <PLAYER_PROFILE_KEY>
 *   bun run holo-scripts/test/getBattleHistoryByProfile.ts --profileName <PLAYER_PROFILE_NAME>
 *
 * Examples:
 *   # Page 1, 100 battles
 *   bun run holo-scripts/test/getBattleHistoryByProfile.ts --profile Abc123...XYZ
 *
 *   # Page 2 (next 100 battles)
 *   bun run holo-scripts/test/getBattleHistoryByProfile.ts --profile Abc123...XYZ --page 2
 *
 *   # Smaller pages, slower scan (fewer rate-limit errors)
 *   bun run holo-scripts/test/getBattleHistoryByProfile.ts --profile Abc123...XYZ --pageSize 50 --signatureBatchSize 100
 *
 *   # Only the first 20 battles with limited scan depth
 *   bun run holo-scripts/test/getBattleHistoryByProfile.ts --profile Abc123...XYZ --pageSize 20 --maxRounds 5
 *
 * Options:
 *   --profile              PublicKey of the player profile account (required if --profileName not set)
 *   --profileName          Player display name to resolve the profile key automatically
 *   --page                 Page number to fetch (default: 1)
 *   --pageSize             Number of battles per page (default: 100)
 *   --signatureBatchSize   Number of signatures to fetch per round (default: 250)
 *   --maxRounds            Maximum number of fetch iterations (default: 40)
 *   --txBatchSize          Number of transactions to fetch in parallel (default: 8)
 *
 * Note: --profile and --profileName are mutually exclusive. --profileName performs an
 * on-chain name lookup and may match multiple profiles; the script will error unless
 * exactly one match is found.
 */

import { EventParser } from "@project-serum/anchor";
import { ConfirmedSignatureInfo, PublicKey, VersionedTransactionResponse } from "@solana/web3.js";
import { DispatcherHolosim as Dispatcher } from "../../src/holoHandlers/HolosimMintsImporter";
import { SAGE_IDL } from "../../src/holoHandlers/IDL/constants";
import bs58 from "bs58";
import { log } from "../../src/Common/PatchConsoleLog";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const argv = require("yargs").argv;

type BattleRole = "attacker" | "defender" | "unknown";

type ParticipantSummary = {
  fleetKey: string | null;
  fleetLabel: string;
  ownerProfile: string | null;
  playerKey: string | null;
  faction: number | null;
  preHp: number | null;
  preSp: number | null;
  preAp: number | null;
  postHp: number | null;
  postSp: number | null;
  postAp: number | null;
  totalAttackPower: number | null;
  totalDefensePower: number | null;
  agility: number | null;
  positionX: number | null;
  positionY: number | null;
  sectorKey: string | null;
  ammoCount: number | null;
  fuelCount: number | null;
  combatXp: number | null;
  councilRank: number | null;
};

type BattleRecord = {
  combatId: string;
  signature: string;
  slot: number;
  blockTime: number | null;
  timestamp: number | null;
  ownRole: BattleRole;
  outcome: string;
  combatType: number | null;
  battleType: "fleet" | "starbase" | "unknown";
  wasRetaliation: boolean | null;
  battleDuration: number | null;
  randomSeed: number | null;
  attacker: ParticipantSummary | null;
  defender: ParticipantSummary | null;
  attackDamageDealt: number | null;
  defenseDamageDealt: number | null;
  attackerDestroyed: boolean | null;
  defenderDestroyed: boolean | null;
  attackerXpGained: number | null;
  defenderXpGained: number | null;
  attackerTrophiesGained: number | null;
  defenderTrophiesGained: number | null;
  ownCombatXpUserAccount: string | null;
  enemyCombatXpUserAccount: string | null;
  enemyProfileFromCombatXpUserAccount: string | null;
  fleetBattleLog: {
    attackerFleet: string | null;
    defenderFleet: string | null;
    sector: [number | null, number | null];
    attackerPreHp: number | null;
    attackerPreSp: number | null;
    defenderPreHp: number | null;
    defenderPreSp: number | null;
    attackerPostHp: number | null;
    attackerPostSp: number | null;
    defenderPostHp: number | null;
    defenderPostSp: number | null;
    damageToAttackerHp: number | null;
    damageToAttackerSp: number | null;
    damageToDefenderHp: number | null;
    damageToDefenderSp: number | null;
    damageAppliedToAttackerHp: number | null;
    damageAppliedToAttackerSp: number | null;
    damageAppliedToDefenderHp: number | null;
    damageAppliedToDefenderSp: number | null;
  } | null;
  starbaseBattle: {
    targetStarbase: string | null;
    sectorKey: string | null;
    attackerFaction: number | null;
    starbaseFaction: number | null;
    damageDealt: number | null;
    starbaseDestroyed: boolean | null;
    starbaseCaptured: boolean | null;
    starbaseHpBefore: number | null;
    starbaseHpAfter: number | null;
  } | null;
  lootDrop: {
    destroyedFleet: string | null;
    destroyerFleet: string | null;
    lootAccount: string | null;
    lootLocationX: number | null;
    lootLocationY: number | null;
    lootExclusivityTime: number | null;
    timestamp: number | null;
  } | null;
  eventNames: string[];
};

type PageOptions = {
  page: number;
  pageSize: number;
  signatureBatchSize: number;
  txBatchSize: number;
  maxRounds: number;
};

const options: PageOptions = {
  page: Math.max(1, Number(argv.page || 1)),
  pageSize: Math.max(1, Number(argv.pageSize || 100)),
  signatureBatchSize: Math.max(25, Math.min(1000, Number(argv.signatureBatchSize || 250))),
  txBatchSize: Math.max(1, Math.min(20, Number(argv.txBatchSize || 8))),
  maxRounds: Math.max(1, Number(argv.maxRounds || 40)),
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function run() {
  const profileArg = String(argv.profile || process.env["PLAYER_PROFILE"] || "").trim();
  const profileNameArg = String(argv.profileName || "").trim();

  if (!profileArg && !profileNameArg) {
    throw new Error("Missing --profile=<PLAYER_PROFILE_PUBLIC_KEY> or --profileName=<PLAYER_NAME>");
  }

  const dispatcher = await Dispatcher.build({ useLookupTables: false, wallet_secret_key: "", player_profile: "", owner_public_key: "" });
  const gameHandler = dispatcher.sageGameHandler;

  let profile: PublicKey;
  if (profileNameArg) {
    const matches = await gameHandler.sagePlayerProfileHandler.findPlayerProfileByName([profileNameArg]);
    // const matches = await gameHandler.sagePlayerProfileHandler.findPlayerProfileByName([profileNameArg]);
    if (matches.length === 0) {
      throw new Error(`No profile found with name matching "${profileNameArg}"`);
    }
    log(`Found ${matches.length} profiles matching [${matches.join(",")}]`); // Debug log to show how many matches were found

    if (matches.length > 1) {
      log(`Multiple profiles match "${profileNameArg}" `);
      log(`Using first match: ${matches[0].key}`);
    }
    profile = matches[0].key;
    console.log(`Resolved --profileName "${profileNameArg}" → ${profile.toBase58()}`);
  } else {
    profile = new PublicKey(profileArg);
  }
  const combatXpUserAccount = await gameHandler.getUserPointsAddress(profile, gameHandler.combatXpCategory);
  const parser = new EventParser(gameHandler.program.programId, gameHandler.program.coder as any);
  const instructionDiscriminators = buildInstructionDiscriminatorMap();
  const instructionDecoder = (data: Buffer): string | null => {
    return decodeInstructionNameFromDiscriminator(data, instructionDiscriminators);
  };
  const profileByUserPointsCache = new Map<string, string | null>();

  const result = await fetchBattleHistoryPage(
    gameHandler.getConnection(),
    parser,
    profile,
    combatXpUserAccount,
    options,
    gameHandler.program.programId,
    gameHandler.pointsProgram,
    gameHandler.combatXpCategory,
    profileByUserPointsCache,
    instructionDecoder,
  );

  const outDir = path.join(process.cwd(), "logs");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `battle-history.${profile.toBase58()}.page-${options.page}.json`);
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2));

  console.log(`Profile: ${profile.toBase58()}`);
  console.log(`CombatXpUserAccount: ${combatXpUserAccount.toBase58()}`);
  console.log(`Page: ${result.page} pageSize: ${result.pageSize}`);
  console.log(`Matched combats: ${result.totalMatched}`);
  console.log(`Has more: ${result.hasMore}`);
  console.log(`Saved detailed history to: ${outFile}`);

  console.table(
    result.items.map((item) => ({
      time: formatUnix(item.timestamp || item.blockTime),
      role: item.ownRole,
      attackerFleet: item.attacker?.fleetLabel || shortKey(item.attacker?.fleetKey),
      defenderFleet: item.defender?.fleetLabel || shortKey(item.defender?.fleetKey),
      attackerProfile: shortKey(item.attacker?.ownerProfile),
      defenderProfile: shortKey(item.defender?.ownerProfile),
      enemyProfileFromCxp: shortKey(item.enemyProfileFromCombatXpUserAccount),
      outcome: item.outcome,
      attackDamage: item.attackDamageDealt,
      defenseDamage: item.defenseDamageDealt,
      signature: shortKey(item.signature),
    })),
  );
}

async function fetchBattleHistoryPage(
  connection: { getSignaturesForAddress: Function; getTransaction: Function },
  parser: EventParser,
  profile: PublicKey,
  combatXpUserAccount: PublicKey,
  pageOptions: PageOptions,
  sageProgramId: PublicKey,
  pointsProgram: any,
  combatXpCategory: PublicKey,
  profileByUserPointsCache: Map<string, string | null>,
  instructionDecoder: (data: Buffer) => string | null,
) {
  const targetCount = pageOptions.page * pageOptions.pageSize;
  const seenSignatures = new Set<string>();
  const battles = new Map<string, BattleRecord>();
  let before: string | undefined;
  let exhausted = false;
  let rounds = 0;

  while (!exhausted && rounds < pageOptions.maxRounds && battles.size < targetCount) {
    log(rounds > 0 ? `Fetching page ${pageOptions.page} (round ${rounds + 1})...` : "Fetching battle history...", {
      page: pageOptions.page,
      round: rounds + 1,
    });
    rounds += 1;
    const signatures = (await connection.getSignaturesForAddress(combatXpUserAccount, {
      before,
      limit: pageOptions.signatureBatchSize,
    })) as ConfirmedSignatureInfo[];

    if (!signatures.length) {
      exhausted = true;
      break;
    }

    before = signatures[signatures.length - 1].signature;
    if (signatures.length < pageOptions.signatureBatchSize) {
      exhausted = true;
    }

    const freshSignatures = signatures.filter((info) => {
      if (seenSignatures.has(info.signature)) {
        return false;
      }
      seenSignatures.add(info.signature);
      return true;
    });

    for (const chunk of chunkArray(freshSignatures, pageOptions.txBatchSize)) {
      const txs = await Promise.all(
        chunk.map(async (info) => ({
          info,
          tx: (await connection.getTransaction(info.signature, {
            commitment: "confirmed",
            maxSupportedTransactionVersion: 0,
          })) as VersionedTransactionResponse | null,
        })),
      );

      for (const { info, tx } of txs) {
        const parsed = await parseBattleRecords(
          profile.toBase58(),
          info,
          tx,
          parser,
          sageProgramId,
          pointsProgram,
          combatXpCategory,
          profileByUserPointsCache,
          instructionDecoder,
        );
        for (const record of parsed) {
          battles.set(record.combatId, record);
        }
      }
    }
  }

  const ordered = Array.from(battles.values()).sort((left, right) => {
    return (right.timestamp || right.blockTime || 0) - (left.timestamp || left.blockTime || 0) || right.slot - left.slot;
  });
  const start = (pageOptions.page - 1) * pageOptions.pageSize;

  return {
    profile: profile.toBase58(),
    combatXpUserAccount: combatXpUserAccount.toBase58(),
    page: pageOptions.page,
    pageSize: pageOptions.pageSize,
    totalMatched: ordered.length,
    hasMore: ordered.length > start + pageOptions.pageSize || !exhausted,
    items: ordered.slice(start, start + pageOptions.pageSize),
  };
}

async function parseBattleRecords(
  profileKey: string,
  signatureInfo: ConfirmedSignatureInfo,
  tx: VersionedTransactionResponse | null,
  parser: EventParser,
  sageProgramId: PublicKey,
  pointsProgram: any,
  combatXpCategory: PublicKey,
  profileByUserPointsCache: Map<string, string | null>,
  instructionDecoder: (data: Buffer) => string | null,
): Promise<BattleRecord[]> {
  const logs = tx?.meta?.logMessages || [];
  if (!logs.length) {
    return [];
  }

  const parsedEvents = Array.from(parser.parseLogs(logs) as Iterable<{ name: string; data: any }>);
  if (!parsedEvents.length) {
    return [];
  }

  const attackFleetCombatXpAccounts = extractAttackFleetCombatXpAccounts(tx, sageProgramId, combatXpCategory, instructionDecoder);

  const battles = new Map<string, BattleRecord>();
  for (const event of parsedEvents) {
    switch (event.name) {
      case "CombatLogEvent": {
        const combatId = bytesToHex(event.data.combatId);
        const attacker = normalizeParticipant(event.data.attacker);
        const defender = normalizeParticipant(event.data.defender);
        const ownRole = resolveOwnRole(profileKey, attacker, defender);
        if (ownRole === "unknown") {
          break;
        }

        const record = getOrCreateRecord(battles, combatId, signatureInfo, tx);
        record.eventNames.push(event.name);
        record.timestamp = toNumber(event.data.timestamp) ?? record.timestamp;
        record.ownRole = ownRole;
        record.combatType = toNumber(event.data.combatType);
        record.battleType = event.data.targetStarbaseKey ? "starbase" : "fleet";
        record.wasRetaliation = toBoolean(event.data.wasRetaliation);
        record.battleDuration = toNumber(event.data.battleDuration);
        record.randomSeed = toNumber(event.data.combatRandomSeed);
        record.attacker = attacker;
        record.defender = defender;
        record.attackDamageDealt = toNumber(event.data.attackDamageDealt);
        record.defenseDamageDealt = toNumber(event.data.defenseDamageDealt);
        record.attackerDestroyed = toBoolean(event.data.attackerDestroyed);
        record.defenderDestroyed = toBoolean(event.data.defenderDestroyed);
        record.attackerXpGained = toNumber(event.data.attackerXpGained);
        record.defenderXpGained = toNumber(event.data.defenderXpGained);
        record.attackerTrophiesGained = toNumber(event.data.attackerTrophiesGained);
        record.defenderTrophiesGained = toNumber(event.data.defenderTrophiesGained);

        if (attackFleetCombatXpAccounts) {
          record.ownCombatXpUserAccount =
            ownRole === "attacker"
              ? attackFleetCombatXpAccounts.attackerCombatXpUserAccount
              : attackFleetCombatXpAccounts.defenderCombatXpUserAccount;
          record.enemyCombatXpUserAccount =
            ownRole === "attacker"
              ? attackFleetCombatXpAccounts.defenderCombatXpUserAccount
              : attackFleetCombatXpAccounts.attackerCombatXpUserAccount;

          if (record.enemyCombatXpUserAccount) {
            record.enemyProfileFromCombatXpUserAccount = await resolveProfileFromUserPointsAccount(
              pointsProgram,
              record.enemyCombatXpUserAccount,
              profileByUserPointsCache,
            );
          }
        }

        record.outcome = describeOutcome(record);
        break;
      }
      case "BattleLog": {
        const combatId = bytesToHex(event.data.combatId);
        const record = getOrCreateRecord(battles, combatId, signatureInfo, tx);
        record.eventNames.push(event.name);
        record.fleetBattleLog = {
          attackerFleet: toBase58(event.data.attackerFleet),
          defenderFleet: toBase58(event.data.defenderFleet),
          sector: [toArrayNumber(event.data.sector, 0), toArrayNumber(event.data.sector, 1)],
          attackerPreHp: toNumber(event.data.attackerPreHp),
          attackerPreSp: toNumber(event.data.attackerPreSp),
          defenderPreHp: toNumber(event.data.defenderPreHp),
          defenderPreSp: toNumber(event.data.defenderPreSp),
          attackerPostHp: toNumber(event.data.attackerPostHp),
          attackerPostSp: toNumber(event.data.attackerPostSp),
          defenderPostHp: toNumber(event.data.defenderPostHp),
          defenderPostSp: toNumber(event.data.defenderPostSp),
          damageToAttackerHp: toNumber(event.data.damageToAttackerHp),
          damageToAttackerSp: toNumber(event.data.damageToAttackerSp),
          damageToDefenderHp: toNumber(event.data.damageToDefenderHp),
          damageToDefenderSp: toNumber(event.data.damageToDefenderSp),
          damageAppliedToAttackerHp: toNumber(event.data.damageAppliedToAttackerHp),
          damageAppliedToAttackerSp: toNumber(event.data.damageAppliedToAttackerSp),
          damageAppliedToDefenderHp: toNumber(event.data.damageAppliedToDefenderHp),
          damageAppliedToDefenderSp: toNumber(event.data.damageAppliedToDefenderSp),
        };
        record.outcome = describeOutcome(record);
        break;
      }
      case "CombatLootDropEvent": {
        const combatId = bytesToHex(event.data.combatId);
        const record = getOrCreateRecord(battles, combatId, signatureInfo, tx);
        record.eventNames.push(event.name);
        record.lootDrop = {
          destroyedFleet: toBase58(event.data.destroyedFleet),
          destroyerFleet: toBase58(event.data.destroyerFleet),
          lootAccount: toBase58(event.data.lootAccount),
          lootLocationX: toNumber(event.data.lootLocationX),
          lootLocationY: toNumber(event.data.lootLocationY),
          lootExclusivityTime: toNumber(event.data.lootExclusivityTime),
          timestamp: toNumber(event.data.timestamp),
        };
        record.outcome = describeOutcome(record);
        break;
      }
      case "StarbaseCombatEvent": {
        const combatId = bytesToHex(event.data.combatId);
        const record = getOrCreateRecord(battles, combatId, signatureInfo, tx);
        record.eventNames.push(event.name);
        record.battleType = "starbase";
        record.starbaseBattle = {
          targetStarbase: toBase58(event.data.targetStarbase),
          sectorKey: toBase58(event.data.sectorKey),
          attackerFaction: toNumber(event.data.attackerFaction),
          starbaseFaction: toNumber(event.data.starbaseFaction),
          damageDealt: toNumber(event.data.damageDealt),
          starbaseDestroyed: toBoolean(event.data.starbaseDestroyed),
          starbaseCaptured: toBoolean(event.data.starbaseCaptured),
          starbaseHpBefore: toNumber(event.data.starbaseHpBefore),
          starbaseHpAfter: toNumber(event.data.starbaseHpAfter),
        };
        record.outcome = describeOutcome(record);
        break;
      }
      default:
        break;
    }
  }

  return Array.from(battles.values()).filter((record) => record.ownRole !== "unknown");
}

function getOrCreateRecord(
  records: Map<string, BattleRecord>,
  combatId: string,
  signatureInfo: ConfirmedSignatureInfo,
  tx: VersionedTransactionResponse | null,
) {
  let record = records.get(combatId);
  if (!record) {
    record = {
      combatId,
      signature: signatureInfo.signature,
      slot: signatureInfo.slot,
      blockTime: signatureInfo.blockTime ?? tx?.blockTime ?? null,
      timestamp: signatureInfo.blockTime ?? tx?.blockTime ?? null,
      ownRole: "unknown",
      outcome: "unknown",
      combatType: null,
      battleType: "unknown",
      wasRetaliation: null,
      battleDuration: null,
      randomSeed: null,
      attacker: null,
      defender: null,
      attackDamageDealt: null,
      defenseDamageDealt: null,
      attackerDestroyed: null,
      defenderDestroyed: null,
      attackerXpGained: null,
      defenderXpGained: null,
      attackerTrophiesGained: null,
      defenderTrophiesGained: null,
      ownCombatXpUserAccount: null,
      enemyCombatXpUserAccount: null,
      enemyProfileFromCombatXpUserAccount: null,
      fleetBattleLog: null,
      starbaseBattle: null,
      lootDrop: null,
      eventNames: [],
    };
    records.set(combatId, record);
  }
  return record;
}

function resolveOwnRole(profileKey: string, attacker: ParticipantSummary | null, defender: ParticipantSummary | null): BattleRole {
  if (attacker?.ownerProfile === profileKey) {
    return "attacker";
  }
  if (defender?.ownerProfile === profileKey) {
    return "defender";
  }
  return "unknown";
}

function normalizeParticipant(input: any): ParticipantSummary | null {
  if (!input) {
    return null;
  }

  return {
    fleetKey: toBase58(input.fleetKey),
    fleetLabel: decodeFleetLabel(input.fleetLabel),
    ownerProfile: toBase58(input.ownerProfile),
    playerKey: toBase58(input.playerKey),
    faction: toNumber(input.faction),
    preHp: toNumber(input.preHp),
    preSp: toNumber(input.preSp),
    preAp: toNumber(input.preAp),
    postHp: toNumber(input.postHp),
    postSp: toNumber(input.postSp),
    postAp: toNumber(input.postAp),
    totalAttackPower: toNumber(input.totalAttackPower),
    totalDefensePower: toNumber(input.totalDefensePower),
    agility: toNumber(input.agility),
    positionX: toNumber(input.positionX),
    positionY: toNumber(input.positionY),
    sectorKey: toBase58(input.sectorKey),
    ammoCount: toNumber(input.ammoCount),
    fuelCount: toNumber(input.fuelCount),
    combatXp: toNumber(input.combatXp),
    councilRank: toNumber(input.councilRank),
  };
}

function describeOutcome(record: BattleRecord): string {
  if (record.starbaseBattle?.starbaseCaptured) {
    return "starbase captured";
  }
  if (record.starbaseBattle?.starbaseDestroyed) {
    return "starbase destroyed";
  }
  if (record.attackerDestroyed && record.defenderDestroyed) {
    return "mutual destruction";
  }
  if (record.defenderDestroyed) {
    return record.ownRole === "attacker" ? "victory" : "defeat";
  }
  if (record.attackerDestroyed) {
    return record.ownRole === "defender" ? "victory" : "defeat";
  }
  if (record.lootDrop) {
    return "loot dropped";
  }
  if ((record.attackDamageDealt || 0) > 0 || (record.defenseDamageDealt || 0) > 0) {
    return "engaged";
  }
  return "unknown";
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function bytesToHex(value: unknown): string {
  return Buffer.from(normalizeBytes(value)).toString("hex");
}

function decodeFleetLabel(value: unknown): string {
  return Buffer.from(normalizeBytes(value)).toString("utf8").replace(/\0+$/g, "").trim();
}

function normalizeBytes(value: unknown): number[] {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((entry) => Number(entry) || 0);
  }
  if (value instanceof Uint8Array) {
    return Array.from(value.values());
  }
  if (Buffer.isBuffer(value)) {
    return Array.from(value.values());
  }
  return [];
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === "object" && value && "toNumber" in (value as Record<string, unknown>)) {
    return toNumber((value as { toNumber: () => number }).toNumber());
  }
  if (typeof value === "object" && value && "toString" in (value as Record<string, unknown>)) {
    return toNumber((value as { toString: () => string }).toString());
  }
  return null;
}

function toBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    return value === "true" || value === "1";
  }
  return null;
}

function toBase58(value: unknown): string | null {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof PublicKey) {
    return value.toBase58();
  }
  if (typeof value === "object" && value && "toBase58" in (value as Record<string, unknown>)) {
    return (value as { toBase58: () => string }).toBase58();
  }
  return null;
}

function toArrayNumber(value: unknown, index: number): number | null {
  if (!Array.isArray(value)) {
    return null;
  }
  return toNumber(value[index]);
}

function shortKey(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }
  if (value.length < 12) {
    return value;
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function formatUnix(value: number | null): string {
  if (!value) {
    return "-";
  }
  return new Date(value * 1000).toISOString();
}

function buildInstructionDiscriminatorMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const instruction of SAGE_IDL.instructions || []) {
    const name = (instruction as any)?.name;
    if (!name) {
      continue;
    }
    map.set(instructionDiscriminatorHex(name), name);
  }
  return map;
}

function instructionDiscriminatorHex(instructionName: string): string {
  const preimage = `global:${instructionName}`;
  const digest: Buffer = crypto.createHash("sha256").update(preimage).digest();
  return digest.subarray(0, 8).toString("hex");
}

function decodeInstructionNameFromDiscriminator(data: Buffer, discriminatorMap: Map<string, string>): string | null {
  if (!data || data.length < 8) {
    return null;
  }
  const discriminator = data.subarray(0, 8).toString("hex");
  return discriminatorMap.get(discriminator) || null;
}

function extractAttackFleetCombatXpAccounts(
  tx: VersionedTransactionResponse | null,
  sageProgramId: PublicKey,
  combatXpCategory: PublicKey,
  instructionDecoder: (data: Buffer) => string | null,
): { attackerCombatXpUserAccount: string | null; defenderCombatXpUserAccount: string | null } | null {
  if (!tx) {
    return null;
  }

  const attackFleetAccounts = getInstructionAccountLayout("attackFleet");
  if (!attackFleetAccounts.length) {
    return null;
  }

  const attackerIdx = attackFleetAccounts.findIndex((name) => name === "attackerCombatXp");
  const defenderIdx = attackFleetAccounts.findIndex((name) => name === "defenderCombatXp");
  const categoryIdx = attackFleetAccounts.findIndex((name) => name === "combatXpCategory");
  if (attackerIdx < 0 || defenderIdx < 0 || categoryIdx < 0) {
    return null;
  }

  const message: any = tx.transaction.message as any;
  const compiledInstructions: any[] = message.compiledInstructions || message.instructions || [];
  for (const instruction of compiledInstructions) {
    const programId = getInstructionProgramId(tx, instruction);
    if (!programId || !programId.equals(sageProgramId)) {
      continue;
    }

    const decodedName = decodeInstructionName(instruction, instructionDecoder);
    if (decodedName !== "attackFleet") {
      continue;
    }

    const accountIndexes: number[] = instruction.accountKeyIndexes || instruction.accounts || [];
    const categoryAccount = accountIndexes[categoryIdx] !== undefined ? getMessageAccountKey(tx, accountIndexes[categoryIdx]) : null;
    if (!categoryAccount || !categoryAccount.equals(combatXpCategory)) {
      continue;
    }

    const attackerAccount = accountIndexes[attackerIdx] !== undefined ? getMessageAccountKey(tx, accountIndexes[attackerIdx]) : null;
    const defenderAccount = accountIndexes[defenderIdx] !== undefined ? getMessageAccountKey(tx, accountIndexes[defenderIdx]) : null;

    return {
      attackerCombatXpUserAccount: attackerAccount?.toBase58() || null,
      defenderCombatXpUserAccount: defenderAccount?.toBase58() || null,
    };
  }

  return null;
}

function getInstructionAccountLayout(instructionName: string): string[] {
  const instruction = (SAGE_IDL.instructions || []).find((ix) => ix.name === instructionName);
  if (!instruction || !Array.isArray((instruction as any).accounts)) {
    return [];
  }
  return ((instruction as any).accounts as Array<{ name: string }>).map((account) => account.name);
}

function decodeInstructionName(instruction: any, instructionDecoder: (data: Buffer) => string | null): string | null {
  const dataBuffer = getInstructionDataBuffer(instruction);
  if (!dataBuffer) {
    return null;
  }
  return instructionDecoder(dataBuffer);
}

function getInstructionDataBuffer(instruction: any): Buffer | null {
  if (!instruction) {
    return null;
  }
  if (instruction.data instanceof Uint8Array) {
    return Buffer.from(instruction.data);
  }
  if (Buffer.isBuffer(instruction.data)) {
    return instruction.data;
  }
  if (typeof instruction.data === "string") {
    try {
      return Buffer.from(bs58.decode(instruction.data));
    } catch {
      return null;
    }
  }
  return null;
}

function getInstructionProgramId(tx: VersionedTransactionResponse, instruction: any): PublicKey | null {
  if (instruction.programId) {
    return instruction.programId as PublicKey;
  }
  if (typeof instruction.programIdIndex !== "number") {
    return null;
  }
  return getMessageAccountKey(tx, instruction.programIdIndex);
}

function getMessageAccountKey(tx: VersionedTransactionResponse, index: number): PublicKey | null {
  const message: any = tx.transaction.message as any;
  if (typeof message.getAccountKeys === "function") {
    const keys = message.getAccountKeys({ accountKeysFromLookups: tx.meta?.loadedAddresses });
    const key = keys.get(index);
    return key || null;
  }

  const keys: PublicKey[] = message.accountKeys || [];
  return keys[index] || null;
}

async function resolveProfileFromUserPointsAccount(
  pointsProgram: any,
  userPointsAccountKey: string,
  cache: Map<string, string | null>,
): Promise<string | null> {
  if (cache.has(userPointsAccountKey)) {
    return cache.get(userPointsAccountKey) || null;
  }

  try {
    const account = await pointsProgram.account.userPointsAccount.fetch(new PublicKey(userPointsAccountKey));
    const profile = toBase58(account?.profile) || null;
    cache.set(userPointsAccountKey, profile);
    return profile;
  } catch {
    cache.set(userPointsAccountKey, null);
    return null;
  }
}
