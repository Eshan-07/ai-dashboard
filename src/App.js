// src/App.js
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import SidebarLayout from "./components/SidebarLayout";

import Dashboard from "./pages/Dashboard";
import Upload from "./pages/Upload";
import History from "./pages/History";
import Admin from "./pages/Admin";

// your login & signup pages
import LoginPage, { SignupPage } from "./pages/AuthPages";

// Chart suggestions panel (make sure this file exists)
import ChartSuggestionsPanel from "./components/ChartSuggestionsPanel";

// Google OAuth
// import { GoogleOAuthProvider } from "@react-oauth/google";
// const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;

function App() {
  // default dataset id used for ChartSuggestionsPanel — change to match your selection flow
  const defaultDatasetId =
    "facacdcc27bc4ffe8bd5c09864e391e4__House_Price_India.csv";

  return (
    <Routes>
      {/* ---------- AUTH ROUTES (no sidebar) ---------- */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />

      {/* ---------- DASHBOARD ROUTES (with sidebar) ---------- */}
      <Route path="/" element={<SidebarLayout />}>
        {/* IMPORTANT: go to /login first, not /dashboard */}
        <Route index element={<Navigate to="/login" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="upload" element={<Upload />} />
        <Route path="history" element={<History />} />

        {/* 🔁 CHANGED: /admin → /profile (still using Admin component for now) */}
        <Route path="profile" element={<Admin />} />

        {/* Chart suggestions route (renders inside the sidebar layout) */}
        <Route
          path="charts"
          element={
            <ChartSuggestionsPanel datasetId={defaultDatasetId} />
          }
        />
      </Route>

      {/* anything unknown → go to login */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;