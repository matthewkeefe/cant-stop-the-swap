import React from "react";
import { useNavigate } from "react-router-dom";
import congratulationsBackground from "../assets/background/congratulations.png";

const CongratulationsPage: React.FC = () => {
  const navigate = useNavigate();

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
        <h1 style={{ marginBottom: 8 }}>You Finished the Game!</h1>

        <p style={{ marginTop: 4, opacity: 0.9 }}>
          Congratulations — you've completed the final level. Thanks for
          playing! If you'd like to play again or explore other levels,
          choose an option below.
        </p>

        <img
          src={congratulationsBackground}
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

        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          <button onClick={() => navigate("/")}>Return to Title</button>
          <button onClick={() => navigate("/levels")}>Level Select</button>
          <button onClick={() => navigate("/play")}>Play Last Level Again</button>
        </div>
      </div>
    </div>
  );
};

export default CongratulationsPage;
