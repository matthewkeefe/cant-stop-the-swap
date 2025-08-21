import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import TitlePage from "./pages/TitlePage";
import OptionsPage from "./pages/OptionsPage";
import App from "./App";

const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<TitlePage />} />
      <Route path="/play" element={<App />} />
      <Route path="/options" element={<OptionsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default AppRoutes;
