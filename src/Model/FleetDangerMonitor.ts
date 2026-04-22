import { iAction } from "../..";
import { Fleet } from "@staratlas/sage-main";
import { PublicKey } from "@solana/web3.js";
import { AwaitingActionRuntime } from "./AwaitingActionRuntime";
import { GameMapStore, FleetSnapshot } from "../Common/GameMapService";

export type FleetDangerTrigger = {
  type: "enemy-proximity" | "low-hp" | "low-sp" | "low-ap";
  message: string;
  distance?: number;
  ownSnapshot?: FleetSnapshot;
  otherSnapshot?: FleetSnapshot;
  action: iAction;
};

export type FleetDangerMonitorOptions = {
  actionFilter?: (action: iAction) => boolean;
  maxEnemyDistance?: number;
  enemyFactionsOnly?: boolean;
  minHpRatio?: number;
  minSpRatio?: number;
  minAp?: number;
  triggerOncePerAction?: boolean;
  onDanger?: (danger: FleetDangerTrigger) => Promise<void> | void;
  logger?: (...args: unknown[]) => void;
};

export interface FleetDangerMonitorContext {
  fleetName: string;
  getGameMap(): GameMapStore | undefined;
  fetchFleetPublicKey(): Promise<PublicKey>;
  getFleetAccount?(): Fleet | undefined;
  fetchFleetAccount?(): Promise<Fleet>;
  defaultLogger?(...args: unknown[]): void;
}

export class FleetDangerMonitor {
  constructor(
    private readonly runtime: AwaitingActionRuntime<iAction, any>,
    private readonly context: FleetDangerMonitorContext,
  ) {}

