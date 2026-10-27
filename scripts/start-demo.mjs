import { spawn } from "node:child_process";

// An inherited API key must never silently turn a portfolio demo into paid traffic.
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3100"], {
  stdio: "inherit",
  env: { ...process.env, CRM_DEMO_MODE: "true", CRM_ENABLE_OPENAI: "false", OPENAI_API_KEY: "", NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "" },
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", code => process.exit(code ?? 0));
