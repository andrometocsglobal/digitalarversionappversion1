// Gesture-triggered wellness micro-tips. General wellbeing guidance only —
// not medical advice.

export const GESTURE_TIPS = {
  open_palm: { title: 'Box breathing', text: 'Breathe in for 4, hold for 4, out for 4, hold for 4. Two rounds settle the nervous system.' },
  fist: { title: 'Squeeze & release', text: 'Clench both fists for 5 seconds, then let go completely. Notice the warmth as tension drains.' },
  point: { title: 'Eye tracking', text: 'Slowly trace a figure-eight with your fingertip and follow it with only your eyes. Relaxes eye muscles after screen time.' },
  peace: { title: 'Two good things', text: 'Name two things that went well today. Gratitude recall lifts mood in under a minute.' },
  three: { title: '3-3-3 grounding', text: 'Name 3 things you see, 3 sounds you hear, and move 3 parts of your body.' },
  four: { title: '4-7-8 breath', text: 'Inhale for 4, hold for 7, exhale for 8. A classic wind-down before sleep.' },
  thumbs_up: { title: 'Posture check', text: 'Shoulders down, chin level, screen at eye height. Your neck thanks you.' },
  thumbs_down: { title: 'Reset moment', text: 'Stand up, roll your shoulders five times, and take one slow breath. Small resets beat long breaks.' },
  rock: { title: 'Hydrate', text: 'Take a few sips of water. Mild dehydration quietly drains focus.' },
  call_me: { title: 'Connect', text: 'Message someone you have not spoken to in a while. Social connection is a real wellness lever.' },
  l_shape: { title: 'Hand stretch', text: 'Spread your fingers wide for 5 seconds, then make a gentle fist. Repeat 5 times to ease typing strain.' },
};

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
