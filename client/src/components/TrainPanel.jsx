import { EXERCISES } from '@shared/wellness/exercises.js';
import { GESTURES } from '@shared/hands/gestures.js';
import { GESTURE_TIPS } from '@shared/wellness/tips.js';

export default function TrainPanel({ exerciseView, onStart, onStop, tip, onNextTip }) {
  return (
    <section className="panel" aria-labelledby="train-h">
      <h2 id="train-h">Brain exercises</h2>
      <div className="task-grid">
        {Object.entries(EXERCISES).map(([id, ex]) => (
          <button key={id} className="task-card" onClick={() => onStart(id)} data-testid={`start-${id}`}>
            <span className="task-title">{ex.title}</span>
            <small>{ex.blurb}</small>
          </button>
        ))}
      </div>
      {exerciseView && (
        <div className="exercise-stats" data-testid="exercise-stats">
          <span>Score <b data-testid="exercise-score">{exerciseView.score}</b></span>
          <span>Streak <b>{exerciseView.streak}</b></span>
          <span>Level <b>{exerciseView.level}</b></span>
          <span title="Harmonic mean of your reaction times">Focus <b>{exerciseView.focusMs ? `${exerciseView.focusMs} ms` : '—'}</b></span>
          <button className="ghost small" onClick={onStop}>Stop</button>
        </div>
      )}

      <h3>Wellness tip</h3>
      <div className="tip" data-testid="tip">
        <strong>{tip.title}</strong>
        <p>{tip.text}</p>
        <button className="ghost small" onClick={onNextTip}>Next tip</button>
      </div>

      <h3>Gesture tips</h3>
      <ul className="gesture-list">
        {Object.entries(GESTURE_TIPS).map(([g, t]) => (
          <li key={g}>
            <span aria-hidden>{GESTURES[g].emoji}</span> <b>{GESTURES[g].label}</b> — {t.title}
          </li>
        ))}
      </ul>
      <p className="muted small-print">Wellness tips are general guidance, not medical advice.</p>
    </section>
  );
}
