import { useEffect, useState } from "react";

type GateDecision = "approve" | "revise" | "retry" | "kill";
type ProjectStatus =
  | "candidate"
  | "incubating"
  | "awaiting_gate"
  | "promoted"
  | "retrying"
  | "killed"
  | "archived";
type NodeName =
  | "batch_brief"
  | "idea_spread"
  | "concept_pack"
  | "opening_draft"
  | "opening_review"
  | "promotion_decision";
type ArtifactKind =
  | "batch_brief"
  | "idea_card"
  | "concept_pack"
  | "opening_draft"
  | "review_scorecard"
  | "decision_record"
  | "project_bible"
  | "trace_log"
  | "prompt_snapshot";
type StageVisualStatus =
  | "pending"
  | "ready"
  | "running"
  | "completed"
  | "failed"
  | "blocked"
  | "awaiting_review";
type RunStepStatus =
  | "pending"
  | "ready"
  | "running"
  | "blocked"
  | "awaiting_review"
  | "succeeded"
  | "failed"
  | "skipped"
  | "rolled_back"
  | "reused_from_checkpoint";

interface Batch {
  batchId: string;
  name: string;
  targetLane: string;
  audience: string;
  status: string;
  currentStage?: string;
}

interface Project {
  projectId: string;
  title: string;
  slug: string;
  status: ProjectStatus;
  stage: string;
  latestScore: number | null;
  decision: GateDecision | null;
}

interface NodeRun {
  runId: string;
  nodeName: NodeName;
  roleName: string;
  executorId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  failureType: string | null;
  retryCount: number;
  inputRefs: string[];
  outputRefs: string[];
  startedAt: string;
  completedAt: string | null;
}

interface ArtifactManifest {
  artifactId: string;
  kind: ArtifactKind;
  path: string;
  version: number;
  producer: string;
  sourceRunId: string;
  createdAt: string;
}

interface GateTask {
  gateId: string;
  gateType: string;
  status: "pending" | "approved" | "rejected";
  decision: GateDecision | null;
  payloadRefs: string[];
  approvedBy: string | null;
  updatedAt?: string;
}

interface WorkflowRun {
  workflowRunId: string;
  status:
    | "queued"
    | "running"
    | "awaiting_review"
    | "succeeded"
    | "failed"
    | "rolled_back";
  currentStage: NodeName | null;
  latestCheckpointId: string | null;
  startedAt: string;
  completedAt: string | null;
}

