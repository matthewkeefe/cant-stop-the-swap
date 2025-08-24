import React from "react";
import { useNavigate } from "react-router-dom";
import LEVELS from "../levels";
import whiteSplat from "../assets/sprites/white-splat.png?url";
import Footer from "../components/Footer";

const circleSize = 96;

// Parse hex color strings (#rgb, #rgba, #rrggbb, #rrggbbaa) into {r,g,b,a}
function parseHexColor(input?: string | null) {
  if (!input) return { r: 0, g: 0, b: 0, a: 1 };
  const s = input.trim().replace(/^#/, "");
  if (![3, 4, 6, 8].includes(s.length)) return { r: 0, g: 0, b: 0, a: 1 };
  const expand = (chunk: string) => chunk.length === 1 ? chunk + chunk : chunk;
  let r = 0, g = 0, b = 0, a = 1;
  if (s.length === 3 || s.length === 4) {
    r = parseInt(expand(s.slice(0,1)), 16);
    g = parseInt(expand(s.slice(1,2)), 16);
    b = parseInt(expand(s.slice(2,3)), 16);
    if (s.length === 4) a = parseInt(expand(s.slice(3,4)), 16) / 255;
  } else {
    r = parseInt(s.slice(0,2), 16);
    g = parseInt(s.slice(2,4), 16);
    b = parseInt(s.slice(4,6), 16);
    if (s.length === 8) a = parseInt(s.slice(6,8), 16) / 255;
  }
  return { r, g, b, a };
}

// Compute relative luminance for sRGB color
function luminance({ r, g, b }: { r: number; g: number; b: number }) {
  const srgb = [r, g, b].map(c => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

// Choose readable text color ("#fff" or "#000") and a matching shadow color
function readableTextAndShadow(hex?: string | null) {
  const col = parseHexColor(hex);
  const L = luminance(col);
  // contrast ratio with white and black
  const contrastWhite = (1.0 + 0.05) / (L + 0.05);
  const contrastBlack = (L + 0.05) / (0.0 + 0.05);
  const useWhite = contrastWhite >= contrastBlack;
  if (useWhite) {
    // text white, shadow dark translucent
    return { textColor: "#ffffff", textShadow: "0 0 6px rgba(0,0,0,0.6)" };
  } else {
    // text dark, shadow light translucent
    return { textColor: "#000000", textShadow: "0 0 6px rgba(255,255,255,0.6)" };
  }
}

const LevelSelectPage: React.FC = () => {
  const navigate = useNavigate();

  const onSelect = (id: string) => {
    try {
      localStorage.setItem("selectedLevelId", id);
    } catch (e) {
      void e;
    }
  // navigate to play and include the chosen level id in navigation state so
  // the App can start that level immediately with the correct settings.
  // Also keep the selectedLevelId in localStorage for other tabs or reloads.
  navigate("/play", { state: { startLevelId: id } });
  };

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
      <div style={{ width: 800, maxWidth: "96vw" }}>
        <h1 style={{ marginBottom: 8 }}>Select Level</h1>

        <p style={{ marginTop: 0, marginBottom: 12, opacity: 0.9 }}>
          Tap or click a level to play. Layout adjusts for small screens.
        </p>

        <div
          role="list"
          style={{
            display: "grid",
            // Use fixed-width columns so items flow left-to-right and wrap
            gridTemplateColumns: `repeat(auto-fill, minmax(${circleSize}px, ${circleSize}px))`,
            gap: 12,
            alignItems: "start",
            justifyContent: "start",
          }}
        >
          {LEVELS.map((lvl) => (
            <button
              key={lvl.id}
              role="listitem"
              onClick={() => onSelect(lvl.id)}
              style={{
                height: circleSize,
                minHeight: circleSize,
                // Use the white-splat sprite as the button background; the splat image
                // provides the visual shape so we don't force a circle via borderRadius.
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                // Fill the splat with the level color via mask (no background image)
                backgroundColor: lvl.color ?? "transparent",
                maskImage: `url(${whiteSplat})`,
                maskSize: "contain",
                maskPosition: "center",
                maskRepeat: "no-repeat",
                WebkitMaskImage: `url(${whiteSplat})`,
                WebkitMaskSize: "contain",
                WebkitMaskPosition: "center",
                WebkitMaskRepeat: "no-repeat",
                border: "2px solid rgba(255,255,255,0.06)",
                color: "#121c29ff",
                cursor: "pointer",
                fontSize: 16,
                fontWeight: 700,
                padding: 8,
                boxSizing: "border-box",
                textAlign: "center",
                boxShadow: "0 6px 18px rgba(0,0,0,0.4)",
                transition: "transform 120ms ease, box-shadow 120ms ease",
              }}
              onMouseDown={(e) =>
                (e.currentTarget.style.transform = "scale(0.98)")
              }
              onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
              onMouseLeave={(e) =>
                (e.currentTarget.style.transform = "scale(1)")
              }
              aria-label={`Start ${lvl.name}`}
            >
              {(() => {
                const { textColor, textShadow } = readableTextAndShadow(lvl.color);
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ fontSize: 16, color: textColor, textShadow }}>{lvl.shortName}</div>
                  </div>
                );
              })()}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 16 }}>
          <button onClick={() => navigate(-1)}>Back</button>
        </div>
  <Footer />
      </div>
    </div>
  );
};

export default LevelSelectPage;
