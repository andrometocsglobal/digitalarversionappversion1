// Habit automation: the AR twin does the routine steps, the human does only the
// part that needs a body. Each template is designed so the human share of the
// effort sits in the 20–30% band; the twin handles the rest.
//
// What the twin automates is real but in-app: timers, reminders, spoken
// coaching, lighting changes, focus overlays and logging. It cannot act
// outside the browser.

export const ACTOR = { TWIN: 'twin', HUMAN: 'human' };

const t = (label, ms, action) => ({ actor: ACTOR.TWIN, label, ms, action });
const h = (label) => ({ actor: ACTOR.HUMAN, label });

export const TASK_TEMPLATES = {
  hydrate: {
    title: 'Hydration',
    icon: '💧',
    steps: [
      t('Check time since last glass', 1200, 'log'),
      t('Walk to the water marker', 1800, 'move'),
      t('Remind you to drink', 1200, 'speak'),
      h('Drink a glass of water (thumbs up when done)'),
      t('Log the glass and schedule the next one', 1000, 'log'),
    ],
  },
  'screen-break': {
    title: '20-20-20 screen break',
    icon: '👀',
    steps: [
      t('Measure your screen time', 1000, 'log'),
      t('Dim the digital bulb', 1200, 'bulb-dim'),
      t('Open the focus overlay', 1000, 'focus-on'),
      h('Look 20 feet away for 20 seconds'),
      t('Restore lighting, close the overlay and log the break', 1400, 'focus-off'),
    ],
  },
  posture: {
    title: 'Posture reset',
    icon: '🧍',
    steps: [
      t('Scan your head position on camera', 1500, 'scan'),
      t('Brighten the light on your face', 1000, 'bulb-bright'),
      t('Coach the reset out loud', 1400, 'speak'),
      h('Roll shoulders back, chin level'),
      t('Log the posture check', 800, 'log'),
    ],
  },
  breathe: {
    title: 'Two-minute calm',
    icon: '🌬️',
    steps: [
      t('Warm the light to a calm tone', 1000, 'bulb-warm'),
      t('Start the breathing pacer', 1000, 'exercise:breathing'),
      t('Count the rhythm for you', 1600, 'speak'),
      h('Breathe with the pacer'),
      t('Save your calm score', 800, 'log'),
    ],
  },
  'detox-hour': {
    title: 'Digital detox block',
    icon: '🌿',
    steps: [
      t('Start the detox timer', 1000, 'timer'),
      t('Enter focus mode and mute tips', 1200, 'focus-on'),
      t('Walk to the detox marker', 1800, 'move'),
      h('Step away from the screen'),
      t('Welcome you back and log the detox', 1200, 'focus-off'),
    ],
  },
  stretch: {
    title: 'Hand & wrist stretch',
    icon: '🤲',
    steps: [
      t('Detect how long you have been typing', 1000, 'log'),
      t('Demonstrate the stretch with the twin hands', 1600, 'twin-demo'),
      t('Count 5 reps aloud', 1400, 'speak'),
      h('Spread fingers wide, then make a gentle fist, 5 times'),
      t('Log the stretch', 800, 'log'),
    ],
  },
};

/** Human share of effort (0..1) — steps weighted equally. */
export function workloadSplit(steps) {
  const total = steps.length || 1;
  const human = steps.filter((s) => s.actor === ACTOR.HUMAN).length;
  return { human: human / total, twin: 1 - human / total, humanSteps: human, twinSteps: total - human };
}

/** Split across a set of templates (by id). */
export function planSplit(ids) {
  return workloadSplit(ids.flatMap((id) => TASK_TEMPLATES[id]?.steps ?? []));
}

// ------------------------------------------------------------------- runner

export function createQueue() {
  return { active: null, pending: [], done: [], twinSteps: 0, humanSteps: 0, seq: 0 };
}

function begin(templateId, now, uid) {
  const tpl = TASK_TEMPLATES[templateId];
  return { uid, templateId, title: tpl.title, icon: tpl.icon, steps: tpl.steps, index: 0, stepStartedAt: now, startedAt: now };
}

const currentStep = (task) => task?.steps[task.index] ?? null;
const effectsFor = (task) => {
  const s = currentStep(task);
  return s?.actor === ACTOR.TWIN && s.action ? [{ action: s.action, task: task.templateId, label: s.label }] : [];
};

/** Assign a task to the twin. Starts immediately if the twin is idle. */
export function assign(queue, templateId, now) {
  if (!TASK_TEMPLATES[templateId]) throw new RangeError(`unknown task "${templateId}"`);
  const uid = queue.seq + 1;
  if (queue.active) return { queue: { ...queue, seq: uid, pending: [...queue.pending, { templateId, uid }] }, effects: [] };
  const active = begin(templateId, now, uid);
  return { queue: { ...queue, seq: uid, active }, effects: effectsFor(active) };
}

function advance(queue, now, actor) {
  const task = queue.active;
  const counters = actor === ACTOR.TWIN ? { twinSteps: queue.twinSteps + 1 } : { humanSteps: queue.humanSteps + 1 };
  if (task.index + 1 < task.steps.length) {
    const next = { ...task, index: task.index + 1, stepStartedAt: now };
    return { queue: { ...queue, ...counters, active: next }, effects: effectsFor(next), completed: null };
  }
  const finished = { templateId: task.templateId, title: task.title, icon: task.icon, finishedAt: now, uid: task.uid };
  const done = [finished, ...queue.done].slice(0, 50); // bounded history
  const [head, ...rest] = queue.pending;
  const active = head ? begin(head.templateId, now, head.uid) : null;
  return {
    queue: { ...queue, ...counters, active, pending: rest, done },
    effects: active ? effectsFor(active) : [],
    completed: finished,
  };
}

/** Let time pass: completes any twin steps whose duration has elapsed. */
export function tick(queue, now, speed = 1) {
  let q = queue;
  const effects = [];
  const completed = [];
  for (let guard = 0; guard < 64; guard++) {
    const step = currentStep(q.active);
    if (!step || step.actor !== ACTOR.TWIN || now - q.active.stepStartedAt < step.ms / speed) break;
    const r = advance(q, q.active.stepStartedAt + step.ms / speed, ACTOR.TWIN);
    q = r.queue;
    effects.push(...r.effects);
    if (r.completed) completed.push(r.completed);
  }
  return { queue: q, effects, completed };
}

/** The human confirms their step (thumbs up, "done", or a tap). */
export function confirmHuman(queue, now) {
  const step = currentStep(queue.active);
  if (!step || step.actor !== ACTOR.HUMAN) return { queue, effects: [], completed: null };
  return advance(queue, now, ACTOR.HUMAN);
}

export function cancelActive(queue, now) {
  if (!queue.active) return { queue, effects: [] };
  const [head, ...rest] = queue.pending;
  const active = head ? begin(head.templateId, now, head.uid) : null;
  return { queue: { ...queue, active, pending: rest }, effects: active ? effectsFor(active) : [] };
}

export function status(queue) {
  const step = currentStep(queue.active);
  const total = queue.twinSteps + queue.humanSteps;
  return {
    busy: !!queue.active,
    waitingForHuman: step?.actor === ACTOR.HUMAN,
    step,
    progress: queue.active ? queue.active.index / queue.active.steps.length : 0,
    humanShare: total ? queue.humanSteps / total : 0,
    twinShare: total ? queue.twinSteps / total : 0,
  };
}