interface StageRun {
  stageRunId: string;
  workflowRunId: string;
  projectId: string;
  nodeName: NodeName;
  attempt: number;
  status: RunStepStatus;
  failureType: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

interface TaskRun {
  taskRunId: string;
  workflowRunId: string;
  stageRunId: string;
  projectId: string;
  nodeName: NodeName;
  roleName: string;
  executorId: string;
  attempt: number;
  status: RunStepStatus;
  failureType: string | null;
  inputRefs: string[];
  outputRefs: string[];
  reusedFromCheckpointId?: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

interface Checkpoint {
  checkpointId: string;
  workflowRunId: string;
  projectId: string;
  stageRunId: string;
  nodeName: NodeName;
  status: "ready" | "consumed" | "superseded";
  artifactId: string | null;
  createdAt: string;
}

interface RunAction {
  actionId: string;
  workflowRunId: string;
  projectId: string;
  actionType: string;
  actor: string;
  reason: string | null;
  targetNodeName: NodeName | null;
  targetStageRunId: string | null;
  targetTaskRunId: string | null;
  checkpointId: string | null;
  createdAt: string;
}

interface ExecutorInfo {
  mode: "openai" | "fake";
  adapterId: string;
  displayName: string;
  modelId?: string;
  reason: string;
}

interface DemoRun {
  batch: Batch | null;
  project: Project;
  workflowRun: WorkflowRun | null;
  stageRuns: StageRun[];
  taskRuns: TaskRun[];
  checkpoints: Checkpoint[];
  runActions: RunAction[];
  nodeRuns: NodeRun[];
  artifacts: ArtifactManifest[];
  gates: GateTask[];
}

interface DemoStateResponse {
  ok: boolean;
  workspaceRoot: string;
  databasePath: string;
  executor: ExecutorInfo;
  latestRun: DemoRun | null;
}

interface DemoRunResponse {
  ok: boolean;
  workspaceRoot: string;
  databasePath: string;
  executor: ExecutorInfo;
  result: DemoRun;
}

interface DemoFormState {
  batchName: string;
  targetLane: string;
  audience: string;
  projectTitle: string;
  goal: string;
  constraints: string;
}

interface WorkflowNodeDefinition {
  name: NodeName;
  description: string;
  inputKinds: ArtifactKind[];
  outputKinds: ArtifactKind[];
  roleNames: string[];
  retryLimit: number;
  recoverableFailureTypes: string[];
}

interface WorkflowDefinitionResponse {
  order: NodeName[];
  nodes: WorkflowNodeDefinition[];
}

interface ArtifactContentResponse {
  ok: boolean;
  manifest: ArtifactManifest;
  content: string;
}

interface ArtifactPreviewState {
  status: "loading" | "ready" | "failed";
  content?: string;
  error?: string;
}

interface ChecklistStage {
  index: number;
  node: WorkflowNodeDefinition;
  runtimeStage: StageRun | null;
  latestTaskRun: TaskRun | null;
  latestRun: NodeRun | null;
  checkpoint: Checkpoint | null;
  primaryArtifact: ArtifactManifest | null;
  artifacts: ArtifactManifest[];
  traceCount: number;
  gate: GateTask | null;
  statusKey: StageVisualStatus;
  statusLabel: string;
  nextAction: string;
  checkpointReady: boolean;
}

interface AttentionItem {
  title: string;
  detail: string;
}

const initialFormState: DemoFormState = {
  batchName: "Demo Xianxia Batch",
  targetLane: "xianxia",
  audience: "male",
  projectTitle: "玄门逆命",
  goal: "尽快看到一条完整的试产闭环跑起来。",
  constraints: "前三章必须有强钩子\n概念要适合长线连载放大",
};

const overviewItems = [
  "Checklist 状态总览",
  "阶段级 checkpoint 可见",
  "关键产物内联预览",
  "Attention Queue",
];

const fallbackWorkflowNodes: WorkflowNodeDefinition[] = [
  {
    name: "batch_brief",
    description: "冻结批次目标，形成可追踪的试产入口。",
    inputKinds: ["batch_brief"],
    outputKinds: ["batch_brief"],
    roleNames: ["trend_scout"],
    retryLimit: 1,
    recoverableFailureTypes: ["retryable"],
  },
  {
    name: "idea_spread",
    description: "生成候选创意、钩子和题材切口。",
    inputKinds: ["batch_brief"],
    outputKinds: ["idea_card"],
    roleNames: ["trend_scout", "trope_mixer", "positioning_editor"],
    retryLimit: 2,
    recoverableFailureTypes: ["retryable", "repairable"],
  },
  {
    name: "concept_pack",
    description: "将候选创意打包成结构化概念卡。",
    inputKinds: ["idea_card"],
    outputKinds: ["concept_pack"],
    roleNames: ["concept_packer"],
    retryLimit: 2,
    recoverableFailureTypes: ["retryable", "repairable"],
  },
  {
    name: "opening_draft",
    description: "完成试读开篇和前三章钩子。",
    inputKinds: ["concept_pack"],
    outputKinds: ["opening_draft"],
    roleNames: ["opening_drafter", "hook_surgeon"],
    retryLimit: 2,
    recoverableFailureTypes: ["retryable", "repairable"],
  },
  {
    name: "opening_review",
    description: "基于市场与故事维度进行结构化评审。",
    inputKinds: ["concept_pack", "opening_draft"],
    outputKinds: ["review_scorecard"],
    roleNames: ["market_reviewer", "story_critic"],
    retryLimit: 1,
    recoverableFailureTypes: ["retryable", "review_required"],
  },
  {
    name: "promotion_decision",
    description: "汇总评分与风险，产出晋级裁决。",
    inputKinds: ["review_scorecard"],
    outputKinds: ["decision_record"],
    roleNames: ["promotion_judge"],
    retryLimit: 1,
    recoverableFailureTypes: ["review_required"],
  },
];
export function App() {
  const [form, setForm] = useState<DemoFormState>(initialFormState);
  const [latestRun, setLatestRun] = useState<DemoRun | null>(null);
  const [expandedStages, setExpandedStages] = useState<
    Partial<Record<NodeName, boolean>>
  >({});
  const [workflowNodes, setWorkflowNodes] = useState<WorkflowNodeDefinition[]>(
    fallbackWorkflowNodes,
  );
  const [artifactPreviews, setArtifactPreviews] = useState<
    Record<string, ArtifactPreviewState>
  >({});
  const [workspaceRoot, setWorkspaceRoot] = useState("");
  const [databasePath, setDatabasePath] = useState("");
  const [executorInfo, setExecutorInfo] = useState<ExecutorInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [resumingCheckpointId, setResumingCheckpointId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadLatestRun();
    void loadWorkflowDefinition();
  }, []);

  useEffect(() => {
    setExpandedStages({});
  }, [latestRun?.workflowRun?.workflowRunId]);

  useEffect(() => {
    if (latestRun?.workflowRun?.status !== "running") {
      return;
    }

    const timer = window.setInterval(() => {
      void loadLatestRun({ silent: true });
    }, 5000);

    return () => {
      window.clearInterval(timer);
    };
  }, [latestRun?.workflowRun?.workflowRunId, latestRun?.workflowRun?.status]);

  useEffect(() => {
    let cancelled = false;

    async function loadArtifactPreviews() {
      if (!latestRun) {
        setArtifactPreviews({});
        return;
      }

      const stages = buildChecklistStages(workflowNodes, latestRun);
      const artifactIds = Array.from(
        new Set(
          stages
            .map((stage) => stage.primaryArtifact?.artifactId)
            .filter((artifactId): artifactId is string => Boolean(artifactId)),
        ),
      );

      if (artifactIds.length === 0) {
        setArtifactPreviews({});
        return;
      }

      setArtifactPreviews((current) => {
        const nextState: Record<string, ArtifactPreviewState> = {};

        for (const artifactId of artifactIds) {
          nextState[artifactId] =
            current[artifactId]?.status === "ready"
              ? current[artifactId]
              : { status: "loading" };
        }

        return nextState;
      });

      const previewEntries = await Promise.all(
        artifactIds.map(async (artifactId) => {
          try {
            const response = await fetch(
              `/api/artifacts/${encodeURIComponent(artifactId)}/content`,
            );
            const payload = (await response.json()) as ArtifactContentResponse & {
              error?: string;
            };

            if (!response.ok || !payload.ok) {
              throw new Error(payload.error ?? "无法读取产物内容。");
            }

            return [
              artifactId,
              {
                status: "ready",
                content: payload.content,
              } satisfies ArtifactPreviewState,
            ] as const;
          } catch (previewError) {
            return [
              artifactId,
              {
                status: "failed",
                error:
                  previewError instanceof Error
                    ? previewError.message
                    : String(previewError),
              } satisfies ArtifactPreviewState,
            ] as const;
          }
        }),
      );

      if (!cancelled) {
        setArtifactPreviews(Object.fromEntries(previewEntries));
      }
    }

    void loadArtifactPreviews();

    return () => {
      cancelled = true;
    };
  }, [latestRun, workflowNodes]);

