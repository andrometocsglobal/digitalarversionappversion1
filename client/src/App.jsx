import { useCallback, useEffect, useRef, useState } from 'react';

import { classifyHands, GestureStabilizer, GESTURES } from '@shared/hands/gestures.js';
import { parseCommand, HELP } from '@shared/voice/commands.js';
import { GESTURE_TIPS, tipAt } from '@shared/wellness/tips.js';
import * as Ex from '@shared/wellness/exercises.js';
import * as Tasks from '@shared/automation/tasks.js';
import { sanitizePrefs, DEFAULT_PREFS, TONE_RGB } from '@shared/prefs.js';
import { solve } from '@shared/omni/index.js';
import { buildBackup, parseBackup, sanitizeHistory } from '@shared/local/backup.js';
import { TRUSTED_KEYS } from '@shared/security/trustedKeys.js';

import { useCamera } from './hooks/useCamera.js';
import { useTracking } from './hooks/useTracking.js';
import { useVoice, speak } from './hooks/useVoice.js';
import { useRegistration } from './hooks/useRegistration.js';
import { useIdentity } from './hooks/useIdentity.js';
import { loadJSON, saveJSON, today } from './lib/store.js';
import { createTwinState, renderFrame, palmAnchor } from './ar/twinRenderer.js';

import TasksPanel from './components/TasksPanel.jsx';
import TrainPanel from './components/TrainPanel.jsx';
import PrefsPanel from './components/PrefsPanel.jsx';
import IdentityPanel, { SignatureGlyph } from './components/IdentityPanel.jsx';
import OmniLab from './components/OmniLab.jsx';
import XRButton from './components/XRButton.jsx';
import ArVerifyGate from './components/ArVerifyGate.jsx';
import DataPanel from './components/DataPanel.jsx';

const MOCK = new URLSearchParams(window.location.search).has('mock');

const SPEAK_LINES = {
  hydrate: 'Time for a glass of water. Small sips, big focus.',
  posture: 'Roll your shoulders back, lift your chest, and level your chin.',
  breathe: 'Breathe in for four, and out for four. Follow the pacer.',
  stretch: 'Spread your fingers wide, then make a gentle fist. Five times.',
  'screen-break': 'Look at something far away for twenty seconds.',
  'detox-hour': 'Time to unplug. I will keep watch while you are away.',
};

const TABS = [
  ['tasks', 'Tasks'],
  ['train', 'Exercises'],
  ['prefs', 'My twin'],
  ['id', 'Omni ID'],
  ['lab', 'Omni Lab'],
  ['data', 'Data'],
  ['help', 'Help'],
];

