import { BN } from "@project-serum/anchor";
import { ShipStats, Fleet, calculateDistance } from "@staratlas/sage-main";
import { Action, iAction, iActionR4Cost } from "./Action";
import { FleetProcess as Process } from "./FleetProcess";
import { MaxDistanceStepUnderMinLimit, UnknownFleetState } from "../Error/ErrorHandlers";
import { formatTimePeriod } from "../utils";
import { iCoordinates, Coordinates } from "./Coordinates";
export * from "./Coordinates";

export interface iPathCost {
  // Fuel Burn
  fuel: number;
  // Time without transactions waiting
  time: number;
  // Movement Type
  type: "Warp" | "Subwarp" | "Hybrid";
}

export interface CostVariants {
  subWarpFuelBurn: number;
  subWarpTime: number;
  warpFuelBurn: number;
  warpTime: number;
}

export interface Movable {
  coordinates: iCoordinates;
  isWarpMove: boolean;
  calcCostVariants: (from: [BN, BN], to: [BN, BN]) => Promise<CostVariants>;
}
/** Move Fleet */
export abstract class MoveAction extends Action implements Movable, iAction {
  coordinates: iCoordinates;
  isWarpMove: boolean;
  isSafeMove: boolean = true;
  timeCost: number = 0; // This setting was set immediately after Move action transaction is executed (and the fleet is flying) to define the end time of the action
  constructor(process: Process, coordinates: iCoordinates, isWarpMove: boolean) {
    super(process);
    this.coordinates = coordinates;
    this.isWarpMove = isWarpMove;
    this.waitTimeCostAfter = true;
    this.waitAfterExecute = 0; // 2 seconds

    if (!this.coordinates.exitWrapDelay) this.coordinates.exitWrapDelay = 0;
  }

  /**
   * Show direction of the target
   * @param from
   * @param to
   * @returns
   */
  static getDirection(from: iCoordinates, to: iCoordinates) {
    let xDirection = 0;
    if (to.x < from.x) {
      xDirection = -1;
    } else if (to.x > from.x) {
      xDirection = 1;
    }
    let yDirection = 0;
    if (to.y < from.y) {
      yDirection = -1;
    } else if (to.y > from.y) {
      yDirection = 1;
    }

    return { x: xDirection, y: yDirection };
  }

