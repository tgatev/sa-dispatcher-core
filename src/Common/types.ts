import { PublicKey } from "@solana/web3.js";
import { FleetStateData } from "@staratlas/sage-main";
import { Loot } from "../holoHandlers/mod/loot";
import { LootInfo } from "../holoHandlers/IDL/constants";
import { Account as TokenAccount } from "@solana/spl-token";

export type InventoryPreviewItem = { [key: string]: any };

export type ProfileExpandedData = {
  fleets: {
    // Key is profile public key
    shortDetails: { [key: string]: FleetShortPreview };
    expandDetails: { [key: string]: FleetPreview };
  };
  inventories: InventoryPreviewItem[];
  craftingOrders: any[];
  upgradeOrders: any[];
  battleHistory: {
    aggregations: {
      wins: number;
      losses: number;
      sectors: { [key: string]: number };
    } | null;
    battles: any[];
  };
};

export type FleetShortPreview = { [key: string]: any };

export type FleetPreview = {
  key: string;
  profileKey: PublicKey | string;
  profileName: string;
  fleetName: string;
  location: string;
  sateLabel: string;
  sate: FleetStateData;
  crewCount: number;
  requiredCrew: number;

  /** Combat Stats */
  // seconds
  lastCombat: number;
  // timeStamp
  lastCombatUpdate: number;
  AP?: number;
  tAP?: number;
  apReg?: number;
  reloadAfter?: number;
  reloadAt?: number;
  SP?: number;
  tSP?: number;
  spReg?: number;

  // [seconds] after which broken shield will be fully up ( if no hit is taken )
  brokenShieldUpAfter?: number;
  // timestamp when shield break delay expires
  shieldBreakDelayExpiresAt?: number;
  // [seconds] to recharge shield when not fully broken
  shieldUpAfter?: number;
  // time Stamp when shield will be up ( if no hit is taken and shield is currently broken )
  shieldUpAt?: number;

  HP?: number;
  pendingHp?: number;
  tHP?: number;
  repair?: number;
  repairA?: number;
  repairE?: number;

  maxWarp: number;
  warpCD: number;
  WarpCDLeft: number;

  fuelTank: number;
  ammoBank: number;
  cargoHold: number;

  miningRate: number;
  respawnTime: number;
  timeStamp: number;

  activities?: {
    refreshProfileData?: () => Promise<ProfileExpandedData>;
    calcShieldAmountAfter?: (time: number) => number;
    calcHPAfter?: (time: number) => number;
  };
};

export type LootDetails = {
  lootAccount: Loot;
  activeItem: LootInfo;
  lootCargoKey: PublicKey;
  // lootTokens: TokenAccount[]
};
