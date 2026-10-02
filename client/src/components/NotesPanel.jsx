import { useState } from 'react';
import { KIND_ICON, STICKY_COLORS, noteToMarkdown, noteToText } from '@shared/notes/notes.js';
import { downloadJSON } from './DataPanel.jsx';

function downloadText(text, filename, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'note';

export default function NotesPanel({ notes, active, dictating, listening, twinName, onCreate, onSelect, onEdit, onRename, onColor, onDelete, onDictation, onImport }) {
  const [confirm, setConfirm] = useState(null);
  const [importText, setImportText] = useState('');
  const [msg, setMsg] = useState('');
  const sorted = [...notes].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <section className="panel" aria-labelledby="notes-h">
      <h2 id="notes-h">Voice notes</h2>
      <p className="muted">
        Say “take a note”, “new document called …” or “yellow sticky note …” and {twinName} writes it in the AR view as you speak — no Send
        button. Notes are saved only on this device (your browser's speech recognition may process the audio — see Help).
      </p>

      <div className="button-row">
        <button onClick={() => onCreate('notepad')} data-testid="new-notepad">📝 New notepad</button>
        <button onClick={() => onCreate('document')}>📄 New document</button>
        <button onClick={() => onCreate('sticky')}>🗒️ New sticky</button>
        <button className={dictating ? 'on' : ''} aria-pressed={dictating} onClick={() => onDictation(!dictating)} data-testid="dictation-toggle">
          {dictating ? '⏹ Stop dictation' : '🎙️ Dictate'}
        </button>
      </div>
      {dictating && !listening && <p className="error">Dictation is on but the microphone is off — press 🎙️ Voice.</p>}

      {active && (
        <div className="note-editor" data-testid="note-editor">
          <div className="row">
            <input value={active.title} onChange={(e) => onRename(active.id, e.target.value)} aria-label="Note title" />
            {active.kind === 'sticky' && (
              <select value={active.color} onChange={(e) => onColor(active.id, e.target.value)} aria-label="Sticky colour">
                {Object.keys(STICKY_COLORS).map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            )}
          </div>
          <textarea rows={active.kind === 'sticky' ? 3 : 8} value={active.text} onChange={(e) => onEdit(active.id, e.target.value)} aria-label="Note text" data-testid="note-textarea" />
          <div className="button-row">
            <button onClick={() => downloadText(noteToText(active) + '\n', `${slug(active.title)}.txt`, 'text/plain')}>⬇ .txt</button>
            <button onClick={() => downloadText(noteToMarkdown(active), `${slug(active.title)}.md`, 'text/markdown')}>⬇ .md</button>
            {confirm === active.id ? (
              <>
                <button className="danger-btn" onClick={() => { onDelete(active.id); setConfirm(null); }}>Delete “{active.title}”</button>
                <button className="ghost" onClick={() => setConfirm(null)}>Keep</button>
              </>
            ) : (
              <button className="ghost" onClick={() => setConfirm(active.id)}>Delete…</button>
            )}
          </div>
        </div>
      )}

      <ul className="note-list" data-testid="note-list">
        {sorted.map((n) => (
          <li key={n.id}>
            <button className={active?.id === n.id ? 'on' : ''} onClick={() => onSelect(n.id)}>
              <span aria-hidden>{KIND_ICON[n.kind]}</span>
              <span className="note-list-main">
                <b>{n.title}</b>
                <small>{(n.kind === 'document' ? noteToText(n).split('\n').slice(1).join(' ') : n.text).slice(0, 70) || 'Empty'}</small>
              </span>
            </button>
          </li>
        ))}
        {!notes.length && <li className="muted">No notes yet.</li>}
      </ul>

      <h3>Export / import notes</h3>
      <div className="button-row">
        <button disabled={!notes.length} onClick={() => downloadJSON({ schema: 'omni-notes/1', exportedAt: new Date().toISOString(), notes }, 'omni-notes.json')} data-testid="notes-export">
          ⬇ All notes (JSON)
        </button>
      </div>
      <div className="form">
        <label>Import notes JSON (merges with yours)
          <textarea rows={3} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder='{"schema":"omni-notes/1", …}' />
        </label>
        <input type="file" accept="application/json,.json" onChange={async (e) => setImportText((await e.target.files[0]?.text()) ?? '')} aria-label="Notes JSON file" />
      </div>
      <button
        disabled={!importText.trim()}
        onClick={() => {
          try {
            const n = onImport(JSON.parse(importText));
            setMsg(`Imported ${n} notes.`);
          } catch (err) {
            setMsg(`Could not import: ${err.message}`);
          }
        }}
      >
        ⬆ Import notes
      </button>
      {msg && <p className="notice">{msg}</p>}
    </section>
  );
}
