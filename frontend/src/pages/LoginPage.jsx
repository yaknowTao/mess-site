import { useState } from "react";
import { getMe, login } from "../services/api";
import "../styles/login.css";

export default function LoginPage({ onLogin }) {
  const [name, setName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(event) {
    event.preventDefault();
    setError("");

    if (!/^\d{10}$/.test(mobileNumber)) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }

    try {
      setLoading(true);
      const result = await login(name.trim(), mobileNumber, password);
      const accessToken = result.access_token;
      const user = await getMe(accessToken);

      localStorage.setItem("access_token", accessToken);
      localStorage.setItem("user", JSON.stringify(user));
      onLogin(user, accessToken);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-shell">
        <section className="login-brand-panel">
          <div className="login-brand">MessMate</div>

          <div className="login-brand-copy">
            <h2>Your meals, made simple.</h2>
            <p>Manage your daily meals, follow order progress, and keep track of payments from one place.</p>
          </div>

          <div className="login-brand-footer">Simple mess management for customers and admins.</div>
        </section>

        <section className="login-form-panel">
          <h1>Welcome back</h1>
          <p>Log in with your MessMate account.</p>

          <form className="login-form" onSubmit={handleLogin}>
            <label>
              Your name
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Enter your name"
                autoComplete="name"
                required
              />
            </label>

            <label>
              Mobile number
              <input
                type="tel"
                value={mobileNumber}
                onChange={(event) => setMobileNumber(event.target.value.replace(/\D/g, ""))}
                placeholder="10-digit mobile number"
                inputMode="numeric"
                maxLength={10}
                autoComplete="tel"
                required
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
              />
            </label>

            <button type="submit" disabled={loading}>
              {loading ? "Logging in..." : "Log in"}
            </button>
          </form>

          {error && <p className="login-error">{error}</p>}
        </section>
      </div>
    </main>
  );
}
