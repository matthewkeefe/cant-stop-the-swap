declare interface CSTSLastPointer {
  type: 'down' | 'move' | 'up';
  cellX?: number;
  cellY?: number;
  time?: number;
  duration?: number;
  moved?: boolean;
  phase?: string | null;
}

declare interface CSTSDebug {
  lastPointer?: CSTSLastPointer;
  [k: string]: unknown;
}

declare global {
  interface Window {
    __CSTS_DEBUG?: CSTSDebug;
    __CSTS_DEBUG_SHOW?: boolean;
  }
}

export {};
