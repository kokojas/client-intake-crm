import { randomUUID } from "node:crypto";
import type { Analysis, Stage, Workspace } from "./domain";

/** Fictional sample data; never copied into a connected Supabase workspace. */
export function createSampleWorkspace(): Workspace {
  const now = Date.now();
  const examples: [string, string, Analysis["service"], number | null, Stage, string | null, string[]][] = [
    ["Automate weekly sales reports", "Maya Chen", "Workflow automation", null, "new", "Confirm reporting sources", ["Reporting sources", "Budget"]],
    ["Customer support knowledge base", "Daniel Reed", "AI integration", 1200, "new", null, []],
    ["Google Sheets to Word proposals", "Olivia Martin", "Document automation", null, "clarifying", "Confirm document template", ["Document template", "Budget"]],
    ["Lead intake from website", "Alex Morgan", "CRM integration", 800, "clarifying", "Clarify lead routing", []],
    ["Invoice document workflow", "Emma Wilson", "Document automation", 650, "proposal", "Follow up on proposal", []],
    ["Email triage assistant", "Noah Davis", "AI integration", 950, "in_progress", "Review sample messages", []],
    ["Markdown export workflow", "Sophie Lane", "Document automation", 400, "done", null, []],
  ];
  const workspace: Workspace = { id: randomUUID(), name: "Maksym's workspace", ownerName: "Maksym Klymenko", intakeToken: randomUUID(), clients: [], requests: [], tasks: [], events: [] };
  examples.forEach(([title, name, service, amount, stage, task, missing], index) => {
    const clientId = randomUUID(), id = randomUUID(), createdAt = new Date(now - (index + 1) * 3600000).toISOString();
    const message = `Hi, I'm ${name}. We need help with ${title.toLowerCase()}.${amount !== null ? ` Our budget is $${amount} USD.` : " We have not set a budget yet."} Could you help us define the next steps?`;
    const analysis: Analysis = { title, summary: `Prepare a ${service.toLowerCase()} solution for ${name}'s team.`, service, budgetAmount: amount, budgetCurrency: amount === null ? null : "USD", deadlineText: null, deadlineDate: null, requirements: [title, "Confirm the acceptance criteria before implementation"], missingInformation: missing, nextTasks: task ? [task] : [], replyDraft: `Hi ${name.split(" ")[0]},\n\nThank you for getting in touch about ${title.toLowerCase()}. ${missing.length ? `Could you share more about ${missing.map(s => s.toLowerCase()).join(" and ")}?` : "Could we arrange a short conversation to confirm the scope and next steps?"}\n\nBest,\nMaksym` };
    workspace.clients.push({ id: clientId, name, email: name.toLowerCase().replace(" ", ".") + "@example.com", company: "" });
    workspace.requests.push({ id, clientId, eventKey: `sample-${index}`, contentHash: `sample-${index}`, title, message, source: "form", stage, analysisState: "ready", analysis, analysisError: null, attempts: 1, lockToken: null, lockUntil: null, createdAt, updatedAt: createdAt, usage: null });
    if (task) workspace.tasks.push({ id: randomUUID(), requestId: id, title: task, completed: false, origin: "ai", dueDate: null, createdAt });
    workspace.events.push({ id: randomUUID(), requestId: id, title: "Sample request added", detail: "Fictional record for exploring the workspace. No API call was made.", createdAt });
  });
  return workspace;
}
