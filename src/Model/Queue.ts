import { iAction, iSimpleAction } from "./Action";
import _ from "lodash";
import { FleetProcess as Process } from "./FleetProcess";

// Usage Example iQueueItem
// let qItem = {
//   action: new UnDockAction(scanFlow),
//   execTime: new Date().getTime(),
//   next: async () => {
//     console.log("After UnDockAction complete [1]");

//     // add item to async queue // return Promise<qLength>
//     // await new Promise((resolve) => setTimeout(resolve, 20 * 1000));
//     return dispatcher.queue.queue([
//       {
//         action: new DockAction(scanFlow),
//         execTime: new Date().getTime(),
//         next: async () => {
//           // await new Promise((resolve) => setTimeout(resolve, 20 * 1000));
//           console.log("After dock");
//           return scanFlow.forward() ; // same as next:scanFlow.forward
//         },
//       } as iQueueItem,
//     ]);
//   },
// } as iQueueItem;

// execute by adding in queue
// dispatcher.queue.queue([qItem]);
// scenario.add(new DockAction(scenario));
// scenario.add(new SubwarpAction(scenario, { x: 16, y: 21, isShipCenter: false }));

export interface iQueueItem<TAction> {
  // Action ( instruction provider)
  action: TAction; //iSimpleAction | iAction
  // Execute after timestamp
  execTime: number;
  // Callback after transaction complete.
  next?: (process: Process) => Promise<void>;
}

export class Queue<TAction> {
  isActive: boolean = false;
  isBusy: boolean = false;
  queueItems: iQueueItem<TAction>[] = [];

  /**
   * Push items to the queue, sorted by execution time
   * this method is wrapped by .wrap()
   *
   * @param items
   * @returns length of all queue items
   */
  async queue(items: iQueueItem<TAction>[]) {
    console.log("[[AddItems to queue...]]");
    return await this.wrap(async () => {
      items.forEach((item) => {
        this.queueItems.splice(_.sortedIndexBy(this.queueItems, item, "execTime"), 0, item);
      });
      return this.queueItems.length;
    });
  }

  /**
   * Fetch items which execution time is less then current time
   *   their count is upto the limit
   * this method is wrapped by .wrap()
   *
   * @param moment - time used to compare with execTime of item / default is now()
   * @param limit - max amount items
   * @returns Promise<iQueueItem[]>
   */
  async unqueue(moment = new Date().getTime(), limit = 100): Promise<iQueueItem<TAction>[]> {
    return await this.wrap(async () => {
      let loopIterator = this.queueItems[0]?.execTime < moment;
      let items: iQueueItem<TAction>[] = [];

      do {
        if (this.queueItems[0]?.execTime < moment) {
          let item = this.queueItems.shift();
          if (item) items.push(item);
        } else {
          break;
        }
      } while (loopIterator && --limit > 0);
      return items;
    });
  }

  /**
   * Warp action, till this action is executed
   * queue Busy status is set to true,
   * after that force status to false.
   *
   * @param callback : () => Promise<void | any | any[]>
   * @returns
   */
  async wrap(callback: () => Promise<void | any | any[]>) {
    while (this.isBusy) {
      console.log("Busy !!! Wait 500ms");
      await new Promise((resolve) => setTimeout(resolve, 5 * 100));
    }

    console.time("Busy Time");
    this.isBusy = true;
    let res = await callback();
    this.isBusy = false;
    console.timeEnd("Busy Time");

    return res;
  }
}
