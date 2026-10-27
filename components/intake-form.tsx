"use client";
import { useRef, useState } from "react";
import { ArrowRight, CheckCircle2, LoaderCircle } from "lucide-react";

export function IntakeForm({ token, owner = false, aiEnabled = false, onSaved }: { token?: string; owner?: boolean; aiEnabled?: boolean; onSaved?: (id: string, message: string) => void }) {
  const eventKey = useRef<string>("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [received, setReceived] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    if (!eventKey.current) eventKey.current = crypto.randomUUID();
    const data = new FormData(event.currentTarget);
    const intake = { eventKey: eventKey.current, name: String(data.get("name") ?? ""), email: String(data.get("email") ?? ""), company: String(data.get("company") ?? ""), message: String(data.get("message") ?? "") };
    try {
      const response = await fetch(owner ? "/api/requests" : `/api/intake/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(owner ? { intake, prepare: aiEnabled && data.get("prepare") === "on" } : intake) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Your request could not be saved.");
      if (owner && onSaved) onSaved(result.id, result.analysisError || (result.duplicate ? "This request was already saved. No duplicate was created." : "Request saved."));
      else setReceived(true);
    } catch (error) { setError(error instanceof Error ? error.message : "Something went wrong. Please try again."); }
    finally { setBusy(false); }
  }
  if (received) return <div className="success-state" role="status"><CheckCircle2 size={40} /><h2>Request received.</h2><p>Thank you. Your message is safely in the inbox and ready for review.</p><p className="muted">Please keep a copy of your message for your records.</p></div>;
  return <form className="intake-form" onSubmit={submit}>
    <div className="form-row"><label>Your name<input name="name" required minLength={2} maxLength={120} autoComplete="name" placeholder="Alex Morgan" /></label><label>Email address<input name="email" required type="email" maxLength={254} autoComplete="email" placeholder="alex@company.com" /></label></div>
    <label>Company <span className="optional">optional</span><input name="company" maxLength={160} autoComplete="organization" placeholder="Your company or team" /></label>
    <label>What would you like to automate?<textarea name="message" required minLength={20} maxLength={10000} rows={7} placeholder="Tell us about the task, the tools you use, and what a good result would look like. Include a budget or deadline if you have one." /></label>
    {owner && aiEnabled && <label className="checkbox-label"><input type="checkbox" name="prepare" defaultChecked />Prepare an AI brief after saving</label>}
    <p className="form-note">Share only information needed for the request. Avoid passwords, API keys and other secrets.</p>
    {error && <div className="error-message" role="alert">{error}</div>}
    <button className="button primary submit-button" disabled={busy} type="submit">{busy ? <><LoaderCircle className="spin" size={17} />Saving your request...</> : <>{owner ? "Save request" : "Send request"}<ArrowRight size={17} /></>}</button>
  </form>;
}
