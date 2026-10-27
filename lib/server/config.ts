export function demoEnabled() { return process.env.CRM_DEMO_MODE === "true" && !process.env.VERCEL; }
export function supabaseConfigured() { return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY); }
export function aiEnabled() { return process.env.CRM_ENABLE_OPENAI === "true" && Boolean(process.env.OPENAI_API_KEY) && Boolean(process.env.CRM_AI_BUDGET_USD) && Boolean(process.env.CRM_AI_METER_URL && process.env.CRM_AI_METER_PUBLISHABLE_KEY && process.env.CRM_AI_METER_TOKEN); }
