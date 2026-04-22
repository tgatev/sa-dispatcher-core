import { PointsIDLAccounts } from "@staratlas/points/src/constants";
export { IDL as POINTS_IDL } from "./points";
import type { Points } from "./points";
import { AnchorTypes, ProgramMethods } from "@staratlas/data-source";
export type UserPointsAccount = PointsIDLAccounts["userPointsAccount"];
export type PointsIDL = Points;
export type PointsIDLProgram = ProgramMethods<PointsIDL>;
export type PointsTypes = AnchorTypes<PointsIDL>;

export type PointsNamedTypes = PointsTypes["Defined"];

export type CreatePointCategoryInput = PointsNamedTypes["CreatePointCategoryInput"];
export type LicenseTypeIDL = PointsNamedTypes["LicenseType"];
export type PointsCategoryData = PointsIDLAccounts["pointCategory"];
export type PointsLevel = PointsNamedTypes["PointsLevel"];
export type UpdatePointCategoryInput = PointsNamedTypes["UpdatePointCategoryInput"];
export type PointsModifierAccount = PointsIDLAccounts["pointsModifier"];
