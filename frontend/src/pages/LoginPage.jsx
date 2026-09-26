import { useState } from "react";
import { requestOtp, verifyOtp } from "../services/api";

export default function LoginPage({ onLogin }) {
  const [name, setName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [otp, setOtp] = useState("");

  const [otpRequested, setOtpRequested] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handleRequestOtp(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!/^\d{10}$/.test(mobileNumber)) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }

    try {
      setLoading(true);

      const result = await requestOtp(name, mobileNumber);

      setOtpRequested(true);
      setMessage(result.message || "OTP requested. Check the backend terminal.");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    try {
      setLoading(true);

      const result = await verifyOtp(name, mobileNumber, otp);

      // Store the token and user for this development version.
      localStorage.setItem("access_token", result.access_token);
      localStorage.setItem("user", JSON.stringify(result.user));

      onLogin(result.user, result.access_token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <h1>Welcome to MessMate</h1>
      <p>Log in with your mobile number to continue.</p>

      {!otpRequested ? (
        <form onSubmit={handleRequestOtp}>
          <label>
            Your name
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Enter your name"
              required
            />
          </label>

          <label>
            Mobile number
            <input
              type="tel"
              value={mobileNumber}
              onChange={(event) => setMobileNumber(event.target.value)}
              placeholder="10-digit mobile number"
              inputMode="numeric"
              maxLength={10}
              required
            />
          </label>

          <button type="submit" disabled={loading}>
            {loading ? "Requesting..." : "Get OTP"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp}>
          <p>Enter the OTP for {mobileNumber}.</p>

          <label>
            OTP
            <input
              type="text"
              value={otp}
              onChange={(event) => setOtp(event.target.value)}
              placeholder="Enter OTP"
              inputMode="numeric"
              maxLength={6}
              required
            />
          </label>

          <button type="submit" disabled={loading}>
            {loading ? "Verifying..." : "Verify and Login"}
          </button>

          <button
            type="button"
            onClick={() => {
              setOtpRequested(false);
              setOtp("");
              setError("");
              setMessage("");
            }}
          >
            Change mobile number
          </button>
        </form>
      )}

      {message && <p>{message}</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}