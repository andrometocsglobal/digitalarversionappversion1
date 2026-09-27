// User preferences for the AR twin and the app. sanitizePrefs() is the single
// gate for anything read from storage, the UI or an imported identity.

export const DEFAULT_PREFS = Object.freeze({
  displayName: 'Me',
  twinName: 'Omni',
  twinColor: '#22d3ee',
  twinShape: 'orb', // orb | bot | spark
  motto: 'Digital detox, healthy habits.',
  speech: true,
  voiceRate: 1,
  voiceLang: 'en-US',
  bulbOn: false,
  bulbLevel: 60,
  bulbTone: 'neutral', // warm | neutral | cool
  ringLight: false,
  showTwin: true,
  mirrorClone: true,
  gestureFrames: 5,
  breakEveryMin: 20,
  detoxGoalMin: 60,
  taskSpeed: 1,
  reducedMotion: false,
});

const clamp = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d);
const pick = (v, list, d) => (list.includes(v) ? v : d);
const str = (v, n, d) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : d);
const bool = (v, d) => (typeof v === 'boolean' ? v : d);

export function sanitizePrefs(p = {}) {
  const d = DEFAULT_PREFS;
  return {
    displayName: str(p.displayName, 40, d.displayName),
    twinName: str(p.twinName, 24, d.twinName),
    twinColor: /^#[0-9a-f]{6}$/i.test(p.twinColor ?? '') ? p.twinColor.toLowerCase() : d.twinColor,
    twinShape: pick(p.twinShape, ['orb', 'bot', 'spark'], d.twinShape),
    motto: str(p.motto, 80, d.motto),
    speech: bool(p.speech, d.speech),
    voiceRate: clamp(p.voiceRate, 0.5, 2, d.voiceRate),
    voiceLang: /^[a-z]{2}(-[A-Z]{2})?$/.test(p.voiceLang ?? '') ? p.voiceLang : d.voiceLang,
    bulbOn: bool(p.bulbOn, d.bulbOn),
    bulbLevel: Math.round(clamp(p.bulbLevel, 0, 100, d.bulbLevel)),
    bulbTone: pick(p.bulbTone, ['warm', 'neutral', 'cool'], d.bulbTone),
    ringLight: bool(p.ringLight, d.ringLight),
    showTwin: bool(p.showTwin, d.showTwin),
    mirrorClone: bool(p.mirrorClone, d.mirrorClone),
    gestureFrames: Math.round(clamp(p.gestureFrames, 2, 15, d.gestureFrames)),
    breakEveryMin: Math.round(clamp(p.breakEveryMin, 5, 120, d.breakEveryMin)),
    detoxGoalMin: Math.round(clamp(p.detoxGoalMin, 10, 600, d.detoxGoalMin)),
    taskSpeed: clamp(p.taskSpeed, 0.25, 20, d.taskSpeed),
    reducedMotion: bool(p.reducedMotion, d.reducedMotion),
  };
}

/** Profile subset that travels inside the Omni ID passport. */
export const profileFromPrefs = (p) => ({
  displayName: p.displayName,
  twinName: p.twinName,
  twinColor: p.twinColor,
  twinShape: p.twinShape,
  motto: p.motto,
});

/** Bulb tone → RGB used for the digital light. */
export const TONE_RGB = { warm: [255, 196, 130], neutral: [255, 244, 230], cool: [214, 234, 255] };
