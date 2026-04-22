import { StarbaseHandler } from "../src/gameHandlers/StarbaseHandler";
import Dispatcher from "../src/Model/Dispatcher";
import { log } from "../src/Common/PatchConsoleLog";
async function run() {
  console.time("init_dispatcher");
  const dispatcher = await Dispatcher.build();
  console.time("Full execution tme");
  // await dispatcher.sageGameHandler.ready;
  console.log("Player Profile:", dispatcher.playerProfile?.toString());
  console.log("Sage Player Profile:", dispatcher.sagePlayerProfile?.toString());

  let result = await dispatcher.sageGameHandler.profileFactionProgram.account.profileFactionAccount.all([
    {
      memcmp: {
        offset: 8 + 1,
        bytes: dispatcher.playerProfile!.toBase58(),
      },
    },
  ]);
  // ! Faction Account Address
  // await dispatcher.sageGameHandler.getProfileFactionAddress(dispatcher.sageGameHandler.playerProfile!);

  // ! All Factions
  // let result = await dispatcher.sageGameHandler.profileFactionProgram.account.profileFactionAccount.all();
  // await dispatcher.sageGameHandler.getAllFactionAccounts();

  // console.log("Profile Faction Account:", result[0]);
  // console.log("Profile Faction Account: Profile", result[0].account.profile.toBase58());
  log("Profile Faction Account: <FACTION>:", result[0].account.faction);

  let starbaseHandler = new StarbaseHandler(dispatcher.sageGameHandler);
  await starbaseHandler.ready;

  console.time("<<<InFront<<<<< Crafting Recipes:");
  let recipes = await StarbaseHandler.fetchCraftRecipes(starbaseHandler.craftingProgram);
  let f = recipes.filter((r) => {
    let b = r.account.category.toBase58() == "3xtx8ZCbTAei2V4hkYp5nkqkzrAfetznxuEatN1rcN33";
    console.log("CMP: ", r.account.category.toBase58(), "== 3xtx8ZCbTAei2V4hkYp5nkqkzrAfetznxuEatN1rcN33", b);

    return b;
  });
  log(f, "Crafting Recipes Length:", recipes.length);
  console.timeEnd("<<<InFront<<<<< Crafting Recipes:");
  console.time("<<<InFront<<<<< Crafting Recipes Categories:");
  let categories = await StarbaseHandler.fetchCraftRecipesCategories(starbaseHandler.craftingProgram);
  log(categories, "<<<< LIST Crafting Recipes Categories:");
  console.timeEnd("<<<InFront<<<<< Crafting Recipes Categories:");

  let sbKeys = starbaseHandler.fetchAllBaseKeys();
  log("Starbase Keys:", sbKeys);
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    console.timeEnd("Full execution tme");
  });
