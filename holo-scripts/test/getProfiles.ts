import { log } from "../../src/Common/PatchConsoleLog";
import { DispatcherHolosim as Dispatcher, argv } from "../../src/holoHandlers/HolosimMintsImporter";

console.log(argv);

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

async function run() {
  console.time("init_dispatcher");
  const dispatcher = await Dispatcher.build();
  console.timeEnd("init_dispatcher");
  console.time("Full execution tme");

  // let searchFor = ["Ras Al Ghul", "Sakaleyn", "ALBA", "COEX ADALI"];
  let searchFor = ["GAMountainMan", "Bola"];
  //Found profile: "GsUwZLhj8BaEJgs2wZ77Pi1HDfBj5FivSNgcyyyRs2SC" GAMountainMan
  //Found profile: "7kkS4vqe9cweSovdF5sggJSmanjLTV8uZrF9rtxNTRv9" Bola
  const profileDataStorage: { [key: string]: any } = {};

  // searchFor = ["NPC"];
  // Found profile: "6rGk9hYEjZVYNY5iua496tWYkkBFZ7U7EtAdmYdJZx16" NPC-ONI
  // Found profile: "DYUDRKkiVs8RhurbvSBhzZgyUjvQa3EjZhTJUb6vPR2r" NPC-MUD
  // Found profile: "AnSByEse1eWjeusPp5uQmZz5sKHVMgFLRNAaVpaHFDXK" NPC-Ustur

  let profiles = await dispatcher.sageGameHandler.sagePlayerProfileHandler.findPlayerProfileByName(searchFor);
  console.log(
    "Profiles found:",
    profiles.map((p: any) => p.key.toBase58()),
  );

  if (profiles) {
    for (let profile of profiles) {
      // @ts-ignore
      let pn = await dispatcher.sageGameHandler.sagePlayerProfileHandler.getPlayerProfileName(profile.data.profile);
      log("Found profile:", `"${profile.key.toBase58()}"`, pn);
      // @ts-ignore */
      let profileExpandedData = await dispatcher.sageGameHandler.sagePlayerProfileHandler.getPlayerDataSnapshot(profile.data.profile);
      profileDataStorage[profile.key.toBase58()] = profileExpandedData;
      console.table(profileExpandedData.fleets.shortDetails);
    }
  }

  console.timeEnd("Full execution tme");

  throw "DDDD";
}
