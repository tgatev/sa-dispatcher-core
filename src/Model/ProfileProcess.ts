import { BaseProcess } from "./BaseProcess";
import { iAction } from "./Action";
import Dispatcher from "./Dispatcher";

/**
 * Describe process oject
 */
export interface iProfileProcess extends BaseProcess<iAction> {}
export class ProfileProcess extends BaseProcess<iAction> {
  constructor(public dispatcher: Dispatcher) {
    super(dispatcher);
  }

  displaySteps(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  forward(): Promise<void> {
    throw new Error("Method not implemented.");
  }
}
