import type { Analysis, Intake, Stage, Task, Workspace } from "../domain";
export type Usage = { inputTokens: number; outputTokens: number; model: string };

export interface Repository {
  readWorkspace(): Promise<Workspace>;
  receive(input: Intake, source: "manual" | "form"): Promise<{ id: string; duplicate: boolean }>;
  transition(id: string, stage: Stage): Promise<void>;
  claimAnalysis(id: string): Promise<{ lockToken: string; cached: boolean }>;
  finishAnalysis(id: string, lockToken: string, analysis: Analysis, usage: Usage): Promise<void>;
  failAnalysis(id: string, lockToken: string, message: string): Promise<void>;
  toggleTask(id: string, completed: boolean): Promise<void>;
  addTask(requestId: string, title: string, dueDate: Task["dueDate"]): Promise<void>;
}
