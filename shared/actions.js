// The AR twin's action layer. Inputs are detached from what the twin does:
// voice and typed commands (parseCommand) and hand gestures (this map) both
// produce the same action objects, which one dispatcher executes.

export const ACTIONS = {
  none: { label: 'Do nothing', action: null },
  confirm: { label: '✅ Done — confirm my step', action: { type: 'task-done' } },
  'note-new': { label: '📝 Take a note (start dictating)', action: { type: 'note-new', kind: 'notepad', title: null, dictate: true } },
  'document-new': { label: '📄 New document (start dictating)', action: { type: 'note-new', kind: 'document', title: null, dictate: true } },
  'sticky-new': { label: '🗒️ New sticky note (dictate into it)', action: { type: 'note-new', kind: 'sticky', title: null, dictate: true } },
  'dictation-toggle': { label: '🎙️ Start / stop dictation', action: { type: 'note-dictation', toggle: true } },
  'dictation-stop': { label: '💾 Stop dictation & save', action: { type: 'note-dictation', on: false } },
  'note-newline': { label: '↵ New line', action: { type: 'note-newline' } },
  'note-paragraph': { label: '¶ New paragraph', action: { type: 'note-paragraph' } },
  'note-undo': { label: '↩️ Scratch that (undo)', action: { type: 'note-undo' } },
  'note-read': { label: '📖 Read the note aloud', action: { type: 'note-read' } },
  'note-close': { label: '📕 Close the note', action: { type: 'note-close' } },
  'mic-toggle': { label: '🎤 Start / stop listening', action: { type: 'mic', toggle: true } },
  'bulb-toggle': { label: '💡 Digital bulb on / off', action: { type: 'bulb', toggle: true } },
  'ring-toggle': { label: '⭕ Ring light on / off', action: { type: 'ring', toggle: true } },
  'twin-toggle': { label: '🤖 Show / hide the twin', action: { type: 'twin', toggle: true } },
  tip: { label: '💡 Wellness tip', action: { type: 'tip' } },
};

/** Gestures that can carry an action (open palm is reserved for "stand on my palm"). */
export const MAPPABLE_GESTURES = ['thumbs_up', 'thumbs_down', 'peace', 'fist', 'point', 'rock', 'call_me', 'l_shape', 'three', 'four', 'open_palm'];

export const DEFAULT_GESTURE_MAP = Object.freeze({
  thumbs_up: 'confirm',
  peace: 'note-new',
  fist: 'dictation-stop',
  point: 'note-newline',
  thumbs_down: 'note-undo',
  rock: 'sticky-new',
  call_me: 'note-read',
  l_shape: 'document-new',
  three: 'bulb-toggle',
  four: 'tip',
  open_palm: 'none',
});

export function sanitizeGestureMap(map = {}) {
  const out = {};
  for (const g of MAPPABLE_GESTURES) out[g] = ACTIONS[map?.[g]] ? map[g] : DEFAULT_GESTURE_MAP[g];
  return out;
}

/** The action a gesture triggers under a map, or null. Returns a fresh copy. */
export function actionForGesture(map, gesture) {
  const id = sanitizeGestureMap(map)[gesture];
  const a = id ? ACTIONS[id]?.action : null;
  return a ? { ...a, via: 'gesture', actionId: id } : null;
}

/** Simple per-gesture cooldown so a held gesture fires once. O(1) state. */
export class ActionCooldown {
  constructor(ms = 1200) {
    this.ms = ms;
    this.last = new Map();
  }
  ready(key, now) {
    const t = this.last.get(key) ?? -Infinity;
    if (now - t < this.ms) return false;
    this.last.set(key, now);
    return true;
  }
}
