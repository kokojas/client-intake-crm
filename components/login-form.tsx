"use client";
import { useState } from "react";
export function LoginForm() {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  return <form className="login-form" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: form.get("email") }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setMessage("Check your inbox for a secure sign-in link. Open it in this browser.");
    } catch (error) { setError(error instanceof Error ? error.message : "Sign in is unavailable."); }
    finally { setBusy(false); }
  }}><label>Email address<input type="email" name="email" autoComplete="email" placeholder="you@example.com" required /></label>{error && <div className="error-message" role="alert">{error}</div>}{message && <p className="login-status" role="status">{message}</p>}<button className="button primary" disabled={busy}>{busy ? "Sending sign-in link..." : "Email me a sign-in link"}</button><p className="form-note">No password needed. This workspace is reserved for its owner.</p></form>;
}
