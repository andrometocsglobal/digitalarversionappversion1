import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyHand, classifyHands, GestureStabilizer } from '../../shared/hands/gestures.js';
import { makeHand, POSES, countPose } from '../../shared/hands/synthetic.js';
import { parseCommand, normalize } from '../../shared/voice/commands.js';
import { tipAt, GENERAL_TIPS } from '../../shared/wellness/tips.js';
import * as Tasks from '../../shared/automation/tasks.js';
import { sanitizePrefs, DEFAULT_PREFS, profileFromPrefs } from '../../shared/prefs.js';

// ---------------------------------------------------------------- gestures

test('every pose is classified at several rotations, scales and positions', () => {
  for (const pose of Object.keys(POSES)) {
    const rotations = pose.startsWith('thumbs') ? [undefined] : [0, 25, -35, 90, 160];
    for (const rotation of rotations) {
      for (const [scale, cx, cy] of [[0.18, 0.5, 0.6], [0.08, 0.2, 0.3], [0.3, 0.7, 0.55]]) {
        const got = classifyHand(makeHand({ pose, rotation, scale, cx, cy }));
        assert.equal(got.gesture, pose, `${pose} rot=${rotation} scale=${scale}`);
      }
    }
  }
});

test('finger counting across two hands gives 0..10', () => {
  for (let n = 0; n <= 10; n++) {
    const hands = n <= 5 ? [makeHand({ fingers: countPose(n) })] : [makeHand({ fingers: countPose(5), cx: 0.3 }), makeHand({ fingers: countPose(n - 5), cx: 0.7 })];
    assert.equal(classifyHands(hands).total, n);
  }
  assert.equal(classifyHand([]), null);
});

test('stabilizer only reports a label after N consistent frames', () => {
  const s = new GestureStabilizer(3);
  assert.equal(s.push('fist'), undefined);
  assert.equal(s.push('fist'), undefined);
  assert.equal(s.push('fist'), 'fist');
  assert.equal(s.push('fist'), undefined);
  s.push('peace');
  assert.equal(s.push('fist'), undefined, 'a single glitch frame resets the streak');
  s.push(null);
  s.push(null);
  assert.equal(s.push(null), null);
});

// -------------------------------------------------------------------- voice

test('voice commands map to actions', () => {
  const cases = [
    ['Turn on the light', { type: 'bulb', on: true }],
    ['lights off please', { type: 'bulb', on: false }],
    ['brighter', { type: 'bulb-adjust', delta: 15 }],
    ['make it dimmer', { type: 'bulb-adjust', delta: -15 }],
    ['brightness eighty five', { type: 'bulb-level', level: 85 }],
    ['set 40 percent', { type: 'bulb-level', level: 40 }],
    ['warm light', { type: 'bulb-tone', tone: 'warm' }],
    ['cool daylight', { type: 'bulb-tone', tone: 'cool' }],
    ['ring light on', { type: 'ring', on: true }],
    ['torch off', { type: 'torch', on: false }],
    ['give me a wellness tip', { type: 'tip' }],
    ['hide twin', { type: 'twin', on: false }],
    ['show my clone', { type: 'twin', on: true }],
    ['mute', { type: 'speech', on: false }],
    ['what can I say', { type: 'help' }],
    ['remind me to drink water', { type: 'task', id: 'hydrate' }],
    ['I need a screen break', { type: 'task', id: 'screen-break' }],
    ['posture check', { type: 'task', id: 'posture' }],
    ['digital detox', { type: 'task', id: 'detox-hour' }],
    ['done', { type: 'task-done' }],
    ['cancel task', { type: 'task-cancel' }],
    ['sum of cubes from 3 to 7', { type: 'omni', kind: 'ap', params: { F: '3', L: '7', p: 3 } }],
    ['sum of power 5 from one to ten', { type: 'omni', kind: 'ap', params: { F: '1', L: '10', p: 5 } }],
    ['sum from 1 to 100', { type: 'omni', kind: 'ap', params: { F: '1', L: '100', p: 1 } }],
    ['geometric sum ratio 2 power 3 for 5 terms', { type: 'omni', kind: 'gp', params: { a: '1', r: '2', n: '5', s: 3 } }],
    ['harmonic sum power 2 from 1 to 1 million', { type: 'omni', kind: 'hp', params: { F: '1', L: '1000000', s: 2 } }],
    ['blargh', { type: 'unknown', text: 'blargh' }],
  ];
  for (const [text, want] of cases) assert.deepEqual(parseCommand(text), want, text);
  assert.equal(normalize('Twenty Three thousand'), '23000');
});

