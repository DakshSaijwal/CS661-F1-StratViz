import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

const TOTAL_MS = 2200;
const AUDIO_START_S = 0.5;
const FADE_OUT_MS = 600;

export default function SplashScreen({ onDone }) {
  const [phase, setPhase] = useState("enter"); // enter | zoom | done

  // Keep onDone in a ref so the effect never needs it as a dep
  const onDoneRef = useRef(onDone);
  useLayoutEffect(() => { onDoneRef.current = onDone; });

  // Run once on mount — no deps so LandingPage re-renders can't restart it
  useEffect(() => {
    const audio = new Audio("/introsound.mp3");
    audio.volume = 1;

    const tryPlay = () => {
      audio.currentTime = AUDIO_START_S;
      return audio.play().catch(() => {});
    };

    // Attempt immediate autoplay; if blocked, play on first user gesture
    tryPlay().then((result) => {
      if (result === undefined) {
        // play() was blocked (returns undefined when NotAllowedError is caught)
        const unlock = () => {
          tryPlay();
          document.removeEventListener("click", unlock, true);
          document.removeEventListener("keydown", unlock, true);
        };
        document.addEventListener("click", unlock, true);
        document.addEventListener("keydown", unlock, true);
      }
    });

    // Fade volume from 1 → 0 over FADE_OUT_MS before the transition ends
    const fadeSteps = 20;
    const fadeInterval = FADE_OUT_MS / fadeSteps;
    let ticker = null;
    const fadeTimer = setTimeout(() => {
      let step = 0;
      ticker = setInterval(() => {
        step++;
        audio.volume = Math.max(0, 1 - step / fadeSteps);
        if (step >= fadeSteps) clearInterval(ticker);
      }, fadeInterval);
    }, TOTAL_MS - FADE_OUT_MS);

    const t1 = setTimeout(() => setPhase("zoom"), 700);
    const t2 = setTimeout(() => {
      setPhase("done");
      onDoneRef.current?.();
    }, TOTAL_MS);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(fadeTimer);
      if (ticker) clearInterval(ticker);
      audio.pause();
      audio.src = "";
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === "done") return null;

  return (
    <>
      <style>{`
        @keyframes f1-enter {
          0%   { transform: translate(-50%, -50%) scale(0.15); opacity: 0; }
          60%  { transform: translate(-50%, -50%) scale(1.05); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1);    opacity: 1; }
        }
        @keyframes f1-zoom {
          0%   { transform: translate(-50%, -50%) scale(1);   opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(90);  opacity: 0; }
        }
        @keyframes overlay-fade {
          0%   { opacity: 1; }
          70%  { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>

      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          background: "#0a0e14",
          animation: phase === "zoom"
            ? `overlay-fade ${TOTAL_MS - 700}ms ease-in forwards`
            : "none",
          pointerEvents: "none",
        }}
      />

      <svg
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          width: "220px",
          height: "220px",
          zIndex: 10000,
          fill: "#E10600",
          filter: "drop-shadow(0 0 40px rgba(225,6,0,0.6))",
          animation: phase === "enter"
            ? "f1-enter 0.65s cubic-bezier(0.22,1,0.36,1) forwards"
            : `f1-zoom ${TOTAL_MS - 700}ms cubic-bezier(0.55,0,1,0.45) forwards`,
          pointerEvents: "none",
        }}
      >
        <path d="M9.6 11.24h7.91L19.75 9H9.39c-2.85 0-3.62.34-5.17 1.81C2.71 12.3 0 15 0 15h3.38c.77-.75 2.2-2.13 2.85-2.75.92-.87 1.37-1.01 3.37-1.01zM20.39 9l-6 6H18l6-6h-3.61zm-3.25 2.61H9.88c-2.22 0-2.6.12-3.55 1.07C5.44 13.57 4 15 4 15h3.15l.75-.75c.49-.49.75-.55 1.78-.55h5.37l2.09-2.09z" />
      </svg>
    </>
  );
}
