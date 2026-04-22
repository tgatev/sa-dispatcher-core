import { BN } from "@project-serum/anchor";
const GALACTIC_CENTER = [new BN(0), new BN(0)] as [BN, BN];
const RAD_SIZE_IN_DEG = 180 / Math.PI;
const DEG_SIZE_IN_RAD = Math.PI / 180;
export interface iCoordinates {
  x: number;
  y: number;
  isShipCenter: boolean;
  exitWrapDelay: number;
  toSectorKey: () => string;
  toBN: () => [BN, BN];
  toShipCentered: (shipLocation?: Coordinates | [BN, BN]) => Coordinates;
  toDirectionVector: (center?: Coordinates | [BN, BN]) => { A: number; sinA: number; cosA: number; L: number };
  equals: (withSector: iCoordinates) => boolean;
}
export interface iAngle {
  alpha: number;

  // return degrees
  deg: (radian?: number) => number;
  // return radians
  rad: (deg?: number) => number;
  // Maths
  sin: (radian?: number) => number;
  cos: (radian?: number) => number;
  tan: (radian?: number) => number;
}

export class RadialDirection implements iAngle {
  /**
   * Angle in radians
   */
  alpha: number;
  constructor(angle: number = 0, type: "rad" | "deg" = "rad") {
    if (type == "rad") {
      this.alpha = angle;
    } else {
      this.alpha = angle * DEG_SIZE_IN_RAD;
    }
  }

  /**
   *
   * @param radian - !! when pass a parram method will convert it to DEG
   * @returns
   */
  deg(radian?: number) {
    if (radian != undefined) {
      return radian * RAD_SIZE_IN_DEG;
    }

    return this.alpha * RAD_SIZE_IN_DEG;
  }

  /**
   *
   * @param radian - !! when pass a parram method will convert it to DEG
   * @returns
   */
  rad(deg?: number) {
    if (deg != undefined) {
      return deg * DEG_SIZE_IN_RAD;
    }
    return this.alpha;
  }
  sin(deg?: number) {
    if (deg != undefined) {
      return Math.sin(this.alpha);
    }
    return Math.sin(this.rad(deg));
  }
  cos(deg?: number) {
    if (deg != undefined) {
      return Math.cos(this.alpha);
    }
    return Math.cos(this.rad(deg));
  }
  tan(deg?: number) {
    if (deg != undefined) {
      return Math.tan(this.alpha);
    }
    return Math.tan(this.rad(deg));
  }
}

export class Coordinates implements iCoordinates {
  x: number;
  y: number;
  isShipCenter: boolean;
  exitWrapDelay: number;

  static fromSectorKey(sectorKey: string): Coordinates {
    let [x, y] = sectorKey.split(",").map(Number);
    return new Coordinates(x, y);
  }
  static fromBN(sector: [BN, BN] | BN[]): Coordinates {
    return new Coordinates(Number(sector[0]), Number(sector[1]));
  }

  constructor(x: number, y: number, isShipCenter: boolean = false, exitWrapDelay: number = 0) {
    this.x = x;
    this.y = y;
    this.isShipCenter = isShipCenter;
    this.exitWrapDelay = exitWrapDelay;
  }

  toSectorKey(): string {
    if (this.isShipCenter) {
      throw "Not Implemented!!!";
    } else {
      return this.x + "," + this.y;
    }
  }

  /**
   * @returns [BN,BN]
   */
  toBN(): [BN, BN] {
    return [new BN(this.x), new BN(this.y)];
  }

  /** Flexible Point Centered Coordinates */
  toShipCentered(shipLocation: Coordinates | [BN, BN] = GALACTIC_CENTER): Coordinates {
    throw "Not yet implemented!" + String(shipLocation);
    return new Coordinates(this.x, this.y, true); // base vector  direction points to right [ L0--> ]
  }

  /**
   * Provide ALPHA direction, length  angle in normal coordinates
   * GALACTIC_CENTER = [BN(0), BN(0)]
   */
  toDirectionVector(center: Coordinates | [BN, BN] = GALACTIC_CENTER) {
    // ToDO Prepare vector aritmatics
    throw "Not yet implemented!" + String(center);

    return { A: 0, sinA: 0, cosA: 1, L: 0 }; // base vector  direction points to right [ L0--> ]
  }

  /**
   * Check is the same sector
   * @param withSector
   * @returns
   */
  equals(withSector: iCoordinates): boolean {
    return this.x == withSector.x && this.y == withSector.y && this.isShipCenter == withSector.isShipCenter;
  }
}
