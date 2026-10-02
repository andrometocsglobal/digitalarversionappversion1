// Voice notes (notepad, document, sticky) and the detached action layer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as N from '../../shared/notes/notes.js';
import { parseCommand, parseNoteCommand } from '../../shared/voice/commands.js';
import { ACTIONS, DEFAULT_GESTURE_MAP, MAPPABLE_GESTURES, actionForGesture, sanitizeGestureMap, ActionCooldown } from '../../shared/actions.js';
import { sanitizePrefs } from '../../shared/prefs.js';
import { GESTURES } from '../../shared/hands/gestures.js';
import { buildBackup, parseBackup } from '../../shared/local/backup.js';
import { TRUSTED_KEYS } from '../../shared/security/trustedKeys.js';

test('spoken punctuation becomes text punctuation', () => {
  assert.equal(N.formatSpoken('milk comma eggs period'), 'milk, eggs.');
  assert.equal(N.formatSpoken('is it 3.5 kg question mark'), 'is it 3.5 kg?');
  assert.equal(N.formatSpoken('first new line second new paragraph third'), 'first\nsecond\n\nthird');
  assert.equal(N.formatSpoken('i think i am done exclamation mark'), 'I think I am done!');
  assert.equal(N.formatSpoken('time colon 5 pm'), 'time: 5 pm');
});

test('dictation appends with sentence-aware spacing, capitals and undo', () => {
  let n = N.createNote({ kind: 'notepad', title: 'Shopping', now: 1 });
  n = N.appendText(n, 'milk comma eggs period');
  n = N.appendText(n, 'bread too');
  n = N.appendText(n, 'and butter period');
  assert.equal(n.text, 'Milk, eggs. Bread too and butter.');
  n = N.newLine(n);
  n = N.appendText(n, 'call the bank');
  assert.equal(n.text, 'Milk, eggs. Bread too and butter.\nCall the bank');
  n = N.undoLast(n);
  assert.equal(n.text, 'Milk, eggs. Bread too and butter.\n');
  n = N.undoLast(N.undoLast(n));
  assert.equal(n.text, 'Milk, eggs. Bread too');
  assert.equal(N.appendText(n, '   ').text, n.text, 'empty dictation is ignored');
});

test('documents get a title heading and section headings; export to text and markdown', () => {
  let d = N.createNote({ kind: 'document', title: 'Project plan', now: 1 });
  d = N.addHeading(d, 'budget period');
  d = N.appendText(d, 'we spend less period');
  d = N.addHeading(d, 'timeline');
  d = N.appendText(d, 'ship in october');
  assert.equal(d.text, '# Project plan\n\n## Budget\n\nWe spend less.\n\n## Timeline\n\nShip in october');
  assert.equal(N.noteToText(d), 'Project plan\n\nBudget\n\nWe spend less.\n\nTimeline\n\nShip in october');
  assert.equal(N.noteToMarkdown(d), d.text + '\n');
  assert.equal(N.noteToMarkdown(N.createNote({ title: 'T', text: 'hi', now: 1 })), '# T\n\nHi\n');
  assert.equal(N.clearNote(d).text, '# Project plan\n\n');
});

test('sticky notes: colour, position clamping, move, find, sanitise', () => {
  const s = N.createNote({ kind: 'sticky', color: 'pink', text: 'call mum', x: 2, y: -1, now: 5 });
  assert.equal(s.text, 'Call mum');
  assert.equal(s.color, 'pink');
  assert.deepEqual([s.x, s.y], [0.95, 0.02]);
  assert.equal(N.createNote({ kind: 'sticky', color: 'tartan' }).color, 'yellow');
  assert.deepEqual([N.moveSticky(s, 0.5, 0.4).x, N.moveSticky(s, 0.5, 0.4).y], [0.5, 0.4]);
  const list = [N.createNote({ title: 'Shopping list', now: 1 }), N.createNote({ title: 'Shopping old', now: 0 }), s];
  assert.equal(N.findNote(list, 'shop').title, 'Shopping list');
  assert.equal(N.findNote(list, 'nothing'), null);
  assert.throws(() => N.createNote({ kind: 'spreadsheet' }));

  const clean = N.sanitizeNotes([
    { kind: 'sticky', id: 'a', title: 'x', text: 'y', color: 'evil', x: 'nan' },
    { kind: 'virus' },
    { kind: 'notepad', id: 'a', title: '', text: 'z'.repeat(30_000) },
  ]);
  assert.equal(clean.length, 2);
  assert.equal(clean[0].color, 'yellow');
  assert.notEqual(clean[1].id, 'a', 'duplicate ids are replaced');
  assert.equal(clean[1].title, 'Untitled');
  assert.equal(clean[1].text.length, N.NOTE_LIMITS.chars);
  assert.deepEqual(N.sanitizeNotes('nope'), []);
});

