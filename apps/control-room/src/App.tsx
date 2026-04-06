const milestones = [
  "Workspace scaffold",
  "Shared schemas",
  "Asset layer",
  "Workflow core",
  "Executors",
  "Evaluation gates",
];

const panels = [
  {
    title: "Batch Console",
    body: "Launch and compare incubation batches.",
  },
  {
    title: "Project Board",
    body: "Track every project stage and gate status.",
  },
  {
    title: "Review Desk",
    body: "Compare concept packs, openings, and scorecards.",
  },
];

export function App() {
  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Novel Harness</p>
        <h1>Control Room</h1>
        <p className="lede">
          First scaffold for the local operator UI. The goal is to expose batch
          state, review bundles, and promotion gates without turning the browser
          into a long-form editor.
        </p>
      </section>

      <section className="grid">
        <article className="card">
          <h2>Milestone Focus</h2>
          <ul className="stacked-list">
            {milestones.map((milestone) => (
              <li key={milestone}>{milestone}</li>
            ))}
          </ul>
        </article>

        <article className="card">
          <h2>Current Policy</h2>
          <ul className="stacked-list">
            <li>File-backed assets remain the source of truth.</li>
            <li>Workflow nodes own stage transitions.</li>
            <li>Gate decisions remain structured and reviewable.</li>
          </ul>
        </article>
      </section>

      <section className="panel-row">
        {panels.map((panel) => (
          <article className="panel" key={panel.title}>
            <h3>{panel.title}</h3>
            <p>{panel.body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
