import { TASK_TEMPLATES, planSplit, workloadSplit } from '@shared/automation/tasks.js';

const pct = (x) => `${Math.round(x * 100)}%`;

export default function TasksPanel({ queue, qStatus, onAssign, onConfirm, onCancel, stats, prefs }) {
  const ids = Object.keys(TASK_TEMPLATES);
  const plan = planSplit(ids);
  // Show the measured split only once you've done at least one human step.
  const lived = queue.humanSteps > 0 ? qStatus : null;
  const human = lived ? lived.humanShare : plan.human;

  return (
    <section className="panel" aria-labelledby="tasks-h">
      <h2 id="tasks-h">Assign tasks to {prefs.twinName}</h2>
      <p className="muted">
        Your twin handles the routine steps (timers, reminders, lighting, coaching, logging). You only do the part that needs you.
      </p>

      <div className="split" data-testid="workload">
        <div className="split-bar" role="img" aria-label={`Human ${pct(human)}, twin ${pct(1 - human)}`}>
          <span className="split-human" style={{ width: pct(human) }}>You {pct(human)}</span>
          <span className="split-twin" style={{ width: pct(1 - human) }}>{prefs.twinName} {pct(1 - human)}</span>
        </div>
        <small className="muted">{lived ? 'Measured from completed steps today.' : 'Planned split across all habit tasks.'} Target: you 20–30%.</small>
      </div>

      <div className="task-grid">
        {ids.map((id) => {
          const t = TASK_TEMPLATES[id];
          const s = workloadSplit(t.steps);
          return (
            <button key={id} className="task-card" onClick={() => onAssign(id)} data-testid={`assign-${id}`}>
              <span className="task-icon" aria-hidden>{t.icon}</span>
              <span className="task-title">{t.title}</span>
              <small>{s.twinSteps} twin · {s.humanSteps} you</small>
            </button>
          );
        })}
      </div>

      {queue.active ? (
        <div className="active-task" data-testid="active-task">
          <div className="row">
            <strong>{queue.active.icon} {queue.active.title}</strong>
            <button className="ghost small" onClick={onCancel}>Cancel</button>
          </div>
          <ol className="steps">
            {queue.active.steps.map((s, i) => (
              <li key={i} className={`${s.actor} ${i < queue.active.index ? 'done' : i === queue.active.index ? 'now' : ''}`}>
                <span className="actor">{s.actor === 'twin' ? '🤖' : '🙋'}</span> {s.label}
              </li>
            ))}
          </ol>
          {qStatus.waitingForHuman && (
            <button className="primary" onClick={onConfirm} data-testid="confirm-human">
              👍 I did it
            </button>
          )}
          {queue.pending.length > 0 && <small className="muted">Queued next: {queue.pending.map((p) => TASK_TEMPLATES[p.templateId].icon).join(' ')}</small>}
        </div>
      ) : (
        <p className="muted" data-testid="twin-idle">{prefs.twinName} is idle. Tap a task or say “remind me to drink water”.</p>
      )}

      <div className="stats">
        <div><b data-testid="stat-tasks">{stats.tasksDone}</b><span>tasks done</span></div>
        <div><b>{stats.glasses}</b><span>glasses</span></div>
        <div><b data-testid="stat-detox">{Math.round(stats.detoxMs / 60000)}</b><span>detox min / {prefs.detoxGoalMin}</span></div>
        <div><b>{stats.breaths}</b><span>breaths</span></div>
      </div>
      {queue.done.length > 0 && (
        <ul className="done-list" data-testid="done-list">
          {queue.done.slice(0, 5).map((d) => (
            <li key={d.uid}>{d.icon} {d.title} <small className="muted">{new Date(d.finishedAt).toLocaleTimeString()}</small></li>
          ))}
        </ul>
      )}
    </section>
  );
}
