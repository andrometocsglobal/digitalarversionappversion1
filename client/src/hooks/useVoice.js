import { useCallback, useEffect, useRef, useState } from 'react';

// Web Speech API: continuous recognition in, speech synthesis out.
// Recognition is Chrome/Edge/Android only; the typed command box always works.

const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition ?? window.webkitSpeechRecognition : undefined;

export function useVoice({ lang, onCommand }) {
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [error, setError] = useState(null);
  const recRef = useRef(null);
  const wantRef = useRef(false);
  const cbRef = useRef(onCommand);
  cbRef.current = onCommand;

  const stop = useCallback(() => {
    wantRef.current = false;
    recRef.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(() => {
    if (!Recognition) {
      setError('Voice recognition is not supported in this browser — type commands instead.');
      return;
    }
    setError(null);
    wantRef.current = true;
    const rec = new Recognition();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0].transcript.trim();
        setHeard(text);
        if (e.results[i].isFinal && text) cbRef.current?.(text);
      }
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        wantRef.current = false;
        setError('Microphone permission was denied.');
      }
    };
    rec.onend = () => {
      // Browsers end sessions after silence; keep listening while wanted.
      if (wantRef.current) {
        try {
          rec.start();
        } catch {
          setListening(false);
        }
      } else setListening(false);
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch (err) {
      setError(err.message);
    }
  }, [lang]);

  useEffect(() => () => stop(), [stop]);

  return { supported: !!Recognition, listening, heard, error, start, stop };
}

export function speak(text, { enabled = true, rate = 1, lang = 'en-US' } = {}) {
  if (!enabled || typeof speechSynthesis === 'undefined' || !text) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    u.lang = lang;
    speechSynthesis.speak(u);
  } catch {
    /* speech is best-effort */
  }
}
