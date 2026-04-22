import { log } from "../../src/Common/PatchConsoleLog";
import { argv } from "../../src/gameHandlers/GameHandler";
import { DispatcherHolosim as Dispatcher } from "../../src/holoHandlers/HolosimMintsImporter";
import { FleetShortPreview } from "../../src/Common/types";

console.log(argv);

console.time("init_dispatcher");
let dispatcher = await Dispatcher.build();
console.timeEnd("init_dispatcher");
console.time("Full execution tme");

let searchFor = ["Ras Al Ghul", "Sakaleyn", "ALBA", "COEX ADALI"];
const profileDataStorage: { [key: string]: any } = {};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

const displayScoutData = async (fleetCollection: any) => {
  let fleetsTableView: { [key: string]: FleetShortPreview } = {};

  // Transform data to displayable format
  for (let fleetCollectionItemKey in fleetCollection) {
    let fleetCollectionItem = fleetCollection[fleetCollectionItemKey];
  }

  console.table(fleetsTableView);
  return fleetsTableView;
};

async function run() {
  let all = await dispatcher.sageGameHandler.sagePlayerProfileHandler.getPlayerName();

  log("All NAMES:", all.length);
  let profiles = all.filter((p) => {
    return searchFor.includes(p.name);
  });

  if (profiles) {
    for (let profile of profiles) {
      log("Found profile:", `"${profile.name}"`, profile.data.profile.toBase58());
      let profileExpandedData = await dispatcher.sageGameHandler.sagePlayerProfileHandler.getPlayerDataSnapshot(profile.data.profile);
      profileDataStorage[profile.name] = profileExpandedData;
      console.table(profileExpandedData.fleets.shortDetails);
    }
  }

  //
  console.timeEnd("Full execution tme");

  throw "DDDD";
}
