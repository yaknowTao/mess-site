import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import Header from "../components/Header";
import MenuList from "../components/MenuList";
import CustomerTransactions from "./CustomerTransactions";
import "../styles/dashboard-layout.css";

function CustomerHome({ user }) {
  return (
    <section className="dashboard-page">
      <h2>Welcome to your dashboard</h2>
      <p>
        Hello {user.name}! Use the menu to manage your meals and check
        your payments.
      </p>

      <div className="dashboard-cards">
        <article className="dashboard-card">
          <h3>My Orders</h3>
          <p>Choose your lunch or dinner and view your order history.</p>
        </article>

        <article className="dashboard-card">
          <h3>Transactions</h3>
          <p>Check deposits, payments, and your account balance.</p>
        </article>
      </div>
    </section>
  );
}

export default function CustomerDashboard({ token, user, onLogout }) {
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <h2 className="sidebar-logo">MessMate</h2>

        <nav className="sidebar-nav">
          <NavLink to="/customer/home">
            Home
          </NavLink>

          <NavLink to="/customer/orders">
            My Orders
          </NavLink>

          <NavLink to="/customer/transactions">
            Transactions
          </NavLink>
        </nav>

        <button
          type="button"
          className="logout-button"
          onClick={onLogout}
        >
          Logout
        </button>
      </aside>

      <main className="main-content">
        <Header name={user.name} />

        <Routes>
          <Route
            index
            element={<Navigate to="home" replace />}
          />

          <Route
            path="home"
            element={<CustomerHome user={user} />}
          />

          <Route
            path="orders"
            element={<MenuList token={token} />}
          />

          <Route
            path="transactions"
            element={<CustomerTransactions token={token} />}
          />

          <Route
            path="*"
            element={<Navigate to="home" replace />}
          />
        </Routes>
      </main>
    </div>
  );
}