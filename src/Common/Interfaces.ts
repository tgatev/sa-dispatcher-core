export interface iActionSignals {
  abort: iAbortSignal;
}

export interface iAbortSignal {
  state: boolean | ((data: any) => Promise<boolean>);
  beforeAbort: (data: any) => Promise<void>;
  thrower: (data: any) => Promise<void>;
  data: any;
}