  static calcWarpPath(
    from: iCoordinates,
    to: iCoordinates,
    maxDistancePerTurn = 1.5,
    swapDistance: number = 0,
    optimizeTime: boolean = true,
  ): iCoordinates[] {
    let xDiff = to.x - from.x;
    let yDiff = to.y - from.y;

    // not able to move with step less then 1
    if (maxDistancePerTurn < 1) {
      throw new MaxDistanceStepUnderMinLimit();
    }
    let distance = calculateDistance([new BN(from.x), new BN(from.y)], [new BN(to.x), new BN(to.y)]);

    if ((xDiff == 0 && yDiff == 0) || distance == 0) {
      // Exact Points
      return [];
    }

    let turns = Math.ceil(distance / maxDistancePerTurn);

    if (turns == 1) {
      return [new Coordinates(to.x, to.y)];
    }
    // line equation (x-x1)/(x2-x1) = (y-y1)/(y2-y1)
    // (x−x1) / (y-y1) = (x2-x1)/(y2-y1) = k ;
    let { x: xDirection, y: yDirection } = this.getDirection(from, to);

    // Swap Distance Values for next call
    let travelDistance = swapDistance ? swapDistance : maxDistancePerTurn;
    let newSwap = swapDistance ? maxDistancePerTurn : swapDistance;

    if (yDiff == 0) {
      // if yDiff == 0 then we ware moving horizontal (by x)
      let newX = from.x + xDirection * Math.floor(Math.min(maxDistancePerTurn, distance));
      return [
        new Coordinates(newX, from.y),
        ...this.calcWarpPath(new Coordinates(newX, from.y), to, travelDistance, newSwap, optimizeTime),
      ];
    }

    //  y= ( (x - x1) + ky1) / k
    let k = xDiff / yDiff;
    // if K = 0, then we ware moving vertical (by y)
    if (k == 0) {
      let newY = from.y + yDirection * Math.floor(Math.min(maxDistancePerTurn, distance));
      return [
        new Coordinates(from.x, newY),
        ...this.calcWarpPath(new Coordinates(from.x, newY), to, travelDistance, newSwap, optimizeTime),
      ];
    }

    // if max distance is less then diagonal length of single sector - then move to direction closer to the diagonal line for whole path
    if (maxDistancePerTurn < Math.sqrt(2)) {
      let byX = calculateDistance([new BN(from.x + xDirection), new BN(from.y)], [new BN(to.x), new BN(to.y)]);
      let byY = calculateDistance([new BN(from.x), new BN(from.y + yDirection)], [new BN(to.x), new BN(to.y)]);
      if (byX < byY) {
        return [
          new Coordinates(from.x + xDirection, from.y),
          ...this.calcWarpPath(new Coordinates(from.x + xDirection, from.y), to, travelDistance, newSwap, optimizeTime),
        ];
      } else {
        return [
          new Coordinates(from.x, from.y + yDirection),
          ...this.calcWarpPath(new Coordinates(from.x, from.y + yDirection), to, travelDistance, newSwap, optimizeTime),
        ];
      }
    }
    let cordY = 0;
    let cordX = 0;
    let tmpDistance = 0;
    if (Math.abs(xDiff) >= Math.abs(yDiff) && xDirection !== 0) {
      for (let x = from.x; x != to.x + xDirection; x += xDirection * 1) {
        let tmp = Math.floor((x - from.x + k * from.y) / k);
        tmpDistance = calculateDistance([new BN(from.x), new BN(from.y)], [new BN(x), new BN(tmp)]);
        if (tmpDistance >= maxDistancePerTurn) {
          continue;
        }
        cordY = tmp;
        cordX = x;
      }
    }

    // // Edge Case Small ranges cant find sector on specific K -> add 1 to other direction
    tmpDistance = 0;
    if (yDirection !== 0 && (Math.abs(xDiff) < Math.abs(yDiff) || (cordX == from.x && cordY == from.y))) {
      for (let y = from.y; y != to.y + yDirection; y += yDirection * 1) {
        let tmp = Math.floor((y - from.y + (1 / k) * from.x) / (1 / k));
        tmpDistance = calculateDistance([new BN(from.x), new BN(from.y)], [new BN(tmp), new BN(y)]);
        if (tmpDistance >= maxDistancePerTurn) {
          continue;
        }
        cordY = y;
        cordX = tmp;
      }
    }
    // Guess 2 more positions to identify a bit longer path but that could reduce amount of turns in case where short cut is
    // by 45 degrees angle from axis
    if (optimizeTime) {
      let cordVersionTo: { x: number; y: number; inRange: boolean; targetDistance: number; actionDistance: number }[] = [
        { x: cordX, y: cordY, inRange: false, targetDistance: 0, actionDistance: 0 },
        { x: cordX + xDirection, y: cordY, inRange: false, targetDistance: 0, actionDistance: 0 },
        { x: cordX, y: cordY + yDirection, inRange: false, targetDistance: 0, actionDistance: 0 },
      ]
        // Calc Distances and is is In max distance range
        .map((v) => {
          let actionDistance = calculateDistance([new BN(from.x), new BN(from.y)], [new BN(v.x), new BN(v.y)]);
          v.inRange = maxDistancePerTurn > actionDistance;
          v.actionDistance = actionDistance;
          v.targetDistance = calculateDistance([new BN(v.x), new BN(v.y)], [new BN(to.x), new BN(to.y)]);
          return v;
        })
        // only values in range,
        .filter((v) => v.inRange)
        // sort by distance to target asc
        .sort((v1, v2) => {
          return v1.targetDistance + v1.actionDistance < v2.targetDistance + v2.actionDistance ? -1 : 1;
        });

      cordX = cordVersionTo[0].x;
      cordY = cordVersionTo[0].y;
    }

    return [new Coordinates(cordX, cordY), ...this.calcWarpPath(new Coordinates(cordX, cordY), to, travelDistance, newSwap, optimizeTime)];
  }

