import Dispatcher from "../src/Model/Dispatcher";
export async function fight(dispatcher: Dispatcher, fleetName: string, ops: any = {}) {
  throw "[WorkInProgress] Use your imagination to build something own :) Let me see YOU Leri :* :* :* ";
}

function getRoleHooks(ops: any) {
  return ops.roleHooks?.[ops.fleetMode];
}
