// src/pages/AuthPages.jsx
import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  User,
  Sun,
  Moon,
} from "lucide-react";
import { GoogleLogin } from "@react-oauth/google";
import { motion } from "framer-motion";

/* ===================== FLUID CURSOR BACKGROUND ===================== */

function FluidCursorBackground() {
  const canvasRef = useRef(null);
  const mouse = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const points = useRef([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resize();
    window.addEventListener("resize", resize);

    const onMove = (e) => {
      mouse.current.x = e.clientX;
      mouse.current.y = e.clientY;
    };

    window.addEventListener("mousemove", onMove);

    points.current = Array.from({ length: 14 }).map(() => ({
      x: mouse.current.x,
      y: mouse.current.y,
      vx: 0,
      vy: 0,
    }));

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      points.current.forEach((p, i) => {
        const dx = mouse.current.x - p.x;
        const dy = mouse.current.y - p.y;

        p.vx += dx * 0.02;
        p.vy += dy * 0.02;
        p.vx *= 0.85;
        p.vy *= 0.85;

        p.x += p.vx;
        p.y += p.vy;

        const radius = 180 - i * 10;
        const gradient = ctx.createRadialGradient(
          p.x,
          p.y,
          0,
          p.x,
          p.y,
          radius
        );

        gradient.addColorStop(0, "rgba(99,102,241,0.35)");
        gradient.addColorStop(0.4, "rgba(139,92,246,0.25)");
        gradient.addColorStop(1, "rgba(0,0,0,0)");

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fill();
      });

      requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0 pointer-events-none"
    />
  );
}

/* ===================== HELPERS (UNCHANGED) ===================== */

function updateUserStats(user) {
  if (!user) return;
  const emailKey = user.email || `no-email:${user.name || "User"}`;

  let stats = {};
  try {
    const raw = localStorage.getItem("user_stats");
    if (raw) stats = JSON.parse(raw) || {};
  } catch {}

  const existing = stats[emailKey] || {
    name: user.name || "User",
    email: user.email || "",
    loginCount: 0,
  };

  stats[emailKey] = {
    ...existing,
    loginCount: (existing.loginCount || 0) + 1,
  };

  localStorage.setItem("user_stats", JSON.stringify(stats));
}

/* ===================== PASSWORD STRENGTH ===================== */

function getStrength(password) {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { label: "Weak", color: "bg-red-500", width: "25%" };
  if (score === 2) return { label: "Fair", color: "bg-yellow-500", width: "50%" };
  if (score === 3) return { label: "Good", color: "bg-blue-500", width: "75%" };
  return { label: "Strong", color: "bg-green-500", width: "100%" };
}

/* ===================== THEME TOGGLE ===================== */

function useTheme() {
  const [theme, setTheme] = useState(
    localStorage.getItem("theme") || "dark"
  );

  useEffect(() => {
    document.documentElement.className = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  return [theme, setTheme];
}

/* ===================== LOGIN PAGE ===================== */

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();
  const [theme, setTheme] = useTheme();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const res = await fetch("http://localhost:8000/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Login failed");

      localStorage.setItem("user", JSON.stringify(data.user));
      updateUserStats(data.user);
      navigate("/dashboard");
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0C15] text-white flex items-center justify-center px-6 relative overflow-hidden">
      <FluidCursorBackground />

      {/* Theme Toggle */}
      <button
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        className="absolute top-6 right-6 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 transition"
      >
        {theme === "dark" ? <Sun /> : <Moon />}
      </button>

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
        className="relative z-10 w-full max-w-[620px] bg-[#151621]/70 backdrop-blur-xl rounded-3xl border border-white/10 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.9)]"
      >
        <div className="px-12 py-14">
          <motion.div
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ repeat: Infinity, duration: 4 }}
            className="flex justify-center mb-8 text-indigo-400 text-5xl font-black"
          >
            AI Analytics
          </motion.div>

          <h1 className="text-5xl font-extrabold mb-4 text-center">
            Welcome back
          </h1>
          <p className="text-xl text-slate-400 mb-12 text-center">
            Access your analytics workspace
          </p>

          <form onSubmit={handleSubmit} className="space-y-8">
            <BigInput
              label="Email Address"
              icon={<Mail />}
              value={email}
              onChange={setEmail}
              placeholder="name@company.com"
              type="email"
            />

            <BigPassword
              label="Password"
              value={password}
              onChange={setPassword}
              show={showPwd}
              toggle={() => setShowPwd(!showPwd)}
            />

            {error && (
              <p className="text-red-400 text-center">{error}</p>
            )}

            <button className="w-full py-6 text-2xl font-bold rounded-2xl bg-indigo-600 hover:bg-indigo-500 transition shadow-[0_0_40px_rgba(99,102,241,0.6)]">
              Sign In →
            </button>

            <div className="text-center text-slate-400 text-lg">OR</div>

            <div className="flex justify-center">
              <GoogleLogin
                onSuccess={async (response) => {
                  const res = await fetch("http://localhost:8000/auth/google", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id_token: response.credential }),
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.detail);
                  localStorage.setItem("user", JSON.stringify(data.user));
                  updateUserStats(data.user);
                  navigate("/dashboard");
                }}
                onError={() => setError("Google login failed")}
              />
            </div>
          </form>

          <div className="mt-10 text-center text-lg text-slate-400">
            New here?
            <Link to="/signup" className="ml-2 text-indigo-400 hover:underline">
              Create Account
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/* ===================== SIGNUP PAGE ===================== */

