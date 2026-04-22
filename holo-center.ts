import { formatTimePeriod, u8aToString, waitTimeProgress } from "./src/utils";
import { BN } from "@project-serum/anchor";
import { iCoordinates, Coordinates } from "./src/Model/Coordinates";
import { log } from "./src/Common/PatchConsoleLog";
import { PublicKey } from "@solana/web3.js";
import { Action } from "./src/Model/Action";
import { DockAction } from "./src/Model/DockAction";
import { ExitSubwarpAction } from "./src/Model/ExitSubwarpAction";
import { ExitWarpAction } from "./src/Model/ExitWarpAction";
import { MoveAction, iPathCost } from "./src/Model/MoveAction";
import { ProcessHolosim as Process, Fleet, argv, SageGameHandler, ShipStats, SageFleetHandler } from "./src/holoHandlers/HolosimMintsImporter";
import { StartMiningAction } from "./src/Model/StartMiningAction";
import { StopMiningAction } from "./src/Model/StopMining";
import { TransferCargoAction, iCargoTransferData } from "./src/Model/TransferCargoAction";
import { UnDockAction } from "./src/Model/UndockAction";
import { SubwarpAction } from "./src/Model/SubwarpAction";
import { AttackAction } from "./src/Model/AttackAction";
import { DisbandAction } from "./src/Model/DisbandAction";
import { handleRespawnToLoadingBayAction } from "./src/Model/RespawnToLoadingBayAction";
import { FleetStateHandlerAction } from "./src/Model/FleetStateHandlerAction";
import { RepairDockedFLeetAction } from "./src/Model/RepairDockedFLeetAction";
import { prompt } from "./src/Common/prompt";
import { RetrieveLootAction } from "./src/Model/RetrieveLootAction";
import { RepairStarbaseAction } from "./src/Model/RepairStarbaseAction";
import { RepairIdleFLeetAction } from "./src/Model/RepairIdleFLeetAction";
import { byteArrayToString } from "./src/Common/GameHandler";

