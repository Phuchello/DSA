import { z } from 'zod';

export const RawCDataSchema = z.tuple([
  z.literal('C_DATA'),
  z.string(), // address
  z.string(), // type
  z.any()     // value
]);

export const RawExecutionPointSchema = z.object({
  event: z.string(),
  line: z.number(),
  funcName: z.string(),
  codeText: z.string().optional().default(''),
  stdout: z.string().optional().default(''),
  stackToRender: z.array(z.record(z.string(), z.any())).optional().default([]),
  globals: z.record(z.string(), z.any()).optional().default({}),
  heap: z.record(z.string(), z.any()).optional().default({}),
  stackNodes: z.record(z.string(), z.any()).optional().default({}),
  unknownNodes: z.record(z.string(), z.any()).optional().default({}),
  orderedGlobals: z.array(z.any()).optional().default([]),
  deletedAddresses: z.array(z.string()).optional().default([]),
  snapshotConvention: z.string().optional().default('before-statement'),
  terminationReason: z.string().optional()
});

export const RawTraceFileSchema = z.object({
  total_steps: z.number(),
  termination_status: z.enum(['normal', 'crashed', 'truncated', 'abnormal_exit', 'interrupted', 'timeout']).optional().default('normal'),
  termination_reason: z.string().optional(),
  final_stdout: z.string().optional().default(''),
  trace: z.array(RawExecutionPointSchema)
});

export type RawExecutionPoint = z.infer<typeof RawExecutionPointSchema>;
export type RawTraceFile = z.infer<typeof RawTraceFileSchema>;
