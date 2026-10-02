// Voice notes the AR twin writes: notepads, documents and sticky notes.
// Pure functions over plain objects so they persist as JSON and test in Node.
//
// note = { id, kind: 'notepad'|'document'|'sticky', title, text, color?, x?, y?,
//          createdAt, updatedAt, undo: number[] }   (undo = previous text lengths)

export const NOTE_KINDS = ['notepad', 'document', 'sticky'];
export const STICKY_COLORS = {
  yellow: '#fde68a',
  pink: '#fbcfe8',
  green: '#bbf7d0',
  blue: '#bfdbfe',
  orange: '#fed7aa',
  purple: '#ddd6fe',
};
export const NOTE_LIMITS = Object.freeze({ notes: 200, chars: 20_000, title: 80, undo: 30 });
export const KIND_ICON = { notepad: '📝', document: '📄', sticky: '🗒️' };

const clampText = (s) => String(s ?? '').slice(0, NOTE_LIMITS.chars);
const clamp01 = (v, d) => (Number.isFinite(Number(v)) ? Math.min(0.95, Math.max(0.02, Number(v))) : d);

function defaultTitle(kind, now) {
  const d = new Date(now);
  const stamp = `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  return `${kind === 'document' ? 'Document' : kind === 'sticky' ? 'Sticky' : 'Note'} ${stamp}`;
}

export function createNote({ kind = 'notepad', title, text = '', color, x, y, now = Date.now(), id } = {}) {
  if (!NOTE_KINDS.includes(kind)) throw new RangeError(`unknown note kind "${kind}"`);
  const note = {
    id: id ?? `n-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    kind,
    title: String(title || defaultTitle(kind, now)).trim().slice(0, NOTE_LIMITS.title),
    text: '',
    createdAt: now,
    updatedAt: now,
    undo: [],
  };
  if (kind === 'document') note.text = `# ${note.title}\n\n`;
  if (kind === 'sticky') Object.assign(note, { color: STICKY_COLORS[color] ? color : 'yellow', x: clamp01(x, 0.15), y: clamp01(y, 0.2) });
  return text ? appendText(note, text, now) : note;
}

const SPOKEN = [
  [/\s*\b(?:new|next) paragraph\b\s*/gi, '\n\n'],
  [/\s*\b(?:new|next) line\b\s*/gi, '\n'],
  [/\s*\bcomma\b/gi, ','],
  [/\s*\b(?:period|full stop)\b/gi, '.'],
  [/\s*\bquestion mark\b/gi, '?'],
  [/\s*\bexclamation (?:mark|point)\b/gi, '!'],
  [/\s*\bsemicolon\b/gi, ';'],
  [/\s*\bcolon\b/gi, ':'],
  [/\s*\b(?:dash|hyphen)\b\s*/gi, ' - '],
];

