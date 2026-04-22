import { formatTimePeriod, waitTimeProgress } from "./src/utils";
import { Action } from "./src/Model/Action";
import { DockAction } from "./src/Model/DockAction";
import { ExitSubwarpAction } from "./src/Model/ExitSubwarpAction";
import { ExitWarpAction } from "./src/Model/ExitWarpAction";
import { MoveAction, iPathCost } from "./src/Model/MoveAction";
import { FleetProcess } from "./src/Model/FleetProcess";
import { StartMiningAction } from "./src/Model/StartMiningAction";
import { StopMiningAction } from "./src/Model/StopMining";
import { TransferCargoAction, iCargoTransferData } from "./src/Model/TransferCargoAction";
import { UnDockAction } from "./src/Model/UndockAction";
import { SageGameHandler, argv } from "./src/gameHandlers/GameHandler";
import { prompt } from "./src/Common/prompt";
import { SubwarpAction } from "./src/Model/SubwarpAction";
import { ShipStats } from "@staratlas/sage-main";
import { BN } from "@project-serum/anchor";
import { iCoordinates, Coordinates } from "./src/Model/Coordinates";
import { log } from "./src/Common/PatchConsoleLog";

process.env["TRANSACTION_PRIORITY_FEE_LIMIT"] = "30000";
process.env["TRANSACTION_PRIORITY_FEE_MIN_CHANCE"] = "85";
process.env["TRANSACTION_PRIORITY_FEE_INCREASE_STEP"] = "7500";
process.env["TRANSACTION_PRIORITY_FEE_INCREASE_BASE_FEE"] = "1000";

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

