import { useEffect, useRef, useState } from 'react';
import { makeHand, POSES, countPose } from '@shared/hands/synthetic.js';
import { MODEL_URLS } from '@shared/platform.js';

// Hand + face tracking on the live video. Results live in a ref (no React
// re-render per frame); onFrame is called once per processed frame.
//
// ?mock=1 swaps MediaPipe for a scriptable tracker (used by the E2E tests and
// handy for demos without a camera):
//   window.__omni.pose('peace') | .fingers(3) | .hands([...landmarks]) | .clear()
//   window.__omni.face({ x, y, width, height })   (normalised 0..1)

const WASM = '/mediapipe/wasm';

async function loadMediaPipe() {
  const { FilesetResolver, HandLandmarker, FaceDetector } = await import('@mediapipe/tasks-vision');
  const fileset = await FilesetResolver.forVisionTasks(WASM);
  const make = async (Cls, opts, delegate) =>
    Cls.createFromOptions(fileset, { ...opts, baseOptions: { ...opts.baseOptions, delegate }, runningMode: 'VIDEO' });
  const withFallback = async (Cls, opts) => {
    try {
      return await make(Cls, opts, 'GPU');
    } catch {
      return make(Cls, opts, 'CPU');
    }
  };
  const [hands, face] = await Promise.all([
    withFallback(HandLandmarker, { baseOptions: { modelAssetPath: MODEL_URLS.hand }, numHands: 2, minHandDetectionConfidence: 0.6 }),
    withFallback(FaceDetector, { baseOptions: { modelAssetPath: MODEL_URLS.face }, minDetectionConfidence: 0.5 }).catch(() => null),
  ]);
  return { hands, face };
}

export function useTracking(videoRef, { enabled, mock, onFrame }) {
  const results = useRef({ hands: [], face: null, ts: 0 });
  const [status, setStatus] = useState(mock ? 'mock' : 'idle');
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    let raf = 0;
    let models = null;
    let lastVideoTime = -1;
    let faceEvery = 0;

    if (mock) {
      const set = (hands) => (results.current = { ...results.current, hands });
      window.__omni = {
        ...(window.__omni ?? {}),
        hands: (list) => set(list.map((landmarks) => ({ landmarks, handedness: 'Right' }))),
        pose: (name) => set([{ landmarks: makeHand({ pose: name }), handedness: 'Right' }]),
        fingers: (n) =>
          set(
            n <= 5
              ? [{ landmarks: makeHand({ fingers: countPose(n) }), handedness: 'Right' }]
              : [
                  { landmarks: makeHand({ fingers: countPose(5), cx: 0.3 }), handedness: 'Right' },
                  { landmarks: makeHand({ fingers: countPose(n - 5), cx: 0.7 }), handedness: 'Left' },
                ],
          ),
        clear: () => set([]),
        face: (box) => (results.current = { ...results.current, face: box }),
        poses: Object.keys(POSES),
      };
      setStatus('mock');
    } else {
      setStatus('loading');
      loadMediaPipe()
        .then((m) => {
          if (cancelled) {
            m.hands?.close();
            m.face?.close();
            return;
          }
          models = m;
          setStatus('tracking');
        })
        .catch((err) => {
          console.warn('hand tracking unavailable', err);
          if (!cancelled) setStatus('unavailable');
        });
    }

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const video = videoRef.current;
      const now = performance.now();
      if (models && video && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        try {
          const h = models.hands.detectForVideo(video, now);
          const hands = (h.landmarks ?? []).map((landmarks, i) => ({
            landmarks,
            handedness: h.handedness?.[i]?.[0]?.categoryName ?? 'Right',
          }));
          let face = results.current.face;
          if (models.face && faceEvery++ % 3 === 0) {
            const d = models.face.detectForVideo(video, now).detections?.[0];
            const vw = video.videoWidth || 1;
            const vh = video.videoHeight || 1;
            face = d?.boundingBox
              ? { x: d.boundingBox.originX / vw, y: d.boundingBox.originY / vh, width: d.boundingBox.width / vw, height: d.boundingBox.height / vh }
              : null;
          }
          results.current = { hands, face, ts: now };
        } catch (err) {
          console.warn('tracking frame failed', err);
        }
      } else if (mock) {
        results.current = { ...results.current, ts: now };
      }
      onFrameRef.current?.(results.current, now);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      models?.hands?.close();
      models?.face?.close();
    };
  }, [enabled, mock, videoRef]);

  return { results, status };
}