/** Turn spoken dictation into text: "milk comma eggs period" → "milk, eggs." */
export function formatSpoken(raw) {
  let s = String(raw ?? '').replace(/\s+/g, ' ').trim();
  for (const [re, rep] of SPOKEN) s = s.replace(re, rep);
  s = s.replace(/ *([,.;:?!])(?=\S)(?![\d])/g, '$1 ').replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n');
  s = s.replace(/(^|[\s(])i(?=[\s,.;:?!']|$)/g, '$1I');
  return s.replace(/[ \t]{2,}/g, ' ').trim();
}

const capitalizeSentences = (s) => s.replace(/([.!?]\s+|\n\s*)([a-z])/g, (_, p, c) => p + c.toUpperCase());

/** Append dictated text with sentence-aware spacing and capitalisation. */
export function appendText(note, fragment, now = Date.now()) {
  let add = formatSpoken(fragment);
  if (!add) return note;
  const text = note.text;
  const atStart = text === '' || /\n\s*$/.test(text);
  const afterSentence = /[.!?]["')\]]?\s*$/.test(text);
  if (atStart || afterSentence) add = add[0].toUpperCase() + add.slice(1);
  const joiner = atStart || /^[,.;:?!\n]/.test(add) ? '' : ' ';
  const next = clampText(text + joiner + capitalizeSentences(add));
  return { ...note, text: next, updatedAt: now, undo: [...note.undo, text.length].slice(-NOTE_LIMITS.undo) };
}

const withText = (note, text, now) => ({ ...note, text: clampText(text), updatedAt: now, undo: [...note.undo, note.text.length].slice(-NOTE_LIMITS.undo) });

export const newLine = (note, now = Date.now()) => withText(note, note.text.replace(/[ \t]+$/, '') + '\n', now);
export const newParagraph = (note, now = Date.now()) => withText(note, note.text.replace(/\s+$/, '') + '\n\n', now);

export function addHeading(note, heading, now = Date.now()) {
  const h = formatSpoken(heading).replace(/[.!?]+$/, '');
  if (!h) return note;
  const title = h[0].toUpperCase() + h.slice(1);
  const base = note.text.replace(/\s+$/, '');
  return withText(note, `${base}${base ? '\n\n' : ''}## ${title}\n\n`, now);
}

/** Undo the last write ("scratch that"). */
export function undoLast(note, now = Date.now()) {
  if (!note.undo.length) return note;
  const len = note.undo[note.undo.length - 1];
  return { ...note, text: note.text.slice(0, len), updatedAt: now, undo: note.undo.slice(0, -1) };
}

export const clearNote = (note, now = Date.now()) => withText(note, note.kind === 'document' ? `# ${note.title}\n\n` : '', now);

export const setText = (note, text, now = Date.now()) => withText(note, text, now);

export const renameNote = (note, title, now = Date.now()) => ({ ...note, title: String(title).trim().slice(0, NOTE_LIMITS.title) || note.title, updatedAt: now });

export const moveSticky = (note, x, y, now = Date.now()) => ({ ...note, x: clamp01(x, note.x), y: clamp01(y, note.y), updatedAt: now });

/** Most recently updated note whose title contains the query. */
export function findNote(notes, query) {
  const q = String(query ?? '').toLowerCase().trim();
  if (!q) return null;
  return [...notes].sort((a, b) => b.updatedAt - a.updatedAt).find((n) => n.title.toLowerCase().includes(q)) ?? null;
}

/** Plain text for reading aloud or .txt export (markdown heading marks removed). */
export const noteToText = (note) => (note.kind === 'document' ? note.text.replace(/^#{1,6}\s+/gm, '') : note.text).trim();

export function noteToMarkdown(note) {
  if (note.kind === 'document') return note.text.trim() + '\n';
  return `# ${note.title}\n\n${note.text.trim()}\n`;
}

/** Validate notes from storage or an imported backup. */
export function sanitizeNotes(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const n of list) {
    if (!n || !NOTE_KINDS.includes(n.kind)) continue;
    const id = typeof n.id === 'string' && /^[\w-]{1,64}$/.test(n.id) && !seen.has(n.id) ? n.id : `n-imp-${out.length}-${Math.random().toString(36).slice(2, 6)}`;
    seen.add(id);
    const created = Number.isFinite(Number(n.createdAt)) ? Number(n.createdAt) : 0;
    const note = {
      id,
      kind: n.kind,
      title: String(n.title ?? '').slice(0, NOTE_LIMITS.title) || 'Untitled',
      text: clampText(n.text),
      createdAt: created,
      updatedAt: Number.isFinite(Number(n.updatedAt)) ? Number(n.updatedAt) : created,
      undo: [],
    };
    if (n.kind === 'sticky') Object.assign(note, { color: STICKY_COLORS[n.color] ? n.color : 'yellow', x: clamp01(n.x, 0.15), y: clamp01(n.y, 0.2) });
    out.push(note);
    if (out.length >= NOTE_LIMITS.notes) break;
  }
  return out;
}
