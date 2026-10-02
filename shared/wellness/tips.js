// Wellness micro-tips for the tip action. General wellbeing guidance only —
// not medical advice.

export const GENERAL_TIPS = [
  { title: '20-20-20', text: 'Every 20 minutes, look at something 20 feet away for 20 seconds.' },
  { title: 'Cross-crawl', text: 'Touch your right hand to your left knee, then left to right, 10 times. Cross-body moves wake up both hemispheres.' },
  { title: 'Finger tapping', text: 'Tap thumb to each fingertip in order, then reverse, both hands at once. A quick coordination workout.' },
  { title: 'Name the colours', text: 'Find five different colours around you as fast as you can. A fast attention reset.' },
  { title: 'Micro-walk', text: 'A two-minute walk every hour improves circulation and mood.' },
  { title: 'Smile check', text: 'Relax your jaw and forehead, then smile gently. Facial tension often hides stress.' },
];

/** Deterministic tip rotation: O(1), no shuffled copies. */
export function tipAt(index) {
  const n = GENERAL_TIPS.length;
  return GENERAL_TIPS[((index % n) + n) % n];
}
