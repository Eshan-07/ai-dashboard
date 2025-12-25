// src/pages/Admin.jsx
import React, { useState, useEffect } from "react";

export default function Admin() {
  /* ================= STATE ================= */
  const [user, setUser] = useState({ name: "", email: "" });
  const [editing, setEditing] = useState(false);
  const [stats, setStats] = useState([]);
  const [originalKey, setOriginalKey] = useState(null);
  const [theme, setTheme] = useState(
    () => localStorage.getItem("theme") || "dark"
  );

  /* ================= HELPERS ================= */
  const makeKey = (u) =>
    u?.email ? u.email : u?.name ? `no-email:${u.name}` : null;

  /* ================= INIT ================= */
  useEffect(() => {
    document.documentElement.classList.remove("dark", "light");
    document.documentElement.classList.add(theme);
    localStorage.setItem("theme", theme);

    // load user
    let currentUser = { name: "", email: "" };
    try {
      const raw = localStorage.getItem("user");
      if (raw) currentUser = JSON.parse(raw);
    } catch {}

    setUser({
      name: currentUser.name || "",
      email: currentUser.email || "",
    });

    const key = makeKey(currentUser);
    setOriginalKey(key);

    // load stats
    let obj = {};
    try {
      const rawStats = localStorage.getItem("user_stats");
      if (rawStats) obj = JSON.parse(rawStats) || {};
    } catch {}

    setStats(
      Object.entries(obj).map(([k, v]) => ({
        key: k,
        name: v.name || "",
        email: v.email || "",
        loginCount: v.loginCount || 0,
      }))
    );
  }, [theme]);

  /* ================= ACTIONS ================= */
  const toggleTheme = () =>
    setTheme((t) => (t === "dark" ? "light" : "dark"));

  const handleChange = (e) =>
    setUser((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleSave = () => {
    localStorage.setItem("user", JSON.stringify(user));

    let obj = {};
    try {
      const raw = localStorage.getItem("user_stats");
      if (raw) obj = JSON.parse(raw) || {};
    } catch {}

    const newKey = makeKey(user);
    const oldKey = originalKey;

    const existing =
      obj[oldKey] ||
      obj[newKey] || {
        name: user.name,
        email: user.email,
        loginCount: 0,
      };

    if (oldKey && oldKey !== newKey) delete obj[oldKey];

    obj[newKey] = {
      ...existing,
      name: user.name,
      email: user.email,
    };

    localStorage.setItem("user_stats", JSON.stringify(obj));
    setOriginalKey(newKey);

    setStats(
      Object.entries(obj).map(([k, v]) => ({
        key: k,
        name: v.name || "",
        email: v.email || "",
        loginCount: v.loginCount || 0,
      }))
    );

    setEditing(false);
  };

  /* ================= UI ================= */
  return (
    <div className="min-h-screen px-10 py-10 bg-gradient-to-br
      from-slate-100 to-slate-200
      dark:from-[#0b1020] dark:to-[#020617]
      text-slate-900 dark:text-white transition-colors">

      {/* HEADER */}
      <div className="flex justify-between items-start mb-12">
        <div>
          <h1 className="text-4xl font-bold">Profile Settings</h1>
          <p className="text-lg text-slate-500 dark:text-slate-400 mt-2">
            Manage personal details and dashboard access
          </p>
        </div>

        <button
          onClick={toggleTheme}
          className="px-6 py-3 rounded-xl bg-black/10 dark:bg-white/10 hover:scale-105 transition"
        >
          {theme === "dark" ? "☀ Light" : "🌙 Dark"}
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-10">
        {/* PROFILE CARD */}
        <div className="xl:col-span-5 bg-white/70 dark:bg-white/10
          backdrop-blur border rounded-3xl p-10">

          <div className="flex flex-col items-center">
            <div className="w-40 h-40 rounded-full bg-gradient-to-br
              from-indigo-500 to-purple-600 p-1">
              <div className="w-full h-full rounded-full
                bg-white dark:bg-black
                flex items-center justify-center text-5xl font-bold">
                {user.name ? user.name[0].toUpperCase() : "U"}
              </div>
            </div>

            <h2 className="mt-6 text-2xl font-semibold">
              {user.name || "Your Name"}
            </h2>
          </div>

          <div className="mt-10 space-y-6">
            {["name", "email"].map((field) => (
              <div key={field}>
                <label className="text-sm uppercase text-slate-500 dark:text-slate-400">
                  {field === "name" ? "Display Name" : "Email Address"}
                </label>

                {editing ? (
                  <input
                    name={field}
                    value={user[field]}
                    onChange={handleChange}
                    className="w-full mt-3 px-5 py-4 rounded-xl
                      bg-transparent border focus:outline-none"
                  />
                ) : (
                  <div className="w-full mt-3 px-5 py-4 rounded-xl
                    bg-black/5 dark:bg-black/30 border">
                    {user[field] || "Not set"}
                  </div>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={() => (editing ? handleSave() : setEditing(true))}
            className="mt-10 w-full py-4 rounded-xl bg-indigo-600 text-white
              hover:bg-indigo-700 transition text-xl font-semibold"
          >
            {editing ? "Save Profile" : "Edit Profile"}
          </button>
        </div>

        {/* STATS + TABLE */}
        <div className="xl:col-span-7 space-y-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <BigStat label="Account Status" value="Active Pro" />
            <BigStat label="Last Login" value="2 Hours Ago" />
            <BigStat label="Team Members" value="1 Active" />
          </div>

          <div className="bg-white/70 dark:bg-white/10 backdrop-blur
            border rounded-3xl">
            <div className="p-8 border-b">
              <h3 className="text-2xl font-semibold">
                Users Who Visited This Dashboard
              </h3>
            </div>

            <table className="w-full text-lg">
              <thead className="text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="p-6 text-left">User</th>
                  <th className="p-6 text-left">Email</th>
                  <th className="p-6 text-right">Login Count</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => (
                  <tr key={s.key} className="border-t">
                    <td className="p-6">{s.name}</td>
                    <td className="p-6">{s.email}</td>
                    <td className="p-6 text-right">
                      <span className="px-5 py-2 rounded-full
                        bg-indigo-500/20 text-indigo-600 dark:text-indigo-300">
                        {s.loginCount} Logins
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function BigStat({ label, value }) {
  return (
    <div className="bg-white/70 dark:bg-white/10 backdrop-blur
      border rounded-2xl p-8">
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-3 text-2xl font-semibold">{value}</p>
    </div>
  );
}
