// src/pages/AuthPages.jsx
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, Eye, EyeOff, User } from "lucide-react";
import { GoogleLogin } from "@react-oauth/google";

// ---- helpers to store profile + stats in localStorage ----
function updateUserStats(user) {
  if (!user) return;
  const emailKey = user.email || `no-email:${user.name || "User"}`;

  let stats = {};
  try {
    const raw = localStorage.getItem("user_stats");
    if (raw) stats = JSON.parse(raw) || {};
  } catch {
    stats = {};
  }

  const existing = stats[emailKey] || {
    name: user.name || "User",
    email: user.email || "",
    loginCount: 0,
  };

  const updated = {
    ...existing,
    name: user.name || existing.name,
    email: user.email || existing.email,
    loginCount: (existing.loginCount || 0) + 1, // increment only
  };

  stats[emailKey] = updated;
  localStorage.setItem("user_stats", JSON.stringify(stats));
}

function decodeGoogleCredential(credential) {
  try {
    const payload = JSON.parse(atob(credential.split(".")[1]));
    return {
      name: payload.name || "Google User",
      email: payload.email || "",
    };
  } catch {
    return { name: "Google User", email: "" };
  }
}

// ---------------- LOGIN PAGE ----------------
export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();

  console.log(
    "DEBUG GOOGLE CLIENT ID:",
    process.env.REACT_APP_GOOGLE_CLIENT_ID
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Please enter email and password.");
      return;
    }

    try {
      const res = await fetch("http://localhost:8000/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Login failed");
      }

      // Success
      console.log("Email login success:", data);

      const user = data.user;
      localStorage.setItem("user", JSON.stringify(user));
      updateUserStats(user);

      navigate("/dashboard");

    } catch (err) {
      console.error("Login error:", err);
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6 font-inter text-gray-800">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <h1 className="text-2xl font-extrabold text-sky-700 mb-1">
          Welcome back
        </h1>
        <p className="text-sm text-gray-600 mb-6">
          Log in to access your AI Dashboard
        </p>

        {/* ---------------- EMAIL LOGIN FORM ---------------- */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div>
            <label className="block text-sm text-gray-600">Email</label>
            <div className="mt-2 relative">
              <Mail
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="email"
                className="w-full p-3 pl-10 rounded-2xl border border-stone-200 focus:ring focus:ring-sky-200"
                placeholder="you@company.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm text-gray-600">Password</label>
            <div className="mt-2 relative">
              <Lock
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />

              <input
                type={showPwd ? "text" : "password"}
                className="w-full p-3 pl-10 pr-10 rounded-2xl border border-stone-200 focus:ring focus:ring-sky-200"
                placeholder="••••••••"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              <button
                type="button"
                onClick={() => setShowPwd((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
              >
                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <p className="text-red-500 text-sm mt-2 text-center">{error}</p>
          )}

          {/* Submit button */}
          <button
            type="submit"
            className="w-full py-3 rounded-full bg-sky-500 text-white font-semibold hover:bg-sky-600 transition-colors"
          >
            Sign in
          </button>

          {/* Links */}
          <div className="flex justify-between text-sm mt-2">
            <Link to="/signup" className="underline">
              Create account
            </Link>
            <Link to="/forgot" className="underline">
              Forgot password?
            </Link>
          </div>
        </form>

        {/* ---------------- GOOGLE LOGIN BUTTON ---------------- */}
        <div className="mt-6">
          <div className="text-center text-gray-500 mb-2">or</div>

          <div className="flex justify-center">
            <GoogleLogin
              onSuccess={async (response) => {
                console.log("Google Login success:", response);
                setError("");

                try {
                  const { credential } = response;
                  // Call backend
                  const res = await fetch("http://localhost:8000/auth/google", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id_token: credential }),
                  });

                  if (!res.ok) {
                    const errData = await res.json();
                    throw new Error(errData.detail || "Login failed");
                  }

                  const data = await res.json();
                  console.log("Backend auth success:", data);

                  // Save user from backend response
                  const user = data.user;
                  // Ensure name/email are present
                  localStorage.setItem("user", JSON.stringify(user));

                  updateUserStats(user);
                  navigate("/dashboard");

                } catch (err) {
                  console.error("Backend login error:", err);
                  setError(err.message || "Login failed. Please try again.");
                }
              }}
              onError={() => {
                console.log("Google Login Failed");
                setError("Google login failed. Try again.");
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------- SIGNUP PAGE ----------------
export function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!name || !email || !password || !confirm) {
      setError("Please fill all fields.");
      return;
    }

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("http://localhost:8000/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Signup failed");
      }

      // Success
      console.log("Signup success:", data);

      const user = data.user;
      localStorage.setItem("user", JSON.stringify(user));
      updateUserStats(user);

      // Navigate to dashboard (same as login)
      navigate("/dashboard");

    } catch (err) {
      console.error("Signup error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6 font-inter text-gray-800">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <h1 className="text-2xl font-extrabold text-sky-700 mb-1">
          Create your account
        </h1>
        <p className="text-sm text-gray-600 mb-6">
          Start building insights with your data.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm text-gray-600">Full name</label>
            <div className="mt-2 relative">
              <User
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                className="w-full p-3 pl-10 rounded-2xl border border-stone-200 focus:ring focus:ring-sky-200"
                placeholder="Jane Doe"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm text-gray-600">Email</label>
            <div className="mt-2 relative">
              <Mail
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="email"
                className="w-full p-3 pl-10 rounded-2xl border border-stone-200 focus:ring focus:ring-sky-200"
                placeholder="you@company.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm text-gray-600">Password</label>
            <div className="mt-2 relative">
              <Lock
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type={showPwd ? "text" : "password"}
                className="w-full p-3 pl-10 pr-10 rounded-2xl border border-stone-200 focus:ring focus:ring-sky-200"
                placeholder="Create a strong password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPwd((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
              >
                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-sm text-gray-600">
              Confirm password
            </label>
            <div className="mt-2 relative">
              <Lock
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type={showConfirmPwd ? "text" : "password"}
                className="w-full p-3 pl-10 pr-10 rounded-2xl border border-stone-200 focus:ring focus:ring-sky-200"
                placeholder="Repeat password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPwd((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
              >
                {showConfirmPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="text-red-500 text-sm mt-2 text-center">{error}</p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3 rounded-full bg-sky-500 text-white font-semibold hover:bg-sky-600 transition-colors ${loading ? "opacity-70 cursor-not-allowed" : ""
              }`}
          >
            {loading ? "Creating account..." : "Create account"}
          </button>

          <div className="flex justify-center text-sm mt-2 text-gray-600">
            <span>Already have an account?</span>
            <Link to="/login" className="underline ml-2">
              Sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

export default LoginPage;