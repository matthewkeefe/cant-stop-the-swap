import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { HashRouter } from "react-router-dom";
import AppRoutes from "./AppRoutes";
import { GameProvider } from "./context/GameProvider";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <GameProvider>
        <AppRoutes />
      </GameProvider>
    </HashRouter>
  </StrictMode>
);