process.env["TRANSACTION_PRIORITY_FEE_ENABLE"] = "1";
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
  log("disband\t- disband fleet on starbase");
  log("respawn\t- respawn destroyed fleet");
  log("repair\t- repair destroyed Docked Fleet");
  log("stateHandler\t- handle fleet state - Reset state (docking/undocking/respawn)");
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
  log("loot\t- loot until full cargo");
  log("rBase\t- repair starbase");
  // dispatcher.sageFleetHandler.getFleetAccount()
  /** Provide pointer reference to handlers */
  let proc = await Process.build();
  argv.fleetName = "";
  argv.sbName = "";

  let action: Action | undefined;

  loop: while (true) {
    let fleetAccount: Fleet = (await proc.fetchFleetAccount()) as unknown as Fleet;
    let fleetState = fleetAccount.state;
    let fleetStats: ShipStats = fleetAccount.data.stats;
    let gh = proc.dispatcher.sageGameHandler as SageGameHandler;
    let fh = proc.dispatcher.sageFleetHandler as SageFleetHandler;

    log("=============================================");
    log("=== Stats: ", `FT:${fleetStats.cargoStats.fuelCapacity} AM:${fleetStats.cargoStats.ammoCapacity} CH:${fleetStats.cargoStats.cargoCapacity}`, " ===");
    log(
      "=== Combat: ",
      `ap:${fleetStats.combatStats.ap} sp: ${fleetAccount.data.sp}/${fleetStats.combatStats.sp} hp: ${fleetAccount.data.pendingHp}/${
        fleetAccount.data.hp
      }/${fleetStats.combatStats.hp} apr:${fleetStats.combatStats.ap / fleetStats.combatStats.apRegenRate}`,
      " ===",
    );
    log(
      "=== CD: ",
      `SCAN:${Math.max(0, fleetAccount.data.scanCooldownExpiresAt * 1000 - Date.now())} AP:${Math.max(
        0,
        fleetAccount.data.apReloadExpiresAt * 1000 - Date.now(),
      )} WARP:
      ${Math.max(0, fleetAccount.data.warpCooldownExpiresAt * 1000 - Date.now())}`,
      " ===",
      fleetState.Respawn ? `Respawn` : "",
    );

    log("=============================================");
    let comand = await prompt("Fleet name: " + proc.fleetName + " < Command > :");
    log("=============================================");

    try {
      sw: switch (comand) {
        case "F":
        case "fleet": {
          let newFleetName = (await prompt("NEW Fleet Name:")).trim();
          let base = await gh.asStatic().readStarbaseByName();
          proc = new Process(proc.dispatcher, newFleetName, base.location);

          fleetAccount = (await proc.fetchFleetAccount()) as unknown as Fleet;
          fleetState = fleetAccount.state;
          fleetStats = fleetAccount.data.stats;

          continue loop;
          break;
        }
        case "D":
        case "dock": {
          action = new DockAction(proc);
          break sw;
        }
        case "stateHandler": {
          action = new FleetStateHandlerAction(proc);
          break sw;
        }
        case "R":
        case "respawn": {
          // action = new RespawnToLoadingBayAction(proc);
          action = undefined;
          await handleRespawnToLoadingBayAction(proc);
          break sw;
        }
        case "RD":
        case "repair": {
          console.log("Repairing docked fleet...");
          let amount = (await prompt("Amount:")).trim() || undefined;
          action = new RepairDockedFLeetAction(proc, amount ? Number(amount) : undefined);
          break sw;
        }
        case "RI":
        case "repairIdle": {
          console.log("Repairing idle fleet...");
          let amount = (await prompt("Amount:")).trim() || undefined;
          let currentLocation = await proc.getCurrentSector(fleetAccount as any);

          let tgtFaS = (await gh.getSectorFleets(currentLocation.x, currentLocation.y, { traveling: true }))
            .filter((f) => {
              return f.data.hp + f.data.pendingHp - (f.data.stats as ShipStats).combatStats.hp < 0;
            })
            .sort((a, b) => {
              let aHp = a.data.hp + a.data.pendingHp;
              let bHp = b.data.hp + b.data.pendingHp;
              return aHp - bHp;
            });
          console.table(
            tgtFaS.map((f) => ({
              name: byteArrayToString(f.data.fleetLabel.filter((b: number) => b > 0)),
              hp: f.data.hp,
              pendingHp: f.data.pendingHp,
              maxHp: (f.data.stats as ShipStats).combatStats.hp,
            })),
          );
          let tgt = (await prompt("FleetName:")).trim() || undefined;
          let tgtFa = tgtFaS.find((f) => byteArrayToString(f.data.fleetLabel.filter((b: number) => b > 0)) == tgt);
          log("Target fleet: ", tgtFa?.key.toBase58(), tgtFa?.data.fleetLabel);

          action = new RepairIdleFLeetAction(proc, 0, amount ? Number(amount) : undefined, tgtFa?.key || undefined);

          break sw;
        }
        case "RSB":
        case "repairBase": {
          action = new RepairStarbaseAction(proc, 0);
          break sw;
        }
        case "U":
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
        case "disband": {
          action = new DisbandAction(proc);
          break sw;
        }
        case "loot": {
          action = new RetrieveLootAction(proc, "FILL_CARGO", 5);
          break sw;
        }

        case "move": {
          let X = Number((await prompt("to X:")).trim());
          let Y = Number((await prompt("to Y:")).trim());
          let actions = [];
          if (isNaN(X) || isNaN(Y)) {
            throw "X: " + X + "or Y: " + Y + " is not a number.";
          }
          let cords = fleetState.Idle?.sector || fleetState.MoveSubwarp?.toSector || fleetState.MoveWarp?.toSector;
          if (!cords) {
            if (fleetState.StarbaseLoadingBay) {
              let baseLocation = await gh.fetchLocationByStarbaseKey(fleetState.StarbaseLoadingBay.starbase);
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
              fleetStats.movementStats.maxWarpDistance / 100,
            );
            Process.generatePathActions(proc, path as Coordinates[], "Warp").forEach((a) => actions.push(a));
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
              swapDistance,
            );

            Process.generatePathActions(proc, path as Coordinates[], "Hybrid").forEach((a) => actions.push(a));
            costs = MoveAction.calcPathCosts(fleetStats, new Coordinates(Number(cords[0]), Number(cords[1])), path, "Hybrid");
          }
          log("Count of actions:", actions.length);
          path.forEach((v, i) => log(v.toSectorKey(), costs[i]?.type || "", costs[i].fuel || "", formatTimePeriod(costs[i]?.time || 0)));
          // @ts-ignore type definition
          let total = costs.reduce((p, c) => ({ fuel: p.fuel + c.fuel, time: p.time + c.time, type: mode }), {
            fuel: 0,
            time: 0,
            type: mode,
          });
          log("Total cost: ", total);
          let execute = Number((await prompt("Approve Execution [ (0) | 1 ]:")) || 0);
          if (execute)
            for (let action of actions) {
              await action.run();
            }
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
            let forceExit = Boolean(Number((await prompt("Force exit? [ (0) | 1 ]:")).toString().trim()));
            let finishTime = Number(fleetState.MoveSubwarp.departureTime) * 1000;
            if (!forceExit && new Date().getTime() < finishTime) {
              await waitTimeProgress(finishTime, "Fleet is still Sub-Wrapping:");
            }
            action = new ExitSubwarpAction(proc, forceExit);
          } else {
            throw "Not matched movement type.";
          }
          break sw;
        }

        case "transfer": {
          let transferList: iCargoTransferData[] = [];
          let iterator = true;
          let freeSpaces = await proc.getFleetFreeSpaces();
          log(
            "FuelTank: ",
            fleetStats.cargoStats.fuelCapacity - freeSpaces.fuelTank,
            " / ",
            fleetStats.cargoStats.fuelCapacity,
            "\tfree space:",
            freeSpaces.fuelTank,
          );
          log(
            "AmmoBank: ",
            fleetStats.cargoStats.ammoCapacity - freeSpaces.ammoBank,
            " / ",
            fleetStats.cargoStats.ammoCapacity,
            "\tfree space:",
            freeSpaces.ammoBank,
          );
          log(
            "CargoHold: ",
            fleetStats.cargoStats.cargoCapacity - freeSpaces.cargoHold,
            " /",
            fleetStats.cargoStats.cargoCapacity,
            "\tfree space:",
            freeSpaces.cargoHold,
          );

          let fleetResources = await proc.getFleetResourceAmounts();
          for (const key of fleetResources.cargoHold.keys()) {
            log(key, "\t Amount:", fleetResources.cargoHold.get(key)?.amount, "\t Wight:", fleetResources.cargoHold.get(key)?.totalWeight);
          }

          loop2: while (iterator) {
            let definition: iCargoTransferData = {} as iCargoTransferData;
            definition.isImportToFleet = Boolean(Number((await prompt("Is import to fleet [ {0}|1 ] ?")).toString().trim()));
            log(definition);

            let cargoType = (await prompt("Cargo type [({c})argoHold|(f)uelTank|(a)mmoBank|(p)assengers]:")).toString().trim() || "cargoHold";
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

            log(definition);

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
        case "showProfile": {
          //  qmLxoXyHZGzr7u94iTe7EX3yLTUzHF4Jebnu3feupVZ
          let playerProfile = (await prompt("Player profile public key:")).trim();
          let profilePubkey: PublicKey;
          try {
            profilePubkey = new PublicKey(playerProfile);
          } catch (e) {
            log("Invalid public key:", e);
            continue loop;
          }

          let fleets = await gh.getPlayerProfileFleetsAccounts(profilePubkey);
          fleets.forEach((f: Fleet) => {
            let stats = f.data.stats as unknown as ShipStats;
            log("---- ", f.key.toBase58(), u8aToString(Uint8Array.from(f.data.fleetLabel)), {
              ap: stats.combatStats.ap,
              sp: stats.combatStats.sp,
              hp: stats.combatStats.hp,
            });
            log(" - location: ", fh.getCurrentSector(f));
          });
          continue loop;
          break sw;
        }
        case "show": {
          action = undefined;
          log("POINTS", gh.game!.data.points);

          // log(gh.game);
          fleetAccount = (await proc.fetchFleetAccount()) as unknown as Fleet;
          fleetState = fleetAccount.state;
          fleetStats = fleetAccount.data.stats;
          // log(fleetAccount);
          // log("----------------| COMBAT STATS |----------------");
          // log(fleetStats.combatStats);
          log(fleetState);
          log("----------------| Fleet Can attack ? |----------------");
          log("Key:", fleetAccount.key.toBase58());
          let canAttack = await fh.canAttack(fleetAccount as any, {
            funder: proc.dispatcher.signer.as,
            funderPermissionIdex: 0,
          });

          log({ ...canAttack, ixr: canAttack.ixr.length });
          log("----------------| Cooldown |----------------");
          log(await fh.getCooldown(fleetAccount as any));
          log("----------------| Cargo Status |----------------");
          let fleetFreeSpace = await proc.getFleetFreeSpaces();
          log(
            "Fuel Tank :",
            fleetFreeSpace.fuelTank,
            "/",
            fleetStats.cargoStats.fuelCapacity,
            "|",
            Math.floor((fleetStats.cargoStats.fuelCapacity - fleetFreeSpace.fuelTank) * 100) / fleetStats.cargoStats.fuelCapacity,
            "%",
          );
          log(
            "Ammo Bank :",
            fleetFreeSpace.ammoBank,
            "of",
            fleetStats.cargoStats.ammoCapacity,
            "|",
            Math.round((fleetStats.cargoStats.ammoCapacity - fleetFreeSpace.ammoBank) * 100) / fleetStats.cargoStats.ammoCapacity,
            "%",
          );
          log(
            "Cargo Hold:",

            fleetFreeSpace.cargoHold,
            "/",
            fleetStats.cargoStats.cargoCapacity,
            "|",
            Math.round((fleetStats.cargoStats.cargoCapacity - fleetFreeSpace.cargoHold) * 100) / fleetStats.cargoStats.cargoCapacity,
            "%",
          );

          let fleetResources = await proc.getFleetResourceAmounts();
          for (const key of fleetResources.cargoHold.keys()) {
            log(key, "\t", fleetResources.cargoHold.get(key)?.amount, "\t totalWeight:", fleetResources.cargoHold.get(key)?.totalWeight);
          }
          continue loop;
          break sw;
        }
        case "base": {
          let base = await SageGameHandler.readStarbaseByName();
          const spbCargoHolds = await gh.getStarbaseCargoPodByOwner(fleetAccount.data.ownerProfile, [new BN(base.location.x), new BN(base.location.y)]);
          let labels = Object.keys(SageGameHandler.SAGE_RESOURCES_MINTS);
          for (let i = 0; i < spbCargoHolds.length; i++) {
            let v = spbCargoHolds[i];
            gh.logger.crit(v.account, `CargoPod: [${i}]:{${v.publicKey}} cargo pod!`);
            let res = await gh.getAmountsByMints(
              v.publicKey,
              // ,
              // Object.values(SageGameHandler.SAGE_RESOURCES_MINTS)
            );
            let ordered = [...res.keys()].sort((k1, k2) => {
              return (res.get(k1)! || 0) - res.get(k2)!;
            });
            for (const key of ordered) {
              let label = labels.find((l) => SageGameHandler.SAGE_RESOURCES_MINTS[l].toBase58() == key);
              log(label, "\t", res.get(key));
            }
          }
          continue loop;
          break;
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
          let path: iCoordinates[] = [];
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
              : costs[0],
          );
          continue loop;
          break sw;
        }
        case "showFleets": {
          let repeat = true || Boolean(Number(await prompt("Repeat [0|1]:")));
          while (repeat) {
            // let fX = Number(await prompt("from X:"));
            // let fY = Number(await prompt("from Y:"));
            // let fleetsKeyedAccountInfo = (await gh.getSectorFleets(
            //    fX,
            //   fY,
            //   true,
            // )) as unknown as Fleet[];
            let location = await proc.getCurrentSector(fleetAccount as any);
            console.log("Current location:", location);
            let fleetsKeyedAccountInfo = (await gh.getSectorFleets(location.x, location.y)) as unknown as Fleet[];
            let withData = await Promise.all(
              fleetsKeyedAccountInfo.map(async (f) => {
                let s1 = await fh.getCurrentSector(fleetAccount as any);
                let s2 = await fh.getCurrentSector(f as any);
                return {
                  fleetAccount: f,
                  location: await fh.getCurrentSector(f as any),
                  label: `${s1.x},${s1.y} <-> ${s2.x},${s2.y} ` + Object.keys(f.state)[0],
                  inRange: await fh.isInAttackRange(fleetAccount as any, f as any, 1),
                  attackable: await fh.isAttackable(fleetAccount as any, f as any, fleetAccount.data.faction),
                };
              }),
            );
            // withData.forEach((f) => {
            //   log(f.label, f.inRange ? " IN RANGE" : "");
            // });
            let now = new Date().getTime() / 1000;
            let owner = fleetAccount.data.ownerProfile;
            let fleets = withData
              .filter(
                (f) => {
                  return (
                    f.fleetAccount.key != fleetAccount.key && // not self
                    owner != f.fleetAccount.data.ownerProfile && // not owned
                    owner != f.fleetAccount.data.subProfile.key && // not borrowed
                    f.fleetAccount.data.faction != fleetAccount.data.faction && // not Same faction
                    f.inRange &&
                    f.attackable
                  );
                }, // only idle
              )
              .sort((aF, bF) => {
                let a = aF.fleetAccount;
                let b = bF.fleetAccount;
                let aCD = 1 + Math.max(0, a.data.apReloadExpiresAt - now);
                let bCD = 1 + Math.max(0, b.data.apReloadExpiresAt - now);
                return (aCD * a.data.ap) / (a.data.pendingHp + a.data.sp) - (bCD * b.data.ap) / (b.data.pendingHp + b.data.sp);
              })
              .map((v0, i) => {
                let v = v0.fleetAccount;
                let state = "";
                switch (true) {
                  case Boolean(v.state.Idle):
                    state = "Idle " + `{${Number(v.state.Idle?.sector[0])},${Number(v.state.Idle?.sector[1])}}`;
                    break;
                  case Boolean(v.state.MoveWarp):
                    if (v.state.MoveWarp?.warpFinish * 1000 > new Date().getTime()) {
                      state = "[E] ";
                    }
                    state +=
                      "Warping" +
                      `{${Number(v.state.MoveWarp?.fromSector[0])},${Number(v.state.MoveWarp?.fromSector[1])}} --> {${Number(
                        v.state.MoveWarp?.toSector[0],
                      )},${Number(v.state.MoveWarp?.toSector[1])}}`;
                    break;
                  case Boolean(v.state.MoveSubwarp):
                    if (v.state.MoveSubwarp?.departureTime * 1000 > new Date().getTime()) {
                      state = "[E] ";
                    }
                    state +=
                      "Subwarp" +
                      `{${Number(v.state.MoveSubwarp?.fromSector[0])},${Number(v.state.MoveSubwarp?.fromSector[1])}} --> {${Number(
                        v.state.MoveSubwarp?.toSector[0],
                      )},${Number(v.state.MoveSubwarp?.toSector[1])}}`;

                    break;
                  case Boolean(v.state.StarbaseLoadingBay):
                    state = "Docked";
                    break;
                  case Boolean(v.state.MineAsteroid):
                    state = "Mining";
                    break;
                  case Boolean(v.state.Respawn):
                    state = "Respawn";
                    break;
                  default:
                    state = "Unknown";
                    break;
                }

                return {
                  fleetAccount: v,
                  i,
                  rate: v.data.ap / (v.data.pendingHp + v.data.sp),
                  hp: v.data.hp,
                  pendingHp: v.data.pendingHp,
                  sp: v.data.sp,
                  ap: v.data.ap,
                  name: v.data.fleetLabel,
                  key: v.key,
                  state: state + (v.data.apReloadExpiresAt * 1000 - Date.now() > 0 ? " [AP-CD]" : ""),
                  attackCD: Math.max(0, v.data.apReloadExpiresAt * 1000 - Date.now()),
                  apCD: (v.data.stats as ShipStats).combatStats.ap / (v.data.stats as ShipStats).combatStats.apRegenRate,
                  stats: v.data.stats as ShipStats,
                  faction: v.data.faction,
                };
              });
            for (let f of fleets) {
              log(`#${f.i} ##### ${f.key}`);
              log(`|[${f.faction}]| State:${f.state} Rate:${Math.floor(f.rate * 100) / 100}`);
              log(
                u8aToString(new Uint8Array(f.name), true),
                `HP/pHP/csHP: ${f.hp}/${f.pendingHp}/${f.stats.combatStats.hp} SP:${f.sp}/${f.stats.combatStats.sp} AP:${f.ap}/${f.stats.combatStats.ap} `,
              );
              log(`${f.attackCD > 0 ? " [CD:" + Math.floor(f.attackCD / 1000) + "s]" : "0 s"}`, "AP CD:" + Math.round(f.apCD * 10000) / 100 + "s");
              log("---------------------------------------------------");
            }
            let index = (await prompt("Attack.?!")).toString().trim();
            log(fleets[Number(index)], "index", index);
            await prompt("Confirm attack on " + fleets[Number(index)]?.key.toBase58() + " [0|1]");

            if (index && fleets[Number(index)]) {
              let target = fleets[Number(index)];
              console.log("Attacking:", target.key.toBase58());

              action = new AttackAction(proc, new PublicKey(target.key));
              await action.run();
              action.process.fetchFleetAccount();
              log("last combat update:", formatTimePeriod(Date.now() / 1000 - fleetAccount.data.lastCombatUpdate));
              log("Reload after:", formatTimePeriod(Date.now() / 1000 - fleetAccount.data.apReloadExpiresAt));
            }
            action = undefined;
            repeat = Boolean(Number(await prompt("Repeat [0|1]:")));
          }
          // continue loop;
          break;
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
