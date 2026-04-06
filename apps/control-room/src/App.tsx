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

interface Batch {
  batchId: string;
  name: string;
  targetLane: string;
  audience: string;
  status: string;
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
  nodeName: string;
  roleName: string;
  status: string;
  failureType: string | null;
  startedAt: string;
  completedAt: string | null;
}

interface ArtifactManifest {
  artifactId: string;
  kind: string;
  path: string;
  version: number;
  producer: string;
  createdAt: string;
}

interface GateTask {
  gateId: string;
  gateType: string;
  status: string;
  decision: GateDecision | null;
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

const initialFormState: DemoFormState = {
  batchName: "Demo Xianxia Batch",
  targetLane: "xianxia",
  audience: "male",
  projectTitle: "玄门逆命",
  goal: "尽快看到一条完整的试产闭环跑起来。",
  constraints: "前三章必须有强钩子\n概念要适合长线连载放大",
};

const overviewItems = [
  "文件资产落盘",
  "SQLite 运行记录",
  "Fake executor 闭环",
  "Promotion gate 裁决",
];

export function App() {
  const [form, setForm] = useState<DemoFormState>(initialFormState);
  const [latestRun, setLatestRun] = useState<DemoRun | null>(null);
  const [workspaceRoot, setWorkspaceRoot] = useState("");
  const [databasePath, setDatabasePath] = useState("");
  const [executorInfo, setExecutorInfo] = useState<ExecutorInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadLatestRun();
  }, []);

  async function loadLatestRun() {
    setLoading(true);
    setError(null);

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
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
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

  const project = latestRun?.project;
  const batch = latestRun?.batch;
  const artifactKinds = latestRun?.artifacts.map((artifact) => artifact.kind) ?? [];

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Novel Harness</p>
          <h1>Live Control Room</h1>
        </div>
        <p className="lede">
          现在这页不再只是骨架。你可以直接触发一次假执行器孵化运行，
          看到批次、项目、节点记录、产物和最终晋级结果。
        </p>
      </section>

      <section className="hero-grid">
        <article className="form-card">
          <div className="card-header">
            <h2>一键试跑</h2>
            <p>直接调用 orchestrator 的 demo 闭环。</p>
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
            <button className="primary-button" onClick={runDemo} disabled={running}>
              {running ? "正在运行..." : "运行 Demo 孵化"}
            </button>
            <button className="secondary-button" onClick={() => void loadLatestRun()} disabled={loading}>
              刷新最近结果
            </button>
          </div>

          {error ? <p className="error-text">{error}</p> : null}
        </article>

        <article className="status-card">
          <div className="card-header">
            <h2>当前观测</h2>
            <p>这是你最快能看到“项目真的在跑”的页面。</p>
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
              <span>最终裁决</span>
              <strong>{project?.decision ?? "未生成"}</strong>
            </div>
            <div className="snapshot-tile">
              <span>最近评分</span>
              <strong>{project?.latestScore ?? "--"}</strong>
            </div>
            <div className="snapshot-tile">
              <span>执行模式</span>
              <strong>{executorInfo?.mode ?? "--"}</strong>
            </div>
            <div className="snapshot-tile">
              <span>节点数</span>
              <strong>{latestRun?.nodeRuns.length ?? 0}</strong>
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

      <section className="detail-grid">
        <article className="card">
          <div className="card-header">
            <h2>批次 / 项目</h2>
            <p>一眼看当前试产入口和项目状态。</p>
          </div>

          {loading ? (
            <p className="muted">正在读取最近一次运行...</p>
          ) : latestRun ? (
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
                  stage: {project?.stage} | slug: {project?.slug}
                </p>
              </div>
            </div>
          ) : (
            <p className="muted">还没有运行记录。点击左上角按钮先跑一次。</p>
          )}
        </article>

        <article className="card">
          <div className="card-header">
            <h2>节点流水</h2>
            <p>每个 workflow node 的执行记录。</p>
          </div>

          <div className="timeline">
            {(latestRun?.nodeRuns ?? []).map((nodeRun) => (
              <div className="timeline-item" key={nodeRun.runId}>
                <div>
                  <p className="timeline-title">{nodeRun.nodeName}</p>
                  <p className="timeline-meta">
                    role: {nodeRun.roleName} | status: {nodeRun.status}
                  </p>
                </div>
                <span className={`pill pill-${nodeRun.status}`}>{nodeRun.status}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="card">
          <div className="card-header">
            <h2>产物清单</h2>
            <p>产物已经落盘，而不是只在内存里闪一下。</p>
          </div>

          <div className="artifact-list">
            {(latestRun?.artifacts ?? []).map((artifact) => (
              <div className="artifact-row" key={artifact.artifactId}>
                <div>
                  <p className="artifact-kind">{artifact.kind}</p>
                  <p className="artifact-path">{artifact.path}</p>
                </div>
                <span className="artifact-version">v{artifact.version}</span>
              </div>
            ))}
          </div>

          {artifactKinds.length > 0 ? (
            <p className="muted">
              已生成：{artifactKinds.join(" / ")}
            </p>
          ) : null}
        </article>

        <article className="card">
          <div className="card-header">
            <h2>Gate 结果</h2>
            <p>最终晋级闸门的当前状态。</p>
          </div>

          <div className="gate-list">
            {(latestRun?.gates ?? []).map((gate) => (
              <div className="gate-row" key={gate.gateId}>
                <div>
                  <p className="timeline-title">{gate.gateType}</p>
                  <p className="timeline-meta">decision: {gate.decision ?? "pending"}</p>
                </div>
                <span className={`pill pill-${gate.status}`}>{gate.status}</span>
              </div>
            ))}
          </div>
        </article>
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