const emptyStats = () => ({ date: today(), tasksDone: 0, glasses: 0, detoxMs: 0, breaths: 0 });
const shortValue = (r) => {
  const v = String(r.decimal ?? r.value);
  return v.length > 24 ? `a ${v.replace('-', '').length}-digit number` : v;
};

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const spotRef = useRef(null);

  const [prefs, setPrefsState] = useState(() => sanitizePrefs(loadJSON('omni.prefs', {})));
  const updatePrefs = useCallback((patch) => {
    setPrefsState((p) => {
      const next = sanitizePrefs({ ...p, ...(typeof patch === 'function' ? patch(p) : patch) });
      saveJSON('omni.prefs', next);
      return next;
    });
  }, []);

  const idState = useIdentity();
  const reg = useRegistration(idState.identity);
  const camera = useCamera(videoRef);

  const [tab, setTab] = useState('tasks');
  const [gestureUi, setGestureUi] = useState({ gesture: null, total: 0 });
  const [bubble, setBubble] = useState('');
  const [log, setLog] = useState([]);
  const [tipIndex, setTipIndex] = useState(0);
  const [tip, setTip] = useState(tipAt(0));
  const [focus, setFocus] = useState(false);
  const [stats, setStats] = useState(() => {
    const s = loadJSON('omni.stats', null);
    return s?.date === today() ? s : emptyStats();
  });
  const [lastOmni, setLastOmni] = useState(null);
  const [command, setCommand] = useState('');
  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);

  const [arStarted, setArStarted] = useState(false);
  const [webglOk, setWebglOk] = useState(null);
  const [pendingBundle, setPendingBundle] = useState('');
  const stageRef = useRef(null);
  const arHostRef = useRef(null);
  const sceneRef = useRef(null);

  const queueRef = useRef({ ...Tasks.createQueue(), done: sanitizeHistory(loadJSON('omni.history', [])) });
  const exerciseRef = useRef(null);
  const twinRef = useRef(createTwinState());
  const stabRef = useRef(new GestureStabilizer(prefs.gestureFrames));
  const bubbleRef = useRef({ text: '', until: 0 });
  const savedBulb = useRef(null);
  const focusStart = useRef(0);
  const announced = useRef('');
  const tipCooldown = useRef({});
  const visibleMs = useRef(0);
  const live = useRef({});
  live.current = { prefs, reg, camera, focus, arStarted };

  // 3D Web AR layer (three.js over the camera) — any device with WebGL.
  const want3d = arStarted && prefs.arMode === '3d' && reg.status === 'verified';
  useEffect(() => {
    if (!want3d || !arHostRef.current) return undefined;
    let cancelled = false;
    import('./ar/webArScene.js').then(({ createWebAR }) => {
      if (cancelled) return;
      const scene = createWebAR(arHostRef.current);
      setWebglOk(!!scene);
      sceneRef.current = scene;
    });
    return () => {
      cancelled = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [want3d]);

  const placeTwin = (e) => {
    if (!arStarted) return;
    const box = e.currentTarget.getBoundingClientRect();
    const dx = (e.clientX - box.left) / box.width;
    const y = (e.clientY - box.top) / box.height;
    twinRef.current.placed = { x: live.current.camera.facingMode === 'user' ? 1 - dx : dx, y };
  };

  useEffect(() => {
    stabRef.current = new GestureStabilizer(prefs.gestureFrames);
  }, [prefs.gestureFrames]);

  useEffect(() => saveJSON('omni.stats', stats), [stats]);

  // ------------------------------------------------------------ twin output
  const say = useCallback((text, { voice = false, ms = 5000 } = {}) => {
    bubbleRef.current = { text, until: Date.now() + ms };
    setBubble(text);
    const p = live.current.prefs;
    if (voice) speak(text.replace(/\p{Extended_Pictographic}/gu, ''), { enabled: p.speech, rate: p.voiceRate, lang: p.voiceLang });
  }, []);

  const addLog = useCallback((msg) => {
    setLog((l) => [{ id: `${Date.now()}-${Math.random()}`, msg, t: new Date().toLocaleTimeString() }, ...l].slice(0, 8));
  }, []);

  // --------------------------------------------------------------- lighting
  const setFocusMode = useCallback(
    (on) => {
      const now = Date.now();
      if (on && !live.current.focus) {
        focusStart.current = now;
        savedBulb.current ??= { bulbOn: live.current.prefs.bulbOn, bulbLevel: live.current.prefs.bulbLevel };
        updatePrefs({ bulbOn: true, bulbLevel: 15 });
      }
      if (!on && live.current.focus) {
        const spent = now - focusStart.current;
        setStats((s) => ({ ...s, detoxMs: s.detoxMs + spent }));
        if (savedBulb.current) updatePrefs(savedBulb.current);
        savedBulb.current = null;
      }
      setFocus(on);
    },
    [updatePrefs],
  );

  const toggleTorch = useCallback(
    async (on) => {
      if (live.current.camera.torchSupported && (await live.current.camera.setTorch(on))) {
        say(on ? '🔦 Torch on' : 'Torch off');
        return;
      }
      updatePrefs({ bulbOn: on, bulbLevel: on ? 100 : live.current.prefs.bulbLevel, ringLight: on });
      say(on ? 'No hardware torch on this camera — the digital bulb and ring light are at full power instead.' : 'Digital light off.', { voice: true });
    },
    [say, updatePrefs],
  );

  // ----------------------------------------------------------------- tasks
  const runEffects = useCallback(
    (effects) => {
      const now = Date.now();
      for (const e of effects) {
        const tpl = Tasks.TASK_TEMPLATES[e.task];
        say(`${tpl.icon} ${e.label}`, { ms: 3500 });
        switch (e.action) {
          case 'speak':
            say(SPEAK_LINES[e.task] ?? e.label, { voice: true, ms: 6000 });
            break;
          case 'bulb-dim':
            savedBulb.current ??= { bulbOn: live.current.prefs.bulbOn, bulbLevel: live.current.prefs.bulbLevel };
            updatePrefs({ bulbOn: true, bulbLevel: 20 });
            break;
          case 'bulb-bright':
            updatePrefs({ bulbOn: true, bulbLevel: 90 });
            break;
          case 'bulb-warm':
            updatePrefs({ bulbOn: true, bulbTone: 'warm' });
            break;
          case 'focus-on':
            setFocusMode(true);
            break;
          case 'focus-off':
            setFocusMode(false);
            break;
          case 'exercise:breathing':
            exerciseRef.current = Ex.start('breathing', now);
            break;
          case 'scan':
            twinRef.current.scanUntil = now + 2200;
            break;
          case 'twin-demo':
            twinRef.current.demoUntil = now + 4200;
            break;
          default:
            break;
        }
      }
    },
    [say, updatePrefs, setFocusMode],
  );

  const applyQueue = useCallback(
    (r) => {
      queueRef.current = r.queue;
      runEffects(r.effects ?? []);
      const completed = Array.isArray(r.completed) ? r.completed : r.completed ? [r.completed] : [];
      if (completed.length) saveJSON('omni.history', r.queue.done);
      for (const c of completed) {
        say(`✅ ${c.title} done! Thank you.`, { voice: true });
        addLog(`${c.icon} ${c.title} completed`);
        setStats((s) => ({ ...s, tasksDone: s.tasksDone + 1, glasses: s.glasses + (c.templateId === 'hydrate' ? 1 : 0) }));
        if (c.templateId === 'breathe' && exerciseRef.current?.kind === 'breathing') exerciseRef.current = null;
      }
      const st = Tasks.status(r.queue);
      const key = r.queue.active ? `${r.queue.active.uid}:${r.queue.active.index}` : '';
      if (st.waitingForHuman && announced.current !== key) {
        announced.current = key;
        say(`🙋 Your turn: ${st.step.label}`, { voice: true, ms: 60_000 });
      }
      rerender();
    },
    [runEffects, say, addLog, rerender],
  );

  const assignTask = useCallback(
    (id) => {
      if (!reg.can('twin')) {
        say('The AR twin is disabled until its registration verifies.');
        return;
      }
      const tpl = Tasks.TASK_TEMPLATES[id];
      addLog(`Assigned ${tpl.icon} ${tpl.title} to ${live.current.prefs.twinName}`);
      applyQueue(Tasks.assign(queueRef.current, id, Date.now()));
    },
    [reg, say, addLog, applyQueue],
  );
  const confirmTask = useCallback(() => applyQueue(Tasks.confirmHuman(queueRef.current, Date.now())), [applyQueue]);
  const cancelTask = useCallback(() => {
    if (live.current.focus) setFocusMode(false);
    applyQueue(Tasks.cancelActive(queueRef.current, Date.now()));
    say('Task cancelled.');
  }, [applyQueue, say, setFocusMode]);

  // Twin work loop, exercise clock and detox auto-breaks.
  useEffect(() => {
    let lastSecond = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      if (queueRef.current.active) {
        const r = Tasks.tick(queueRef.current, now, live.current.prefs.taskSpeed);
        if (r.effects.length || r.completed.length || r.queue !== queueRef.current) applyQueue(r);
      }
      if (exerciseRef.current) rerender();
      if (bubbleRef.current.text && now > bubbleRef.current.until) {
        bubbleRef.current = { text: '', until: 0 };
        setBubble('');
      }
      if (now - lastSecond >= 1000) {
        if (document.visibilityState === 'visible') visibleMs.current += now - lastSecond;
        lastSecond = now;
        const q = queueRef.current;
        if (visibleMs.current >= live.current.prefs.breakEveryMin * 60_000) {
          visibleMs.current = 0;
          const already = q.active?.templateId === 'screen-break' || q.pending.some((p) => p.templateId === 'screen-break');
          if (!already && live.current.reg.can('twin')) {
            addLog('⏰ Screen-time limit reached — auto break');
            applyQueue(Tasks.assign(q, 'screen-break', now));
          }
        }
      }
    }, 200);
    return () => clearInterval(id);
  }, [applyQueue, rerender, addLog]);

  // ------------------------------------------------------------- exercises
  const startExercise = useCallback(
    (kind) => {
      exerciseRef.current = Ex.start(kind, Date.now());
      setTab('train');
      say(`${Ex.EXERCISES[kind].title}: ${Ex.EXERCISES[kind].blurb}`, { voice: true });
      addLog(`Started ${Ex.EXERCISES[kind].title}`);
      rerender();
    },
    [say, addLog, rerender],
  );
  const stopExercise = useCallback(() => {
    const ex = exerciseRef.current;
    exerciseRef.current = null;
    if (ex) say(`Exercise stopped. Score ${ex.score}.`, { voice: true });
    rerender();
  }, [say, rerender]);

  const tipIdx = useRef(0);
  const nextTip = useCallback(() => {
    tipIdx.current += 1;
    const t = tipAt(tipIdx.current);
    setTipIndex(tipIdx.current);
    setTip(t);
    say(`💡 ${t.title}: ${t.text}`, { voice: true, ms: 8000 });
  }, [say]);

  // -------------------------------------------------------------- gestures
  const handleGesture = useCallback(
    (gesture, total) => {
      setGestureUi({ gesture, total });
      if (!gesture) return;
      const now = Date.now();
      const ex = exerciseRef.current;
      if (ex && !ex.done) {
        const r = Ex.input(ex, { gesture, total }, now);
        exerciseRef.current = r.state;
        if (r.event) {
          say(r.event.message, { voice: r.event.type !== 'step', ms: 2500 });
          addLog(`🧠 ${r.event.message}`);
          if (ex.kind === 'breathing' && r.event.type === 'correct') setStats((s) => ({ ...s, breaths: s.breaths + 1 }));
        }
        rerender();
        return;
      }
      if (Tasks.status(queueRef.current).waitingForHuman && gesture === 'thumbs_up') {
        confirmTask();
        return;
      }
      const t = GESTURE_TIPS[gesture];
      if (t && live.current.reg.can('hands') && now - (tipCooldown.current[gesture] ?? 0) > 8000) {
        tipCooldown.current[gesture] = now;
        setTip(t);
        say(`${GESTURES[gesture].emoji} ${t.title}: ${t.text}`, { voice: true, ms: 7000 });
        addLog(`${GESTURES[gesture].emoji} ${GESTURES[gesture].label} → ${t.title}`);
      }
    },
    [say, addLog, rerender, confirmTask],
  );

  const onFrame = useCallback(
    (results, now) => {
      const { prefs: p, reg: r, camera: cam } = live.current;
      const cls = classifyHands(results.hands);
      const label = cls.primary?.gesture ?? null;
      const changed = stabRef.current.push(label ? `${label}|${cls.total}` : null);
      if (changed !== undefined) {
        const [g, n] = changed ? changed.split('|') : [null, '0'];
        handleGesture(g, Number(n));
      }

      const mirror = cam.facingMode === 'user';
      const spot = spotRef.current;
      if (spot) {
        const f = results.face;
        const cx = f ? f.x + f.width / 2 : 0.5;
        const cy = f ? f.y + f.height / 2 : 0.4;
        spot.style.left = `${(mirror ? 1 - cx : cx) * 100}%`;
        spot.style.top = `${cy * 100}%`;
        spot.style.setProperty('--spot', `${Math.max(30, (f?.width ?? 0.3) * 260)}%`);
      }

      const canvas = canvasRef.current;
      if (!canvas) return;
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
      }
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const q = queueRef.current;
      const st = Tasks.status(q);
      const arOn = r.can('twin') && live.current.arStarted;
      // An open palm becomes a stage the twin stands on.
      const palmIdx = cls.hands.findIndex((h) => h.gesture === 'open_palm');
      const palm = palmIdx >= 0 ? palmAnchor(results.hands[palmIdx].landmarks) : null;
      const scene = sceneRef.current;
      const twin = twinRef.current;
      renderFrame(ctx, W, H, twin, {
        hands: results.hands,
        face: results.face,
        mirror,
        prefs: p,
        task: q.active ? { templateId: q.active.templateId, waitingForHuman: st.waitingForHuman, progress: st.progress } : null,
        bubble: bubbleRef.current.until > Date.now() ? bubbleRef.current.text : '',
        now,
        arEnabled: arOn,
        palm,
        avatar3d: !!scene,
      });
      if (scene) {
        const f = results.face;
        scene.update({
          visible: arOn && p.showTwin,
          x: mirror ? 1 - twin.x : twin.x,
          y: twin.y,
          scale: twin.scale,
          tilt: twin.tilt,
          shape: p.twinShape,
          color: p.twinColor,
          moving: twin.moving,
          lookX: f ? (mirror ? 1 - (f.x + f.width / 2) : f.x + f.width / 2) : null,
          label: st.step ? (st.waitingForHuman ? `Your turn: ${st.step.label}` : st.step.label) : p.twinName,
        });
      }
      const stage = stageRef.current;
      if (stage && stage.dataset.anchor !== twin.anchor) stage.dataset.anchor = twin.anchor;
    },
    [handleGesture],
  );

  const tracking = useTracking(videoRef, { enabled: camera.status === 'live' || MOCK, mock: MOCK, onFrame });

  // ---------------------------------------------------------------- voice
  const handleCommand = useCallback(
    async (text, source = 'typed') => {
      const a = parseCommand(text);
      addLog(`${source === 'voice' ? '🎙️' : '⌨️'} “${text}” → ${a.type}`);
      const bulbOk = () => {
        if (reg.can('digital-bulb')) return true;
        say('The digital bulb needs a verified AR registration.');
        return false;
      };
      switch (a.type) {
        case 'bulb':
          if (bulbOk()) {
            updatePrefs({ bulbOn: a.on });
            say(a.on ? '💡 Digital bulb on' : 'Digital bulb off');
          }
          break;
        case 'bulb-adjust':
          if (bulbOk()) updatePrefs((p) => ({ bulbOn: true, bulbLevel: p.bulbLevel + a.delta }));
          break;
        case 'bulb-level':
          if (bulbOk()) updatePrefs({ bulbOn: true, bulbLevel: a.level });
          break;
        case 'bulb-tone':
          if (bulbOk()) {
            updatePrefs({ bulbOn: true, bulbTone: a.tone });
            say(`${a.tone[0].toUpperCase()}${a.tone.slice(1)} light`);
          }
          break;
        case 'ring':
          if (bulbOk()) updatePrefs({ ringLight: a.on });
          break;
        case 'torch':
          toggleTorch(a.on);
          break;
        case 'tip':
          nextTip();
          break;
        case 'exercise':
          startExercise(a.kind);
          break;
        case 'exercise-stop':
          stopExercise();
          break;
        case 'twin':
          updatePrefs({ showTwin: a.on });
          say(a.on ? `${live.current.prefs.twinName} is here.` : 'Twin hidden.');
          break;
        case 'speech':
          updatePrefs({ speech: a.on });
          break;
        case 'help':
          setTab('help');
          say(`Try: ${HELP.slice(0, 5).join(' · ')}`, { ms: 9000 });
          break;
        case 'task':
          assignTask(a.id);
          break;
        case 'task-done':
          confirmTask();
          break;
        case 'task-cancel':
          cancelTask();
          break;
        case 'omni': {
          let r;
          try {
            r = solve(a.kind, a.params); // on-device, O(1) in the number of terms
          } catch (err) {
            say(`I can't compute that: ${err.message}`);
            break;
          }
          setLastOmni(r);
          say(`🧮 ${r.decimal ?? r.value} — ${r.exact ? 'exact' : 'O(1) asymptotic'}, ${r.ms} ms`, { ms: 9000 });
          speak(`The answer is ${shortValue(r)}.`, { enabled: live.current.prefs.speech, rate: live.current.prefs.voiceRate, lang: live.current.prefs.voiceLang });
          break;
        }
        default:
          say(`Sorry, I didn't catch “${text}”. Say “help”.`);
      }
    },
    [reg, addLog, say, updatePrefs, toggleTorch, nextTip, startExercise, stopExercise, assignTask, confirmTask, cancelTask],
  );

  const voice = useVoice({ lang: prefs.voiceLang, onCommand: (t) => handleCommand(t, 'voice') });

  // Greet once the verified AR element is started.
  const greeted = useRef(false);
  useEffect(() => {
    if (arStarted && reg.status === 'verified' && !greeted.current) {
      greeted.current = true;
      say(`Hi ${prefs.displayName}! I'm ${prefs.twinName}, your AR twin. Show me a gesture or give me a task.`, { ms: 7000 });
    }
  }, [arStarted, reg.status, prefs.displayName, prefs.twinName, say]);

  // Ring light brightens the whole screen — the display itself becomes the light.
  useEffect(() => {
    document.body.classList.toggle('ring-on', prefs.ringLight && prefs.bulbOn);
    document.body.style.setProperty('--bulb', `rgb(${TONE_RGB[prefs.bulbTone].join(',')})`);
  }, [prefs.ringLight, prefs.bulbOn, prefs.bulbTone]);

  // ---------------------------------------------------- JSON export / import
  const exportBackup = async (passphrase) => {
    const bundle = passphrase ? await idState.backup(passphrase) : null;
    return buildBackup({
      prefs,
      stats,
      history: queueRef.current.done,
      registry: reg.registry,
      receipt: reg.receipt,
      passport: idState.identity?.passport ?? null,
      identityBundle: bundle,
    });
  };

  const importBackup = async (text) => {
    const r = await parseBackup(text, { trustedKeys: TRUSTED_KEYS });
    updatePrefs(r.prefs);
    setStats(r.stats);
    queueRef.current = { ...queueRef.current, done: r.history };
    saveJSON('omni.history', r.history);
    if (r.registry && r.registry.integrity !== reg.registry?.integrity) await reg.importRegistry(r.registry);
    if (r.receipt && r.receipt.integrity === (r.registry ?? reg.registry)?.integrity) reg.restoreReceipt(r.receipt);
    if (r.identityBundle && !idState.identity) setPendingBundle(JSON.stringify(r.identityBundle, null, 2));
    addLog(`⬆ Imported app backup (${r.history.length} history items)`);
    rerender();
    return r;
  };

  // --------------------------------------------------------------- render
  const q = queueRef.current;
  const qStatus = Tasks.status(q);
  const exView = exerciseRef.current ? Ex.view(exerciseRef.current, Date.now()) : null;
  const mirror = camera.facingMode === 'user';
  const rgb = TONE_RGB[prefs.bulbTone].join(',');
  const g = gestureUi.gesture ? GESTURES[gestureUi.gesture] : null;

  return (
    <div className={`app ${focus ? 'focus-mode' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>◎</span>
          <div>
            <h1>Omni AR Twin</h1>
            <small>{prefs.motto}</small>
          </div>
        </div>
        <div className={`badge ${reg.status}`} data-testid="reg-badge" title={reg.reason}>
          {reg.status === 'checking' && 'Verifying AR element…'}
          {reg.status === 'verified' && `🛡️ AR element verified · ${reg.element.name} v${reg.element.version}`}
          {reg.status === 'failed' && `⚠️ AR registration failed: ${reg.reason}`}
          {reg.receipt && reg.status === 'verified' && (
            <small data-testid="reg-receipt"> · receipt {reg.receipt.registrationId.slice(0, 8)}{reg.receipt.holder ? ' ✍️' : ''}</small>
          )}
        </div>
        {idState.identity && (
          <button className="id-chip" onClick={() => setTab('id')} title="Your Omni ID">
            <SignatureGlyph id={idState.identity.passport.id} color={idState.identity.passport.profile.twinColor} size={28} />
            {idState.identity.passport.profile.displayName}
          </button>
        )}
      </header>

      <main className="layout">
        <div className="stage-col">
          <div
            className={`stage ${prefs.ringLight && prefs.bulbOn ? 'ring' : ''}`}
            style={{ '--bulb': `rgb(${rgb})`, '--level': prefs.bulbLevel / 100 }}
            data-testid="stage"
            data-ar-mode={sceneRef.current ? '3d' : '2d'}
            ref={stageRef}
            onClick={placeTwin}
            onDoubleClick={() => (twinRef.current.placed = null)}
          >
            <video
              ref={videoRef}
              className={mirror ? 'mirror' : ''}
              playsInline
              muted
              autoPlay
              data-testid="camera"
              style={{ filter: prefs.bulbOn ? `brightness(${(1 + prefs.bulbLevel * 0.007).toFixed(3)}) contrast(1.04) saturate(1.06)` : 'none' }}
            />
            <div className="bulb-wash" hidden={!prefs.bulbOn} data-testid="bulb-wash" />
            <div ref={spotRef} className="bulb-spot" hidden={!prefs.bulbOn} />
            <canvas ref={canvasRef} className="ar-layer" data-testid="ar-layer" />
            {/* 3D twin above the hand skeleton, so it stands in front of your palm. */}
            <div ref={arHostRef} className="ar3d-host" />

            {!arStarted && (
              <ArVerifyGate
                reg={reg}
                camera={camera}
                prefs={prefs}
                webglOk={webglOk}
                onChange={updatePrefs}
                onStart={() => setArStarted(true)}
                onSkip={() => setArStarted(true)}
              />
            )}

            {camera.status !== 'live' && (
              <div className="stage-msg" data-testid="camera-status">
                {camera.status === 'starting' && 'Starting camera…'}
                {(camera.status === 'denied' || camera.status === 'error') && (
                  <>
                    <p>{camera.error}</p>
                    <button onClick={() => camera.start(camera.facingMode)}>Try again</button>
                  </>
                )}
              </div>
            )}

            <div className="hud-top">
              <span className="chip" data-testid="gesture">{g ? `${g.emoji} ${g.label} · ${gestureUi.total}` : '✋ Show a hand'}</span>
              <span className="chip muted" data-testid="tracker-status">tracker: {tracking.status}</span>
            </div>

            {exView && (
              <div className="exercise-hud" data-testid="exercise-hud">
                <small>{exView.title}</small>
                <div className="exercise-prompt" data-testid="exercise-prompt">{exView.prompt}</div>
                <small>{exView.detail}</small>
              </div>
            )}

            <div className="twin-says" aria-live="polite" data-testid="twin-says">{bubble}</div>

            {focus && (
              <div className="focus-overlay" data-testid="focus-overlay">
                <div>
                  <h2>🌿 Look away</h2>
                  <p>Rest your eyes on something far away. {prefs.twinName} will call you back.</p>
                  {qStatus.waitingForHuman && <button className="primary" onClick={confirmTask}>👍 Done</button>}
                </div>
              </div>
            )}
          </div>

          <div className="dock">
            <div className="dock-group" role="group" aria-label="Digital bulb">
              <button
                className={prefs.bulbOn ? 'on' : ''}
                aria-pressed={prefs.bulbOn}
                onClick={() => reg.can('digital-bulb') && updatePrefs({ bulbOn: !prefs.bulbOn })}
                data-testid="bulb-toggle"
              >
                💡 Bulb {prefs.bulbOn ? 'on' : 'off'}
              </button>
              <input
                type="range"
                min="0"
                max="100"
                value={prefs.bulbLevel}
                aria-label="Bulb brightness"
                onChange={(e) => updatePrefs({ bulbOn: true, bulbLevel: Number(e.target.value) })}
                data-testid="bulb-level"
              />
              <span className="num" data-testid="bulb-level-value">{prefs.bulbLevel}%</span>
              <div className="seg">
                {['warm', 'neutral', 'cool'].map((t) => (
                  <button key={t} className={prefs.bulbTone === t ? 'on' : ''} aria-pressed={prefs.bulbTone === t} onClick={() => updatePrefs({ bulbTone: t, bulbOn: true })}>
                    {t}
                  </button>
                ))}
              </div>
              <button className={prefs.ringLight ? 'on' : ''} aria-pressed={prefs.ringLight} onClick={() => updatePrefs({ ringLight: !prefs.ringLight, bulbOn: true })} data-testid="ring-toggle">
                ⭕ Ring light
              </button>
              <button onClick={() => toggleTorch(!camera.torchOn)} data-testid="torch-toggle" title={camera.torchSupported ? 'Hardware torch' : 'No hardware torch — uses the digital bulb'}>
                🔦 Torch
              </button>
            </div>

            <div className="dock-group">
              <button className={prefs.showTwin ? 'on' : ''} aria-pressed={prefs.showTwin} onClick={() => updatePrefs({ showTwin: !prefs.showTwin })} data-testid="twin-toggle">
                🤖 {prefs.twinName}
              </button>
              <button
                className={voice.listening ? 'on' : ''}
                aria-pressed={voice.listening}
                onClick={() => (voice.listening ? voice.stop() : voice.start())}
                data-testid="mic-toggle"
                disabled={!reg.can('voice')}
              >
                🎙️ {voice.listening ? 'Listening' : 'Voice'}
              </button>
              <button
                className={prefs.arMode === '3d' ? 'on' : ''}
                aria-pressed={prefs.arMode === '3d'}
                onClick={() => updatePrefs({ arMode: prefs.arMode === '3d' ? '2d' : '3d' })}
                data-testid="ar-mode-toggle"
                title="3D Web AR works on laptops, PCs and phones"
              >
                🧊 {prefs.arMode === '3d' ? '3D AR' : '2D AR'}
              </button>
              <button onClick={camera.flip} title="Switch camera">🔄</button>
              <XRButton enabled={reg.can('camera')} getState={() => ({ prefs: live.current.prefs, taskId: queueRef.current.active?.templateId ?? null, stepLabel: Tasks.status(queueRef.current).step?.label ?? '', waitingForHuman: Tasks.status(queueRef.current).waitingForHuman })} />
            </div>

            <form
              className="command"
              onSubmit={(e) => {
                e.preventDefault();
                if (command.trim()) handleCommand(command.trim(), 'typed');
                setCommand('');
              }}
            >
              <input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder={voice.listening ? `Heard: ${voice.heard || '…'}` : 'Type or say a command — e.g. “light on”, “sum of cubes from 3 to 7”'}
                aria-label="Command"
                data-testid="command-input"
              />
              <button type="submit" data-testid="command-send">Send</button>
            </form>
            {voice.error && <small className="error">{voice.error}</small>}

            <ul className="activity" data-testid="activity">
              {log.map((l) => (
                <li key={l.id}><small>{l.t}</small> {l.msg}</li>
              ))}
            </ul>
          </div>
        </div>

        <aside className="side">
          <nav className="tabs" role="tablist">
            {TABS.map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)} data-testid={`tab-${id}`}>
                {label}
              </button>
            ))}
          </nav>
          {tab === 'tasks' && (
            <TasksPanel queue={q} qStatus={qStatus} onAssign={assignTask} onConfirm={confirmTask} onCancel={cancelTask} stats={stats} prefs={prefs} />
          )}
          {tab === 'train' && <TrainPanel exerciseView={exView} onStart={startExercise} onStop={stopExercise} tip={tip} onNextTip={nextTip} tipIndex={tipIndex} />}
          {tab === 'prefs' && <PrefsPanel prefs={prefs} onChange={updatePrefs} onReset={() => updatePrefs({ ...DEFAULT_PREFS })} />}
          {tab === 'id' && <IdentityPanel idState={idState} prefs={prefs} initialBundle={pendingBundle} />}
          {tab === 'lab' && <OmniLab lastVoiceResult={lastOmni} />}
          {tab === 'data' && <DataPanel reg={reg} hasIdentity={!!idState.identity} onExport={exportBackup} onImport={importBackup} />}
          {tab === 'help' && (
            <section className="panel">
              <h2>Hands-free commands</h2>
              <ul className="help-list" data-testid="help-list">
                {HELP.map((h) => <li key={h}><code>{h}</code></li>)}
              </ul>
              <h3>Gestures</h3>
              <p className="muted">👍 thumbs up confirms your part of a task · during exercises, fingers answer · otherwise each gesture brings a wellness tip.</p>
              <h3>Privacy</h3>
              <p className="muted">Everything runs in your browser — there is no server. Camera, hand and face processing never leave the device; your data moves only when you export a JSON file (Data tab).</p>
              <h3>AR on every device</h3>
              <p className="muted">3D Web AR runs in any browser with a camera — laptop, desktop, iPhone or Android. Show an open palm and {prefs.twinName} stands on it; click or tap the video to place it; double-click to release it.</p>
              <h3>Room-scale AR (ARCore)</h3>
              <p className="muted">On an ARCore Android phone with Chrome (over https), “Enter real AR” places {prefs.twinName} on real surfaces. Tap again to drop task stations; the twin walks to whichever task it is working on.</p>
            </section>
          )}
        </aside>
      </main>
    </div>
  );
}
