import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import Header from "../components/Header";
import MenuList from "../components/MenuList";
import { getDaysOff } from "../services/api";
import CustomerTransactions from "./CustomerTransactions";
import "../styles/dashboard-layout.css";
import "../styles/customer-dayoff-additions.css";

function CustomerHome({ user, token }) {
  const [daysOff, setDaysOff] = useState([]);
  useEffect(() => { const today = new Date(); const end = new Date(today); end.setDate(end.getDate() + 90); const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; getDaysOff(token, fmt(today), fmt(end)).then(setDaysOff).catch(() => {}); }, [token]);
  return (
    <section className="dashboard-page">
      <h2>Welcome to your dashboard</h2>
      {daysOff.length > 0 && <div className="mess-day-off-banner"><strong>Upcoming mess holidays</strong><span>{daysOff.slice(0,5).map(day => `${day.date}${day.reason ? ` — ${day.reason}` : ""}`).join(" · ")}</span></div>}
      <p>Hello {user.name}! Manage your meals and review your account.</p>
      <div className="dashboard-cards">
        <NavLink className="dashboard-card dashboard-card-link" to="/customer/orders">
          <h3>My Orders</h3>
          <p>View today’s and upcoming orders, edit eligible orders, and track progress.</p>
        </NavLink>
        <NavLink className="dashboard-card dashboard-card-link" to="/customer/transactions">
          <h3>Transactions</h3>
          <p>Review completed meal dues, deposits, payments, and payment requests.</p>
        </NavLink>
      </div>
    </section>
  );
}

export default function CustomerDashboard({ token, user, onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="app-layout">
      {menuOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={closeMenu} />}
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`} aria-hidden={!menuOpen}>
        <div className="sidebar-topline">
          <h2 className="sidebar-logo">MessMate</h2>
          <button type="button" className="sidebar-close" onClick={closeMenu} aria-label="Close menu">×</button>
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/customer/home" onClick={closeMenu}>Home</NavLink>
          <NavLink to="/customer/orders" onClick={closeMenu}>My Orders</NavLink>
          <NavLink to="/customer/transactions" onClick={closeMenu}>Transactions</NavLink>
        </nav>
        <button type="button" className="logout-button" onClick={onLogout}>Logout</button>
      </aside>

      <main className="main-content">
        <div className="customer-topbar">
          <button type="button" className="menu-toggle" onClick={() => setMenuOpen(true)} aria-label="Open navigation" aria-expanded={menuOpen}>☰</button>
          <Header name={user.name} />
        </div>
        <Routes>
          <Route index element={<Navigate to="home" replace />} />
          <Route path="home" element={<CustomerHome user={user} token={token} />} />
          <Route path="orders" element={<MenuList token={token} />} />
          <Route path="transactions" element={<CustomerTransactions token={token} />} />
          <Route path="*" element={<Navigate to="home" replace />} />
        </Routes>
      </main>
    </div>
  );
}
