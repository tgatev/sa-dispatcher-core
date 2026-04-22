import { PublicKey } from "@solana/web3.js";
import { SageGameHandler } from "../gameHandlers/GameHandler";
import Dispatcher from "./Dispatcher";
import { writeJsonFile } from "../fileUtils";
import { sleep } from "bun";

export default class ResourceAggregator {
  private static _instance: ResourceAggregator;

  /**
   * @param dispatcher - The dispatcher instance to be used
   */
  private constructor(private dispatcher: Dispatcher) {
    // Private constructor to prevent instantiation
  }

  /**
   * Singleton instance of ResourceAggregator
   * @param dispatcher - The dispatcher instance to be used
   * @returns {ResourceAggregator} - The singleton instance of ResourceAggregator
   */
  public static async getInstance(dispatcher: Dispatcher): Promise<ResourceAggregator> {
    if (!this._instance) {
      this._instance = new ResourceAggregator(dispatcher);
    }
    await this._instance.init();
    return this._instance;
  }

  public async init() {
    // Wait game handler to be ready
    await this.dispatcher.sageGameHandler.ready;
  }
  // - fraction_playerPublicKey_starbase : { resourceName: amount }
  private _userAggregations: { [key: string]: { [key: string]: number } } = {};

  set userAggregations({ starbaseName, resource, amount }: { starbaseName: string; resource: string; amount: number }) {
    if (!this._userAggregations[starbaseName]) {
      this._userAggregations[starbaseName] = {};
    }
    this._userAggregations[starbaseName][resource] = (this._userAggregations[starbaseName][resource] || 0) + amount;
  }

  get userAggregations(): { [key: string]: { [key: string]: number } } {
    // actualize the data for weight
    return this._userAggregations;
  }

  // /**
  //  * Aggregates resources from the given list of resource objects.
  //  * @param resources - The list of resource objects to aggregate.
  //  * @returns {Promise<void>} - A promise that resolves when the aggregation is complete.
  //  */
  // public async aggregateResources(resources: any[]): Promise<void> {}

