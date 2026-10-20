export interface DsaNode {
  id: string;
  address: string;
  generation?: number;
  info: number | string | null;
  nextAddress: string | null;
  status: 'allocated' | 'detached' | 'unreachable' | 'freed' | 'orphan';
}

export interface DsaPointer {
  name: string;
  targetAddress: string | null;
  state: 'valid' | 'null' | 'freed' | 'dangling' | 'uninitialized' | 'unknown';
  varAddress?: string;
  color?: string;
}

export interface DsaDiff {
  changedVariables: string[];
  allocatedNodes: string[];
  freedNodes: string[];
  unlinkedNodes?: string[];
  pointerReroutes: Array<{ pointer: string; from: string | null; to: string | null }>;
}

export interface NormalizedExecutionPoint {
  step: number;
  line: number;
  funcName: string;
  codeText: string;
  stdout: string;
  event: string;
  snapshotConvention?: string;
  stackToRender: any[];
  heap: Record<string, any>;
  dsa: {
    nodes: DsaNode[];
    mainChain?: DsaNode[];
    detachedNodes?: DsaNode[];
    unreachableNodes?: DsaNode[];
    freedNodes?: DsaNode[];
    pointers: DsaPointer[];
    diff: DsaDiff;
    vietnameseExplanation: string;
    advancedNotes: string;
  };
}

export interface Lesson {
  id: string;
  title: string;
  description: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  code: string;
  defaultStdin: string;
}