test('note voice grammar keeps dictated words verbatim', () => {
  const cases = [
    ['take a note', { type: 'note-new', kind: 'notepad', title: null, dictate: true }],
    ['take notes', { type: 'note-new', kind: 'notepad', title: null, dictate: true }],
    ['New document called Project Plan', { type: 'note-new', kind: 'document', title: 'Project Plan', color: null, dictate: true }],
    ['create a blue sticky note called ideas', { type: 'note-new', kind: 'sticky', title: 'ideas', color: 'blue', dictate: true }],
    ['new sticky note', { type: 'note-new', kind: 'sticky', title: null, color: null, dictate: true }],
    ['yellow sticky note call Mum at five', { type: 'sticky', text: 'call Mum at five', color: 'yellow' }],
    ['sticky note: buy milk.', { type: 'sticky', text: 'buy milk', color: null }],
    ['write Meeting at 10', { type: 'note-write', text: 'Meeting at 10' }],
    ['start dictation', { type: 'note-dictation', on: true }],
    ["that's all", { type: 'note-dictation', on: false }],
    ['new line', { type: 'note-newline' }],
    ['new paragraph', { type: 'note-paragraph' }],
    ['heading Budget', { type: 'note-heading', text: 'Budget' }],
    ['scratch that', { type: 'note-undo' }],
    ['clear the note', { type: 'note-clear' }],
    ['read it back', { type: 'note-read' }],
    ['close the document', { type: 'note-close' }],
    ['open note shopping', { type: 'note-open', title: 'shopping' }],
    ['list my notes', { type: 'note-list' }],
    ['delete this note', { type: 'note-delete' }],
    ['confirm delete', { type: 'note-delete-confirm' }],
    ['clear all sticky notes', { type: 'sticky-clear' }],
    ['export notes', { type: 'notes-export' }],
  ];
  for (const [text, want] of cases) assert.deepEqual(parseCommand(text), want, text);
  // Ordinary speech is not a note command (so dictation writes it down) …
  for (const t of ['light on', 'remind me to drink water', 'the meeting moved to Friday']) assert.equal(parseNoteCommand(t), null, t);
  // … and the rest of the grammar is unchanged.
  assert.deepEqual(parseCommand('light on'), { type: 'bulb', on: true });
  assert.equal(parseCommand('start finger math').type, 'unknown', 'exercises are gone');
});

test('gesture → action map: defaults, every action valid, sanitising, lookup', () => {
  for (const g of MAPPABLE_GESTURES) {
    assert.ok(GESTURES[g], g);
    assert.ok(ACTIONS[DEFAULT_GESTURE_MAP[g]], `${g} → ${DEFAULT_GESTURE_MAP[g]}`);
  }
  assert.deepEqual(actionForGesture(DEFAULT_GESTURE_MAP, 'peace'), { type: 'note-new', kind: 'notepad', title: null, dictate: true, via: 'gesture', actionId: 'note-new' });
  assert.deepEqual(actionForGesture(DEFAULT_GESTURE_MAP, 'fist'), { type: 'note-dictation', on: false, via: 'gesture', actionId: 'dictation-stop' });
  assert.equal(actionForGesture(DEFAULT_GESTURE_MAP, 'open_palm'), null, 'open palm is reserved for the palm anchor');
  assert.equal(actionForGesture(DEFAULT_GESTURE_MAP, 'unknown'), null);
  const custom = sanitizeGestureMap({ peace: 'bulb-toggle', fist: 'rm -rf', bogus: 'tip' });
  assert.equal(custom.peace, 'bulb-toggle');
  assert.equal(custom.fist, DEFAULT_GESTURE_MAP.fist);
  assert.equal(custom.bogus, undefined);
  assert.deepEqual(actionForGesture(custom, 'peace').type, 'bulb');
  // A returned action is a copy — mutating it cannot change the catalogue.
  actionForGesture(DEFAULT_GESTURE_MAP, 'peace').kind = 'x';
  assert.equal(ACTIONS['note-new'].action.kind, 'notepad');
});

test('voice and gesture inputs can be switched off independently', () => {
  const p = sanitizePrefs({ voiceActions: false, gestureActions: true, gestureMap: { point: 'note-read' } });
  assert.equal(p.voiceActions, false);
  assert.equal(p.gestureActions, true);
  assert.equal(p.gestureMap.point, 'note-read');
  assert.equal(p.gestureMap.peace, DEFAULT_GESTURE_MAP.peace);
  assert.equal(sanitizePrefs({}).autoListen, true);
});

test('cooldown fires a held gesture once per window', () => {
  const cd = new ActionCooldown(1000);
  assert.equal(cd.ready('peace', 0), true);
  assert.equal(cd.ready('peace', 500), false);
  assert.equal(cd.ready('fist', 500), true, 'per gesture');
  assert.equal(cd.ready('peace', 1000), true);
});

test('notes travel inside the one-file app backup', async () => {
  const notes = [N.createNote({ title: 'Diary', text: 'today was good period', now: 1 }), N.createNote({ kind: 'sticky', color: 'green', text: 'water plants', now: 2 })];
  const r = await parseBackup(JSON.stringify(buildBackup({ prefs: {}, stats: {}, notes })), { trustedKeys: TRUSTED_KEYS });
  assert.equal(r.notes.length, 2);
  assert.equal(r.notes[0].text, 'Today was good.');
  assert.equal(r.notes[1].color, 'green');
});
