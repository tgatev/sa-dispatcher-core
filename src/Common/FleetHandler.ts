import { Logger, logger } from "../utils";
import { PublicKey } from "@solana/web3.js";
import { AnySageIDLProgram, GameHandler } from "./GameHandler";

export interface BaseFleetLike {
  key: PublicKey;
  state: any;
  data: any;
}
export abstract class FleetHandler<
  TFleetAccount extends BaseFleetLike = BaseFleetLike,
  TSageProgram extends AnySageIDLProgram = AnySageIDLProgram,
  TSageGameHandler extends GameHandler<TSageProgram, TFleetAccount> = GameHandler<TSageProgram, TFleetAccount>,
> {
  static logger = logger;
  logger: Logger = logger;
  static stateDiscriminatorsMap = {
    StarbaseLoadingBay: 0,
    Idle: 1,
    MineAsteroid: 2,
    MoveWarp: 3,
    MoveSubwarp: 4,
    Respawn: 5,
  };

  /**
   * Provide Current class for static calls in object context
   * @returns
   */
  asStatic(): typeof this.constructor {
    return this.constructor as typeof this.constructor;
  }
  constructor(public readonly _gameHandler: TSageGameHandler) {
    this._gameHandler = _gameHandler;
  }

  async getFleetAccount(fleetPubkey: PublicKey): Promise<TFleetAccount> {
    return this._gameHandler.getFleetAccount(fleetPubkey);
  }

  async getCurrentSector(_fleetAccount: TFleetAccount | PublicKey, _isEndpoint: boolean = false): Promise<{ x: number; y: number }> {
    throw new Error("Method not implemented.");
  }

  async isInAttackRange(_attacker: TFleetAccount | PublicKey, _target: TFleetAccount | PublicKey, _attackRange: number = 1): Promise<boolean> {
    throw new Error("Method not implemented.");
  }

  async isAttackable(
    _attacker: TFleetAccount | PublicKey,
    _target: TFleetAccount | PublicKey,
    _attackerFaction: number,
    _range: number = 1,
  ): Promise<boolean> {
    throw new Error("Method not implemented.");
  }

  /**
   * Calculate grid distances between two sectors.
   * - `manhattan` = |dx| + |dy| (movement only along X/Y grid lines)
   * - `chebyshev` = max(|dx|, |dy|) (used for square range checks, e.g. attack range)
   * - `euclidean` = sqrt(dx^2 + dy^2) (straight-line geometric distance)
   */

  getSectorDistances(from: { x: number; y: number }, to: { x: number; y: number }) {
    const dx = Math.abs(Number(from.x) - Number(to.x));
    const dy = Math.abs(Number(from.y) - Number(to.y));

    return {
      dx,
      dy,
      manhattan: dx + dy,
      chebyshev: Math.max(dx, dy),
      euclidean: Number(Math.sqrt(dx * dx + dy * dy).toFixed(6)),
    };
  }
}