test('tips rotate', () => {
  assert.equal(tipAt(GENERAL_TIPS.length), tipAt(0));
  assert.equal(tipAt(-1), GENERAL_TIPS.at(-1));
});

// -------------------------------------------------------------- automation

test('every habit template keeps the human share within 20-30%', () => {
  for (const [id, t] of Object.entries(Tasks.TASK_TEMPLATES)) {
    const s = Tasks.workloadSplit(t.steps);
    assert.ok(s.human >= 0.2 && s.human <= 0.3, `${id}: ${s.human}`);
  }
  const all = Tasks.planSplit(Object.keys(Tasks.TASK_TEMPLATES));
  assert.ok(all.twin >= 0.7 && all.twin <= 0.8);
});

test('task runner: twin steps auto-complete, waits for the human, then finishes and starts the next', () => {
  let q = Tasks.createQueue();
  let r = Tasks.assign(q, 'hydrate', 0);
  q = r.queue;
  assert.deepEqual(r.effects.map((e) => e.action), ['log']);
  q = Tasks.assign(q, 'stretch', 0).queue;
  assert.equal(q.pending.length, 1);

  r = Tasks.tick(q, 100_000);
  q = r.queue;
  assert.equal(Tasks.status(q).waitingForHuman, true, 'twin did its three steps and now waits');
  assert.deepEqual(r.effects.map((e) => e.action), ['move', 'speak']);
  assert.equal(Tasks.tick(q, 999_999).queue, q, 'time alone never completes a human step');

  r = Tasks.confirmHuman(q, 100_100);
  q = r.queue;
  r = Tasks.tick(q, 200_000);
  q = r.queue;
  assert.equal(r.completed[0].templateId, 'hydrate');
  assert.equal(q.active.templateId, 'stretch');
  assert.equal(q.done.length, 1);
  const st = Tasks.status(q);
  assert.ok(st.twinShare > 0.7);
  assert.equal(Tasks.confirmHuman(Tasks.createQueue(), 0).queue.active, null);
  assert.throws(() => Tasks.assign(q, 'nope', 0));
});

test('task speed scales twin step durations', () => {
  const q = Tasks.assign(Tasks.createQueue(), 'posture', 0).queue;
  assert.equal(Tasks.tick(q, 1000, 1).queue.active.index, 0);
  assert.equal(Tasks.tick(q, 1000, 10).queue.active.index, 3);
});

test('cancel moves on to the next queued task', () => {
  let q = Tasks.assign(Tasks.createQueue(), 'hydrate', 0).queue;
  q = Tasks.assign(q, 'posture', 0).queue;
  q = Tasks.cancelActive(q, 5).queue;
  assert.equal(q.active.templateId, 'posture');
});

// -------------------------------------------------------------------- prefs

test('preferences are sanitised', () => {
  assert.deepEqual(sanitizePrefs({}), { ...DEFAULT_PREFS });
  const p = sanitizePrefs({ twinColor: 'red', bulbLevel: 500, twinShape: 'dragon', twinName: '  Nova  ', breakEveryMin: 1, speech: 'yes' });
  assert.equal(p.twinColor, DEFAULT_PREFS.twinColor);
  assert.equal(p.bulbLevel, 100);
  assert.equal(p.twinShape, 'orb');
  assert.equal(p.twinName, 'Nova');
  assert.equal(p.breakEveryMin, 5);
  assert.equal(p.speech, true);
  assert.deepEqual(Object.keys(profileFromPrefs(p)), ['displayName', 'twinName', 'twinColor', 'twinShape', 'motto']);
});
