import { useEffect, useRef, useState } from 'react';
import { KIND_ICON, STICKY_COLORS } from '@shared/notes/notes.js';

/** Reveal text a few characters per frame, so the twin visibly "writes". */
function useTypewriter(text, instant) {
  const [n, setN] = useState(text.length);
  useEffect(() => {
    if (instant || text.length <= n) {
      setN(text.length);
      return undefined;
    }
    let raf = 0;
    const step = () => {
      setN((c) => {
        const next = Math.min(text.length, c + 2);
        if (next < text.length) raf = requestAnimationFrame(step);
        return next;
      });
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, instant]);
  return text.slice(0, n);
}

function NoteCard({ note, dictating, instant, twinName }) {
  const shown = useTypewriter(note.text, instant);
  const writing = shown.length < note.text.length;
  const lines = shown.split('\n').slice(-16);
  return (
    <div className={`ar-note ${note.kind}`} data-testid="ar-note" aria-live="polite">
      <div className="ar-note-head">
        <span aria-hidden>{KIND_ICON[note.kind]}</span>
        <b>{note.title}</b>
        {(dictating || writing) && <span className="ar-note-pen" title={`${twinName} is writing`}>✍️</span>}
      </div>
      <div className="ar-note-body" data-testid="ar-note-text">
        {lines.map((l, i) =>
          l.startsWith('## ') ? (
            <h4 key={i}>{l.slice(3)}</h4>
          ) : l.startsWith('# ') ? (
            <h3 key={i}>{l.slice(2)}</h3>
          ) : (
            <p key={i}>{l || ' '}</p>
          ),
        )}
        {dictating && <span className="caret" aria-hidden />}
      </div>
      {dictating && <small className="ar-note-hint">Listening — say “stop dictation” to finish</small>}
    </div>
  );
}

function Sticky({ note, onMove, onRemove, instant }) {
  const ref = useRef(null);
  const drag = useRef(null);
  const shown = useTypewriter(note.text, instant);

  const down = (e) => {
    e.stopPropagation();
    if (e.target.closest('button')) return;
    const parent = ref.current.parentElement.getBoundingClientRect();
    const box = ref.current.getBoundingClientRect();
    drag.current = { parent, dx: e.clientX - box.left, dy: e.clientY - box.top };
    ref.current.setPointerCapture(e.pointerId);
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    ref.current.style.left = `${((e.clientX - d.dx - d.parent.left) / d.parent.width) * 100}%`;
    ref.current.style.top = `${((e.clientY - d.dy - d.parent.top) / d.parent.height) * 100}%`;
  };
  const up = (e) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    onMove(note.id, (e.clientX - d.dx - d.parent.left) / d.parent.width, (e.clientY - d.dy - d.parent.top) / d.parent.height);
  };

  return (
    <div
      ref={ref}
      className="ar-sticky"
      style={{ left: `${note.x * 100}%`, top: `${note.y * 100}%`, background: STICKY_COLORS[note.color] }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      data-testid="ar-sticky"
    >
      <button className="ar-sticky-x" aria-label={`Remove sticky ${note.title}`} onClick={() => onRemove(note.id)}>
        ×
      </button>
      <p>{shown || '…'}</p>
    </div>
  );
}

// AR overlay over the camera: the active notepad/document as a paper card the
// twin writes into, and the sticky notes pinned in the scene.
export default function NotesLayer({ active, open, dictating, stickies, onMoveSticky, onRemoveSticky, reducedMotion, twinName, caption }) {
  return (
    <div className="notes-layer">
      {stickies.map((s) => (
        <Sticky key={s.id} note={s} onMove={onMoveSticky} onRemove={onRemoveSticky} instant={reducedMotion} />
      ))}
      {open && active && active.kind !== 'sticky' && <NoteCard key={active.id} note={active} dictating={dictating} instant={reducedMotion} twinName={twinName} />}
      {caption != null && (
        <div className="voice-caption" data-testid="voice-caption">
          🎙️ {caption || <span className="muted">listening…</span>}
        </div>
      )}
    </div>
  );
}
