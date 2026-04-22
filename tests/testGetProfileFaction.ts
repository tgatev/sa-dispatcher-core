import { ProfileHandler } from "../src/gameHandlers/ProfileHandler";
import Dispatcher from "../src/Model/Dispatcher";

async function run() {
  console.time("init_dispatcher");
  const dispatcher = await Dispatcher.build();
  console.time("Full execution tme");
  // await dispatcher.sageGameHandler.ready;
  console.log("Player Profile:", dispatcher.sageGameHandler.playerProfile?.toString());
  console.log("Sage Player Profile:", dispatcher.sageGameHandler.sagePlayerProfile?.toString());
  let result = await dispatcher.sageGameHandler.profileFactionProgram.account.profileFactionAccount.all([
    {
      memcmp: {
        offset: 8 + 1,
        bytes: dispatcher.sageGameHandler.playerProfile!.toBase58(),
      },
    },
  ]);
  // ! Faction Account Address
  // await dispatcher.sageGameHandler.getProfileFactionAddress(dispatcher.sageGameHandler.playerProfile!);

  // ! All Factions
  // let result = await dispatcher.sageGameHandler.profileFactionProgram.account.profileFactionAccount.all();
  // await dispatcher.sageGameHandler.getAllFactionAccounts();

  console.log("Profile Faction Account:", result[0]);
  console.log("Profile Faction Account: Profile", result[0].account.profile.toBase58());
  console.log("Profile Faction Account: <FACTION>:", result[0].account.faction);
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    console.timeEnd("Full execution tme");
  });