async function run() {
  for (let key in SageGameHandler.SAGE_RESOURCES_MINTS) {
    //  Object.keys( ).sort((a, b) => a.localeCompare(b))
    log(SageGameHandler.SAGE_RESOURCES_MINTS[key].toBase58(), "\t" + key);
  }
  log("Commands:");
  log("dock\t- dock to starbase");
  log("undock\t- undock from starbase");
  log("start\t- start mining");
  log("stop\t- stop mining");
  log("move\t- move fleet by warp | subwarp | hybrid to location");
  log("exit\t- exit warp/subwarp");
  log("transfer\t- transfer cargo");
  log("show\t- show fleet status");
  log("path\t- calc fleet path to location");
  log("fleet\t- reset fleet and saveStarbase");
  log("base\t- show starbase inventory");
  // dispatcher.sageFleetHandler.getFleetAccount()
  /** Provide pointer reference to handlers */
  console.warn("PROCESS Building...");
  let proc = await FleetProcess.build();
  console.warn("PROCESS Builded", "WALLET INDEX:", proc.dispatcher.funderPermissionIdex);
  let action: Action | undefined;

  loop: while (true) {
    let fleetAccount = await proc.fetchFleetAccount();
    let fleetState = fleetAccount.state;
    let fleetStats: ShipStats = fleetAccount.data.stats;
    log("=============================================");
    log("Fleet:", fleetAccount.key.toBase58());
    log("=============================================");
    let comand = await prompt("Fleet name: " + proc.fleetName + " < Command > :");
    log("=============================================");

    try {
      sw: switch (comand) {
        case "fleet": {
          proc.fleetName = await prompt("Fleet Name:");
          let fsb = await SageGameHandler.readStarbaseByName();
          proc.saveStarbase = fsb.location;

          fleetAccount = await proc.fetchFleetAccount();
          fleetState = fleetAccount.state;
          fleetStats = fleetAccount.data.stats;

          continue loop;
        }
        case "dock": {
          action = new DockAction(proc);
          break sw;
        }
        case "undock": {
          action = new UnDockAction(proc);
          break sw;
        }
        case "start": {
          let resourceName = await prompt("Resource name:");
          let richness = await prompt("Richness name (number):");
          let hardness = await prompt("Hardness name (number):");
          action = new StartMiningAction(proc, resourceName, Number(hardness), Number(richness));
          break sw;
        }
        case "stop": {
          action = new StopMiningAction(proc);
          break sw;
        }
        case "move": {
          let X = Number((await prompt("to X:")).trim());
          let Y = Number((await prompt("to Y:")).trim());
          let actions = [];
          if (!(X && Y)) {
            throw "X: " + X + "or Y: " + Y + " is not a number.";
          }
          let cords = fleetState.Idle?.sector || fleetState.MoveSubwarp?.toSector || fleetState.MoveWarp?.toSector;
          if (!cords) {
            if (fleetState.StarbaseLoadingBay) {
              let baseLocation = await proc.dispatcher.sageGameHandler.fetchLocationByStarbaseKey(fleetState.StarbaseLoadingBay.starbase);
              if (!baseLocation) {
                throw "Docked Fleet - Cant find starbase.";
              }
              cords = [new BN(baseLocation.x), new BN(baseLocation.y)];
            }
            if (!cords) throw "Cant match sector state.";
          }

          let mode = (await prompt("Mode [ warp | subwarp | (hybrid) ]:")).trim();
          let costs: iPathCost[] = [];
          let path: iCoordinates[] = [];
          if (mode == "warp") {
            path = MoveAction.calcWarpPath(
              new Coordinates(Number(cords[0]), Number(cords[1])),
              new Coordinates(X, Y),
              fleetStats.movementStats.maxWarpDistance / 100
            );
            FleetProcess.generatePathActions(proc, path, "Warp").forEach((a) => actions.push(a));
            costs = MoveAction.calcPathCosts(fleetStats, new Coordinates(Number(cords[0]), Number(cords[1])), path, "Warp");
          } else if (mode == "subwarp") {
            path = [new Coordinates(X, Y)];
            action = new SubwarpAction(proc, path[0]);
            costs = MoveAction.calcPathCosts(fleetStats, new Coordinates(Number(cords[0]), Number(cords[1])), path, "Subwarp");

            actions.push(action);
          } else {
            let swapDistance = Number((await prompt("Subwarp Distance between Warps (1): ")).trim() || 1);
            if (!swapDistance) {
              throw "Distance iserted is not a number!";
            }

            path = MoveAction.calcWarpPath(
              new Coordinates(Number(cords[0]), Number(cords[1])),
              new Coordinates(X, Y),
              fleetStats.movementStats.maxWarpDistance / 100,
              swapDistance
            );

            FleetProcess.generatePathActions(proc, path, "Hybrid").forEach((a) => actions.push(a));
            costs = MoveAction.calcPathCosts(fleetStats, new Coordinates(Number(cords[0]), Number(cords[1])), path, "Hybrid");
          }
          log("Count of actions:", actions.length);
          path.forEach((v, i) => log(v.toSectorKey(), costs[i]?.type || "", costs[i].fuel || "", formatTimePeriod(costs[i]?.time || 0)));

          // @ts-ignore type definition
          let total = costs.reduce((p, c) => ({ fuel: p.fuel + c.fuel, time: p.time + c.time, type: mode }));
          log("Total cost: ", total);
          let execute = Number((await prompt("Approve Execution [ (0) | 1 ]:")) || 0);
          if (execute)
            for (let action of actions) {
              await action.run();
            }
          action = undefined;
          continue loop;
        }

        case "exit": {
          if (fleetState.MoveWarp) {
            let finishTime = Number(fleetState.MoveWarp.warpFinish) * 1000;
            if (new Date().getTime() < finishTime) {
              await waitTimeProgress(finishTime, "Fleet is still Wrapping:");
            }
            action = new ExitWarpAction(proc);
          } else if (fleetState.MoveSubwarp) {
            let finishTime = Number(fleetState.MoveSubwarp.departureTime) * 1000;
            if (new Date().getTime() < finishTime) {
              await waitTimeProgress(finishTime, "Fleet is still Sub-Wrapping:");
            }
            action = new ExitSubwarpAction(proc);
          } else {
            throw "Not matched movement type.";
          }
          break sw;
        }

        case "transfer": {
          let transferList: iCargoTransferData[] = [];
          let iterator = true;
          let freeSpaces = await proc.getFleetFreeSpaces();
          console.log(
            "FuelTank: ",
            fleetStats.cargoStats.fuelCapacity - freeSpaces.fuelTank,
            " of ",
            fleetStats.cargoStats.fuelCapacity,
            "\tfree",
            freeSpaces.fuelTank
          );
          console.log(
            "AmmoBank: ",
            fleetStats.cargoStats.ammoCapacity - freeSpaces.ammoBank,
            " of ",
            fleetStats.cargoStats.ammoCapacity,
            "\tfree",
            freeSpaces.ammoBank
          );
          console.log(
            "CargoHold: ",
            fleetStats.cargoStats.cargoCapacity - freeSpaces.cargoHold,
            " of ",
            fleetStats.cargoStats.cargoCapacity,
            "\tfree",
            freeSpaces.cargoHold
          );

          loop2: while (iterator) {
            let definition: iCargoTransferData = {} as iCargoTransferData;
            definition.isImportToFleet = Boolean(Number((await prompt("Is import to fleet [ {0}|1 ] ?")).toString().trim()));
            console.log(definition);

            let cargoType =
              (await prompt("Cargo type [({c})argoHold|(f)uelTank|(a)mmoBank|(p)assengers]:")).toString().trim() || "cargoHold";
            if (cargoType == "c") {
              cargoType = "cargoHold";
            } else if (cargoType == "f") {
              cargoType = "fuelTank";
            } else if (cargoType == "a") {
              cargoType = "ammoBank";
            } else if (cargoType == "p") {
              cargoType = "passengers";
            }

            if (cargoType == "ammoBank" || cargoType == "cargoHold" || cargoType == "fuelTank" || cargoType == "passengers") {
              definition.cargoType = cargoType;
            } else {
              console.error("Set default cargo value - cargoHold");
            }

            if (definition.cargoType == "fuelTank") {
              definition.resourceName = "fuel";
            } else if (definition.cargoType == "ammoBank") {
              definition.resourceName = "ammunitions";
            } else if (definition.cargoType == "passengers") {
              definition.resourceName = "passenger";
            } else {
              definition.resourceName = (await prompt("ResourcesName [...]:")).toString().trim();
              if (!definition.resourceName) {
                console.error("Empty resource name. Repeat the definition");
                continue loop2;
              }
            }

            console.log(definition);

            let amount: number | string = (await prompt("Amount [number|'max']:")).toString().trim();
            if (amount != "max") amount = Number(amount);
            definition.amount = amount;

            let conditionBool = Number((await prompt("Condition [0|1]:")).toString().trim() || 0);
            if (conditionBool > 0) {
              let whenMoreThen = (await prompt("When More Then (inStarbase)[number]:")).toString().trim() || 0;
              if (Number(whenMoreThen) > 0) definition.condition = { whenMoreThen: Number(whenMoreThen) };

              let whenLessThen = (await prompt("When Less Then (inFleet)[number]:")).toString().trim() || 0;
              if (Number(whenLessThen) > 0) definition.condition = { whenLessThen: Number(whenLessThen) };
            }

            transferList.push(definition);

            iterator = Boolean(Number((await prompt("More Definitions [0|1]?")).toString().trim()));
          }
          log(transferList);
          action = new TransferCargoAction(proc, transferList);
          break sw;
        }
        case "base": {
          // ! Display starbase data
          // let key = proc.dispatcher.sageGameHandler.getStarbaseAddress([new BN(-28), new BN(21)]);
          // let bbb = await proc.dispatcher.sageGameHandler.getStarbaseAccount(key);
          // log(bbb);
          // throw "STOP";
          let base = await SageGameHandler.readStarbaseByName();
          const spbCargoHolds = await proc.dispatcher.sageGameHandler.getStarbaseCargoPodByOwner(fleetAccount.data.ownerProfile, [
            new BN(base.location.x),
            new BN(base.location.y),
          ]);
          let labels = Object.keys(SageGameHandler.SAGE_RESOURCES_MINTS);
          for (let i = 0; i < spbCargoHolds.length; i++) {
            let v = spbCargoHolds[i];
            proc.dispatcher.sageGameHandler.logger.crit(v.account, `CargoPod: [${i}]:{${v.publicKey}} cargo pod!`);
            let res = await proc.dispatcher.sageGameHandler.getAmountsByMints(
              v.publicKey
              // ,
              // Object.values(SageGameHandler.SAGE_RESOURCES_MINTS)
            );
            let ordered = [...res.keys()].sort((k1, k2) => {
              return res.get(k1)! - res.get(k2)!;
            });
            for (const key of ordered) {
              let label = labels.find((l) => SageGameHandler.SAGE_RESOURCES_MINTS[l].toBase58() == key);
              log(label, "\t", res.get(key));
            }
          }
          break;
        }
        case "show": {
          action = undefined;
          log(fleetState);
          let fleetFreeSpace = await proc.getFleetFreeSpaces();
          log(
            "Fuel Tank :",
            Math.floor((fleetStats.cargoStats.fuelCapacity - fleetFreeSpace.fuelTank) * 100) / fleetStats.cargoStats.fuelCapacity,
            "% free",
            fleetFreeSpace.fuelTank,
            "of",
            fleetStats.cargoStats.fuelCapacity
          );
          log(
            "Ammo Bank :",
            Math.round((fleetStats.cargoStats.ammoCapacity - fleetFreeSpace.ammoBank) * 100) / fleetStats.cargoStats.ammoCapacity,
            "% free",
            fleetFreeSpace.ammoBank,
            "of",
            fleetStats.cargoStats.ammoCapacity
          );
          log(
            "Cargo Hold:",
            Math.round((fleetStats.cargoStats.cargoCapacity - fleetFreeSpace.cargoHold) * 100) / fleetStats.cargoStats.cargoCapacity,
            "% free",
            fleetFreeSpace.cargoHold,
            "of",
            fleetStats.cargoStats.cargoCapacity
          );

          let fleetResources = await proc.getFleetResourceAmounts();
          for (const key of fleetResources.cargoHold.keys()) {
            log(key, "\t", fleetResources.cargoHold.get(key)?.amount, "\t totalWeight:", fleetResources.cargoHold.get(key)?.totalWeight);
          }
          break sw;
        }
        case "path": {
          let fX = Number(await prompt("from X:"));
          let fY = Number(await prompt("from Y:"));
          let from = new Coordinates(fX, fY);
          let tX = Number(await prompt("to X:"));
          let tY = Number(await prompt("to Y:"));
          let to = new Coordinates(tX, tY);
          // @ts-ignore
          let mode: "Warp" | "Subwarp" | "Hybrid" = (await prompt("mode[ Warp | Subwarp | Hybrid ]:")) || "Warp";
          let path: Coordinates[] = [];
          if (mode == "Warp" || mode == "Hybrid") {
            if (mode == "Hybrid") {
              let subwarpDistance = Number(await prompt("Subwarp Max Distance (1)?")) || 1;
              path = MoveAction.calcWarpPath(from, to, fleetStats.movementStats.maxWarpDistance / 100, subwarpDistance);
            } else {
              path = MoveAction.calcWarpPath(from, to, fleetStats.movementStats.maxWarpDistance / 100);
            }
          } else if (mode == "Subwarp") {
            path = [to];
          }
          log(path);
          let costs = MoveAction.calcPathCosts(fleetStats, from, path, mode);
          log(costs);

          log(
            "Total:",
            costs.length > 1
              ? costs.reduce((a, v) => {
                  return { fuel: a.fuel + v.fuel, time: a.time + v.time, type: mode };
                })
              : costs[0]
          );

          break sw;
        }
        default:
          throw "Unknown Command";
          break;
      }
      // @ts-ignore
      if (action) await action.run();
      action = undefined;
    } catch (e) {
      console.error(e);
    }
  }
}
