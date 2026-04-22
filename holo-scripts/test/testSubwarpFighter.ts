import { ProcessHolosim as Process } from "../../src/holoHandlers/HolosimMintsImporter";
import { Coordinates } from "../../src/Model/Coordinates";
import { SubwarpAction } from "../../src/Model/SubwarpAction";
import { WarpAction } from "../../src/Model/WarpAction";
let pr = await Process.build();
let sfrom = new Coordinates(10,20); 
let sto = new Coordinates(10,20); 

async function run() {
    let warp = new WarpAction(pr, sfrom);
    await warp.run();
    await SubwarpAction.createCombatAware(pr, sto, {
        waitAfterNoTargetMs: 20*1000, 
    }).run();

}