import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";

// Read this project's env file; do not inherit another project's key.
const local = parseEnv(await readFile(new URL("../.env.local", import.meta.url), "utf8"));
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3100"], {
  stdio: "inherit",
  env: { ...process.env, ...local, CRM_DEMO_MODE: "true", OPENAI_API_KEY: local.OPENAI_API_KEY || "", CRM_ENABLE_OPENAI: local.CRM_ENABLE_OPENAI === "true" && Boolean(local.OPENAI_API_KEY) ? "true" : "false", NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "" },
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", code => process.exit(code ?? 0));
