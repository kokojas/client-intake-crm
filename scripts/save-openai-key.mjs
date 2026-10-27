import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { lstat, readFile, rename, writeFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

// Manual fallback for an unavailable secure picker. Never echo, log, or send the key.
const target = fileURLToPath(new URL("../.env.local", import.meta.url));
if (!process.stdin.isTTY) throw new Error("Run this command in an interactive terminal.");
const muted = new Writable({ write(_chunk, _encoding, done) { done(); } });
const prompt = createInterface({ input: process.stdin, output: muted, terminal: true });
console.log("Save the new CRM OpenAI key locally. Input is hidden.");
console.log(`Destination: ${target}`);
console.log("Paste the key, then press Enter. Ctrl+C cancels without writing.");
let temporary;
try {
  let key = await new Promise((resolve, reject) => {
    prompt.question("", resolve);
    prompt.once("SIGINT", () => reject(new Error("Cancelled. No key was saved.")));
  });
  prompt.close();
  key = key.trim();
  if (!/^sk-[A-Za-z0-9_-]{30,}$/.test(key)) throw new Error("Invalid key format. No changes were made.");
  const stat = await lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("The destination must be a regular file.");
  let contents = await readFile(target, "utf8");
  const set = (name, value) => {
    const entry = `${name}=${value}`;
    const line = new RegExp(`^${name}=.*$`, "m");
    contents = line.test(contents) ? contents.replace(line, () => entry) : `${contents.trimEnd()}\n${entry}\n`;
  };
  set("OPENAI_API_KEY", key);
  set("CRM_ENABLE_OPENAI", "false");
  set("CRM_AI_BUDGET_USD", "11.14");
  temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, contents, { mode: 0o600, flag: "wx" });
  await rename(temporary, target);
  temporary = undefined;
  key = "";
  contents = "";
  console.log("Saved securely to .env.local (0600). No API request was made.");
  console.log("AI stays disabled until connection and spending controls are verified.");
} catch (error) {
  prompt.close();
  if (temporary) await unlink(temporary).catch(() => undefined);
  console.error(error instanceof Error ? error.message : "The key could not be saved.");
  process.exitCode = 1;
}
