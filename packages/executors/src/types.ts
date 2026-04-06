import type { FailureType, NodeName, RoleName } from "@novel-harness/schemas";

export interface RunContract {
  projectId: string;
  nodeName: NodeName;
  roleName: RoleName;
  taskBrief: string;
  contextRefs: string[];
  constraints: string[];
  outputSchemaName: string;
}

export interface ExecutionUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface ExecutionTrace {
  adapterId: string;
  modelId: string;
  startedAt: string;
  completedAt: string;
  rawOutputRef?: string;
  usage?: ExecutionUsage;
}

export interface ExecutorResult {
  status: "succeeded" | "failed";
  artifact?: unknown;
  metrics: Record<string, number>;
  trace: ExecutionTrace;
  failureType?: FailureType;
  errorMessage?: string;
}

export interface ExecutorAdapter {
  id: string;
  displayName: string;
  run(contract: RunContract): Promise<ExecutorResult>;
}

export interface ResolvedExecutor {
  executor: ExecutorAdapter;
  mode: "openai" | "fake";
  adapterId: string;
  displayName: string;
  modelId?: string;
  reason: string;
}
