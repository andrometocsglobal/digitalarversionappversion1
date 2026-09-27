import { useCallback, useEffect, useRef, useState } from 'react';

// Opens the camera as soon as the app loads. Exposes the hardware torch when
// the device supports it (mostly rear cameras on Android Chrome).
export function useCamera(videoRef) {
  const [state, setState] = useState({ status: 'starting', error: null, facingMode: 'user', torchSupported: false, torchOn: false });
  const streamRef = useRef(null);

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const start = useCallback(
    async (facingMode = 'user') => {
      stop();
      setState((s) => ({ ...s, status: 'starting', error: null, facingMode }));
      if (!navigator.mediaDevices?.getUserMedia) {
        setState((s) => ({ ...s, status: 'error', error: 'Camera API unavailable — open the app over https or localhost.' }));
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }
        const track = stream.getVideoTracks()[0];
        const caps = track?.getCapabilities?.() ?? {};
        setState({ status: 'live', error: null, facingMode, torchSupported: !!caps.torch, torchOn: false });
      } catch (err) {
        const denied = err?.name === 'NotAllowedError' || err?.name === 'SecurityError';
        setState((s) => ({ ...s, status: denied ? 'denied' : 'error', error: denied ? 'Camera permission was denied.' : err.message }));
      }
    },
    [videoRef],
  );

  const setTorch = useCallback(async (on) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return false;
    try {
      await track.applyConstraints({ advanced: [{ torch: !!on }] });
      setState((s) => ({ ...s, torchOn: !!on }));
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    start('user');
    return stop;
  }, [start]);

  const flip = useCallback(() => start(state.facingMode === 'user' ? 'environment' : 'user'), [start, state.facingMode]);

  return { ...state, start, flip, setTorch };
}
