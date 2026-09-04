import { useState } from "react";

export default function Login({ onSubmit }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!password || loading) return;
    setLoading(true);
    setError("");
    try {
      await onSubmit(password);
    } catch (err) {
      setError(
        err.message === "unauthorized"
          ? "That password isn't right."
          : "Couldn't reach the server. Try again."
      );
      setPassword("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div
        className="glow-orb"
        style={{ width: 520, height: 520, top: -180, left: "50%", transform: "translateX(-50%)" }}
      />
      <div className="noise" />

      <form onSubmit={handleSubmit} className="card login-card">
        <div className="login-mark">N</div>
        <h1 className="login-title">Notes</h1>
        <p className="login-subtitle">Enter your password to continue.</p>

        <label htmlFor="password" className="login-label">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="field login-input"
        />

        {error && <p className="login-error">{error}</p>}

        <button type="submit" disabled={loading} className="btn btn-primary login-button">
          {loading ? "Unlocking…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}
