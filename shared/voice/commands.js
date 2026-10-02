// Natural-language voice command parser. Pure: text in, action object out.
// The same parser serves the Web Speech recogniser and the typed command box.

const WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
};
const SCALE = { thousand: 1_000n, million: 1_000_000n, billion: 1_000_000_000n, trillion: 1_000_000_000_000n };
const POWER_WORDS = { squares: 2, square: 2, cubes: 3, cube: 3 };

/** Normalise: lowercase, number words â†’ digits, "5 million" â†’ 5000000. */
export function normalize(text) {
  let s = String(text).toLowerCase().replace(/[,!?]/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)\b/g, (w) => String(WORDS[w]));
  s = s.replace(/\b([2-9]0) ([1-9])\b/g, (_, t, u) => String(Number(t) + Number(u)));
  s = s.replace(/\b(\d+) (thousand|million|billion|trillion)\b/g, (_, n, sc) => (BigInt(n) * SCALE[sc]).toString());
  s = s.replace(/\b(\d+)(st|nd|rd|th)\b/g, '$1');
  return s;
}

// Phrases that assign a habit task to the AR twin.
const TASK_PHRASES = [
  [/\b(water|hydrat\w*|drink)\b/, 'hydrate'],
  [/\b(screen break|eye break|20 20 20|rest my eyes)\b/, 'screen-break'],
  [/\b(posture|sit up|straighten)\b/, 'posture'],
  [/\b(calm|relax|two minute calm|de-?stress)\b/, 'breathe'],
  [/\b(detox|digital detox|unplug|offline)\b/, 'detox-hour'],
  [/\b(stretch|wrist|hands? exercise)\b/, 'stretch'],
];

const on = (s) => /\b(on|start|enable|up|show)\b/.test(s);
const off = (s) => /\b(off|stop|disable|hide|kill)\b/.test(s);

export const HELP = [
  'light on / light off',
  'brighter / dimmer / brightness 80',
  'warm light / cool light / neutral light',
  'ring light on / off',
  'torch on / off',
  'next tip',
  'show twin / hide twin',
  'remind me to drink water / screen break / posture / stretch / detox',
  'done (finish your part of the task)',
  'sum of cubes from 3 to 7',
  'geometric sum ratio 2 power 3 for 5 terms',
  'harmonic sum power 2 from 1 to 1 million',
  'mute / unmute',
  'take a note · new document called Project plan',
  '(dictate) … comma · period · question mark · new line',
  'heading Budget · scratch that · read it back · stop dictation',
  'yellow sticky note call mom · clear sticky notes',
  'open note shopping · list notes · export notes',
];

// ------------------------------------------------------------ voice notes
// Matched on the raw transcript (not normalize()) so dictated words keep their
// original spelling — "call Mum at five" must not become "call mum at 5".

const KIND = { note: 'notepad', notes: 'notepad', notepad: 'notepad', 'note pad': 'notepad', document: 'document', doc: 'document', 'sticky note': 'sticky', sticky: 'sticky' };
const COLOR = '(yellow|pink|green|blue|orange|purple)';

