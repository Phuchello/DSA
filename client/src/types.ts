export interface DsaNode {
  id: string;
  address: string;
  generation?: number;
  info: number | string | null;
  nextAddress: string | null;
  status: 'allocated' | 'detached' | 'unreachable' | 'freed' | 'orphan' | 'unknown';
  location?: 'heap' | 'stack' | 'unknown';
}

export interface DsaPointer {
  name: string;
  targetAddress: string | null;
  state: 'valid' | 'null' | 'freed' | 'dangling' | 'uninitialized' | 'unknown';
  varAddress?: string;
  color?: string;
  frameId?: string;
  frameName?: string;
  frameDepth?: number;
  displayName?: string;
}

export interface DsaListRoot {
  name: string;
  displayName: string;
  headPointer: string;
  tailPointer: string | null;
  frameId?: string;
  frameName?: string;
  frameDepth?: number;
  headAddress: string | null;
  tailAddress: string | null;
  nodes: DsaNode[];
}

export interface ScalarUpdate {
  name: string;
  from: any;
  to: any;
  frameName: string;
  frameId: string;
  frameDepth: number;
  displayName: string;
  wasUninitialized?: boolean;
}

export interface ArrayUpdate {
  arrayName: string;
  index: number;
  from: any;
  to: any;
  frameName: string;
  frameId: string;
  frameDepth: number;
  displayName: string;
}

export interface FrameTransition {
  type: 'push' | 'pop' | 'none';
  funcName?: string;
  depth?: number;
  callerFunc?: string;
  calleeFunc?: string;
}

export interface EducationalExplanationDetail {
  upcoming: string;
  observed: string;
  semantics: string;
}

export interface DsaDiff {
  changedVariables: string[];
  allocatedNodes: string[];
  freedNodes: string[];
  unlinkedNodes?: string[];
  pointerReroutes: Array<{ pointer: string; from: string | null; to: string | null }>;
  scalarUpdates?: ScalarUpdate[];
  arrayUpdates?: ArrayUpdate[];
  frameTransition?: FrameTransition;
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
    listRoots?: DsaListRoot[];
    detachedNodes?: DsaNode[];
    unreachableNodes?: DsaNode[];
    freedNodes?: DsaNode[];
    pointers: DsaPointer[];
    diff: DsaDiff;
    vietnameseExplanation: string;
    advancedNotes: string;
    explanationDetail?: EducationalExplanationDetail;
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

export type TerminationStatus = 'normal' | 'crashed' | 'abnormal_exit' | 'interrupted' | 'truncated' | 'timeout';

export interface ExecutionResponse {
  success: boolean;
  trace: NormalizedExecutionPoint[];
  finalStdout?: string;
  totalSteps?: number;
  terminationStatus?: TerminationStatus;
  terminationReason?: string;
  buildOutput?: string;
  error?: string;
}
