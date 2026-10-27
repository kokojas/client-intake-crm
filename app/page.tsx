import { redirect } from "next/navigation";
import WorkspaceApp from "@/components/workspace-app";
import { AppError } from "@/lib/domain";
import { workspacePayload } from "@/lib/server/context";
export const dynamic = "force-dynamic";
export default async function Home() {
  try { return <WorkspaceApp initial={await workspacePayload()} />; }
  catch (error) { if (error instanceof AppError && error.status === 401) redirect("/login"); return <main className="standalone"><div className="standalone-card"><h1>Your workspace is almost ready.</h1><p>The database connection or owner sign-in still needs to be completed.</p><a className="button primary" href="/login">Open sign in</a></div></main>; }
}
