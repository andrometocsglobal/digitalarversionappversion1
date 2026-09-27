// Hand-gesture brain exercises as pure state machines:
//   finger-math      show the answer to a sum with your fingers (0..10, both hands)
//   mirror-sequence  memorise a gesture sequence, then perform it back
//   breathing        open palm to inhale, fist to exhale, in rhythm
//
// start(kind, now, rand) -> state
// input(state, { gesture, total }, now) -> { state, event }
// view(state, now) -> { title, prompt, detail, score }
//
// Scoring uses the Omni closed forms: a streak of k correct answers is worth
// 1+2+...+k (AP, exact, O(1)); level thresholds grow geometrically (GP); the
// "focus speed" is the harmonic mean of reaction times (O(1) running state).

import { apRangePowerSum, gpPowerSum } from '../omni/engine.js';
import { GESTURES } from '../hands/gestures.js';

export const EXERCISES = {
  'finger-math': { title: 'Finger Math', blurb: 'Solve the sum and hold up the answer with your fingers.' },
  'mirror-sequence': { title: 'Mirror Memory', blurb: 'Watch the gesture sequence, then perform it back in order.' },
  breathing: { title: 'Gesture Breathing', blurb: 'Open palm while breathing in, fist while breathing out.' },
};

const SEQUENCE_POOL = ['fist', 'open_palm', 'peace', 'point', 'thumbs_up'];
const SHOW_MS = 1400;

/** Next gesture for the memory sequence, never repeating the previous one. */
function nextGesture(prev, rand) {
  const pool = SEQUENCE_POOL.filter((g) => g !== prev);
  return pool[Math.floor(rand() * pool.length)];
}
const BREATH_MS = 4000;

/** Points for a streak of k: 1 + 2 + ... + k, via the exact midpoint AP sum. */
export const streakPoints = (k) => (k > 0 ? Number(apRangePowerSum(1, k, 1).n) : 0);

/** Level L needs 10Â·(2^L âˆ’ 1) points (GP closed form); returns the level reached. */
export function levelFor(points) {
  let level = 0;
  while (Number(gpPowerSum(10, 2, level + 1, 1).n) <= points) level++;
  return level;
}

function withReaction(state, now) {
  const rt = Math.max(1, now - state.askedAt);
  return { reactions: state.reactions + 1, invReaction: state.invReaction + 1 / rt };
}

/** Harmonic-mean reaction time in ms (0 if none). */
export const focusSpeed = (s) => (s.reactions ? Math.round(s.reactions / s.invReaction) : 0);

function newQuestion(level, rand) {
  const max = level >= 2 ? 10 : 5;
  const answer = Math.floor(rand() * (max + 1));
  if (level >= 1 && rand() < 0.4 && answer < max) {
    const b = 1 + Math.floor(rand() * (max - answer));
    return { a: answer + b, b, op: 'âˆ’', answer };
  }
  const a = Math.floor(rand() * (answer + 1));
  return { a, b: answer - a, op: '+', answer };
}

export function start(kind, now = 0, rand = Math.random) {
  const base = { kind, startedAt: now, askedAt: now, score: 0, streak: 0, best: 0, level: 0, reactions: 0, invReaction: 0, rand };
  switch (kind) {
    case 'finger-math':
      return { ...base, question: newQuestion(0, rand) };
    case 'mirror-sequence': {
      const sequence = [];
      for (let i = 0; i < 3; i++) sequence.push(nextGesture(sequence[i - 1], rand));
      return { ...base, sequence, index: 0, showUntil: now + SHOW_MS * sequence.length, lives: 3 };
    }
    case 'breathing':
      return { ...base, cycles: 0, credited: -1 };
    default:
      throw new RangeError(`unknown exercise "${kind}"`);
  }
}

function award(state, now, correct) {
  if (!correct) return { ...state, streak: 0 };
  const streak = state.streak + 1;
  const score = state.score + streak; // running total equals the AP sum within a streak
  return { ...state, ...withReaction(state, now), streak, best: Math.max(state.best, streak), score, level: levelFor(score) };
}

