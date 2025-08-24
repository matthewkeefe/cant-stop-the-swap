import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Footer from "../components/Footer";

const OptionsPage: React.FC = () => {
  const navigate = useNavigate();
  const [music, setMusic] = useState<number>(() => {
    const v = typeof window !== "undefined" ? localStorage.getItem("musicVolume") : null;
    return v !== null ? Math.max(0, Math.min(1, Number(v))) : 0.25;
  });
  const [sfx, setSfx] = useState<number>(() => {
    const v = typeof window !== "undefined" ? localStorage.getItem("sfxVolume") : null;
    return v !== null ? Math.max(0, Math.min(1, Number(v))) : 1.0;
  });

  useEffect(() => {
    try {
      localStorage.setItem("musicVolume", String(music));
      try {
        window.dispatchEvent(new CustomEvent("volumechange", { detail: { music } }));
      } catch (e) {
        void e;
      }
    } catch (e) {
      void e;
      // ignore storage errors (e.g., private mode)
    }
  }, [music]);

  useEffect(() => {
    try {
      localStorage.setItem("sfxVolume", String(sfx));
      try {
        window.dispatchEvent(new CustomEvent("volumechange", { detail: { sfx } }));
      } catch (e) {
        void e;
      }
    } catch (e) {
      void e;
      // ignore storage errors (e.g., private mode)
    }
  }, [sfx]);

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100vw",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        background: "#0b0b0e",
        color: "#cbd5e1",
        fontFamily: "ui-sans-serif, system-ui",
        padding: 16,
        boxSizing: "border-box",
      }}
    >
      <div style={{ width: 664, maxWidth: "90vw", textAlign: "left" }}>
        <h1 style={{ marginBottom: 8 }}>Options</h1>

        <label style={{ display: "block", marginBottom: 12 }}>
          Music Volume: {Math.round(music * 100)}%
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={music}
            onChange={(e) => setMusic(Number(e.target.value))}
            style={{ width: "100%", marginTop: 6 }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 12 }}>
          Sounds Volume: {Math.round(sfx * 100)}%
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={sfx}
            onChange={(e) => setSfx(Number(e.target.value))}
            style={{ width: "100%", marginTop: 6 }}
          />
        </label>

        <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
          <button onClick={() => navigate(-1)}>Back</button>
        </div>
  <Footer />
      </div>
    </div>
  );
};

export default OptionsPage;
