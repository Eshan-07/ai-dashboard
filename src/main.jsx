// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import App from "./App";
import "./index.css";

// Read Google Client ID from Vite env
const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// Debug log (keep this until OAuth works)
console.log("Google Client ID loaded:", clientId);

// Optional warning if env is missing
if (!clientId) {
  console.warn(
    "VITE_GOOGLE_CLIENT_ID is NOT set. Google OAuth will not work."
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {clientId ? (
      <GoogleOAuthProvider clientId={clientId}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </GoogleOAuthProvider>
    ) : (
      <BrowserRouter>
        <App />
      </BrowserRouter>
    )}
  </React.StrictMode>
);
