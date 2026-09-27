import { useState } from 'react';

export function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const stamp = () => new Date().toISOString().slice(0, 10);

// Single-app JSON export / import. No server: the file *is* the sync.
export default function DataPanel({ reg, hasIdentity, onExport, onImport }) {
  const [includeId, setIncludeId] = useState(false);
  const [pass, setPass] = useState('');
  const [text, setText] = useState('');
  const [msg, setMsg] = useState(null);
  const [regText, setRegText] = useState('');
  const [regMsg, setRegMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const guard = (fn, set) => async () => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      set({ bad: true, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel" aria-labelledby="data-h">
      <h2 id="data-h">Your data — one JSON file</h2>
      <p className="muted">
        This app has no server. Export everything to a single JSON file and import it on any other device or browser: preferences, twin, today's
        stats, task history, AR registration + receipt, and (optionally) your encrypted Omni ID.
      </p>

      <h3>Export app backup</h3>
      <div className="form">
        <label className="check">
          <input type="checkbox" checked={includeId} disabled={!hasIdentity} onChange={(e) => setIncludeId(e.target.checked)} data-testid="backup-include-id" />
          Include my Omni ID (encrypted with a passphrase)
        </label>
        {includeId && (
          <label>Passphrase (8+ characters)
            <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" data-testid="backup-pass" />
          </label>
        )}
      </div>
      <button
        className="primary"
        disabled={busy || (includeId && pass.length < 8)}
        onClick={guard(async () => {
          const backup = await onExport(includeId ? pass : null);
          setText(JSON.stringify(backup, null, 2));
          downloadJSON(backup, `omni-ar-backup-${stamp()}.json`);
          setMsg({ text: `Exported ${backup.history.length} history items${backup.identity?.bundle ? ' and your encrypted Omni ID' : ''}.` });
        }, setMsg)}
        data-testid="backup-export"
      >
        ⬇ Export backup JSON
      </button>

      <h3>Import app backup</h3>
      <div className="form">
        <label>Choose a file
          <input type="file" accept="application/json,.json" onChange={async (e) => setText((await e.target.files[0]?.text()) ?? '')} data-testid="backup-file" />
        </label>
        <label>…or paste JSON
          <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder='{"schema":"omni-app-backup/1", …}' data-testid="backup-text" />
        </label>
      </div>
      <button
        disabled={busy || !text.trim()}
        onClick={guard(async () => {
          const r = await onImport(text);
          setMsg({
            text: `Imported preferences, stats and ${r.history.length} history items.${r.identityBundle ? ' Your Omni ID backup is ready — open the Omni ID tab and enter its passphrase.' : ''}${r.warnings.length ? ` Skipped: ${r.warnings.join('; ')}.` : ''}`,
          });
        }, setMsg)}
        data-testid="backup-import"
      >
        ⬆ Import backup
      </button>
      {msg && <p className={msg.bad ? 'error' : 'notice'} data-testid="backup-status">{msg.text}</p>}

      <h3>AR element registration</h3>
      <dl className="kv" data-testid="reg-details">
        <dt>Element</dt><dd>{reg.element ? `${reg.element.name} v${reg.element.version}` : '—'}</dd>
        <dt>Source</dt><dd data-testid="reg-source">{reg.source ?? '—'}</dd>
        <dt>Status</dt><dd>{reg.status}{reg.status === 'failed' ? ` — ${reg.reason}` : ''}</dd>
        <dt>Valid until</dt><dd>{reg.registry?.expiresAt ? new Date(reg.registry.expiresAt).toLocaleDateString() : '—'}</dd>
        <dt>Receipt</dt>
        <dd>{reg.receipt ? `${reg.receipt.registrationId.slice(0, 8)} · ${reg.receipt.holder ? 'signed by your Omni ID' : 'unsigned (create an Omni ID to sign it)'}` : '—'}</dd>
      </dl>
      <div className="button-row">
        <button disabled={!reg.registry} onClick={() => downloadJSON(reg.registry, 'ar-register.json')} data-testid="reg-export">⬇ Export registration</button>
        <button disabled={!reg.receipt} onClick={() => downloadJSON(reg.receipt, `ar-receipt-${stamp()}.json`)}>⬇ Export receipt</button>
      </div>
      <div className="form">
        <label>Import a signed ar-register.json
          <textarea rows={3} value={regText} onChange={(e) => setRegText(e.target.value)} placeholder='{"schema":"omni-ar-register/1", …}' data-testid="reg-import-text" />
        </label>
      </div>
      <button
        disabled={busy || !regText.trim()}
        onClick={guard(async () => {
          const r = await reg.importRegistry(regText);
          setRegMsg(r.ok ? { text: `✅ Imported and verified ${r.element.name} v${r.element.version}.` } : { bad: true, text: `❌ Rejected: ${r.reason}. Your current verified registration is unchanged.` });
        }, setRegMsg)}
        data-testid="reg-import"
      >
        ⬆ Import registration
      </button>
      {regMsg && <p className={regMsg.bad ? 'error' : 'notice'} data-testid="reg-import-status">{regMsg.text}</p>}
    </section>
  );
}
