export type ObjectType = "base" | "planet" | "fleet" | "sun";
export type Faction = "oni" | "mud" | "ust" | "neutral";

export interface Coordinates {
  x: number;
  y: number;
}

export interface MapObject {
  id: string;
  type: ObjectType;
  faction: Faction | string;
  position: Coordinates;
  state?: string;
  raw?: Buffer;
  decoded?: any;
}

export interface Sector {
  coord: Coordinates;
  objects: MapObject[];
  neighbors: Sector[];
}

export type SectorChangeListener = (sector: Sector, changedObject: MapObject) => void;

export class SectorMap {
  sectors: Map<string, Sector> = new Map();
  listeners: Map<string, SectorChangeListener[]> = new Map();

  constructor(objects: MapObject[] = []) {
    for (const obj of objects) {
      const sector = this.getSector(obj.position);
      sector.objects.push(obj);
    }
  }

  coordKey(coord: Coordinates) {
    return `${coord.x}:${coord.y}`;
  }

  // get or create sector by discrete coordinates (x,y integers)
  getSector(coord: Coordinates) {
    const c = { x: Math.round(coord.x), y: Math.round(coord.y) };
    const key = this.coordKey(c);
    let s = this.sectors.get(key);
    if (!s) {
      s = { coord: c, objects: [], neighbors: this.getNeighbors(c) };
      this.sectors.set(key, s);
    }
    return s;
  }

  // 4-neighborhood (N,S,E,W)
  getNeighbors(coord: Coordinates) {
    const c = { x: Math.round(coord.x), y: Math.round(coord.y) };
    const deltas = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
      // diagonals if needed
      { x: 1, y: 1 },
      { x: -1, y: 1 },
      { x: 1, y: -1 },
      { x: -1, y: -1 },
    ];
    const neighbors: Sector[] = [];
    for (const d of deltas) {
      const key = this.coordKey({ x: c.x + d.x, y: c.y + d.y });
      const s = this.sectors.get(key) ?? { coord: { x: c.x + d.x, y: c.y + d.y }, objects: [], neighbors: [] };
      neighbors.push(s);
    }
    return neighbors;
  }

  // upsert object into appropriate sector (removes previous occurrences)
  upsertObject(obj: MapObject) {
    // remove old instances
    for (const sector of this.sectors.values()) {
      const idx = sector.objects.findIndex((o) => o.id === obj.id);
      if (idx !== -1) sector.objects.splice(idx, 1);
    }
    // insert into new sector
    const sector = this.getSector(obj.position);
    sector.objects.push(obj);
    this.notifyListeners(sector, obj);
  }

  // update object partial state (find by id)
  updateObjectState(objId: string, newState: Partial<MapObject>) {
    for (const sector of this.sectors.values()) {
      const idx = sector.objects.findIndex((o) => o.id === objId);
      if (idx >= 0) {
        const target = sector.objects[idx];
        Object.assign(target, newState);
        this.notifyListeners(sector, target);
        return target;
      }
    }
    return null;
  }

  // subscribe per-object id (or per-sector key if you prefer)
  subscribe(objId: string, listener: SectorChangeListener) {
    const arr = this.listeners.get(objId) ?? [];
    arr.push(listener);
    this.listeners.set(objId, arr);
  }

  unsubscribe(objId: string, listener?: SectorChangeListener) {
    const arr = this.listeners.get(objId);
    if (!arr) return;
    if (!listener) {
      this.listeners.delete(objId);
      return;
    }
    this.listeners.set(
      objId,
      arr.filter((l) => l !== listener),
    );
  }

  // notify all listeners for objects in sector and per-object listeners
  notifyListeners(sector: Sector, changedObject: MapObject) {
    // sector-level listeners keyed by "sector:x:y"
    const sectorKey = `sector:${this.coordKey(sector.coord)}`;
    const sectorListeners = this.listeners.get(sectorKey) ?? [];
    for (const l of sectorListeners) l && l(sector, changedObject);

    // per-object listeners
    const objListeners = this.listeners.get(changedObject.id) ?? [];
    for (const l of objListeners) l && l(sector, changedObject);
  }

  // return objects in a given sector
  getObjectsInSector(coord: Coordinates) {
    const sector = this.getSector(coord);
    return sector.objects.slice(); // return copy
  }
}

/**
 *  Directions map for generateStepsFromStart
 */
export const directionPresets = {
  l: [-1, 0],
  r: [1, 0],
  t: [0, 1],
  b: [0, -1],
};

/**
 * Generate coordinates in a line from a starting point in a given direction
 */
export function generateStepsFromStart(start: [number, number], direction: "l" | "r" | "t" | "b", steps: number = 1, stepSize = 1) {
  const dir = directionPresets[direction];
  const out: [number, number][] = [];
  for (let i = 0; i < steps; i++) {
    out.push([start[0] + i * dir[0] * stepSize, start[1] + i * dir[1] * stepSize]);
  }
  return out;
}
