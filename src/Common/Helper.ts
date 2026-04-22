import { FleetPreview, FleetShortPreview } from "../Common/types";
import { formatTimePeriod, u8aToString } from "../utils";
// using holosim cause there is more data fields and missing fields are becoming to undefined instead of 0 and that is causing some issues with logic and calculations
import { SageGameHandler, Fleet, ShipStats } from "../holoHandlers/HolosimMintsImporter";

export async function getFleetExtendedViewState(f: Fleet, gh?: SageGameHandler, now: number = Math.round(Date.now() / 1000)): Promise<FleetPreview> {
  // Fleet Stats
  let fs = f.data.stats as ShipStats;
  let fleetCollectionItem = {} as FleetPreview;
  fleetCollectionItem.key = f.key.toBase58();

  fleetCollectionItem.profileKey = gh ? await gh?.getFleetPlayerProfile(f).toBase58() : "";
  if (gh && fleetCollectionItem.profileKey) {
    let nr = await gh?.sagePlayerProfileHandler.getPlayerName([
      {
        memcmp: {
          offset: 8 + 1, // Discriminator + Profile PublicKey
          bytes: fleetCollectionItem.profileKey,
        },
      },
    ]);
    nr && nr.length > 0 && (fleetCollectionItem.profileName = nr.map((p) => p.name).join(","));
  }
  // General Data
  fleetCollectionItem.fleetName = `"${u8aToString(Uint8Array.from(f.data.fleetLabel))}"`;
  fleetCollectionItem.location = gh ? (await gh?.sageFleetHandler.getCurrentSector(f as any)).toSectorKey() : "NOT FETCHED";
  fleetCollectionItem.sateLabel = Object.keys(f.state).join(",");
  fleetCollectionItem.sate = f.state;
  fleetCollectionItem.crewCount = fs.miscStats.crewCount;
  fleetCollectionItem.requiredCrew = fs.miscStats.requiredCrew;

  // Combat.State
  fleetCollectionItem.lastCombat = f.data.lastCombatUpdate - now; // Ofthen negative value in seconds - means that many seconds ago - when last combat update was received - suppose that is last hit taken or attack made
  fleetCollectionItem.lastCombatUpdate = f.data.lastCombatUpdate;
  fleetCollectionItem.AP = f.data.ap;
  fleetCollectionItem.tAP = fs.combatStats.ap || undefined;
  fleetCollectionItem.apReg = fs.combatStats.apRegenRate / 100 || undefined;
  fleetCollectionItem.reloadAfter = Math.max(0, f.data.apReloadExpiresAt?.toNumber() - now);
  fleetCollectionItem.reloadAt = f.data.apReloadExpiresAt?.toNumber() || undefined;

  fleetCollectionItem.SP = f.data.sp || undefined;
  fleetCollectionItem.tSP = fs.combatStats.sp || undefined;
  fleetCollectionItem.spReg = fs.combatStats.shieldRechargeRate / 100 || undefined;

  // Time When broken shield will be fully up ( if no hit is taken )
  fleetCollectionItem.brokenShieldUpAfter = Math.max(0, f.data.shieldBreakDelayExpiresAt?.toNumber() - now) || undefined;
  // Time When shield will be fully up ( if no hit is taken and shield is currently broken )
  fleetCollectionItem.shieldBreakDelayExpiresAt = f.data.shieldBreakDelayExpiresAt?.toNumber() || undefined;
  // Time When shield will be fully up ( if no hit is taken and shield is currently broken )
  // fleetCollectionItem.shieldUpAfter = f.data.shieldBreakDelayExpiresAt?.toNumber() + 240 || undefined;
  // Seconds to recharge shield when not fully broken
  fleetCollectionItem.shieldUpAfter = (fs.combatStats.sp - f.data.sp) / (fleetCollectionItem.spReg || 1) || undefined;
  // timeStamp
  fleetCollectionItem.shieldUpAt = now + (fleetCollectionItem.shieldUpAfter || 0); // (fs.combatStats.sp - f.data.sp) / (fleetCollectionItem.spReg || 1) || undefined;

  fleetCollectionItem.HP = f.data.hp || undefined;
  fleetCollectionItem.pendingHp = f.data.pendingHp;
  fleetCollectionItem.tHP = fs.combatStats.hp || undefined;
  fleetCollectionItem.repair = fs.combatStats.repairRate / 100 || undefined;
  fleetCollectionItem.repairA = fs.combatStats.repairAbility || undefined;
  fleetCollectionItem.repairE = fs.combatStats.repairEfficiency || undefined;

  fleetCollectionItem.maxWarp = fs.movementStats.maxWarpDistance;
  fleetCollectionItem.warpCD = fs.movementStats.warpCoolDown;
  fleetCollectionItem.WarpCDLeft = Math.max(0, f.data.warpCooldownExpiresAt?.toNumber() - now);

  /** Cargo */
  fleetCollectionItem.fuelTank = fs.cargoStats.fuelCapacity;
  fleetCollectionItem.ammoBank = fs.cargoStats.ammoCapacity;
  fleetCollectionItem.cargoHold = fs.cargoStats.cargoCapacity;

  //  ... and More
  fleetCollectionItem.miningRate = fs.cargoStats.miningRate;
  fleetCollectionItem.respawnTime = fs.miscStats.respawnTime;
  fleetCollectionItem.timeStamp = now;

  /// Advanced - Expand Details;
  fleetCollectionItem.activities = {
    // refreshProfileData: async () => fetchProfileData(playerProfile, profileName),
    calcShieldAmountAfter: (time: number) => {
      return Math.min(Math.max(0, time) * (fleetCollectionItem.spReg || 1) + f.data.sp, fs.combatStats.sp);
    },
    calcHPAfter: (time: number) => {
      return Math.min(
        Math.max(0, time * (fleetCollectionItem.repair || 1) * (fleetCollectionItem.repairE || 1) * (fleetCollectionItem.repairA || 1) + f.data.hp),
        fs.combatStats.hp,
      );
    },
  };

  return fleetCollectionItem;
}

