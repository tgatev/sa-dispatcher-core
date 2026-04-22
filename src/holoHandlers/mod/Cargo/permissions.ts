import {
  fixedSizeArray,
  FixedSizeArray,
  staticImplements,
} from '@staratlas/data-source';
import {
  PermissionType,
  PermissionTypeStatic,
} from '@staratlas/player-profile';

@staticImplements<PermissionTypeStatic<CargoPermissions>>()
export class CargoPermissions implements PermissionType<CargoPermissions> {
  constructor(
    public manageDefinition: boolean,
    public createCargoType: boolean,
    public manageCargoType: boolean,
  ) {}

  getPermissions(): FixedSizeArray<number, 8> {
    const out: FixedSizeArray<number, 8> = fixedSizeArray(8, 0);
    out[0] =
      (this.manageDefinition ? 1 << 0 : 0) |
      (this.createCargoType ? 1 << 1 : 0) |
      (this.manageCargoType ? 1 << 2 : 0);

    return out;
  }

  static empty(): CargoPermissions {
    return new CargoPermissions(false, false, false);
  }

  static all(): CargoPermissions {
    return new CargoPermissions(true, true, true);
  }

  static manageDefinition(): CargoPermissions {
    return new CargoPermissions(true, false, false);
  }

  static createCargoType(): CargoPermissions {
    return new CargoPermissions(false, true, false);
  }

  static manageCargoType(): CargoPermissions {
    return new CargoPermissions(false, false, true);
  }

  static definitionPermissions(): CargoPermissions {
    return CargoPermissions.manageDefinition();
  }

  static cargoTypePermissions(): CargoPermissions {
    return new CargoPermissions(false, true, true);
  }

  static fromPermissions(
    permissions: FixedSizeArray<number, 8>,
  ): CargoPermissions {
    return new CargoPermissions(
      (permissions[0] & (1 << 0)) !== 0,
      (permissions[0] & (1 << 1)) !== 0,
      (permissions[0] & (1 << 2)) !== 0,
    );
  }

  and(other: CargoPermissions): CargoPermissions {
    return new CargoPermissions(
      this.manageDefinition && other.manageDefinition,
      this.createCargoType && other.createCargoType,
      this.manageCargoType && other.manageCargoType,
    );
  }

  or(other: CargoPermissions): CargoPermissions {
    return new CargoPermissions(
      this.manageDefinition || other.manageDefinition,
      this.createCargoType || other.createCargoType,
      this.manageCargoType || other.manageCargoType,
    );
  }

  eq(other: CargoPermissions): boolean {
    return (
      this.manageDefinition === other.manageDefinition &&
      this.createCargoType === other.createCargoType &&
      this.manageCargoType === other.manageCargoType
    );
  }

  contains(other: CargoPermissions): boolean {
    return this.and(other).eq(other);
  }
}