/** Note-control commands only (used alone while dictating). */
export function parseNoteCommand(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');
  if (!t) return null;
  let m;

  if (/^(?:start|begin|resume|take) (?:dictation|dictating|writing|typing)$|^take notes?$/i.test(t)) {
    return /^take notes?$/i.test(t) ? { type: 'note-new', kind: 'notepad', title: null, dictate: true } : { type: 'note-dictation', on: true };
  }
  if (/^(?:stop|end|finish|pause) (?:dictation|dictating|writing|typing|the note|note|notes)$|^that'?s all$/i.test(t)) return { type: 'note-dictation', on: false };

  m = new RegExp(`^(?:add |create |make |new |put |pin )?(?:a |an )?(?:${COLOR} )?sticky(?: note)?(?: (?:saying|that says|with|to|for|about|reading))?[:,]? (.+)$`, 'i').exec(t);
  if (m && !/^(?:called|named|titled)\b/i.test(m[2]) && !/^notes?$/i.test(m[2])) {
    const color = new RegExp(`^(?:add |create |make |new |put |pin )?(?:a |an )?${COLOR} `, 'i').exec(t)?.[1]?.toLowerCase();
    return { type: 'sticky', text: m[2], color: color ?? null };
  }

  m = /^(?:open|show|switch to|go to) (?:the |my )?(?:note|notepad|note pad|document|doc)s? (?:called |named |titled )?(.+)$/i.exec(t);
  if (m && !/^(?:list|all)$/i.test(m[1])) return { type: 'note-open', title: m[1] };

  m = new RegExp(`^(?:create|make|open|start|new|begin)(?: a| an| the| my)?(?: new)?(?: ${COLOR})? (sticky note|sticky|note pad|notepad|notes|note|document|doc)(?: (?:called|named|titled|for|about) (.+))?$`, 'i').exec(t);
  if (m) return { type: 'note-new', kind: KIND[m[2].toLowerCase()], title: m[3] ?? null, color: m[1]?.toLowerCase() ?? null, dictate: true };
  m = /^take (?:a |an )?(note|notes|document) (?:called|named|titled|for|about) (.+)$|^take (?:a )?note$/i.exec(t);
  if (m) return { type: 'note-new', kind: KIND[(m[1] ?? 'note').toLowerCase()], title: m[2] ?? null, dictate: true };

  m = /^(?:write|type|note down|jot down|jot|add line|write down)(?: that)?[:,]? (.+)$/i.exec(t);
  if (m) return { type: 'note-write', text: m[1] };

  if (/^(?:new|next) line$/i.test(t)) return { type: 'note-newline' };
  if (/^(?:new|next) paragraph$/i.test(t)) return { type: 'note-paragraph' };
  m = /^(?:add )?(?:a )?(?:heading|title|section|subheading)(?: called| named)?[:,]? (.+)$/i.exec(t);
  if (m) return { type: 'note-heading', text: m[1] };
  if (/^(?:undo|scratch that|delete that|remove that|delete (?:the )?last (?:line|sentence|part|bit))$/i.test(t)) return { type: 'note-undo' };
  if (/^clear (?:the |this |my )?(?:note|notepad|note pad|document|doc)$/i.test(t)) return { type: 'note-clear' };
  if (/^(?:read|read it|read back|read it back|read (?:the |this |my )?(?:note|notepad|document|doc)(?: back| aloud| out)?)$/i.test(t)) return { type: 'note-read' };
  if (/^(?:close|hide) (?:the |this |my )?(?:note|notepad|note pad|document|doc)$/i.test(t)) return { type: 'note-close' };
  if (/^(?:list|show) (?:my |all |all my )?notes$/i.test(t)) return { type: 'note-list' };
  if (/^delete (?:the |this )?(?:note|notepad|document|doc)$/i.test(t)) return { type: 'note-delete' };
  if (/^(?:yes )?confirm delete$/i.test(t)) return { type: 'note-delete-confirm' };
  if (/^(?:clear|remove|delete) (?:all )?(?:the )?sticky notes$/i.test(t)) return { type: 'sticky-clear' };
  if (/^(?:export|download|save) (?:all )?(?:my )?notes$/i.test(t)) return { type: 'notes-export' };
  return null;
}

/**
 * Returns an action: { type, ... } or { type: 'unknown', text }.
 * Types: bulb, bulb-adjust, bulb-level, bulb-tone, ring, torch, tip, task, task-done,
 * task-cancel, twin, speech, help, omni, and the note-* / sticky types.
 */
export function parseCommand(text) {
  const s = normalize(text);
  if (!s) return { type: 'unknown', text: '' };

  const note = parseNoteCommand(text);
  if (note) return note;

  // --- Omni maths first: "sum of ..." phrases contain words like "from"/"to".
  let m = /\bsum of (?:the )?(?:(squares|square|cubes|cube)|(?:power|powers) (?:of )?(\d+)|(\d+) powers?)\b.*?\bfrom (-?\d+) to (-?\d+)/.exec(s);
  if (m) {
    const p = m[1] ? POWER_WORDS[m[1]] : Number(m[2] ?? m[3]);
    return { type: 'omni', kind: 'ap', params: { F: m[4], L: m[5], p } };
  }
  m = /\bsum (?:of numbers |of integers )?from (-?\d+) to (-?\d+)/.exec(s);
  if (m) return { type: 'omni', kind: 'ap', params: { F: m[1], L: m[2], p: 1 } };
  if (/\bgeometric\b/.test(s)) {
    const ratio = /\bratio (-?\d+(?:\.\d+)?)/.exec(s)?.[1] ?? '2';
    const power = /\bpower (\d+)/.exec(s)?.[1] ?? '1';
    const terms = /\b(\d+) terms?\b/.exec(s)?.[1] ?? /\bterms? (\d+)/.exec(s)?.[1] ?? '10';
    const start = /\bstart(?:ing)?(?: at| from)? (-?\d+(?:\.\d+)?)/.exec(s)?.[1] ?? '1';
    return { type: 'omni', kind: 'gp', params: { a: start, r: ratio, n: terms, s: Number(power) } };
  }
  if (/\bharmonic\b/.test(s)) {
    const power = /\bpower (\d+)/.exec(s)?.[1] ?? '1';
    const range = /\bfrom (\d+) to (\d+)/.exec(s);
    return { type: 'omni', kind: 'hp', params: { F: range?.[1] ?? '1', L: range?.[2] ?? '10', s: Number(power) } };
  }

  // --- Twin tasks
  if (/^(done|i'?m done|finished|complete|completed|did it|ok done)$/.test(s) || /\b(mark|task) (it )?(as )?done\b/.test(s)) {
    return { type: 'task-done' };
  }
  if (/\b(cancel|skip) (the )?task\b/.test(s)) return { type: 'task-cancel' };
  for (const [re, id] of TASK_PHRASES) if (re.test(s)) return { type: 'task', id };

  // --- Lighting
  m = /\bbrightness (?:to )?(\d{1,3})\b/.exec(s) ?? /\b(\d{1,3}) ?(?:%|percent)\b/.exec(s);
  if (m) return { type: 'bulb-level', level: Math.max(0, Math.min(100, Number(m[1]))) };
  if (/\b(brighter|more light|increase|turn it up|lighter)\b/.test(s)) return { type: 'bulb-adjust', delta: 15 };
  if (/\b(dimmer|dim|darker|less light|decrease|turn it down)\b/.test(s)) return { type: 'bulb-adjust', delta: -15 };
  if (/\b(warm|warmer|candle|golden)\b/.test(s)) return { type: 'bulb-tone', tone: 'warm' };
  if (/\b(cool|cooler|cold|daylight|blue)\b/.test(s)) return { type: 'bulb-tone', tone: 'cool' };
  if (/\b(neutral|white)\b/.test(s) && /\b(light|tone|bulb)\b/.test(s)) return { type: 'bulb-tone', tone: 'neutral' };
  if (/\bring ?light\b/.test(s)) return { type: 'ring', on: !off(s) };
  if (/\b(torch|flash ?light|flash)\b/.test(s)) return { type: 'torch', on: !off(s) };
  if (/\b(light|lights|bulb|lamp)\b/.test(s)) {
    if (off(s)) return { type: 'bulb', on: false };
    if (on(s)) return { type: 'bulb', on: true };
  }

  // --- Twin / assistant
  if (/\b(twin|clone|avatar|double|companion)\b/.test(s)) return { type: 'twin', on: !off(s) };
  if (/\b(unmute|speak|talk to me)\b/.test(s)) return { type: 'speech', on: true };
  if (/\b(mute|quiet|silence|be quiet)\b/.test(s)) return { type: 'speech', on: false };
  if (/\b(tip|advice|wellness|motivate|motivation)\b/.test(s)) return { type: 'tip' };
  if (/\b(help|commands|what can (i|you) say)\b/.test(s)) return { type: 'help' };

  return { type: 'unknown', text: s };
}
