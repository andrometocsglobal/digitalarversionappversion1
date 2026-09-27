import { useEffect, useRef, useState } from 'react';

async function isImmersiveArSupported() {
  try {
    return !!(await navigator.xr?.isSessionSupported?.('immersive-ar'));
  } catch {
    return false;
  }
}

// "Enter real AR": WebXR immersive-ar with surface hit-testing (ARCore
// Android + Chrome, over https). Elsewhere the camera-overlay twin is used.
export default function XRButton({ getState, enabled }) {
  const [supported, setSupported] = useState(null);
  const [active, setActive] = useState(false);
  const [info, setInfo] = useState('');
  const overlay = useRef(null);
  const ctl = useRef(null);

  useEffect(() => {
    isImmersiveArSupported().then(setSupported);
  }, []);

  const enter = async () => {
    try {
      const { startXR } = await import('../ar/xrScene.js');
      setActive(true);
      ctl.current = await startXR({
        overlayRoot: overlay.current,
        getState,
        onInfo: setInfo,
        onEnd: () => {
          setActive(false);
          setInfo('');
        },
      });
    } catch (err) {
      setActive(false);
      setInfo(`Could not start AR: ${err.message}`);
    }
  };

  return (
    <>
      <button
        className="xr-btn"
        disabled={!supported || !enabled}
        onClick={enter}
        data-testid="xr-button"
        title={supported ? 'Place your twin on real surfaces in your room' : '3D Web AR already works here; room-scale surface AR needs an ARCore Android phone with Chrome over https'}
      >
        {supported === null ? 'Checking room AR…' : supported ? '🕶️ Room-scale AR' : 'Room AR: ARCore phones only'}
      </button>
      {info && !active && <small className="muted">{info}</small>}
      <div ref={overlay} className={`xr-overlay ${active ? 'on' : ''}`}>
        {active && (
          <>
            <p>{info}</p>
            <button onClick={() => ctl.current?.end()}>Exit AR</button>
          </>
        )}
      </div>
    </>
  );
}
