// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import App from "./App";
import "./index.css";

// Vite env variable (use import.meta.env)
const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

if (!clientId) {
  // eslint-disable-next-line no-console
  console.warn(
    "VITE_GOOGLE_CLIENT_ID is NOT set. Google OAuth will fail with missing client_id. " +
      "Make sure .env contains VITE_GOOGLE_CLIENT_ID and restart the dev server."
  );
} else {
  // eslint-disable-next-line no-console
  console.log("Google Client ID loaded:", clientId);
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={clientId}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </GoogleOAuthProvider>
  </React.StrictMode>
);