/**
 *
 * @param fleetCollectionItem
 * @param time in seconds
 * @returns
 */
export function getFleetShortViewState(fleetCollectionItem: FleetPreview, time = 60): FleetShortPreview {
  let shieldAfter = fleetCollectionItem?.activities?.calcShieldAmountAfter ? fleetCollectionItem?.activities?.calcShieldAmountAfter(time) : "";
  let hpAfter = fleetCollectionItem?.activities?.calcHPAfter ? fleetCollectionItem?.activities?.calcHPAfter(time) : "";
  return {
    profileKey: fleetCollectionItem.profileKey,
    profile: fleetCollectionItem.profileName,
    name: fleetCollectionItem?.fleetName,
    state: fleetCollectionItem?.sateLabel,
    location: fleetCollectionItem?.location,
    crew: fleetCollectionItem?.crewCount + "/" + fleetCollectionItem?.requiredCrew,
    // key: fleetCollectionItem.key,
    AP: fleetCollectionItem?.AP + "/" + fleetCollectionItem?.tAP,
    SP: fleetCollectionItem?.SP + "/" + fleetCollectionItem?.tSP,
    HP: fleetCollectionItem?.HP + "/" + fleetCollectionItem?.tHP + `[${fleetCollectionItem?.pendingHp || "-1"}]`,
    lastCombat: formatTimePeriod(fleetCollectionItem.lastCombat),

    "AP Reload After / SP Up ": fleetCollectionItem?.reloadAfter + "/" + fleetCollectionItem?.shieldUpAfter,
    "AP/SP/HP Reg":
      fleetCollectionItem?.apReg +
      "/" +
      fleetCollectionItem?.spReg +
      "/" +
      Number((fleetCollectionItem?.repair || 1) * (fleetCollectionItem?.repairE || 1) * (fleetCollectionItem?.repairA || 1)) / 100,
    "Warp CD Left": fleetCollectionItem?.WarpCDLeft || 0,
    "Shield Up After": fleetCollectionItem?.brokenShieldUpAfter || 0,
    "SP/HP After": `(${time}) /` + shieldAfter + "/" + hpAfter,
  };
}
