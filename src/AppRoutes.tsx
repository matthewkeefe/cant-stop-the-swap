import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import TitlePage from './pages/TitlePage';
import ScorePage from './pages/ScorePage';
import OptionsPage from './pages/OptionsPage';
import LevelSelectPage from './pages/LevelSelectPage';
import App from './App';
import CongratulationsPage from './pages/CongratulationsPage';

const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<TitlePage />} />
      <Route path="/play" element={<App />} />
      <Route path="/levels" element={<LevelSelectPage />} />
      <Route path="/options" element={<OptionsPage />} />
      <Route path="/scores" element={<ScorePage />} />
      <Route path="/you-beat" element={<CongratulationsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default AppRoutes;
