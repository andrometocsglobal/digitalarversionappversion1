import { GESTURES } from '@shared/hands/gestures.js';
import { ACTIONS, MAPPABLE_GESTURES, DEFAULT_GESTURE_MAP } from '@shared/actions.js';

// Inputs are detached from actions: switch voice → action and gesture → action
// on or off independently, and choose what each gesture makes the twin do.
export default function GesturesPanel({ prefs, onChange, last, voice }) {
  const setMap = (gesture, id) => onChange({ gestureMap: { ...prefs.gestureMap, [gesture]: id } });

  return (
    <section className="panel" aria-labelledby="gest-h">
      <h2 id="gest-h">How {prefs.twinName} listens</h2>
      <p className="muted">Voice and gestures are two separate ways to reach the same actions. Use either, both, or neither.</p>

      <div className="mode-cards">
        <label className={`mode-card ${prefs.voiceActions ? 'on' : ''}`}>
          <input type="checkbox" checked={prefs.voiceActions} onChange={(e) => onChange({ voiceActions: e.target.checked })} data-testid="voice-actions" />
          <span>
            <b>🎙️ Voice → action</b>
            <small>{voice.supported ? (voice.listening ? 'Microphone listening' : 'Microphone off') : 'Not supported in this browser — type commands instead'}</small>
          </span>
        </label>
        <label className={`mode-card ${prefs.gestureActions ? 'on' : ''}`}>
          <input type="checkbox" checked={prefs.gestureActions} onChange={(e) => onChange({ gestureActions: e.target.checked })} data-testid="gesture-actions" />
          <span>
            <b>✋ Gesture → action</b>
            <small>Hold a gesture briefly; each fires once (1.5 s cooldown)</small>
          </span>
        </label>
      </div>

      <h3>Gesture actions</h3>
      <div className="gesture-map" data-testid="gesture-map">
        {MAPPABLE_GESTURES.map((g) => (
          <label key={g} className={last?.gesture === g && Date.now() - last.at < 2500 ? 'fired' : ''}>
            <span className="gesture-name">
              <span aria-hidden>{GESTURES[g].emoji}</span> {GESTURES[g].label}
            </span>
            <select value={prefs.gestureMap[g]} onChange={(e) => setMap(g, e.target.value)} disabled={!prefs.gestureActions} data-testid={`map-${g}`}>
              {Object.entries(ACTIONS).map(([id, a]) => (
                <option key={id} value={id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="button-row">
        <button className="ghost" onClick={() => onChange({ gestureMap: { ...DEFAULT_GESTURE_MAP } })}>Reset to defaults</button>
      </div>
      {last && (
        <p className="notice" data-testid="last-gesture-action">
          Last: {GESTURES[last.gesture].emoji} {GESTURES[last.gesture].label} → {ACTIONS[last.actionId].label}
        </p>
      )}
      <p className="muted small-print">Open palm is free by default so {prefs.twinName} can stand on your hand in AR.</p>
    </section>
  );
}
