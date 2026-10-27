import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
let local = {};
try { local = parseEnv(await readFile(new URL("../.env.local", import.meta.url), "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", process.argv[2] || "dev", "--hostname", "127.0.0.1", "--port", "3101"], { stdio: "inherit", env: { ...process.env, ...local, CRM_DEMO_MODE: "false", OPENAI_API_KEY: local.OPENAI_API_KEY || "" } });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", code => process.exit(code ?? 0));
