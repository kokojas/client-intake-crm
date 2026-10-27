import { Inbox } from "lucide-react";
import { LoginForm } from "@/components/login-form";
import { demoEnabled, supabaseConfigured } from "@/lib/server/config";
export const dynamic = "force-dynamic";
export default function Login() { return <main className="standalone"><div className="standalone-card login"><a className="brand" href="/"><Inbox size={29} strokeWidth={1.8} /><span>intake</span></a><h1>Welcome to your workspace.</h1><p>A clear next step for every client request.</p>{supabaseConfigured() ? <LoginForm /> : <p className="error-message">The cloud workspace connection is not ready yet.</p>}{demoEnabled() && <a className="text-button" href="/">Return to sample workspace</a>}</div></main>; }