  /**
   * Calculate time and resource cost for Fleet
   * from Sector to Sector
   *
   * @param fleetStats
   * @param from
   * @param to
   * @returns
   */
  static calcMoveCosts(fleetStats: ShipStats, from: [BN, BN], to: [BN, BN]): CostVariants {
    return {
      subWarpFuelBurn: Fleet.calculateSubwarpFuelBurnWithCoords(fleetStats, from, to),
      subWarpTime: Fleet.calculateSubwarpTimeWithCoords(fleetStats, from, to),
      warpFuelBurn: Fleet.calculateWarpFuelBurnWithCoords(fleetStats, from, to),
      warpTime: Fleet.calculateWarpTimeWithCoords(fleetStats, from, to),
    };
  }

  /**
   *
   * @param fleetStats From fleet account
   * @param from Coordinates of current position
   * @param path Path of warp coordinates
   * @returns iPathTotalCost
   */
  static calcPathCosts(fleetStats: ShipStats, from: iCoordinates, path: iCoordinates[], mode: "Warp" | "Subwarp" | "Hybrid" = "Warp") {
    let costs = [];
    var isEven = function (x: number) {
      return !(x & 1);
    };

    // this.process.logger.crit("length...", path.length);
    let tmp_from = from;
    for (let i = 0; i < path.length; i++) {
      let curMode = mode;
      if (mode == "Hybrid") {
        // Switch Modes
        curMode = isEven(i) ? "Warp" : "Subwarp";
      }

      if (curMode == "Warp") {
        costs.push({
          fuel: Math.ceil(
            Fleet.calculateWarpFuelBurnWithCoords(
              fleetStats,
              [new BN(tmp_from.x), new BN(tmp_from.y)],
              [new BN(path[i].x), new BN(path[i].y)],
            ),
          ),
          time: Math.ceil(
            Fleet.calculateWarpTimeWithCoords(fleetStats, [new BN(tmp_from.x), new BN(tmp_from.y)], [new BN(path[i].x), new BN(path[i].y)]),
          ),
          type: "Warp",
        } as iPathCost);
      } else {
        costs.push({
          fuel: Math.ceil(
            Fleet.calculateSubwarpFuelBurnWithCoords(
              fleetStats,
              [new BN(tmp_from.x), new BN(tmp_from.y)],
              [new BN(path[i].x), new BN(path[i].y)],
            ),
          ),
          time: Math.ceil(
            Fleet.calculateSubwarpTimeWithCoords(
              fleetStats,
              [new BN(tmp_from.x), new BN(tmp_from.y)],
              [new BN(path[i].x), new BN(path[i].y)],
            ),
          ),
          type: "Subwarp",
        } as iPathCost);
      }
      tmp_from = path[i];
    }

    return costs;
  }

  /**
   * Validate movement path that will be possible to go to save starbase after
   *  most often used to validate scenario path, warp or hybrid movement
   *
   * @param path
   * @param from
   * @param saveStarBase
   * @param fleetStats fleetAccount.data.stats
   */
  static async isPathSafeGoingTo(
    path: Coordinates[],
    fuelAmount: number,
    from: Coordinates,
    saveStarBase: Coordinates,
    fleetStats: ShipStats,
    movementMode: "Warp" | "Subwarp" | "Hybrid" = "Warp",
  ) {
    let stepsCosts = this.calcPathCosts(fleetStats, from, path, movementMode);
    let total: iPathCost = { fuel: 0, time: 0, type: movementMode };

    stepsCosts.forEach((item) => {
      total.time += item.time;
      total.fuel += item.fuel;
    });

    let fuelToStarbase = Fleet.calculateSubwarpFuelBurnWithCoords(
      fleetStats,
      [new BN(path[path.length - 1].x), new BN(path[path.length - 1].y)],
      [new BN(saveStarBase.x), new BN(saveStarBase.y)],
    );

    let fuelLeftAfterMove = fuelAmount - total.fuel;
    let isSaveBack = fuelToStarbase < fuelLeftAfterMove;

    return isSaveBack;
  }

