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
      artifact: buildFakeArtifact(contract),
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

function buildFakeArtifact(contract: RunContract) {
  switch (contract.nodeName) {
    case "batch_brief":
      return {
        batchId: `${contract.projectId}-batch`,
        batchName: "Demo Batch",
        targetLane: "xianxia",
        audience: "male",
        constraints: contract.constraints,
        goal: contract.taskBrief,
      };
    case "idea_spread":
      return {
        candidates: [
          {
            title: "《玄门逆命》",
            hook: "被逐出山门的废徒，靠偷听天机改写自己的死局。",
            premise: "男主被判必死后，从修真边角位一路撬动宗门秩序。",
            differentiator: "把偷听天机和反向布局结合成持续钩子。",
          },
          {
            title: "《我在仙门做局外人》",
            hook: "人人看不起的杂役，掌握了仙门所有人不敢说的秘密。",
            premise: "主角从信息差切入，在宗门争斗中不断翻盘。",
            differentiator: "从幕后情报战切入，而不是单纯升级打脸。",
          },
          {
            title: "《天命账房》",
            hook: "宗门账房发现所有天才的资源账本都被提前改写。",
            premise: "主角用账册、债务和供奉流向拆穿仙门晋升黑箱。",
            differentiator: "把修仙升级写成资源审计和权力反杀。",
          },
          {
            title: "《我替反派保管机缘》",
            hook: "他被迫替大反派收纳机缘，却发现每件机缘都能改写自己的死期。",
            premise: "主角夹在正邪两道之间，用保管身份不断截胡危机。",
            differentiator: "用保管员视角串联机缘、背叛和长线阵营选择。",
          },
        ],
      };
    case "concept_pack":
      return {
        title: "《玄门逆命》",
        tagline: "偷听天机，逆改必死命。",
        premise: "被逐出山门的废徒意外获得偷听天机的能力，在修真秩序的裂缝里一路逆命。",
        synopsis:
          "主角原本只是宗门弃子，却从一段段被隐瞒的天机里拼出大局，先自救，再反制宗门、世家与更大的修真秩序。",
        protagonist: "林渊，谨慎、记仇、极擅长利用信息差。",
        stakes: "如果他无法先一步破解死局，不仅自己会死，连唯一站在他这边的人也会被牵连。",
        worldRules: [
          "天机只能被片段偷听，不能完整读取。",
          "每次逆改命数都会招来新的反噬。",
          "宗门高层依靠垄断信息维持统治。",
        ],
        openingPromise: [
          "第一卷先解决被逐出山门后的必死局。",
          "前期靠信息差翻盘，中期转为布局反杀。",
          "每个大高潮都围绕一次更大的天机误导展开。",
        ],
      };
    case "opening_draft":
      return {
        chapters: [
          {
            chapterNumber: 1,
            title: "逐出山门",
            body: "林渊被废去外门身份的那一刻，耳边第一次响起并不属于此界的低语：三日后，断魂崖下，必死。",
          },
          {
            chapterNumber: 2,
            title: "断魂崖前",
            body: "所有人都等着看他死，林渊却从偷听到的只言片语里，提前埋下一枚没人注意的暗棋。",
          },
          {
            chapterNumber: 3,
            title: "第一道反杀",
            body: "当追杀者自以为掌控全局时，林渊掀开他听来的秘密，让本该落在自己头上的死局反咬回去。",
          },
        ],
      };
    case "opening_review":
      return {
        hookScore: 84,
        retentionScore: 79,
        noveltyScore: 71,
        proseScore: 74,
        serialPotentialScore: 86,
        riskFlags: ["前两章世界规则需要更快落地"],
        notes:
          "开篇钩子密度足够，信息差驱动也成立，短板主要在设定解释的时机还可以更利落。",
        decisionSuggestion: "approve",
      };
    case "promotion_decision":
      return {
        decision: "approve",
        weightedScore: 80,
        rationale: "假执行器默认将该项目视为通过试产闸门。",
        riskFlags: [],
      };
    default:
      return {
        summary: `Fake artifact for ${contract.nodeName}`,
      };
  }
}