export function input(state, { gesture = null, total = 0 } = {}, now = 0) {
  if (!state) return { state, event: null };
  switch (state.kind) {
    case 'finger-math': {
      if (total !== state.question.answer) return { state, event: null };
      const next = award(state, now, true);
      const levelUp = next.level > state.level;
      return {
        state: { ...next, question: newQuestion(next.level, state.rand), askedAt: now },
        event: { type: levelUp ? 'level' : 'correct', message: levelUp ? `Level ${next.level}! Harder sums unlocked.` : `Correct! Streak ${next.streak}.` },
      };
    }
    case 'mirror-sequence': {
      if (now < state.showUntil || !gesture || gesture === 'unknown') return { state, event: null };
      const want = state.sequence[state.index];
      if (gesture !== want) {
        // Ignore the gesture that just completed the previous step.
        if (state.index > 0 && gesture === state.sequence[state.index - 1]) return { state, event: null };
        const lives = state.lives - 1;
        if (lives <= 0) return { state: { ...state, lives: 0, done: true, streak: 0 }, event: { type: 'complete', message: `Game over. Best sequence: ${state.sequence.length - 1}.` } };
        return {
          state: { ...state, lives, index: 0, streak: 0, showUntil: now + SHOW_MS * state.sequence.length },
          event: { type: 'wrong', message: `Not quite â€” watch again. ${lives} lives left.` },
        };
      }
      if (state.index + 1 < state.sequence.length) {
        return { state: { ...state, index: state.index + 1 }, event: { type: 'step', message: `${state.index + 1}/${state.sequence.length}` } };
      }
      const next = award(state, now, true);
      const sequence = [...state.sequence, nextGesture(state.sequence.at(-1), state.rand)];
      return {
        state: { ...next, sequence, index: 0, askedAt: now + SHOW_MS * sequence.length, showUntil: now + SHOW_MS * sequence.length },
        event: { type: 'correct', message: `Perfect! Now remember ${sequence.length}.` },
      };
    }
    case 'breathing': {
      const phase = breathPhase(state, now);
      const want = phase.name === 'inhale' ? 'open_palm' : 'fist';
      if (gesture !== want || state.credited === phase.index) return { state, event: null };
      const credited = phase.index;
      const cycles = phase.name === 'exhale' ? state.cycles + 1 : state.cycles;
      const next = { ...state, credited, cycles, score: cycles };
      return { state: next, event: phase.name === 'exhale' ? { type: 'correct', message: `Breath ${cycles} complete.` } : { type: 'step', message: 'Good inhaleâ€¦' } };
    }
    default:
      return { state, event: null };
  }
}

export function breathPhase(state, now) {
  const index = Math.floor(Math.max(0, now - state.startedAt) / BREATH_MS);
  const name = index % 2 === 0 ? 'inhale' : 'exhale';
  const remaining = Math.ceil((BREATH_MS - ((now - state.startedAt) % BREATH_MS)) / 1000);
  return { index, name, remaining };
}

export function view(state, now = 0) {
  if (!state) return null;
  const { title } = EXERCISES[state.kind];
  const stats = { score: state.score, streak: state.streak, level: state.level, focusMs: focusSpeed(state) };
  switch (state.kind) {
    case 'finger-math': {
      const q = state.question;
      return { title, prompt: `${q.a} ${q.op} ${q.b} = ?`, detail: 'Hold up the answer with your fingers (use both hands above 5).', ...stats };
    }
    case 'mirror-sequence': {
      if (state.done) return { title, prompt: 'Game over', detail: `You remembered ${state.sequence.length - 1} gestures.`, ...stats };
      if (now < state.showUntil) {
        const i = Math.min(state.sequence.length - 1, Math.floor((now - (state.showUntil - SHOW_MS * state.sequence.length)) / SHOW_MS));
        const g = GESTURES[state.sequence[i]];
        return { title, prompt: `${g.emoji} ${g.label}`, detail: `Memorise: ${i + 1} of ${state.sequence.length}`, ...stats };
      }
      return { title, prompt: `Your turn: ${state.index + 1} of ${state.sequence.length}`, detail: `â™¥ ${state.lives}  Â·  perform the sequence in order`, ...stats };
    }
    case 'breathing': {
      const p = breathPhase(state, now);
      return {
        title,
        prompt: p.name === 'inhale' ? `ðŸ–ï¸ Breathe inâ€¦ ${p.remaining}` : `âœŠ Breathe outâ€¦ ${p.remaining}`,
        detail: `${state.cycles} breaths completed`,
        ...stats,
      };
    }
    default:
      return null;
  }
}
