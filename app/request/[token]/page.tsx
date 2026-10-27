import { Inbox } from "lucide-react";
import { IntakeForm } from "@/components/intake-form";
export default async function RequestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <main className="standalone"><div><div className="standalone-card"><div className="brand"><Inbox size={29} strokeWidth={1.8} /><span>intake</span></div><h1>Less busywork.<br />More room for your work.</h1><p>Have a process you'd like to improve? Tell us what happens today and what you'd like to change.</p><IntakeForm token={token} /></div><p className="standalone-footer">Your message is saved for review. No quote or commitment is made automatically.</p></div></main>;
}