  watch(options: FleetDangerMonitorOptions = {}): () => void {
    return this.runtime.addWatcher(async ({ action }) => {
      if (options.actionFilter && !options.actionFilter(action)) {
        return;
      }

      const gameMap = this.context.getGameMap();
      if (!gameMap) {
        return;
      }

      let ownFleetPubkey: string;
      try {
        ownFleetPubkey = (await this.context.fetchFleetPublicKey()).toBase58();
      } catch {
        return;
      }

      const log = options.logger || this.context.defaultLogger || ((..._args: unknown[]) => {});
      const triggerOncePerAction = options.triggerOncePerAction !== false;
      let disposed = false;
      let triggered = false;

      const getOwnFaction = (ownSnapshot?: FleetSnapshot, fleetAccount?: Fleet): string | undefined => {
        const snapshotFaction = ownSnapshot?.faction;
        if (snapshotFaction !== undefined && snapshotFaction !== null) {
          return String(snapshotFaction);
        }
        const fleetFaction = (fleetAccount as any)?.data?.faction;
        if (fleetFaction !== undefined && fleetFaction !== null) {
          return String(fleetFaction);
        }
        return undefined;
      };

      const getCombatStats = (ownSnapshot?: FleetSnapshot, fleetAccount?: Fleet) => {
        const raw: any = ownSnapshot?.raw || fleetAccount;
        const rawData: any = (raw as any)?.data;
        const fallbackData: any = (fleetAccount as any)?.data;
        const fleetData: any = rawData || fallbackData;
        const combatStats: any = rawData?.stats?.combatStats || fallbackData?.stats?.combatStats;
        const hp = Number(fleetData?.hp ?? 0);
        const sp = Number(fleetData?.sp ?? 0);
        const ap = Number(fleetData?.ap ?? 0);
        const maxHp = Number(combatStats?.hp ?? 0);
        const maxSp = Number(combatStats?.sp ?? 0);
        const maxAp = Number(combatStats?.ap ?? 0);
        return {
          hp,
          sp,
          ap,
          maxHp,
          maxSp,
          maxAp,
          hpRatio: maxHp > 0 ? hp / maxHp : 1,
          spRatio: maxSp > 0 ? sp / maxSp : 1,
        };
      };

      const triggerDanger = async (danger: FleetDangerTrigger) => {
        if (disposed) {
          return;
        }
        if (triggerOncePerAction && triggered) {
          return;
        }
        triggered = true;

        log(`[DangerMonitor][${this.context.fleetName}]`, danger.message);
        await options.onDanger?.(danger);
        await this.runtime.signalAbort({
          reason: danger.type,
          message: danger.message,
          source: "FleetProcess.watchDangerWhileAwaitingAction",
          distance: danger.distance,
          ownFleetPubkey,
          enemyFleetPubkey: danger.otherSnapshot?.pubkey,
        });
      };

      const evaluateSnapshot = async (otherSnapshot?: FleetSnapshot) => {
        if (disposed) {
          return;
        }

        const ownSnapshot = gameMap.getFleet(ownFleetPubkey);
        const fleetAccount = this.context.getFleetAccount?.() || ((await this.context.fetchFleetAccount?.().catch(() => undefined)) as Fleet | undefined);
        const ownFaction = getOwnFaction(ownSnapshot, fleetAccount);
        const combatStats = getCombatStats(ownSnapshot, fleetAccount);

        if (options.minHpRatio !== undefined && combatStats.hpRatio <= options.minHpRatio) {
          await triggerDanger({
            type: "low-hp",
            message: `HP dropped below threshold (${combatStats.hpRatio.toFixed(2)} <= ${options.minHpRatio}) during ${action.constructor.name}`,
            ownSnapshot,
            action,
          });
          return;
        }

        if (options.minSpRatio !== undefined && combatStats.spRatio <= options.minSpRatio) {
          await triggerDanger({
            type: "low-sp",
            message: `SP dropped below threshold (${combatStats.spRatio.toFixed(2)} <= ${options.minSpRatio}) during ${action.constructor.name}`,
            ownSnapshot,
            action,
          });
          return;
        }

        if (options.minAp !== undefined && combatStats.ap <= options.minAp) {
          await triggerDanger({
            type: "low-ap",
            message: `AP dropped below threshold (${combatStats.ap} <= ${options.minAp}) during ${action.constructor.name}`,
            ownSnapshot,
            action,
          });
          return;
        }

        if (otherSnapshot && otherSnapshot.pubkey !== ownFleetPubkey && ownSnapshot?.position && options.maxEnemyDistance !== undefined) {
          if (options.enemyFactionsOnly !== false && ownFaction && String(otherSnapshot.faction) === ownFaction) {
            return;
          }

          const distance =
            Math.abs(Number(ownSnapshot.position.x) - Number(otherSnapshot.position.x)) +
            Math.abs(Number(ownSnapshot.position.y) - Number(otherSnapshot.position.y));

          if (distance <= options.maxEnemyDistance) {
            await triggerDanger({
              type: "enemy-proximity",
              message: `Enemy fleet ${otherSnapshot.pubkey} entered danger radius ${distance}/${options.maxEnemyDistance} during ${action.constructor.name}`,
              distance,
              ownSnapshot,
              otherSnapshot,
              action,
            });
          }
        }
      };

      const onFleetUpdate = ({ current }: { current: FleetSnapshot }) => {
        void evaluateSnapshot(current).catch((err) => log(`[DangerMonitor][${this.context.fleetName}] evaluation failed`, err));
      };

      const onOwnFleetUpdate = (snapshot: FleetSnapshot) => {
        void evaluateSnapshot(snapshot).catch((err) => log(`[DangerMonitor][${this.context.fleetName}] self evaluation failed`, err));
      };

      gameMap.on("fleet:update", onFleetUpdate);
      gameMap.on(`fleet:${ownFleetPubkey}`, onOwnFleetUpdate);
      void evaluateSnapshot().catch((err) => log(`[DangerMonitor][${this.context.fleetName}] initial evaluation failed`, err));

      return () => {
        disposed = true;
        gameMap.off("fleet:update", onFleetUpdate);
        gameMap.off(`fleet:${ownFleetPubkey}`, onOwnFleetUpdate);
      };
    });
  }
}
