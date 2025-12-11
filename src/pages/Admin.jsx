// src/pages/Admin.jsx  (Profile & user stats page)
import React, { useState, useEffect } from "react";

export default function Admin() {
  // current profile (last logged-in user)
  const [user, setUser] = useState({ name: "", email: "" });
  const [editing, setEditing] = useState(false);

  // list of all users who have logged in (from localStorage.user_stats)
  const [stats, setStats] = useState([]);
  const [originalEmailKey, setOriginalEmailKey] = useState(null);

  // helper to build the key we use in localStorage.user_stats
  const makeKey = (u) =>
    u?.email && u.email !== ""
      ? u.email
      : u?.name
      ? `no-email:${u.name}`
      : null;

  useEffect(() => {
    // load current user
    let currentUser = { name: "", email: "" };
    try {
      const rawUser = localStorage.getItem("user");
      if (rawUser) {
        const parsed = JSON.parse(rawUser);
        currentUser = {
          name: parsed.name || "",
          email: parsed.email || "",
        };
      }
    } catch {
      // ignore parse error
    }
    setUser(currentUser);
    setOriginalEmailKey(makeKey(currentUser));

    // load stats
    let obj = {};
    try {
      const rawStats = localStorage.getItem("user_stats");
      if (rawStats) obj = JSON.parse(rawStats) || {};
    } catch {
      obj = {};
    }

    const list = Object.entries(obj).map(([key, value]) => ({
      key,
      name: value.name || "",
      email: value.email || "",
      loginCount: value.loginCount || 0,
    }));
    setStats(list);
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setUser((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = () => {
    // save current user profile
    localStorage.setItem("user", JSON.stringify(user));

    // also update stats entry for this user
    let obj = {};
    try {
      const raw = localStorage.getItem("user_stats");
      if (raw) obj = JSON.parse(raw) || {};
    } catch {
      obj = {};
    }

    const oldKey = originalEmailKey;
    const newKey = makeKey(user);

    // find existing entry (keep loginCount)
    let existing =
      (oldKey && obj[oldKey]) ||
      (newKey && obj[newKey]) || {
        name: user.name || "User",
        email: user.email || "",
        loginCount: 0,
      };

    // delete old key if changed
    if (oldKey && oldKey !== newKey) {
      delete obj[oldKey];
    }

    // write updated entry
    if (newKey) {
      obj[newKey] = {
        ...existing,
        name: user.name || existing.name,
        email: user.email || existing.email,
      };
    }

    localStorage.setItem("user_stats", JSON.stringify(obj));
    setOriginalEmailKey(newKey);

    // refresh list for UI
    const list = Object.entries(obj).map(([key, value]) => ({
      key,
      name: value.name || "",
      email: value.email || "",
      loginCount: value.loginCount || 0,
    }));
    setStats(list);

    setEditing(false);
  };

  const handleClear = () => {
    // clear current user + ALL stats
    localStorage.removeItem("user");
    localStorage.removeItem("user_stats");
    setUser({ name: "", email: "" });
    setStats([]);
    setOriginalEmailKey(null);
  };

  return (
    <div className="min-h-[calc(100vh-3rem)] p-4 sm:p-8">
      <div className="w-full max-w-4xl bg-white rounded-3xl shadow-xl p-6 sm:p-8">
        {/* Profile section */}
        <h1 className="text-2xl sm:text-3xl font-extrabold text-sky-700 mb-1">
          Profile
        </h1>
        <p className="text-sm text-gray-600 mb-6">
          Manage your account details and see which accounts have used this AI
          Dashboard.
        </p>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm text-gray-600 mb-1">Name</label>
            {editing ? (
              <input
                type="text"
                name="name"
                value={user.name}
                onChange={handleChange}
                className="w-full p-3 rounded-2xl border border-stone-200 focus:ring focus:ring-sky-200"
                placeholder="Your name"
              />
            ) : (
              <p className="w-full p-3 rounded-2xl bg-stone-50 text-gray-800">
                {user.name || "Not set"}
              </p>
            )}
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm text-gray-600 mb-1">Email</label>
            {editing ? (
              <input
                type="email"
                name="email"
                value={user.email}
                onChange={handleChange}
                className="w-full p-3 rounded-2xl border border-stone-200 focus:ring focus:ring-sky-200"
                placeholder="you@company.com"
              />
            ) : (
              <p className="w-full p-3 rounded-2xl bg-stone-50 text-gray-800 break-all">
                {user.email || "Not set"}
              </p>
            )}
          </div>
        </div>

        {/* Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 mt-6">
          {!editing ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="w-full sm:w-auto px-5 py-2.5 rounded-full bg-sky-500 text-white font-semibold hover:bg-sky-600 transition-all duration-200"
            >
              Edit
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSave}
              className="w-full sm:w-auto px-5 py-2.5 rounded-full bg-sky-500 text-white font-semibold hover:bg-sky-600 transition-all duration-200"
            >
              Save
            </button>
          )}

          <button
            type="button"
            onClick={handleClear}
            className="w-full sm:w-auto px-5 py-2.5 rounded-full bg-rose-500 text-white font-semibold hover:bg-rose-600 transition-all duration-200"
          >
            Clear items
          </button>
        </div>

        {/* Stats list */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">
            Users who visited this dashboard
          </h2>
          {stats.length === 0 ? (
            <p className="text-sm text-gray-500">
              No login history yet. Log in with an account to see it here.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-200">
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Email</th>
                    <th className="py-2 pr-4">Login count</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((s) => (
                    <tr
                      key={s.key}
                      className="border-b border-gray-100 last:border-b-0"
                    >
                      <td className="py-2 pr-4">{s.name || "Unknown"}</td>
                      <td className="py-2 pr-4 break-all">
                        {s.email || "Not set"}
                      </td>
                      <td className="py-2 pr-4">{s.loginCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}