export function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const strength = getStrength(password);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirm)
      return setError("Passwords do not match.");

    setLoading(true);
    try {
      const res = await fetch("http://localhost:8000/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);

      localStorage.setItem("user", JSON.stringify(data.user));
      updateUserStats(data.user);
      navigate("/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0C15] flex items-center justify-center px-6 text-white relative overflow-hidden">
      <FluidCursorBackground />

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-[720px] bg-[#151621]/70 backdrop-blur-xl rounded-3xl border border-white/10 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.9)] px-14 py-16"
      >
        <h1 className="text-6xl font-extrabold mb-6">
          Create your account
        </h1>
        <p className="text-xl text-slate-400 mb-12">
          Start building insights with your data today.
        </p>

        <form onSubmit={handleSubmit} className="space-y-8">
          <BigInput label="Full Name" icon={<User />} value={name} onChange={setName} />
          <BigInput label="Email Address" icon={<Mail />} value={email} onChange={setEmail} type="email" />
          <BigPassword label="Password" value={password} onChange={setPassword} show={showPwd} toggle={() => setShowPwd(!showPwd)} />

          <div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div className={`h-full ${strength.color}`} style={{ width: strength.width }} />
            </div>
            <p className="mt-2 text-sm text-slate-400">
              Password strength: {strength.label}
            </p>
          </div>

          <BigPassword label="Confirm Password" value={confirm} onChange={setConfirm} show={showConfirm} toggle={() => setShowConfirm(!showConfirm)} />

          {error && <p className="text-red-400 text-center">{error}</p>}

          <button
            disabled={loading}
            className="w-full py-7 text-2xl font-bold rounded-2xl bg-indigo-600 hover:bg-indigo-500 transition shadow-[0_0_40px_rgba(99,102,241,0.6)]"
          >
            {loading ? "Creating account..." : "Create Account →"}
          </button>

          <div className="text-center text-lg text-slate-400">
            Already have an account?
            <Link to="/login" className="ml-2 text-indigo-400 hover:underline">
              Sign in
            </Link>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

/* ===================== REUSABLE INPUTS ===================== */

function BigInput({ label, icon, value, onChange, type = "text", placeholder }) {
  return (
    <div>
      <label className="text-lg font-medium mb-2 block">{label}</label>
      <div className="relative">
        <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400">
          {icon}
        </span>
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required
          className="w-full pl-14 pr-5 py-6 rounded-2xl bg-white/5 border border-white/10 text-xl focus:ring-2 focus:ring-indigo-500 outline-none"
        />
      </div>
    </div>
  );
}

function BigPassword({ label, value, onChange, show, toggle }) {
  return (
    <div>
      <label className="text-lg font-medium mb-2 block">{label}</label>
      <div className="relative">
        <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          className="w-full pl-14 pr-14 py-6 rounded-2xl bg-white/5 border border-white/10 text-xl focus:ring-2 focus:ring-indigo-500 outline-none"
        />
        <button
          type="button"
          onClick={toggle}
          className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400"
        >
          {show ? <EyeOff /> : <Eye />}
        </button>
      </div>
    </div>
  );
}

export default LoginPage;