  async function loadWorkflowDefinition() {
    try {
      const response = await fetch("/api/workflows/incubation");
      const payload = (await response.json()) as WorkflowDefinitionResponse;

      if (!response.ok || !Array.isArray(payload.nodes)) {
        throw new Error("无法读取 workflow 定义。");
      }

      setWorkflowNodes(payload.nodes.length > 0 ? payload.nodes : fallbackWorkflowNodes);
    } catch {
      setWorkflowNodes(fallbackWorkflowNodes);
    }
  }

  async function loadLatestRun(options: { silent?: boolean } = {}) {
    if (!options.silent) {
      setLoading(true);
      setError(null);
    }

    try {
      const response = await fetch("/api/demo/state");
      const payload = (await response.json()) as DemoStateResponse & {
        error?: string;
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "无法读取 demo 状态。");
      }

      setWorkspaceRoot(payload.workspaceRoot);
      setDatabasePath(payload.databasePath);
      setExecutorInfo(payload.executor);
      setLatestRun(payload.latestRun);
    } catch (loadError) {
      if (!options.silent) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      }
    } finally {
      if (!options.silent) {
        setLoading(false);
      }
    }
  }

  async function runDemo() {
    setRunning(true);
    setError(null);

    try {
      const response = await fetch("/api/demo/incubation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          batchName: form.batchName,
          targetLane: form.targetLane,
          audience: form.audience,
          projectTitle: form.projectTitle,
          goal: form.goal,
          constraints: parseConstraints(form.constraints),
        }),
      });
      const payload = (await response.json()) as DemoRunResponse & {
        error?: string;
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "演示孵化运行失败。");
      }

      setWorkspaceRoot(payload.workspaceRoot);
      setDatabasePath(payload.databasePath);
      setExecutorInfo(payload.executor);
      setLatestRun(payload.result);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : String(runError));
    } finally {
      setRunning(false);
    }
  }

  async function resumeFromCheckpoint(stage: ChecklistStage) {
    if (!latestRun?.workflowRun || !stage.checkpoint) {
      return;
    }

    setResumingCheckpointId(stage.checkpoint.checkpointId);
    setError(null);

    try {
      const response = await fetch(
        `/api/runs/${encodeURIComponent(latestRun.workflowRun.workflowRunId)}/resume`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            checkpointId: stage.checkpoint.checkpointId,
            ...(form.goal.trim() ? { goal: form.goal.trim() } : {}),
          }),
        },
      );
      const payload = (await response.json()) as DemoRunResponse & {
        error?: string;
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "从 checkpoint 恢复失败。");
      }

      setWorkspaceRoot(payload.workspaceRoot);
      setDatabasePath(payload.databasePath);
      setExecutorInfo(payload.executor);
      setLatestRun(payload.result);
    } catch (resumeError) {
      setError(resumeError instanceof Error ? resumeError.message : String(resumeError));
    } finally {
      setResumingCheckpointId(null);
    }
  }

  function toggleStage(stage: ChecklistStage) {
    setExpandedStages((current) => ({
      ...current,
      [stage.node.name]: !(current[stage.node.name] ?? shouldStageAutoExpand(stage)),
    }));
  }

  const checklistStages = buildChecklistStages(workflowNodes, latestRun);
  const completedCount = checklistStages.filter(
    (stage) => stage.statusKey === "completed",
  ).length;
  const runningCount = checklistStages.filter(
    (stage) => stage.statusKey === "running",
  ).length;
  const attentionCount = checklistStages.filter((stage) =>
    ["failed", "blocked", "awaiting_review"].includes(stage.statusKey),
  ).length;
  const deliverableCount =
    latestRun?.artifacts.filter((artifact) => artifact.kind !== "trace_log").length ?? 0;
  const checkpointCount = checklistStages.filter((stage) => stage.checkpointReady).length;
  const completionRatio =
    checklistStages.length > 0
      ? Math.round((completedCount / checklistStages.length) * 100)
      : 0;
  const currentCheckpoint =
    latestRun?.workflowRun?.latestCheckpointId
      ? latestRun.checkpoints.find(
          (checkpoint) =>
            checkpoint.checkpointId === latestRun.workflowRun?.latestCheckpointId,
        )?.nodeName ?? null
      : [...checklistStages].reverse().find((stage) => stage.checkpointReady)?.node.name ??
        null;
  const attentionItems = buildAttentionItems(checklistStages, latestRun);
  const latestGate = latestRun?.gates[0] ?? null;
  const latestDeliverables = getLatestDeliverables(latestRun?.artifacts ?? []);
  const parallelReadyCount = workflowNodes.filter(
    (node) => node.roleNames.length > 1,
  ).length;
  const workflowStatus = latestRun?.workflowRun?.status ?? null;
  const autoRefreshEnabled = workflowStatus === "running";
  const busy = running || Boolean(resumingCheckpointId);
  const project = latestRun?.project;
  const batch = latestRun?.batch;
  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Novel Harness</p>
          <h1>Checklist Control Room</h1>
        </div>
        <p className="lede">
          页面现在围绕“当前跑到哪一步、产物是什么、下一步该做什么”来组织，
          不再只把节点日志和文件路径平铺出来。
        </p>
      </section>

      <section className="hero-grid">
        <article className="form-card">
          <div className="card-header">
            <h2>触发一次试跑</h2>
            <p>保留最短输入面板，但右侧工作台会按 checklist 追踪整条链路。</p>
          </div>

          <div className="form-grid">
            <label>
              <span>批次名</span>
              <input
                value={form.batchName}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    batchName: event.target.value,
                  }))
                }
              />
            </label>

            <label>
              <span>题材赛道</span>
              <input
                value={form.targetLane}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    targetLane: event.target.value,
                  }))
                }
              />
            </label>

            <label>
              <span>受众</span>
              <input
                value={form.audience}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    audience: event.target.value,
                  }))
                }
              />
            </label>

            <label>
              <span>项目标题</span>
              <input
                value={form.projectTitle}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    projectTitle: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          <label className="field-block">
            <span>目标</span>
            <textarea
              value={form.goal}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  goal: event.target.value,
                }))
              }
              rows={3}
            />
          </label>

          <label className="field-block">
            <span>约束</span>
            <textarea
              value={form.constraints}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  constraints: event.target.value,
                }))
              }
              rows={4}
            />
          </label>

          <div className="action-row">
            <button className="primary-button" onClick={runDemo} disabled={busy}>
              {running ? "正在运行..." : "运行 Demo 孵化"}
            </button>
            <button
              className="secondary-button"
              onClick={() => void loadLatestRun()}
              disabled={loading}
            >
              刷新最近结果
            </button>
          </div>

          {error ? <p className="error-text">{error}</p> : null}
        </article>

        <article className="status-card">
          <div className="card-header">
            <h2>控制面状态</h2>
            <p>先把 checkpoint、产物和注意事项聚焦出来，再往后扩展 resume / rollback / skip。</p>
          </div>

          <div className="badge-row">
            {overviewItems.map((item) => (
              <span className="badge" key={item}>
                {item}
              </span>
            ))}
          </div>

          <dl className="path-list">
            <div>
              <dt>Workspace</dt>
              <dd>{workspaceRoot || "等待首次运行"}</dd>
            </div>
            <div>
              <dt>SQLite</dt>
              <dd>{databasePath || "等待首次运行"}</dd>
            </div>
          </dl>

          <div className="snapshot-grid">
            <div className="snapshot-tile">
              <span>项目状态</span>
              <strong>{project?.status ?? "未运行"}</strong>
            </div>
            <div className="snapshot-tile">
              <span>当前阶段</span>
              <strong>{project?.stage ?? "--"}</strong>
            </div>
            <div className="snapshot-tile">
              <span>执行模式</span>
              <strong>{executorInfo?.mode ?? "--"}</strong>
            </div>
            <div className="snapshot-tile">
              <span>状态同步</span>
              <strong>{autoRefreshEnabled ? "自动轮询中" : "手动 / 待机"}</strong>
            </div>
            <div className="snapshot-tile">
              <span>并行预留节点</span>
              <strong>{parallelReadyCount}</strong>
            </div>
          </div>

          {executorInfo ? (
            <div className="executor-note">
              <p className="timeline-title">
                {executorInfo.displayName}
                {executorInfo.modelId ? ` / ${executorInfo.modelId}` : ""}
              </p>
              <p className="timeline-meta">{executorInfo.reason}</p>
            </div>
          ) : null}
        </article>
      </section>

      <section className="overview-grid">
        <article className="card progress-card">
          <div className="card-header compact-header">
            <div>
              <h2>Run Checklist</h2>
              <p>按阶段聚焦当前进度、checkpoint 和可见产物。</p>
            </div>
            <span className="progress-total">{completedCount}/{checklistStages.length}</span>
          </div>

          <div className="progress-track" aria-hidden="true">
            <div className="progress-fill" style={{ width: `${completionRatio}%` }} />
          </div>

          <div className="metric-grid">
            <div className="metric-tile">
              <span>完成阶段</span>
              <strong>{completedCount}</strong>
            </div>
            <div className="metric-tile">
              <span>运行中</span>
              <strong>{runningCount}</strong>
            </div>
            <div className="metric-tile">
              <span>Attention</span>
              <strong>{attentionCount}</strong>
            </div>
            <div className="metric-tile">
              <span>关键产物</span>
              <strong>{deliverableCount}</strong>
            </div>
            <div className="metric-tile">
              <span>Checkpoint</span>
              <strong>{checkpointCount}</strong>
            </div>
            <div className="metric-tile">
              <span>最终裁决</span>
              <strong>{project?.decision ?? latestGate?.decision ?? "--"}</strong>
            </div>
          </div>

          <p className="muted checkpoint-note">
            当前 checkpoint：
            {currentCheckpoint ? `${getStageTitle(currentCheckpoint)} 已可作为恢复锚点。` : "尚未形成。"}
          </p>
        </article>

        <article className="card attention-card">
          <div className="card-header compact-header">
            <div>
              <h2>Attention Queue</h2>
              <p>把需要你感知和处理的事项单独提出来。</p>
            </div>
          </div>

          <div className="attention-list">
            {attentionItems.map((item) => (
              <div className="attention-item" key={`${item.title}-${item.detail}`}>
                <p className="attention-title">{item.title}</p>
                <p className="attention-detail">{item.detail}</p>
              </div>
            ))}
          </div>
        </article>
      </section>
      <section className="workspace-grid">
        <article className="card checklist-card">
          <div className="card-header">
            <h2>阶段 Checklist</h2>
            <p>
              每一项都直接显示角色集合、最近一次尝试、主产物和下一步动作。
              多角色节点已经标记为 parallel-ready，后续接 runtime 扩展即可。
            </p>
          </div>

          {loading ? (
            <p className="muted">正在读取最近一次运行...</p>
          ) : (
            <div className="checklist-list">
              {checklistStages.map((stage) => {
                const previewState = stage.primaryArtifact
                  ? artifactPreviews[stage.primaryArtifact.artifactId]
                  : null;
                const pillKey = mapStageStatusToPill(stage.statusKey);
                const expanded =
                  expandedStages[stage.node.name] ?? shouldStageAutoExpand(stage);
                const canResume =
                  Boolean(latestRun?.workflowRun && stage.checkpoint) &&
                  !busy &&
                  workflowStatus !== "running";

                return (
                  <article
                    className={`stage-card stage-${stage.statusKey}`}
                    key={stage.node.name}
                  >
                    <div className="stage-header">
                      <div className="stage-marker">
                        {String(stage.index + 1).padStart(2, "0")}
                      </div>
                      <div className="stage-heading">
                        <p className="stage-kicker">Checklist Item</p>
                        <h3>{getStageTitle(stage.node.name)}</h3>
                        <p>{stage.node.description}</p>
                      </div>
                      <span className={`pill pill-${pillKey}`}>{stage.statusLabel}</span>
                    </div>

                    <div className="stage-chip-row">
                      <span className="meta-chip">roles {stage.node.roleNames.length}</span>
                      {stage.node.roleNames.length > 1 ? (
                        <span className="meta-chip">parallel-ready</span>
                      ) : null}
                      {stage.checkpointReady ? (
                        <span className="meta-chip">checkpoint ready</span>
                      ) : null}
                      {stage.traceCount > 0 ? (
                        <span className="meta-chip">trace {stage.traceCount}</span>
                      ) : null}
                      {stage.latestTaskRun?.status === "reused_from_checkpoint" ? (
                        <span className="meta-chip">reused checkpoint</span>
                      ) : null}
                      {getStageAttempt(stage) > 1 ? (
                        <span className="meta-chip">attempt {getStageAttempt(stage)}</span>
                      ) : null}
                    </div>
                    <div className="stage-toolbar">
                      <p className="stage-summary-line">{stage.nextAction}</p>
                      <div className="stage-action-row">
                        {stage.checkpoint ? (
                          <button
                            className="stage-button"
                            onClick={() => void resumeFromCheckpoint(stage)}
                            disabled={!canResume}
                          >
                            {resumingCheckpointId === stage.checkpoint.checkpointId
                              ? "恢复中..."
                              : "从这里继续"}
                          </button>
                        ) : null}
                        <button
                          className="stage-button stage-button-secondary"
                          onClick={() => toggleStage(stage)}
                        >
                          {expanded ? "收起详情" : "展开详情"}
                        </button>
                      </div>
                    </div>

                    {expanded ? (
                      <>
                        <div className="stage-info-grid">
                          <div className="stage-info-card">
                            <span className="mini-label">角色集合</span>
                            <p className="stage-text">{stage.node.roleNames.join(" / ")}</p>
                          </div>
                          <div className="stage-info-card">
                            <span className="mini-label">最近尝试</span>
                            <p className="stage-text">{getStageTimingLabel(stage)}</p>
                          </div>
                          <div className="stage-info-card">
                            <span className="mini-label">下一动作</span>
                            <p className="stage-text">{stage.nextAction}</p>
                          </div>
                        </div>

                        {stage.primaryArtifact ? (
                          <div className="artifact-panel">
                            <div className="artifact-panel-head">
                              <div>
                                <p className="artifact-kind">{stage.primaryArtifact.kind}</p>
                                <p className="artifact-meta">
                                  {stage.primaryArtifact.producer} / v{stage.primaryArtifact.version} / {formatTimestamp(stage.primaryArtifact.createdAt)}
                                </p>
                              </div>
                              <span className="artifact-version">deliverable</span>
                            </div>
                            <p className="artifact-path">{stage.primaryArtifact.path}</p>
                            <details
                              className="artifact-details"
                              open={stage.statusKey !== "pending" && stage.statusKey !== "blocked"}
                            >
                              <summary>展开关键产物预览</summary>
                              {previewState?.status === "ready" ? (
                                <pre className="artifact-preview">
                                  {createPreviewSnippet(previewState.content ?? "")}
                                </pre>
                              ) : previewState?.status === "failed" ? (
                                <p className="error-text compact-error">{previewState.error}</p>
                              ) : (
                                <p className="muted">正在加载产物正文...</p>
                              )}
                            </details>
                          </div>
                        ) : (
                          <div className="artifact-placeholder">
                            <p className="mini-label">关键产物</p>
                            <p className="muted">这一阶段还没有持久化主产物。</p>
                          </div>
                        )}

                        {stage.latestRun || stage.runtimeStage ? (
                          <div className="stage-footer">
                            <p className="stage-footer-line">{getStageFooterSummary(stage)}</p>
                            {stage.latestTaskRun?.failureType || stage.latestRun?.failureType ? (
                              <p className="stage-footer-line">
                                failure type: {stage.latestTaskRun?.failureType ?? stage.latestRun?.failureType}
                              </p>
                            ) : null}
                            {stage.gate ? (
                              <p className="stage-footer-line">
                                gate: {stage.gate.gateType} / {stage.gate.status} / {stage.gate.decision ?? "pending"}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </article>

        <aside className="sidebar-stack">
          <article className="card">
            <div className="card-header">
              <h2>批次 / 项目快照</h2>
              <p>把入口、分数和 gate 信息压成一个可扫读的摘要。</p>
            </div>

            {latestRun ? (
              <div className="stack">
                <div className="summary-block">
                  <span className="label">Batch</span>
                  <h3>{batch?.name ?? "未知批次"}</h3>
                  <p>
                    {batch?.targetLane} / {batch?.audience} / {batch?.status}
                  </p>
                </div>

                <div className="summary-block">
                  <span className="label">Project</span>
                  <h3>{project?.title}</h3>
                  <p>
                    stage: {project?.stage} / slug: {project?.slug}
                  </p>
                  <p>
                    score: {project?.latestScore ?? "--"} / decision: {project?.decision ?? "--"}
                  </p>
                </div>

                {latestGate ? (
                  <div className="summary-block">
                    <span className="label">Gate</span>
                    <h3>{latestGate.gateType}</h3>
                    <p>
                      {latestGate.status} / {latestGate.decision ?? "pending"}
                    </p>
                    <p>approved by: {latestGate.approvedBy ?? "--"}</p>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="muted">还没有运行记录。先跑一次，右侧 checklist 会自动落满。</p>
            )}
          </article>

          <article className="card">
            <div className="card-header">
              <h2>最近产物</h2>
              <p>非 trace 产物单独抽出来，避免重要 deliverable 被日志淹没。</p>
            </div>

            <div className="deliverable-list">
              {latestDeliverables.length > 0 ? (
                latestDeliverables.map((artifact) => (
                  <div className="deliverable-row" key={artifact.artifactId}>
                    <div>
                      <p className="timeline-title">
                        {getArtifactLabel(artifact.kind)}
                      </p>
                      <p className="timeline-meta">
                        {artifact.producer} / {formatTimestamp(artifact.createdAt)}
                      </p>
                    </div>
                    <span className="artifact-version">v{artifact.version}</span>
                  </div>
                ))
              ) : (
                <p className="muted">还没有可展示的关键产物。</p>
              )}
            </div>
          </article>
        </aside>
      </section>
    </main>
  );
}
function parseConstraints(input: string) {
  return input
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildChecklistStages(
  workflowNodes: WorkflowNodeDefinition[],
  latestRun: DemoRun | null,
): ChecklistStage[] {
  const orderedNodes =
    workflowNodes.length > 0 ? workflowNodes : fallbackWorkflowNodes;
  const nodeRuns = [...(latestRun?.nodeRuns ?? [])].sort(
    (left, right) =>
      new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime(),
  );
  const stageRuns = [...(latestRun?.stageRuns ?? [])].sort(
    (left, right) =>
      compareNullableIso(right.startedAt, left.startedAt) ||
      right.attempt - left.attempt,
  );
  const taskRuns = [...(latestRun?.taskRuns ?? [])].sort(
    (left, right) =>
      compareNullableIso(right.startedAt, left.startedAt) ||
      right.attempt - left.attempt,
  );
  const checkpoints = [...(latestRun?.checkpoints ?? [])].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
  const artifacts = latestRun?.artifacts ?? [];
  const gates = latestRun?.gates ?? [];
  const stages: ChecklistStage[] = [];

  for (const [index, node] of orderedNodes.entries()) {
    const runtimeStage = stageRuns.find((stageRun) => stageRun.nodeName === node.name) ?? null;
    const latestTaskRun = runtimeStage
      ? taskRuns.find((taskRun) => taskRun.stageRunId === runtimeStage.stageRunId) ?? null
      : taskRuns.find((taskRun) => taskRun.nodeName === node.name) ?? null;
    const latestNodeRun = nodeRuns.find((nodeRun) => nodeRun.nodeName === node.name) ?? null;
    const primaryArtifactKind = getPrimaryArtifactKind(node.name);
    const artifactsForRun = latestNodeRun
      ? artifacts.filter((artifact) => artifact.sourceRunId === latestNodeRun.runId)
      : [];
    const primaryArtifact =
      artifactsForRun.find((artifact) => artifact.kind === primaryArtifactKind) ??
      artifacts.find((artifact) => artifact.kind === primaryArtifactKind) ??
      null;
    const gate = node.name === "promotion_decision" ? gates[0] ?? null : null;
    const checkpoint =
      (runtimeStage
        ? checkpoints.find(
            (entry) =>
              entry.stageRunId === runtimeStage.stageRunId && entry.status === "ready",
          )
        : checkpoints.find(
            (entry) => entry.nodeName === node.name && entry.status === "ready",
          )) ?? null;
    const statusKey = runtimeStage
      ? mapRunStepStatusToVisualStatus(runtimeStage.status, gate)
      : resolveStageStatus(index, latestNodeRun, gate, stages);

    stages.push({
      index,
      node,
      runtimeStage,
      latestTaskRun,
      latestRun: latestNodeRun,
      checkpoint,
      primaryArtifact,
      artifacts: artifactsForRun,
      traceCount: artifactsForRun.filter((artifact) => artifact.kind === "trace_log").length,
      gate,
      statusKey,
      statusLabel: getStageStatusLabel(statusKey, latestTaskRun, latestNodeRun, gate),
      nextAction: getNextAction(statusKey, node, latestTaskRun, latestNodeRun),
      checkpointReady: checkpoint !== null,
    });
  }

  return stages;
}

function mapRunStepStatusToVisualStatus(
  status: RunStepStatus,
  gate: GateTask | null,
): StageVisualStatus {
  if (gate?.status === "pending") {
    return "awaiting_review";
  }

  if (gate?.status === "rejected") {
    return "failed";
  }

  switch (status) {
    case "ready":
      return "ready";
    case "running":
      return "running";
    case "blocked":
      return "blocked";
    case "awaiting_review":
      return "awaiting_review";
    case "succeeded":
    case "skipped":
    case "reused_from_checkpoint":
      return "completed";
    case "failed":
    case "rolled_back":
      return "failed";
    default:
      return "pending";
  }
}

function resolveStageStatus(
  index: number,
  latestRun: NodeRun | null,
  gate: GateTask | null,
  previousStages: ChecklistStage[],
): StageVisualStatus {
  if (gate?.status === "pending") {
    return "awaiting_review";
  }

  if (gate?.status === "rejected") {
    return "failed";
  }

  if (latestRun?.status === "failed") {
    return "failed";
  }

  if (latestRun?.status === "running") {
    return "running";
  }

  if (latestRun?.status === "succeeded") {
    return "completed";
  }

  if (index === 0) {
    return "ready";
  }

  if (previousStages.every((stage) => stage.statusKey === "completed")) {
    return "ready";
  }

  return previousStages.some((stage) =>
    ["failed", "blocked", "running", "awaiting_review"].includes(stage.statusKey),
  )
    ? "blocked"
    : "pending";
}

function getStageStatusLabel(
  statusKey: StageVisualStatus,
  latestTaskRun: TaskRun | null,
  latestRun: NodeRun | null,
  gate: GateTask | null,
) {
  const failureType = latestTaskRun?.failureType ?? latestRun?.failureType ?? null;
  const taskStatus = latestTaskRun?.status ?? null;

  switch (statusKey) {
    case "completed":
      if (taskStatus === "reused_from_checkpoint") {
        return "reused";
      }
      return "done";
    case "running":
      return "running";
    case "failed":
      return failureType ? `failed / ${failureType}` : "failed";
    case "ready":
      return "ready";
    case "blocked":
      return "blocked";
    case "awaiting_review":
      return gate?.status === "pending" ? "awaiting gate" : "awaiting review";
    default:
      return "pending";
  }
}

function getNextAction(
  statusKey: StageVisualStatus,
  node: WorkflowNodeDefinition,
  latestTaskRun: TaskRun | null,
  latestRun: NodeRun | null,
) {
  const roleName = latestTaskRun?.roleName ?? latestRun?.roleName ?? node.roleNames[0];
  const failureType = latestTaskRun?.failureType ?? latestRun?.failureType ?? null;
  const taskStatus = latestTaskRun?.status ?? null;

  switch (statusKey) {
    case "completed":
      return taskStatus === "reused_from_checkpoint"
        ? "这一阶段已沿用历史 checkpoint；可以从当前选定节点继续往下执行。"
        : "Checkpoint 已形成，可作为后续 resume / rollback 锚点。";
    case "running":
      return `等待 ${roleName} 完成当前输出。`;
    case "failed":
      return failureType === "review_required"
        ? "需要人工介入判断是否修复、重跑或直接终止。"
        : "定位失败原因后再决定重跑或替换输入。";
    case "ready":
      return "这是当前最早可以继续推进的阶段。";
    case "blocked":
      return "上游阶段未完成，暂时不能安全推进。";
    case "awaiting_review":
      return "等待 gate 决策；下一阶段前不应继续自动串行。";
    default:
      return "尚未排到这一阶段。";
  }
}

function shouldStageAutoExpand(stage: ChecklistStage) {
  return ["ready", "running", "failed", "blocked", "awaiting_review"].includes(
    stage.statusKey,
  );
}

function getStageAttempt(stage: ChecklistStage) {
  if (stage.runtimeStage) {
    return stage.runtimeStage.attempt;
  }

  if (stage.latestRun) {
    return stage.latestRun.retryCount + 1;
  }

  return 1;
}

function getStageTimingLabel(stage: ChecklistStage) {
  const startedAt =
    stage.latestTaskRun?.startedAt ??
    stage.runtimeStage?.startedAt ??
    stage.latestRun?.startedAt ??
    null;
  const completedAt =
    stage.latestTaskRun?.completedAt ??
    stage.runtimeStage?.completedAt ??
    stage.latestRun?.completedAt ??
    null;

  if (!startedAt) {
    return stage.latestTaskRun?.status === "reused_from_checkpoint"
      ? "沿用历史 checkpoint"
      : "尚未开始";
  }

  return `${formatTimestamp(startedAt)}${
    completedAt ? ` -> ${formatTimestamp(completedAt)}` : " -> running"
  }`;
}

function getStageFooterSummary(stage: ChecklistStage) {
  if (stage.runtimeStage && stage.latestTaskRun) {
    return `stage ${stage.runtimeStage.stageRunId.slice(0, 8)} / task ${stage.latestTaskRun.taskRunId.slice(0, 8)} / status ${stage.latestTaskRun.status}`;
  }

  if (stage.runtimeStage) {
    return `stage ${stage.runtimeStage.stageRunId.slice(0, 8)} / status ${stage.runtimeStage.status}`;
  }

  if (stage.latestRun) {
    return `run ${stage.latestRun.runId.slice(0, 8)} / inputs ${stage.latestRun.inputRefs.length} / outputs ${stage.latestRun.outputRefs.length}`;
  }

  return "尚无执行记录。";
}

function compareNullableIso(left: string | null, right: string | null) {
  return new Date(left ?? 0).getTime() - new Date(right ?? 0).getTime();
}

function buildAttentionItems(
  checklistStages: ChecklistStage[],
  latestRun: DemoRun | null,
): AttentionItem[] {
  if (!latestRun) {
    return [
      {
        title: "尚未开始试跑",
        detail: "先运行一次 demo，checklist 才会形成 checkpoint、产物和状态反馈。",
      },
    ];
  }

  const items = checklistStages.flatMap((stage) => {
    if (stage.statusKey === "failed") {
      return [
        {
          title: `${getStageTitle(stage.node.name)} 失败`,
          detail: stage.nextAction,
        },
      ];
    }

    if (stage.statusKey === "awaiting_review") {
      return [
        {
          title: `${getStageTitle(stage.node.name)} 等待裁决`,
          detail: stage.nextAction,
        },
      ];
    }

    if (stage.statusKey === "running") {
      return [
        {
          title: `${getStageTitle(stage.node.name)} 正在执行`,
          detail: stage.nextAction,
        },
      ];
    }

    return [];
  });

  if (items.length > 0) {
    return items;
  }

  const nextReadyStage = checklistStages.find((stage) => stage.statusKey === "ready");
  if (nextReadyStage) {
    return [
      {
        title: `下一可推进阶段：${getStageTitle(nextReadyStage.node.name)}`,
        detail: nextReadyStage.nextAction,
      },
    ];
  }

  return [
    {
      title: "当前没有阻塞项",
      detail: "这次运行的关键阶段都已经有明确结果，注意查看最新 deliverable 和 decision。",
    },
  ];
}

function getLatestDeliverables(artifacts: ArtifactManifest[]) {
  return artifacts
    .filter((artifact) => artifact.kind !== "trace_log")
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    )
    .slice(0, 6);
}
function getPrimaryArtifactKind(nodeName: NodeName): ArtifactKind {
  switch (nodeName) {
    case "idea_spread":
      return "idea_card";
    case "concept_pack":
      return "concept_pack";
    case "opening_draft":
      return "opening_draft";
    case "opening_review":
      return "review_scorecard";
    case "promotion_decision":
      return "decision_record";
    default:
      return "batch_brief";
  }
}

function getStageTitle(nodeName: NodeName) {
  switch (nodeName) {
    case "batch_brief":
      return "Batch Brief";
    case "idea_spread":
      return "创意候选";
    case "concept_pack":
      return "Concept Pack";
    case "opening_draft":
      return "Opening Draft";
    case "opening_review":
      return "评审打分";
    case "promotion_decision":
      return "晋级裁决";
    default:
      return nodeName;
  }
}

function getArtifactLabel(kind: ArtifactKind) {
  switch (kind) {
    case "batch_brief":
      return "Batch Brief";
    case "idea_card":
      return "Idea Spread";
    case "concept_pack":
      return "Concept Pack";
    case "opening_draft":
      return "Opening Draft";
    case "review_scorecard":
      return "Review Scorecard";
    case "decision_record":
      return "Decision Record";
    case "trace_log":
      return "Trace Log";
    case "project_bible":
      return "Project Bible";
    default:
      return kind;
  }
}

function mapStageStatusToPill(statusKey: StageVisualStatus) {
  switch (statusKey) {
    case "completed":
      return "succeeded";
    case "running":
      return "running";
    case "failed":
      return "failed";
    case "ready":
      return "ready";
    case "blocked":
      return "blocked";
    case "awaiting_review":
      return "pending";
    default:
      return "pending";
  }
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return "--";
  }

  return new Date(value).toLocaleString("zh-CN", {
    hour12: false,
  });
}

function createPreviewSnippet(content: string) {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return "(empty artifact)";
  }

  const lines = trimmed.split(/\r?\n/).slice(0, 16).join("\n");
  return trimmed.length > lines.length ? `${lines}\n\n...` : lines;
}