  /**
   * This method is a placeholder and should be implemented with the actual logic to fetch and dump player data.
   * Starting point is the css Starbase Account to fetch all the players per fraction.
   */
  public async dump(
    {
      basePath,
      base,
    }: {
      basePath: string;
      base: {
        fraction?: string;
        name?: string;
      };
    } = {
      basePath: "./" + new Date().toISOString() + ".ResourceAggregations",
      base: { fraction: undefined, name: undefined },
    }
  ): Promise<void> {
    if (!basePath) {
      basePath = "./" + new Date().toISOString() + "/"; // Default path with timestamp
    }
    basePath = basePath.replaceAll("\\", "/"); // Normalize path for Windows
    basePath = basePath.replaceAll(/[: ]/g, "_"); // Normalize path for Windows

    const calcTotalCargoWeight = (aggregation: any) => {
      return (
        Object.keys(aggregation)
          .map((resourceName) => {
            // Resource weight
            // return aggregation[resourceName] * this.dispatcher.sageGameHandler.findWeight(resourceName);
            return this.dispatcher.sageGameHandler.calcCargoSpaceUsed(resourceName, aggregation[resourceName]);
          })
          // Sum All Resources
          .reduce((acc, amount) => {
            return acc + amount;
          }, 0)
      );
    };

    // List of all starbases without CSS bases
    let starbaseList = Object.keys(this.dispatcher.sageGameHandler.asStatic().starbaseMap)
      //Exclude CSS Bases
      .filter((k) => !(k.includes("ust1") || k.includes("oni1") || k.includes("mud1")))
      .map((baseKey) => {
        return this.dispatcher.sageGameHandler.asStatic().starbaseMap[baseKey];
      });
    // userAggregations.fr.userPlayer.StarbaseKey.totalCargoWeight: number
    //                                           .resources.ResourceKey: number
    //                    .userPlayer.totalCargoWeight
    // something like this {
    //   [key: string]: {
    //     // Fraction
    //     [key: string]: {
    //       // Player Id
    //       [key: string]: // Starbase Key | Total Cargo Weight
    //       | number
    //         | {
    //             [key: string]: // Starbase Key contains the total cargo weight and resources
    //             number | { [key: string]: number };
    //           };
    //     };
    //   };
    // }
    let userAggregations: any = {};

    for (let fr of ["UST", "MUD", "ONI"]) {
      //
      let cssKey = fr.toLocaleLowerCase() + "1";
      let cssData = await this.dispatcher.StarbaseHandler.getAllStarbaseInventories(
        new PublicKey(this.dispatcher.sageGameHandler.asStatic().starbaseMap[cssKey].starbasePublicKey!)
      );

      // Calc Base Weight
      let totalCargoWeight = calcTotalCargoWeight(cssData.baseAggregations);
      await writeJsonFile(`${basePath}/${fr}/${fr.toLowerCase()}1.${totalCargoWeight}.json`, cssData.baseAggregations);
      //@ts-ignore //! Free memory
      cssData.baseAggregations = null;
      // Aggregate User Data
      //   It should not be possible to have new  player keys without being registered in the CSS base
      //     But some players could have no accounts on other bases, or player can exists only on the CSS base
      Object.keys(cssData.playerInventory).forEach((basePlayerKey) => {
        let playerBaseInventory = cssData.playerInventory[basePlayerKey];
        // Checks for missing keys and define default values
        if (!userAggregations[fr]) userAggregations[fr] = {};
        if (!userAggregations[fr][basePlayerKey]) userAggregations[fr][basePlayerKey] = {};
        if (!userAggregations[fr][basePlayerKey]["CSS"]) userAggregations[fr][basePlayerKey]["CSS"] = {};

        userAggregations[fr][basePlayerKey]["CSS"]["totalCargoWeight"] = calcTotalCargoWeight(playerBaseInventory);
        userAggregations[fr][basePlayerKey]["CSS"]["resources"] = structuredClone(playerBaseInventory);
      });
      // @ts-ignore //! Free memory
      cssData = null;

      // Get all Data for other starbases in the fraction
      for (let starbase of starbaseList) {
        if (starbase.fraction !== fr) continue; // Filter by fraction
        if (!(starbase.name == "UST-5" || starbase.name == "MRZ-23" || starbase.name == "MRZ-21" || starbase.name == "MRZ-28")) continue;
        let starbaseName = starbase.name;
        // let starbase = starbaseList[starbaseKey];
        // Get all players from the starbase
        let starbaseData = await this.dispatcher.StarbaseHandler.getAllStarbaseInventories(new PublicKey(starbase.starbasePublicKey!));
        let totalCargoWeight = calcTotalCargoWeight(starbaseData.baseAggregations);
        let players = Array.from(Object.keys(starbaseData.playerInventory)).length;
        await writeJsonFile(`${basePath}/${fr}/${starbase.name}.${totalCargoWeight}.${players}.json`, starbaseData.baseAggregations);
        // @ts-ignore //! Free memory
        starbaseData.baseAggregations = null;
        // Aggregate User Data
        Object.keys(starbaseData.playerInventory).forEach((basePlayerKey) => {
          let playerBaseInventory = starbaseData.playerInventory[basePlayerKey];
          // Checks for missing keys and define default values
          if (!userAggregations[fr]) userAggregations[fr] = {};
          if (!userAggregations[fr][basePlayerKey]) userAggregations[fr][basePlayerKey] = {};
          if (!userAggregations[fr][basePlayerKey][starbaseName]) userAggregations[fr][basePlayerKey][starbaseName] = {};

          userAggregations[fr][basePlayerKey][starbaseName]["totalCargoWeight"] = calcTotalCargoWeight(playerBaseInventory);
          userAggregations[fr][basePlayerKey][starbaseName]["resources"] = structuredClone(playerBaseInventory);
        });

        // @ts-ignore //! Free memory
        starbaseData = null; // Force garbage collection
        // todo remove ! TestBreak
        // break;
      }
      if (userAggregations[fr] !== undefined) {
        // When all fraction UserData was colleted, Aggregate all User cargo Weight
        for (let playerProfileKey of Object.keys(userAggregations[fr])) {
          // userAggregations[fr][playerProfileKey]["totalCargoWeight"] = 0;
          let allCargoTotals = 0;
          for (let starbaseName of Object.keys(userAggregations[fr][playerProfileKey])) {
            allCargoTotals += userAggregations[fr][playerProfileKey][starbaseName]["totalCargoWeight"];
          }
          userAggregations[fr][playerProfileKey]["totalCargoWeight"] = allCargoTotals;
        }

        // Write all user data to file
        for (let playerProfileKey of Object.keys(userAggregations[fr])) {
          let weight = userAggregations[fr][playerProfileKey]["totalCargoWeight"];
          // Write all user data to file
          await writeJsonFile(`${basePath}/${fr}/pp/${weight}.${playerProfileKey}.json`, userAggregations[fr][playerProfileKey]);
        }
        userAggregations[fr] = null; // Free memory
      }
      // todo remove ! TestBreak
      // break;
    }
  }
}
