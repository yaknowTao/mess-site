import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import LoginPage from "./pages/LoginPage";
import ChangePasswordPage from "./pages/ChangePasswordPage";
import AdminDashboard from "./pages/AdminDashboard";
import CustomerDashboard from "./pages/CustomerDashboard";
import { getMe } from "./services/api";
import Header from "./components/Header";

function AppContent() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() =>
    localStorage.getItem("access_token")
  );
  const [checkingLogin, setCheckingLogin] = useState(true);

  useEffect(() => {
    async function checkLogin() {
      const savedToken = localStorage.getItem("access_token");

      if (!savedToken) {
        setCheckingLogin(false);
        return;
      }

      try {
        const currentUser = await getMe(savedToken);
        setUser(currentUser);
        setToken(savedToken);
      } catch {
        localStorage.removeItem("access_token");
        localStorage.removeItem("user");
        setUser(null);
        setToken(null);
      } finally {
        setCheckingLogin(false);
      }
    }

    checkLogin();
  }, []);

  function handleLogin(userData, accessToken) {
    localStorage.setItem("access_token", accessToken);
    localStorage.setItem("user", JSON.stringify(userData));

    setUser(userData);
    setToken(accessToken);
  }

  function handleLogout() {
    localStorage.removeItem("user");
    localStorage.removeItem("access_token");

    setUser(null);
    setToken(null);
  }

  async function handlePasswordChanged() {
    const updatedUser = await getMe(token);

    localStorage.setItem("user", JSON.stringify(updatedUser));
    setUser(updatedUser);
  }

  if (checkingLogin) {
    return <p>Checking your login...</p>;
  }

  if (!user || !token) {
    return <LoginPage onLogin={handleLogin} />;
  }

  if (user.must_change_password) {
    return (
      <ChangePasswordPage
        token={token}
        onPasswordChanged={handlePasswordChanged}
      />
    );
  }

  if (user.role === "admin") {
    return (
      <Routes>
        <Route
          path="/admin/*"
          element={
            <main>
              <Header name={user.name} />
              <button onClick={handleLogout}>Logout</button>
              <AdminDashboard token={token} />
            </main>
          }
        />

        <Route
          path="*"
          element={<Navigate to="/admin" replace />}
        />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route
        path="/customer/*"
        element={
          <CustomerDashboard
            token={token}
            user={user}
            onLogout={handleLogout}
          />
        }
      />
      <Route
        path="*"
        element={<Navigate to="/customer/home" replace />}
      />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}