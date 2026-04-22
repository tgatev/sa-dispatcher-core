import { iAction } from "../..";

export type AwaitingActionWatcherCleanup = void | (() => void | Promise<void>);

export type AwaitingActionWatcherContext<TAction extends iAction, TOwner> = {
  owner: TOwner;
  action: TAction;
};

export type AwaitingActionWatcher<TAction extends iAction, TOwner> = (
  ctx: AwaitingActionWatcherContext<TAction, TOwner>,
) => AwaitingActionWatcherCleanup | Promise<AwaitingActionWatcherCleanup>;

export class AwaitingActionRuntime<TAction extends iAction, TOwner> {
  private currentAction: TAction | undefined;
  private currentActionPromise: Promise<any> | undefined;
  private currentAbortContext: Record<string, any> | undefined;
  private actionRunId = 0;
  private watchers = new Map<number, AwaitingActionWatcher<TAction, TOwner>>();
  private activeWatcherCleanups = new Map<number, AwaitingActionWatcherCleanup>();
  private nextWatcherId = 1;

  constructor(
    private readonly options: {
      logger?: (...args: unknown[]) => void;
      onCleared?: () => void;
    } = {},
  ) {}

  get action(): TAction | undefined {
    return this.currentAction;
  }

  get actionPromise(): Promise<any> | undefined {
    return this.currentActionPromise;
  }

  get lastAbortContext(): Record<string, any> | undefined {
    return this.currentAbortContext;
  }

  clear(): void {
    this.currentAction = undefined;
    this.currentActionPromise = undefined;
    this.options.onCleared?.();
  }

  resetAbortContext(): void {
    this.currentAbortContext = undefined;
  }

  addWatcher(watcher: AwaitingActionWatcher<TAction, TOwner>): () => void {
    const watcherId = this.nextWatcherId++;
    this.watchers.set(watcherId, watcher);

    return () => {
      this.watchers.delete(watcherId);
      void this.disposeWatcherCleanup(watcherId);
    };
  }

  async signalAbort(data: Record<string, any> = {}, restoreState = true): Promise<boolean> {
    const action: any = this.currentAction;
    if (!action?.signals?.abort) {
      return false;
    }

    const previousAbortState = action.signals.abort.state;
    action.signals.abort.data = {
      ...(action.signals.abort.data || {}),
      ...data,
    };
    this.currentAbortContext = {
      ...(action.signals.abort.data || {}),
      ...data,
    };
    action.signals.abort.state = true;

    if (restoreState) {
      const restoreAbortState = () => {
        if (action?.signals?.abort?.state === true) {
          action.signals.abort.state = previousAbortState;
        }
      };

      if (this.currentActionPromise?.finally) {
        this.currentActionPromise.finally(restoreAbortState).catch(() => undefined);
      } else {
        setTimeout(restoreAbortState, 0);
      }
    }

    return true;
  }

  async waitForSettle(timeoutMs: number): Promise<void> {
    if (!this.currentActionPromise) {
      return;
    }

    await Promise.race([
      Promise.resolve(this.currentActionPromise).catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, Math.max(0, timeoutMs))),
    ]);
  }

  async runWithAction(action: TAction, owner: TOwner, run: () => Promise<any>): Promise<any> {
    const runId = ++this.actionRunId;
    this.resetAbortContext();
    this.currentAction = action;
    await this.activateWatchers(owner, action);
    this.currentActionPromise = Promise.resolve(run()).finally(async () => {
      if (this.actionRunId === runId) {
        await this.disposeAllWatcherCleanups();
        this.clear();
      }
    });

    return this.currentActionPromise;
  }

  private async activateWatchers(owner: TOwner, action: TAction): Promise<void> {
    const watcherEntries = Array.from(this.watchers.entries());
    for (const [watcherId, watcher] of watcherEntries) {
      try {
        const cleanup = await watcher({ owner, action });
        if (cleanup) {
          this.activeWatcherCleanups.set(watcherId, cleanup);
        }
      } catch (err) {
        this.options.logger?.("[AwaitingActionRuntime] watcher activation failed", err);
      }
    }
  }

  private async disposeWatcherCleanup(watcherId: number): Promise<void> {
    const cleanup = this.activeWatcherCleanups.get(watcherId);
    if (!cleanup) {
      return;
    }

    this.activeWatcherCleanups.delete(watcherId);
    if (typeof cleanup === "function") {
      await cleanup();
    }
  }

  private async disposeAllWatcherCleanups(): Promise<void> {
    const watcherIds = Array.from(this.activeWatcherCleanups.keys());
    for (const watcherId of watcherIds) {
      try {
        await this.disposeWatcherCleanup(watcherId);
      } catch (err) {
        this.options.logger?.("[AwaitingActionRuntime] watcher cleanup failed", err);
      }
    }
  }
}