  /**
   * Check will the fleet still being able go back to starbase after moving on sector
   *    in by base movement modes.
   *
   * @param target
   * @param warpMode
   * @returns
   */
  async isSafeGoingTo(target: iCoordinates, fuelAmount: number | undefined = undefined, fromSector: iCoordinates | undefined = undefined) {
    // no need request to rpc - get stored data if exists
    let fleet = this.process.fleetAccount || (await this.process.fetchFleetAccount());

    // When have no passed fuel amount - use current amount in the fleet
    if (!fuelAmount) {
      fuelAmount = await this.process.getFuelAmount();
    }
    // If fleet is after subwarp move fuel amount will be burned on exit subwarp
    // Now we handel 2 instructions in single transaction
    // 1: exit (Sub)Warp, 2 move
    if (fleet.state.MoveSubwarp) {
      fuelAmount -= Math.ceil(Number(fleet.state.MoveSubwarp.fuelExpenditure));
    }
    // Current sector
    let from: BN[] = [];
    if (!fromSector) {
      // Use fleet idle sector for start coordinates
      from = fleet.state.Idle?.sector || fleet.state.MoveWarp?.toSector || (fleet.state.MoveSubwarp?.toSector as [BN, BN]);
      // get by starbase location if fleet is docked
      if (!from && fleet.state.StarbaseLoadingBay) {
        let location = await this.process.getCurrentSector(fleet);
        from = [new BN(location.x), new BN(location.y)];
      }

      if (from.length != 2) {
        this.process.logger.crit(fleet.state);
        throw new Error("Cant fetch coordinates, fleet should be idle.");
      }
    } else {
      // Use passed coordinates
      from = [new BN(fromSector.x), new BN(fromSector.y)];
      if (fromSector.isShipCenter) {
        // in this situation need to get current coordinates to compose coordinates
        if (!fleet.state.Idle) {
          this.process.logger.crit(fleet.state);
          throw new Error("Cant fetch coordinates, fleet should be idle to calculate 'fromSector' ship centered coordinates.");
        }
        from[0] += fleet.state.Idle.sector[0];
        from[1] += fleet.state.Idle.sector[1];
      }
    }
    let to: BN[] = [new BN(target.x), new BN(target.y)];
    if (target.isShipCenter) {
      if (!fleet.state.Idle) {
        this.process.logger.crit(fleet.state);
        throw new Error("Cant fetch coordinates, fleet should be idle to calculate 'fromSector' ship centered coordinates.");
      }
      to[0] += fleet.state.Idle.sector[0];
      to[1] += fleet.state.Idle.sector[1];
    }

    // current_amount - cost_to_move
    let fuelLeftAfterMove: number;
    if (this.isWarpMove) {
      fuelLeftAfterMove =
        fuelAmount - Math.ceil(Fleet.calculateWarpFuelBurnWithCoords(fleet.data.stats, [from[0], from[1]], [to[0], to[1]]));
    } else {
      fuelLeftAfterMove =
        fuelAmount - Math.ceil(Fleet.calculateSubwarpFuelBurnWithCoords(fleet.data.stats, [from[0], from[1]], [to[0], to[1]]));
    }

    // Calc fuel need to go back to star base
    let saveBackFuel = Math.ceil(
      Fleet.calculateSubwarpFuelBurnWithCoords(
        fleet.data.stats,
        [to[0], to[1]],
        [new BN(this.process.saveStarbase.x), new BN(this.process.saveStarbase.y)],
      ),
    );
    // + 1 secure the existence
    let isSafeBack: boolean = saveBackFuel < fuelLeftAfterMove;
    // this.process.logger.crit(
    //   target.toSectorKey(),
    //   "-->",
    //   this.process.saveStarbase.toSectorKey(),
    //   "isSafeGoingTo ? ",
    //   saveBackFuel,
    //   "<",
    //   fuelLeftAfterMove,
    //   " = ",
    //   isSafeBack
    // );
    return isSafeBack;
  }

  /**
   * Provide cost based on current location
   *  use static calcMoveCosts
   *
   * @param from
   * @param to
   * @returns
   */
  async calcCostVariants(from: [BN, BN], to: [BN, BN]): Promise<CostVariants> {
    if (!this.process.fleetAccount) await this.process.fetchFleetAccount();
    // @ts-ignore
    return (this.constructor as MoveAction).calcMoveCosts(this.process.fleetAccount?.data.stats, from, to);
  }

