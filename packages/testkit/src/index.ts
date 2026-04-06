import type { ExecutorAdapter, ExecutorResult, RunContract } from "@novel-harness/executors";
import type { FailureType, NodeName } from "@novel-harness/schemas";

export interface FakeExecutorOptions {
  adapterId?: string;
  modelId?: string;
  failNodes?: Partial<Record<NodeName, FailureType>>;
}

export class FakeExecutor implements ExecutorAdapter {
  readonly id: string;
  readonly displayName = "Fake Executor";
  private readonly modelId: string;
  private readonly failNodes: Partial<Record<NodeName, FailureType>>;

  constructor(options: FakeExecutorOptions = {}) {
    this.id = options.adapterId ?? "fake-executor";
    this.modelId = options.modelId ?? "fake-model";
    this.failNodes = options.failNodes ?? {};
  }

  async run(contract: RunContract): Promise<ExecutorResult> {
    const startedAt = new Date().toISOString();
    const forcedFailure = this.failNodes[contract.nodeName];

    if (forcedFailure) {
      return {
        status: "failed",
        metrics: {},
        failureType: forcedFailure,
        errorMessage: `Fake failure for ${contract.nodeName}`,
        trace: {
          adapterId: this.id,
          modelId: this.modelId,
          startedAt,
          completedAt: new Date().toISOString(),
        },
      };
    }

    return {
      status: "succeeded",
      artifact: {
        summary: `Fake artifact for ${contract.nodeName}`,
        roleName: contract.roleName,
        outputSchemaName: contract.outputSchemaName,
      },
      metrics: {
        clarity: 80,
      },
      trace: {
        adapterId: this.id,
        modelId: this.modelId,
        startedAt,
        completedAt: new Date().toISOString(),
        usage: {
          inputTokens: 128,
          outputTokens: 256,
        },
      },
    };
  }
}
