import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import titleBackground from "../assets/background/csts-title.png";

const TitlePage: React.FC = () => {
  const nav = useNavigate();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === " " ||
        e.key === "Space" ||
        e.key === "z" ||
        e.key === "Z"
      ) {
        try {
          localStorage.removeItem("selectedLevelId");
        } catch (e) {
          void e;
        }
        // Explicitly request level-1 when starting from Title
        nav("/play", { state: { startLevelId: "level-1" } });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [nav]);
  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100vw",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#0b0b0e",
        color: "#cbd5e1",
        padding: 16,
        boxSizing: "border-box",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: "min(90vw, 960px)" }}>
        <img
          src={titleBackground}
          alt="Can't Stop the Swap"
          style={{
            display: "block",
            margin: "0 auto",
            maxWidth: "90vw",
            height: "auto",
            maxHeight: "60vh",
            objectFit: "contain",
          }}
        />
        <p style={{ marginTop: 16, opacity: 0.9 }}>Press Space or Z to start</p>
        <div
          style={{
            marginTop: 12,
            display: "flex",
            gap: 8,
            justifyContent: "center",
          }}
        >
          <button
              onClick={() => {
                try {
                  localStorage.removeItem("selectedLevelId");
                } catch (e) {
                  void e;
                }
                // Explicitly start level-1 when launching from title
                nav("/play", { state: { startLevelId: "level-1" } });
              }}
          >
            Start
          </button>
          <button onClick={() => nav("/levels")} aria-label="Select level">Levels</button>
          <button onClick={() => nav("/options")}>Options</button>
          <button onClick={() => nav("/scores")}>Scores</button>
        </div>
      </div>
    </div>
  );
};

export default TitlePage;