  /**
   * Get time until Arrival on the location
   *
   * @returns
   */
  async getTravelingTimeLeft(): Promise<number> {
    let fleet = await this.process.fetchFleetAccount();
    let travelTime: BN = 0;

    if (this.isWarpMove && fleet.state.MoveWarp) {
      travelTime = fleet.state.MoveWarp.warpFinish - new Date().getTime() / 1000;
    } else if (!this.isWarpMove && fleet.state.MoveSubwarp) {
      travelTime = fleet.state.MoveSubwarp.arrivalTime - new Date().getTime() / 1000;
    } else {
      throw new UnknownFleetState(fleet.state);
    }

    this.process.logger.info("Arrival time after ", formatTimePeriod(travelTime));

    return travelTime * 1000;
  }

  static getPathCosts(
    fleetStats: ShipStats,
    currentFuelAmount: number,
    currentSector: iCoordinates,
    path: iCoordinates[],
    pathMoveMode: "Warp" | "Subwarp" | "Hybrid",
    saveStarbase: iCoordinates,
    goToStarbaseMovementType: "Warp" | "Subwarp" | "Hybrid",
  ) {
    if (currentFuelAmount < 0) throw new Error("Current fuel amount can't be less 0!");

    let pathCosts = this.calcPathCosts(fleetStats, currentSector, path, pathMoveMode);
    let safeStatus = true;
    // If we are going
    let movementCosts: iPathCost = { fuel: 0, time: 0, type: pathMoveMode };
    let refillCost: iPathCost = { fuel: 0, time: 0, type: pathMoveMode };

    pathCosts.forEach((item) => {
      movementCosts.fuel += item.fuel;
      movementCosts.time += item.time;
    });

    if (goToStarbaseMovementType == "Subwarp") {
      // From last point to starbase with SubWarp
      let costs = this.calcPathCosts(fleetStats, path[path.length - 1], [saveStarbase], "Subwarp");
      // Path is only from 1 stem - so we have only one cost item
      let safeBackFuel = costs[0].fuel;
      refillCost = { fuel: costs[0].fuel, time: costs[0].time, type: "Subwarp" };
      safeStatus = safeBackFuel + movementCosts.fuel < currentFuelAmount - 1;
    } else if ((goToStarbaseMovementType = "Warp") || (goToStarbaseMovementType = "Hybrid")) {
      // From last point to starbase with warp
      // ! NOTE CHECK IF PATH IS NOT EMPTY
      let refillPath = this.calcWarpPath(path[path.length - 1], saveStarbase);
      let refillSteps = this.calcPathCosts(fleetStats, path[path.length - 1], refillPath, pathMoveMode);

      refillCost = { fuel: 0, time: 0, type: goToStarbaseMovementType };
      refillSteps.forEach((i) => {
        refillCost.fuel += i.fuel;
        refillCost.time += i.time;
      });

      safeStatus = refillCost.fuel + movementCosts.fuel < currentFuelAmount - 1;
    } else {
      throw new Error("Mot implemented Movement Type in Scan Definition! ", goToStarbaseMovementType);
    }

    return { safeStatus: safeStatus, pathCost: movementCosts, refillCost: refillCost };
  }

  /**
   * Sum costs ( fuel or time  )
   * @param pathDetails path steps costs iPathCost[]
   * @param resultType "fuel" | "time" = "fuel"
   * @returns Fuel Amount or time in second depends of result type
   */
  static calcTotalCost(pathDetails: iPathCost[], resultType: "fuel" | "time" = "fuel") {
    let total: iPathCost;
    if (pathDetails.length > 1) {
      total = pathDetails.reduce((a, v) => {
        a.fuel += v.fuel;
        a.time += v.time;
        return a;
      });
    } else {
      total = pathDetails[0] as iPathCost;
    }

    if (resultType == "fuel") {
      return total.fuel;
    } else {
      return total.time;
    }
  }

  /**
   * Validate movement ...
   *   isSafe - should be available to go back in starbase by subwarp
   * @returns
   */
  async verify() {
    if (this.isSafeMove) {
      return await this.isSafeGoingTo(this.coordinates);
    }
    // alternative: fuel thank value > goToClosestBaseCost_fromNewPoint
    // need map of available starbases
    return true;
  }
}
