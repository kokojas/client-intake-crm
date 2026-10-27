"use client";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Calendar, Check, CheckSquare, ChevronRight, Clock3, Columns3, Copy, Inbox, LoaderCircle, MoreHorizontal, Plus, Search, Settings, ShieldCheck, TriangleAlert, X } from "lucide-react";
import { budgetLabel, requestClient, SERVICES, STAGE_LABELS, type RequestRecord, type Stage, type WorkspacePayload } from "@/lib/domain";
import { IntakeForm } from "./intake-form";
import { Modal } from "./modal";
import { RequestDetail } from "./request-detail";

type Section = "Pipeline" | "Tasks" | "Activity" | "Settings";
const columns: Stage[] = ["new", "clarifying", "proposal", "in_progress", "done"];

export default function WorkspaceApp({ initial }: { initial: WorkspacePayload }) {
  const [payload, setPayload] = useState(initial), [section, setSection] = useState<Section>("Pipeline"), [view, setView] = useState<"board" | "list">("board");
  const [search, setSearch] = useState(""), [service, setService] = useState("all"), [selectedId, setSelectedId] = useState<string | null>(null), [newOpen, setNewOpen] = useState(false), [busy, setBusy] = useState(false), [toast, setToast] = useState(""), [showCompleted, setShowCompleted] = useState(false);
  const [newStage, setNewStage] = useState<Stage>("new");
  const { workspace, demo, aiEnabled, storage } = payload;
  const selected = workspace.requests.find(request => request.id === selectedId);
  const closeDetails = useCallback(() => setSelectedId(null), []), closeNew = useCallback(() => setNewOpen(false), []);
  const intakePath = `/request/${workspace.intakeToken}`;
  const openRequests = workspace.requests.filter(request => request.stage !== "done" && request.stage !== "lost");
  const needReview = openRequests.filter(request => request.analysisState !== "ready" || request.analysis?.missingInformation.length);
  const openTasks = workspace.tasks.filter(task => !task.completed);
  const visible = workspace.requests.filter(request => {
    const client = requestClient(workspace, request);
    return (service === "all" || request.analysis?.service === service) && `${request.title} ${client?.name} ${client?.company} ${request.analysis?.summary || ""}`.toLowerCase().includes(search.toLowerCase());
  });
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 6500); return () => clearTimeout(timer); }, [toast]);
  async function refresh() {
    const response = await fetch("/api/workspace", { cache: "no-store" });
    if (response.status === 401) { window.location.assign("/login"); return; }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "The workspace could not be refreshed.");
    setPayload(result);
  }
  async function mutate(url: string, body?: unknown, method = "POST") {
    const previous = payload;
    const change = body as { completed?: boolean; stage?: Stage } | undefined;
    if (method === "PATCH" && url.startsWith("/api/tasks/") && typeof change?.completed === "boolean") {
      setPayload(value => ({ ...value, workspace: { ...value.workspace, tasks: value.workspace.tasks.map(task => task.id === url.split("/").at(-1) ? { ...task, completed: change.completed! } : task) } }));
    }
    if (method === "PATCH" && url.startsWith("/api/requests/") && change?.stage) {
      setPayload(value => ({ ...value, workspace: { ...value.workspace, requests: value.workspace.requests.map(request => request.id === url.split("/").at(-1) ? { ...request, stage: change.stage! } : request) } }));
    }
    setBusy(true);
    try {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "This action could not be completed.");
      await refresh();
    } catch (error) {
      setPayload(previous);
      setToast(error instanceof Error ? error.message : "This action could not be completed.");
      try { await refresh(); } catch { /* Preserve displayed data while offline. */ }
      throw error;
    } finally { setBusy(false); }
  }
  async function copy(value: string, message: string) {
    try { await navigator.clipboard.writeText(value); setToast(message); }
    catch { setToast("Clipboard is unavailable in this browser. Select and copy the text instead."); }
  }
  function openNew(stage: Stage = "new") { setSelectedId(null); setNewStage(stage); setNewOpen(true); }

  function requestCard(request: RequestRecord) {
    const client = requestClient(workspace, request), task = workspace.tasks.find(task => task.requestId === request.id && !task.completed);
    const review = request.analysisState !== "ready" || Boolean(request.analysis?.missingInformation.length);
    return <button key={request.id} className="request-card" aria-label={`Open ${request.title}`} draggable onDragStart={event => { event.dataTransfer.setData("text/plain", request.id); event.dataTransfer.effectAllowed = "move"; }} onClick={() => setSelectedId(request.id)}>
      <div className="card-title"><h3>{request.title}</h3><MoreHorizontal size={17} aria-hidden="true" /></div><p className="card-client">{client?.name}</p>
      <span className="service-tag">{request.analysis?.service || "Awaiting review"}</span><p className={`card-budget ${request.analysis?.budgetAmount == null ? "unspecified" : ""}`}>{budgetLabel(request.analysis)}</p>
      {review ? <span className="state-chip review"><TriangleAlert size={15} />{request.analysisState === "failed" ? "AI needs attention" : "Needs review"}</span> : request.stage === "new" ? <span className="state-chip ready"><ShieldCheck size={15} />AI ready</span> : null}
      {task && request.stage !== "new" && <div className="card-task"><Calendar size={16} /><span>{task.title}</span></div>}
    </button>;
  }
  return <div className="app-shell">
    <aside className="sidebar"><a className="brand" href="/" aria-label="Intake home"><Inbox size={29} strokeWidth={1.8} /><span>intake</span></a><nav aria-label="Workspace navigation">{([ ["Pipeline", Columns3], ["Tasks", CheckSquare], ["Activity", Clock3] ] as const).map(([name, Icon]) => <button key={name} className={`nav-item ${section === name ? "active" : ""}`} onClick={() => setSection(name)}><Icon size={19} strokeWidth={1.8} />{name}</button>)}</nav><div className="sidebar-bottom"><button className={`nav-item ${section === "Settings" ? "active" : ""}`} onClick={() => setSection("Settings")}><Settings size={20} strokeWidth={1.8} />Settings</button><button className="profile-button" onClick={() => setSection("Settings")}><span className="avatar">MK</span><span>{workspace.ownerName}</span><ChevronRight size={15} /></button></div></aside>
    <main className={`workspace-main section-${section.toLowerCase()}`}><div className="breadcrumb">Workspace<span>/</span><strong>{section}</strong></div><header className="page-header"><div><h1>{section}</h1><p>{section === "Pipeline" ? "From first message to finished work." : section === "Tasks" ? "Keep the next step in sight." : section === "Activity" ? "A clear history of every request." : "Your connections and workspace."}</p></div><div className="header-actions"><a className="intake-link" href={intakePath} target="_blank" rel="noreferrer">Open intake form</a><button className="button primary" onClick={() => openNew()}><Plus size={19} />New request</button></div></header>
    {section === "Pipeline" && <><div className="metrics-strip"><div><strong>{openRequests.length}</strong><span>Open requests</span></div><div><strong>{needReview.length}</strong><span>Need review</span></div><div><strong>{openTasks.length}</strong><span>Open tasks</span></div></div><div className="pipeline-toolbar"><div className="segmented" aria-label="Pipeline view"><button className={view === "board" ? "selected" : ""} aria-pressed={view === "board"} onClick={() => setView("board")}>Board</button><button className={view === "list" ? "selected" : ""} aria-pressed={view === "list"} onClick={() => setView("list")}>List</button></div><div className="filters"><label className="search-field"><Search size={17} /><input aria-label="Search requests" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search requests..." />{search && <button aria-label="Clear search" onClick={() => setSearch("")}><X size={14} /></button>}</label><select aria-label="Filter by service" value={service} onChange={event => setService(event.target.value)}><option value="all">All services</option>{SERVICES.map(service => <option key={service}>{service}</option>)}</select></div></div>
      {view === "board" ? <div className="board-scroll"><div className="kanban-board">{columns.map(stage => <section className="kanban-column" key={stage} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const id = event.dataTransfer.getData("text/plain"); if (workspace.requests.some(request => request.id === id) && !busy) mutate(`/api/requests/${id}`, { stage }, "PATCH").catch(() => undefined); }}><header><h2>{STAGE_LABELS[stage]}<span className="count">{visible.filter(request => request.stage === stage).length}</span></h2><button className="icon-button" aria-label={`Add request to ${STAGE_LABELS[stage]}`} onClick={() => openNew(stage)}><Plus size={16} /></button></header><div className="column-cards">{visible.filter(request => request.stage === stage).map(requestCard)}{visible.filter(request => request.stage === stage).length === 0 && <div className="empty-column">No requests here yet</div>}</div></section>)}</div></div> : <div className="table-scroll"><table className="requests-table"><thead><tr><th>Request</th><th>Client</th><th>Service</th><th>Stage</th><th>Budget</th><th /></tr></thead><tbody>{visible.map(request => <tr key={request.id}><td><button onClick={() => setSelectedId(request.id)}>{request.title}</button></td><td>{requestClient(workspace, request)?.name}</td><td>{request.analysis?.service || "Awaiting review"}</td><td>{STAGE_LABELS[request.stage]}</td><td>{budgetLabel(request.analysis)}</td><td><button className="icon-button" aria-label={`View ${request.title}`} onClick={() => setSelectedId(request.id)}><ArrowUpRight size={16} /></button></td></tr>)}</tbody></table>{visible.length === 0 && <div className="empty-state">No requests match your search.</div>}</div>}
      <p className="workspace-footnote">{demo ? "Sample workspace · All sample requests shown are fictional" : `${workspace.name} · Changes are saved automatically`}{workspace.requests.some(request => request.stage === "lost") && view === "board" && <button className="text-button" onClick={() => setView("list")}>View lost requests</button>}</p></>}
    {section === "Tasks" && <section className="workspace-section"><div className="section-heading"><h2>{showCompleted ? "All tasks" : "Open tasks"}</h2><button className="text-button" onClick={() => setShowCompleted(!showCompleted)}>{showCompleted ? "Hide completed" : "Show completed"}</button></div><div className="task-list">{workspace.tasks.filter(task => showCompleted || !task.completed).map(task => { const request = workspace.requests.find(request => request.id === task.requestId); return <div className={`task-row ${task.completed ? "task-done" : ""}`} key={task.id}><input type="checkbox" aria-label={`Complete ${task.title}`} checked={task.completed} disabled={busy} onChange={event => { mutate(`/api/tasks/${task.id}`, { completed: event.target.checked }, "PATCH").catch(() => undefined); }} /><div><strong>{task.title}</strong><button onClick={() => setSelectedId(task.requestId)}>{request?.title}</button></div>{task.dueDate && <time>{task.dueDate}</time>}<span className="task-origin">{task.origin === "ai" ? "AI suggested" : "Manual"}</span></div>; })}{workspace.tasks.filter(task => showCompleted || !task.completed).length === 0 && <div className="empty-state"><CheckCircle />All caught up. No open tasks.</div>}</div></section>}
    {section === "Activity" && <section className="workspace-section"><div className="timeline full-timeline">{workspace.events.map(event => <article key={event.id}><span className="timeline-dot" /><div className="section-heading"><h3>{event.title}</h3><time>{new Date(event.createdAt).toLocaleString("en-GB")}</time></div><p>{event.detail}</p><button className="text-button" onClick={() => setSelectedId(event.requestId)}>{workspace.requests.find(request => request.id === event.requestId)?.title}<ChevronRight size={14} /></button></article>)}{workspace.events.length === 0 && <div className="empty-state">Your request history will appear here.</div>}</div></section>}
    {section === "Settings" && <section className="settings-grid"><div className="settings-panel"><h2>Connections</h2><div className="connection-row"><div><strong>OpenAI</strong><p>Structured briefs and reply drafts</p></div><span className={`connection-state ${aiEnabled ? "connected" : ""}`}>{aiEnabled ? "Configured" : "Not connected"}</span></div><div className="connection-row"><div><strong>{storage === "supabase" ? "Supabase" : "Local sample storage"}</strong><p>{storage === "supabase" ? "Owner-only cloud workspace" : "Separate fictional data on this computer"}</p></div><span className="connection-state connected">Connected</span></div><p className="muted small">Public intake saves requests for review. Only a signed-in owner can prepare AI briefs. Repeated submissions do not create duplicate requests.</p></div><div className="settings-panel"><h2>Intake form</h2><p>Share this link with clients to collect their requests.</p><div className="share-link">{intakePath}</div><div className="settings-actions"><button className="button secondary" onClick={() => { copy(new URL(intakePath, window.location.origin).href, "Intake link copied.").catch(() => undefined); }}><Copy size={16} />Copy link</button><a className="text-button" href={intakePath} target="_blank" rel="noreferrer">Open form<ArrowUpRight size={15} /></a></div></div><div className="settings-panel"><h2>Workspace</h2><p>{workspace.name}</p><p className="muted">{workspace.ownerName}</p>{demo ? <p className="demo-note">{aiEnabled ? "Local sample workspace. AI preparation uses your OpenAI connection." : "Sample mode is active. No OpenAI requests are made by this demo."}</p> : <form action="/api/auth/signout" method="post"><button className="button secondary">Sign out</button></form>}</div></section>}
    </main>
    {newOpen && <Modal title="New request" close={closeNew}><p className="modal-intro">Capture the client's message. Keep the original; prepare the details when you're ready.</p><IntakeForm owner aiEnabled={aiEnabled} onSaved={async (id, message) => { setNewOpen(false); setToast(message); try { if (newStage !== "new") await mutate(`/api/requests/${id}`, { stage: newStage }, "PATCH"); else await refresh(); setSelectedId(id); } catch { setToast("Request saved. Refresh the workspace to view it."); } }} /></Modal>}
    {selected && <RequestDetail key={selected.id} request={selected} workspace={workspace} close={closeDetails} busy={busy} aiEnabled={aiEnabled} mutate={mutate} prepare={() => mutate(`/api/requests/${selected.id}/analyze`)} copy={copy} />}
    {toast && <div className="toast" role="status"><span>{toast}</span><button className="icon-button" onClick={() => setToast("")} aria-label="Dismiss notification"><X size={16} /></button></div>}
    {busy && <div className="saving-indicator"><LoaderCircle size={14} className="spin" />Saving...</div>}
  </div>;
}

function CheckCircle() { return <Check size={23} />; }
