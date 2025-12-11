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
} from "lucide-react";

export default function SidebarLayout() {
  const [open, setOpen] = useState(true);

  // Load sidebar state
  useEffect(() => {
    const saved = localStorage.getItem("ai_dashboard_sidebar_open");
    if (saved !== null) setOpen(saved === "true");
  }, []);

  useEffect(() => {
    localStorage.setItem("ai_dashboard_sidebar_open", open ? "true" : "false");
  }, [open]);

  // Logout handler – IMPORTANT: do not clear user_stats here
  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    // hard redirect so app resets UI, but storage (user_stats) stays
    window.location.href = "/login";
  };

  const baseLinkClasses =
    "flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-300 text-sm font-medium";

  const activeClasses = "bg-sky-400 text-white scale-105 transform shadow";
  const inactiveClasses = "text-gray-700 hover:bg-sky-50 hover:text-sky-600";

  return (
    <div className="flex min-h-screen bg-stone-50">
      {/* Sidebar */}
      <aside
        className={`relative bg-white shadow-lg border-r border-stone-100 transition-all duration-300 flex flex-col justify-between
          ${open ? "w-64" : "w-20"}`}
        aria-label="Primary navigation"
      >
        <div>
          {/* Title */}
          <div
            className={`flex items-center gap-3 p-6 ${
              open ? "justify-start" : "justify-center"
            }`}
          >
            <div className="w-10 h-10 rounded-full bg-sky-100 flex items-center justify-center">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden
              >
                <path
                  d="M3 12h18"
                  stroke="#0ea5e9"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="M3 6h18"
                  stroke="#7dd3fc"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>

            {open && (
              <h2 className="text-2xl font-extrabold text-sky-700">
                AI Dashboard
              </h2>
            )}
          </div>

          {/* NAV LINKS */}
          <nav className="flex flex-col px-4 py-2 space-y-2" aria-label="Main">
            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                `${baseLinkClasses} ${
                  isActive ? activeClasses : inactiveClasses
                }`
              }
              title="Dashboard"
            >
              <Home size={18} />
              {open && <span>Dashboard</span>}
            </NavLink>

            <NavLink
              to="/upload"
              className={({ isActive }) =>
                `${baseLinkClasses} ${
                  isActive ? activeClasses : inactiveClasses
                }`
              }
              title="Upload"
            >
              <Upload size={18} />
              {open && <span>Upload</span>}
            </NavLink>

            <NavLink
              to="/history"
              className={({ isActive }) =>
                `${baseLinkClasses} ${
                  isActive ? activeClasses : inactiveClasses
                }`
              }
              title="History"
            >
              <Clock size={18} />
              {open && <span>History</span>}
            </NavLink>

            {/* Profile */}
            <NavLink
              to="/profile"
              className={({ isActive }) =>
                `${baseLinkClasses} ${
                  isActive ? activeClasses : inactiveClasses
                }`
              }
              title="Profile"
            >
              <UserCircle size={18} />
              {open && <span>Profile</span>}
            </NavLink>
          </nav>

          {/* Logout */}
          <div className="px-4 mt-4">
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center justify-center gap-2 w-full bg-rose-500 text-white px-3 py-2 rounded-full hover:bg-rose-600 transition-all duration-300"
            >
              <LogOut size={16} />
              {open && <span>Logout</span>}
            </button>
          </div>
        </div>

        {/* Toggle Button */}
        <div className="p-4">
          <button
            onClick={() => setOpen((s) => !s)}
            aria-expanded={open}
            className={`absolute -right-3 top-1/2 translate-y-[-50%] p-2 rounded-full shadow-lg 
              ${open ? "bg-white" : "bg-sky-500 text-white"}`}
          >
            {open ? <ChevronsLeft size={18} /> : <ChevronsRight size={18} />}
          </button>
        </div>
      </aside>

      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}