import { z } from "zod";

export const STAGES = ["new", "clarifying", "proposal", "in_progress", "done", "lost"] as const;
export const STAGE_LABELS: Record<Stage, string> = { new: "New", clarifying: "Clarifying", proposal: "Proposal", in_progress: "In progress", done: "Done", lost: "Lost" };
export const SERVICES = ["Workflow automation", "Document automation", "AI integration", "CRM integration", "Other"] as const;
export type Stage = (typeof STAGES)[number];

export const IntakeSchema = z.object({
  eventKey: z.string().min(8).max(120).regex(/^[a-zA-Z0-9_-]+$/),
  name: z.string().trim().min(2).max(120),
  email: z.email().max(254).transform(value => value.toLowerCase()),
  company: z.string().trim().max(160).default(""),
  message: z.string().trim().min(20).max(10000),
}).strict();
export type Intake = z.infer<typeof IntakeSchema>;

// All fields are required for strict Structured Outputs; absent facts remain null.
export const AnalysisSchema = z.object({
  title: z.string(),
  summary: z.string(),
  service: z.enum(SERVICES),
  budgetAmount: z.number().nullable(),
  budgetCurrency: z.enum(["USD", "EUR", "GBP", "UAH"]).nullable(),
  deadlineText: z.string().nullable(),
  deadlineDate: z.string().nullable(),
  requirements: z.array(z.string()),
  missingInformation: z.array(z.string()),
  nextTasks: z.array(z.string()),
  replyDraft: z.string(),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

/** Validate meaning as well as JSON shape before writing model output to CRM. */
export function validateAnalysis(input: unknown): Analysis {
  const analysis = AnalysisSchema.parse(input);
  if (!analysis.title.trim() || analysis.title.length > 160 || analysis.summary.length > 3000 || analysis.replyDraft.length > 6000)
    throw new Error("The AI brief exceeded the allowed length.");
  if (analysis.budgetAmount !== null && (!Number.isFinite(analysis.budgetAmount) || analysis.budgetAmount < 0))
    throw new Error("The AI brief contained an invalid budget.");
  if ((analysis.budgetAmount === null) !== (analysis.budgetCurrency === null))
    throw new Error("A budget needs an explicitly stated amount and currency.");
  if (analysis.deadlineDate !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(analysis.deadlineDate) || Number.isNaN(Date.parse(analysis.deadlineDate)) || new Date(analysis.deadlineDate).toISOString().slice(0, 10) !== analysis.deadlineDate))
    throw new Error("The AI brief contained an invalid date.");
  for (const values of [analysis.requirements, analysis.missingInformation, analysis.nextTasks])
    if (values.length > 12 || values.some(value => !value.trim() || value.length > 600)) throw new Error("The AI brief contained invalid checklist items.");
  return analysis;
}

export interface Client { id: string; name: string; email: string; company: string }
export interface RequestRecord {
  id: string; clientId: string; eventKey: string; contentHash: string;
  title: string; message: string; source: "form" | "manual"; stage: Stage;
  analysisState: "pending" | "processing" | "ready" | "failed";
  analysis: Analysis | null; analysisError: string | null; attempts: number;
  lockToken: string | null; lockUntil: string | null;
  createdAt: string; updatedAt: string; usage: { inputTokens: number; outputTokens: number; model: string } | null;
}
export interface Task { id: string; requestId: string; title: string; completed: boolean; origin: "manual" | "ai"; dueDate: string | null; createdAt: string }
export interface Activity { id: string; requestId: string; title: string; detail: string; createdAt: string }
export interface Workspace { id: string; name: string; ownerName: string; intakeToken: string; clients: Client[]; requests: RequestRecord[]; tasks: Task[]; events: Activity[] }
export interface WorkspacePayload { workspace: Workspace; demo: boolean; aiEnabled: boolean; storage: "local" | "supabase" }

export class AppError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); this.name = "AppError"; }
}
export const requestClient = (workspace: Workspace, request: RequestRecord) => workspace.clients.find(client => client.id === request.clientId);
export function budgetLabel(analysis: Analysis | null) {
  return analysis?.budgetAmount != null && analysis.budgetCurrency
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: analysis.budgetCurrency, maximumFractionDigits: 0 }).format(analysis.budgetAmount)
    : "Budget not specified";
}
