// src/components/SidebarLayout.jsx
import React, { useState, useEffect } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  Home,
  Upload,
  Clock,
  UserCircle,
  LogOut,
  ChevronsLeft,
  ChevronsRight,
  BarChart3,
} from "lucide-react";

export default function SidebarLayout() {
  const [open, setOpen] = useState(true);

  /* ---------------- APPLY THEME (READ-ONLY) ---------------- */
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") || "dark";
    document.documentElement.classList.toggle(
      "dark",
      savedTheme === "dark"
    );
  }, []);

  /* ---------------- RESTORE SIDEBAR STATE ---------------- */
  useEffect(() => {
    const saved = localStorage.getItem("ai_dashboard_sidebar_open");
    if (saved !== null) {
      setOpen(saved === "true");
    }
  }, []);

  /* ---------------- SAVE SIDEBAR STATE ---------------- */
  useEffect(() => {
    localStorage.setItem(
      "ai_dashboard_sidebar_open",
      open ? "true" : "false"
    );
  }, [open]);

  /* ---------------- LOGOUT ---------------- */
  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/login";
  };

  /* ---------------- STYLES ---------------- */
  const baseLink =
    "group flex items-center gap-4 px-6 py-4 rounded-2xl text-lg font-semibold transition-all duration-300";

  const activeLink =
    "bg-indigo-600 text-white shadow-lg scale-[1.03]";

  const inactiveLink =
    "text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-white/10";

  return (
    <div className="flex min-h-screen bg-slate-100 dark:bg-slate-950">
      {/* ================= SIDEBAR ================= */}
      <aside
        className={`relative z-40 flex flex-col justify-between
        transition-all duration-300 border-r
        bg-gradient-to-b
        from-slate-100 to-slate-200
        dark:from-[#0b1020] dark:to-[#070b18]
        border-slate-300 dark:border-white/10
        ${open ? "w-80" : "w-24"}`}
      >
        {/* TOP */}
        <div>
          {/* Brand */}
          <div
            className={`flex items-center gap-4 px-6 py-6 ${
              open ? "justify-start" : "justify-center"
            }`}
          >
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center">
              <BarChart3 size={26} className="text-white" />
            </div>
            {open && (
              <span className="text-2xl font-bold text-slate-900 dark:text-white">
                AI Analytics
              </span>
            )}
          </div>

          {/* Navigation */}
          <nav className="px-4 space-y-4 mt-6">
            {[
              { to: "/dashboard", icon: Home, label: "Dashboard" },
              { to: "/upload", icon: Upload, label: "Upload Data" },
              { to: "/history", icon: Clock, label: "History" },
              { to: "/profile", icon: UserCircle, label: "Profile" },
            ].map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `${baseLink} ${isActive ? activeLink : inactiveLink}`
                }
              >
                <Icon
                  size={24}
                  className="transition-transform duration-300 group-hover:scale-110"
                />
                {open && <span>{label}</span>}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* BOTTOM */}
        <div className="px-4 pb-6">
          <button
            onClick={handleLogout}
            className="flex items-center justify-center gap-3 w-full
              bg-rose-500 hover:bg-rose-600
              text-white px-6 py-4 rounded-2xl text-lg transition"
          >
            <LogOut size={22} />
            {open && <span>Logout</span>}
          </button>
        </div>

        {/* SIDEBAR TOGGLE (ONLY SIDEBAR, NOT THEME) */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="absolute -right-4 top-1/2 -translate-y-1/2
          p-3 rounded-full shadow-xl transition
          bg-indigo-600 text-white hover:scale-110"
          title="Toggle sidebar"
        >
          {open ? <ChevronsLeft size={22} /> : <ChevronsRight size={22} />}
        </button>
      </aside>

      {/* ================= MAIN ================= */}
      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
