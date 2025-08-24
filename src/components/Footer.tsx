import React from "react";

const Footer: React.FC = () => {
  return (
    <div
      style={{
        width: "100%",
        maxWidth: 664,
        marginTop: 18,
        color: "#9ca3af",
        fontSize: 12,
        opacity: 0.9,
        textAlign: "center",
      }}
    >
      <div>© 2025 Matt Keefe. All rights reserved.</div>
      <div style={{ marginTop: 4 }}>
        Portions of this game were created with assistance from AI (ChatGPT,
        GitHub Copilot, and Suno).
      </div>
    </div>
  );
};

export default Footer;
