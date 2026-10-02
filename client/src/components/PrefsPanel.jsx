const SHAPES = [
  ['orb', 'Orb'],
  ['bot', 'Bot'],
  ['spark', 'Spark'],
];

export default function PrefsPanel({ prefs, onChange, onReset }) {
  const set = (k) => (e) => onChange({ [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'range' || e.target.type === 'number' ? Number(e.target.value) : e.target.value });

  return (
    <section className="panel" aria-labelledby="prefs-h">
      <h2 id="prefs-h">Your AR twin</h2>
      <div className="form">
        <label>Your name<input value={prefs.displayName} maxLength={40} onChange={set('displayName')} /></label>
        <label>Twin name<input value={prefs.twinName} maxLength={24} onChange={set('twinName')} data-testid="pref-twin-name" /></label>
        <label>Twin colour<input type="color" value={prefs.twinColor} onChange={set('twinColor')} /></label>
        <fieldset>
          <legend>Twin shape</legend>
          <div className="seg">
            {SHAPES.map(([v, l]) => (
              <button key={v} type="button" className={prefs.twinShape === v ? 'on' : ''} aria-pressed={prefs.twinShape === v} onClick={() => onChange({ twinShape: v })}>
                {l}
              </button>
            ))}
          </div>
        </fieldset>
        <label>Motto<input value={prefs.motto} maxLength={80} onChange={set('motto')} /></label>
        <label className="check"><input type="checkbox" checked={prefs.showTwin} onChange={set('showTwin')} /> Show twin</label>
        <label className="check"><input type="checkbox" checked={prefs.mirrorClone} onChange={set('mirrorClone')} /> Mirror-clone my hands</label>
        <label className="check"><input type="checkbox" checked={prefs.speech} onChange={set('speech')} /> Twin speaks aloud</label>
        <label className="check"><input type="checkbox" checked={prefs.autoListen} onChange={set('autoListen')} /> Listen automatically when AR starts (hands-free)</label>
        <label>Voice speed {prefs.voiceRate.toFixed(2)}×<input type="range" min="0.5" max="2" step="0.05" value={prefs.voiceRate} onChange={set('voiceRate')} /></label>
        <label>Language
          <select value={prefs.voiceLang} onChange={set('voiceLang')}>
            {['en-US', 'en-GB', 'en-IN', 'hi-IN', 'ta-IN', 'es-ES', 'fr-FR', 'de-DE'].map((l) => <option key={l}>{l}</option>)}
          </select>
        </label>
        <label>Gesture steadiness ({prefs.gestureFrames} frames)<input type="range" min="2" max="15" value={prefs.gestureFrames} onChange={set('gestureFrames')} /></label>
      </div>

      <h3>Digital detox</h3>
      <div className="form">
        <label>Screen break every (min)<input type="number" min="5" max="120" value={prefs.breakEveryMin} onChange={set('breakEveryMin')} /></label>
        <label>Daily detox goal (min)<input type="number" min="10" max="600" value={prefs.detoxGoalMin} onChange={set('detoxGoalMin')} /></label>
        <label>Twin work speed {prefs.taskSpeed}×<input type="range" min="0.25" max="20" step="0.25" value={prefs.taskSpeed} onChange={set('taskSpeed')} data-testid="pref-speed" /></label>
        <label className="check"><input type="checkbox" checked={prefs.reducedMotion} onChange={set('reducedMotion')} /> Reduce motion</label>
      </div>
      <button className="ghost" onClick={onReset}>Reset preferences</button>
    </section>
  );
}
