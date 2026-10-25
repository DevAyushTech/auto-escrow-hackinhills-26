"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown, FileText, Info, RefreshCw, Search, ShieldCheck, Sparkles } from "lucide-react";
import { api, AgentSummary, Agreement, ApiError, Dispute, Escrow, ExecutionState, JobEvent, JobSummary, MatchCandidate, MatchRun, Submission, Verification } from "@/lib/api";
import { useFlow } from "@/context/FlowContext";
import { DemoCard, DemoShell, StatusPill } from "@/components/demo/DemoShell";

const DEFAULT_OUTPUT = '{"summary":"approved synthetic result","status":"approved"}';
const DEFAULT_EVIDENCE = '{"source":"synthetic-fixture"}';

export default function GuidedDemoPage() {
  const { ensureDemoSession, sessionToken, activeJobId, setActiveJobId, startTransactionWithAgent } = useFlow();
  const [step, setStep] = useState(1);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [job, setJob] = useState<JobSummary | null>(null);
  const [matchRun, setMatchRun] = useState<MatchRun | null>(null);
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [escrow, setEscrow] = useState<Escrow | null>(null);
  const [execution, setExecution] = useState<ExecutionState | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [jobForm, setJobForm] = useState({
    title: "Review a synthetic API contract",
    description: "Return a structured review of a synthetic API contract and clearly identify any issues.",
    required_skills: "review, testing",
    task_category: "verification",
    expected_output: "A JSON review with a summary and status.",
    acceptance_criteria: "Required JSON fields: summary, status\nRequired terms: approved, synthetic\nRequired evidence fields: source",
    budget: "125.00",
    deadline: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3).toISOString().slice(0, 16),
  });
  const [output, setOutput] = useState(DEFAULT_OUTPUT);
  const [evidence, setEvidence] = useState(DEFAULT_EVIDENCE);
  const [disputeReason, setDisputeReason] = useState("The result should be reviewed against the accepted synthetic terms.");
  const [disputeDescription, setDisputeDescription] = useState("This is a guided synthetic dispute so the protected path can be inspected.");

  const token = sessionToken;
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? null;
  const eligible = matchRun?.candidates ?? [];
  const allCandidates = [...(matchRun?.candidates ?? []), ...(matchRun?.excluded_agents ?? [])];
  const latestDispute = disputes[0] ?? null;
  const canContinueToJob = Boolean(selectedAgentId);

  useEffect(() => {
    void ensureDemoSession().then(() => undefined).catch(() => undefined);
  }, [ensureDemoSession]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setAgentsError(null);
    api.listAgents(token).then((response) => {
      if (!cancelled && response) setAgents(response.items);
    }).catch((requestError) => {
      if (!cancelled) setAgentsError(requestError instanceof ApiError ? requestError.detail : "Agent data could not be loaded.");
    });
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (typeof window === "undefined" || !agents.length || selectedAgentId !== null) return;
    const requestedAgent = Number(new URLSearchParams(window.location.search).get("agent"));
    if (!Number.isInteger(requestedAgent) || requestedAgent <= 0) return;
    const agent = agents.find((item) => item.id === requestedAgent);
    if (agent) {
      selectAgent(agent);
      setStep(1);
    }
  }, [agents, selectedAgentId]);

  useEffect(() => {
    if (typeof window === "undefined" || activeJobId) return;
    const requestedJob = Number(new URLSearchParams(window.location.search).get("job"));
    if (Number.isInteger(requestedJob) && requestedJob > 0) setActiveJobId(requestedJob);
  }, [activeJobId, setActiveJobId]);

  useEffect(() => {
    if (!token || !activeJobId) return;
    void refreshJob(activeJobId, token).catch((requestError) => {
      setError(requestError instanceof ApiError ? requestError.detail : "The saved demo job could not be restored.");
    });
    // The active job is restored from the provider's persisted context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, activeJobId]);

  async function refreshJob(jobId: number, sessionToken: string) {
    const [jobResponse, agreementResponse, escrowResponse, executionResponse, verificationResponse, submissionsResponse, disputesResponse, eventsResponse] = await Promise.all([
      api.getJob(jobId, sessionToken),
      api.getAgreement(jobId, sessionToken),
      api.getEscrow(jobId, sessionToken),
      api.getExecution(jobId, sessionToken),
      api.getVerification(jobId, sessionToken),
      api.listSubmissions(jobId, sessionToken),
      api.getDisputes(jobId, sessionToken),
      api.getEvents(jobId, sessionToken),
    ]);
    setJob(jobResponse);
    setAgreement(agreementResponse);
    setEscrow(escrowResponse);
    setExecution(executionResponse);
    setVerification(verificationResponse);
    setSubmissions(submissionsResponse ?? []);
    setDisputes(disputesResponse ?? []);
    setEvents(eventsResponse ?? []);
    if (jobResponse?.selected_agent_id) setSelectedAgentId(jobResponse.selected_agent_id);
    if (disputesResponse?.length || escrowResponse?.status === "released" || escrowResponse?.status === "refunded") setStep(9);
    else if (verificationResponse) setStep(8);
    else if (submissionsResponse?.length) setStep(7);
    else if (escrowResponse) setStep(6);
    else if (agreementResponse?.status === "accepted") setStep(5);
    else if (agreementResponse) setStep(4);
    else if (jobResponse?.selected_agent_id) setStep(4);
    else setStep(3);
  }

  function runAction(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    action().catch((requestError) => setError(requestError instanceof ApiError ? requestError.detail : "The request failed. Try again.")).finally(() => setBusy(false));
  }

  function nextStep(target: number) {
    setStep(Math.min(9, Math.max(1, target)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function selectAgent(agent: AgentSummary) {
    setSelectedAgentId(agent.id);
    startTransactionWithAgent({
      id: `api-${agent.id}`,
      name: agent.name,
      category: "Data & ML",
      trustScore: 0,
      successRate: 0,
      completedTasks: 0,
      avgResponseTime: agent.estimated_completion_minutes ? `${agent.estimated_completion_minutes} min` : "Unknown",
      priceRate: "Agreement-defined",
      priceAmount: Number(jobForm.budget),
      riskLevel: "Low",
      verified: agent.status === "active",
      avatar: agent.name.slice(0, 2).toUpperCase(),
      description: agent.description,
      capabilities: agent.skills,
      publicKey: agent.external_id,
      autonomyLevel: "Standard",
    });
  }

  function createJob() {
    if (!token) return setError("Start the demo session before creating a job.");
    const deadline = new Date(jobForm.deadline);
    if (!jobForm.title.trim() || !jobForm.description.trim() || !jobForm.expected_output.trim() || !jobForm.acceptance_criteria.trim() || Number(jobForm.budget) <= 0 || Number.isNaN(deadline.getTime())) {
      return setError("Complete the title, description, expected output, criteria, positive budget, and future deadline.");
    }
    if (deadline <= new Date()) return setError("Deadline must be in the future.");
    runAction(async () => {
      const created = await api.createJob({
        title: jobForm.title,
        description: jobForm.description,
        required_skills: jobForm.required_skills.split(",").map((skill) => skill.trim()).filter(Boolean),
        task_category: jobForm.task_category,
        expected_output: jobForm.expected_output,
        acceptance_criteria: jobForm.acceptance_criteria.split("\n").map((criterion) => criterion.trim()).filter(Boolean),
        budget: jobForm.budget,
        currency: "USD",
        deadline: deadline.toISOString(),
        additional_instructions: "Synthetic guided-demo task. Do not execute submitted code.",
        requirements: { synthetic: true, output_format: "json" },
      }, token);
      if (!created) throw new ApiError(500, "The API returned no created job.");
      setJob(created);
      setActiveJobId(created.id);
      setNotice(`Job ${created.public_id} was saved by the API.`);
      nextStep(3);
      const matches = await api.matchJob(created.id, token);
      setMatchRun(matches);
    });
  }

  function matchExistingJob() {
    if (!token || !job) return;
    runAction(async () => {
      const matches = await api.matchJob(job.id, token);
      setMatchRun(matches);
    });
  }

  function persistAgentSelection(candidate: MatchCandidate) {
    if (!token || !job) return;
    runAction(async () => {
      const selected = await api.selectAgent(job.id, candidate.agent_id, matchRun?.run_id, token);
      if (!selected) throw new ApiError(500, "The API returned no selected job.");
      setJob(selected);
      setSelectedAgentId(candidate.agent_id);
      setNotice(`${candidate.agent_name} is now the persisted executor selection.`);
      nextStep(4);
    });
  }

  function createAgreement() {
    if (!token || !job) return;
    runAction(async () => {
      const created = await api.createAgreement(job.id, token);
      if (!created) throw new ApiError(500, "The API returned no agreement.");
      setAgreement(created);
      setNotice(`Agreement version ${created.proposal_version} is ready to review.`);
    });
  }

  function acceptAgreement() {
    if (!token || !agreement) return;
    if (!window.confirm("Accept these terms? The accepted version becomes immutable and the job moves to assigned.")) return;
    runAction(async () => {
      const accepted = await api.acceptAgreement(agreement.id, token);
      if (!accepted) throw new ApiError(500, "The API returned no accepted agreement.");
      setAgreement(accepted);
      if (job) setJob(await api.getJob(job.id, token));
      setNotice(`Version ${accepted.accepted_version} is frozen. No funds moved yet.`);
      nextStep(5);
    });
  }

  function fundEscrow() {
    if (!token || !job) return;
    if (!window.confirm("Record a simulated funding entry? No real payment or wallet transfer occurs.")) return;
    runAction(async () => {
      const funded = await api.fundEscrow(job.id, token);
      setEscrow(funded);
      setNotice("The simulated funding ledger now contains the authoritative entry.");
      nextStep(6);
    });
  }

  function startExecution() {
    if (!token || !job) return;
    runAction(async () => {
      const state = await api.startExecution(job.id, token);
      setExecution(state);
      setJob(await api.getJob(job.id, token));
      setNotice("Local demo execution started. No external agent was invoked.");
    });
  }

  function submitWork() {
    if (!token || !job) return;
    let evidenceObject: Record<string, unknown>;
    try { evidenceObject = JSON.parse(evidence) as Record<string, unknown>; } catch { return setError("Evidence must be valid JSON."); }
    if (!output.trim()) return setError("Add a submission before continuing.");
    runAction(async () => {
      const submission = await api.submit(job.id, { submitted_output: output, evidence: evidenceObject, notes: "Submitted through the guided synthetic demo." }, token);
      if (!submission) throw new ApiError(500, "The API returned no persisted submission.");
      setSubmissions((previous) => [...previous, submission]);
      setJob(await api.getJob(job.id, token));
      setExecution(await api.getExecution(job.id, token));
      setNotice(`Submission version ${submission.version} is persisted. It was stored, not executed.`);
      nextStep(7);
    });
  }

  function verifyWork() {
    if (!token || !job) return;
    runAction(async () => {
      const result = await api.verify(job.id, token);
      if (!result) throw new ApiError(500, "The API returned no verification result.");
      setVerification(result);
      setJob(await api.getJob(job.id, token));
      setExecution(await api.getExecution(job.id, token));
      setNotice(result.overall_result === "passed" ? "Verification passed. Release is eligible but still requires a separate action." : "Verification did not pass. Settlement remains blocked.");
      nextStep(8);
    });
  }

  function releaseFunds() {
    if (!token || !escrow) return;
    if (!window.confirm("Release the simulated escrow after the passed verification?")) return;
    runAction(async () => {
      const released = await api.releaseEscrow(escrow.id, token);
      setEscrow(released);
      if (job) await refreshJob(job.id, token);
      setNotice("The release was recorded in the simulated ledger and audit history.");
      nextStep(9);
    });
  }

  function openDispute() {
    if (!token || !job || !escrow || !selectedAgentId) return;
    runAction(async () => {
      const created = await api.createDispute(job.id, {
        escrow_id: escrow.id,
        category: verification?.overall_result === "failed" ? "failed_verification" : "other",
        reason: disputeReason,
        description: disputeDescription,
        evidence: { source: "guided-demo", synthetic: true },
        raised_by_agent_id: selectedAgentId,
      }, token);
      if (!created) throw new ApiError(500, "The API returned no dispute record.");
      setDisputes([created]);
      setEscrow(await api.getEscrow(job.id, token));
      setJob(await api.getJob(job.id, token));
      setNotice("The dispute is open. Normal settlement is now blocked.");
      nextStep(9);
    });
  }

  function reviewDispute() {
    if (!token || !latestDispute) return;
    runAction(async () => {
      const reviewed = await api.reviewDispute(latestDispute.id, token);
      if (!reviewed) throw new ApiError(500, "The API returned no reviewed dispute.");
      setDisputes([reviewed]);
      setNotice("The demo operator review transition is persisted.");
    });
  }

  function resolveDispute(resolution: "refund" | "release" | "reject") {
    if (!token || !latestDispute) return;
    runAction(async () => {
      const resolved = await api.resolveDispute(latestDispute.id, resolution, token);
      if (!resolved) throw new ApiError(500, "The API returned no resolved dispute.");
      setDisputes([resolved]);
      if (job) await refreshJob(job.id, token);
      setNotice(`The dispute was closed with a ${resolution} outcome.`);
    });
  }

  const statusTone = verification?.overall_result === "passed" ? "good" : verification?.overall_result === "failed" || verification?.overall_result === "manual_review" ? "bad" : "neutral";

  return <DemoShell currentStep={step}>
    {error && <div className="mb-5 rounded-2xl border border-[#f1caca] bg-[#fff6f6] p-4 text-sm text-[#9b4c4c]">{error} <button className="ml-2 font-bold underline" onClick={() => setError(null)}>Dismiss</button></div>}
    {notice && <div className="mb-5 flex items-center gap-2 rounded-2xl border border-[#bfe0d2] bg-[#f0fbf6] p-4 text-sm text-[#28765d]"><Check size={17} /> {notice}</div>}

    {step === 1 && <DemoCard>
      <div className="grid gap-8 lg:grid-cols-[1fr_0.7fr]">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#4486b7]">Step 1 · Discover an agent</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em]">Start with the capability, not the promise.</h2>
          <p className="mt-4 max-w-xl leading-7 text-[#657a91]">These profiles come from the API. They are synthetic demo agents, but their skills, availability, output formats, and completion estimates are real persisted fields used by matching.</p>
          <div className="mt-7 flex items-center gap-3 rounded-2xl bg-[#f5f9fc] p-4 text-sm text-[#58718b]"><Info size={17} className="text-[#3b89bb]" /><span>Matching is a heuristic ranking signal, not a guarantee of success.</span></div>
        </div>
        <div className="rounded-3xl bg-[#102d52] p-6 text-white"><Sparkles className="text-[#9bd8f8]" size={22} /><h3 className="mt-6 text-xl font-semibold">What to inspect</h3><ul className="mt-4 space-y-3 text-sm leading-6 text-[#c2d8e8]"><li>• Skills and task categories</li><li>• Availability and expected completion</li><li>• Supported output formats</li><li>• Synthetic performance metadata</li></ul></div>
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {agentsError && <div className="rounded-2xl border border-[#f1caca] bg-[#fff6f6] p-4 text-sm text-[#9b4c4c] md:col-span-2 lg:col-span-3"><div>{agentsError}</div><button onClick={() => token && api.listAgents(token).then((response) => response && setAgents(response.items)).catch(() => undefined)} className="mt-2 inline-flex items-center gap-2 font-bold underline"><RefreshCw size={14} /> Retry</button></div>}
        {agents.map((agent) => <AgentCard key={agent.id} agent={agent} selected={selectedAgentId === agent.id} onSelect={() => selectAgent(agent)} />)}
        {!agentsError && agents.length === 0 && <div className="rounded-2xl border border-dashed border-[#bfcfdd] p-8 text-sm text-[#6f8296] md:col-span-2 lg:col-span-3">No agent records are available yet. Seed synthetic agents in the backend, then retry.</div>}
      </div>
      <div className="mt-8 flex justify-end"><button disabled={!canContinueToJob} onClick={() => nextStep(2)} className="inline-flex items-center gap-2 rounded-full bg-[#102d52] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#1a4a7a] disabled:cursor-not-allowed disabled:opacity-40">Continue to job brief <ArrowRight size={16} /></button></div>
    </DemoCard>}

    {step === 2 && <DemoCard>
      <SectionHeading eyebrow="Step 2 · Create a job" title="Give the work a definition the system can verify." text="The API validates the task description, skills, budget, deadline, deliverable, and acceptance criteria. The criteria below are intentionally deterministic so the demo can explain the result." />
      <div className="mt-7 grid gap-5 md:grid-cols-2">
        <Field label="Task title" value={jobForm.title} onChange={(value) => setJobForm({ ...jobForm, title: value })} />
        <Field label="Task category" value={jobForm.task_category} onChange={(value) => setJobForm({ ...jobForm, task_category: value })} help="Used by the matching category component." />
        <TextArea label="Description" value={jobForm.description} onChange={(value) => setJobForm({ ...jobForm, description: value })} className="md:col-span-2" />
        <Field label="Required skills" value={jobForm.required_skills} onChange={(value) => setJobForm({ ...jobForm, required_skills: value })} help="Comma-separated; matching normalizes case." />
        <Field label="Expected output" value={jobForm.expected_output} onChange={(value) => setJobForm({ ...jobForm, expected_output: value })} />
        <Field label="Budget (USD)" type="number" value={jobForm.budget} onChange={(value) => setJobForm({ ...jobForm, budget: value })} />
        <Field label="Deadline" type="datetime-local" value={jobForm.deadline} onChange={(value) => setJobForm({ ...jobForm, deadline: value })} />
        <TextArea label="Acceptance criteria" value={jobForm.acceptance_criteria} onChange={(value) => setJobForm({ ...jobForm, acceptance_criteria: value })} help="One criterion per line. Try the prefilled deterministic checks." className="md:col-span-2" />
      </div>
      <div className="mt-8 flex flex-col-reverse justify-between gap-3 sm:flex-row"><button onClick={() => nextStep(1)} className="rounded-full border border-[#cad9e7] px-5 py-3 text-sm font-bold text-[#516b84]">Back</button><button disabled={busy} onClick={createJob} className="inline-flex items-center justify-center gap-2 rounded-full bg-[#102d52] px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? "Saving…" : "Create job and run matching"} <ArrowRight size={16} /></button></div>
    </DemoCard>}

    {step === 3 && <DemoCard>
      <SectionHeading eyebrow="Step 3 · Compare matching" title="See why the backend ranked each candidate." text="The score is persisted with a scoring version, component breakdown, warnings, and eligibility decision. It is a signal to investigate—not a promise." />
      {!matchRun && <div className="mt-7 rounded-2xl border border-dashed border-[#c5d8e6] p-8 text-sm text-[#6d8196]">No matching run has been returned for this job yet. <button onClick={matchExistingJob} className="font-bold underline">Run matching</button></div>}
      {matchRun && <div className="mt-7 space-y-4"><div className="flex flex-wrap items-center gap-2 text-xs text-[#6d8094]"><StatusPill label={`Scoring ${matchRun.scoring_version}`} /><span>Run {matchRun.run_id}</span><span>Computed {new Date(matchRun.computed_at).toLocaleString()}</span></div>{allCandidates.map((candidate) => <MatchCard key={candidate.agent_id} candidate={candidate} selected={selectedAgentId === candidate.agent_id} onSelect={() => candidate.eligible && persistAgentSelection(candidate)} />)}</div>}
      <div className="mt-8 flex justify-between"><button onClick={() => nextStep(2)} className="rounded-full border border-[#cad9e7] px-5 py-3 text-sm font-bold text-[#516b84]">Back</button>{job?.selected_agent_id && <button onClick={() => nextStep(4)} className="inline-flex items-center gap-2 rounded-full bg-[#102d52] px-5 py-3 text-sm font-bold text-white">Review agreement <ArrowRight size={16} /></button>}</div>
    </DemoCard>}

    {step === 4 && <DemoCard>
      <SectionHeading eyebrow="Step 4 · Review agreement" title="Accept the terms before the ledger can be funded." text="Acceptance freezes the current version. The backend copies the amount, currency, deadline, deliverable, criteria, and verification method into the accepted snapshot." />
      {!agreement && <div className="mt-7 rounded-3xl border border-[#d9e7f1] bg-[#f8fbfe] p-6"><p className="text-sm text-[#647b91]">No proposal exists for this job.</p><button disabled={busy || !job?.selected_agent_id} onClick={createAgreement} className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#102d52] px-5 py-3 text-sm font-bold text-white disabled:opacity-40">Create proposal <FileText size={16} /></button></div>}
      {agreement && <div className="mt-7 grid gap-5 lg:grid-cols-[1fr_0.72fr]"><div className="rounded-3xl border border-[#d6e5f0] p-6"><div className="flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-[0.16em] text-[#4a89b7]">Proposal version {agreement.proposal_version}</span><StatusPill label={agreement.status} tone={agreement.status === "accepted" ? "good" : "neutral"} /></div><div className="mt-6 space-y-4 text-sm"><ReadOnly label="Scope" value={String(agreement.terms.scope ?? job?.description ?? "")} /><ReadOnly label="Deliverable" value={String(agreement.terms.expected_deliverable ?? job?.expected_output ?? "")} /><ReadOnly label="Criteria" value={Array.isArray(agreement.terms.acceptance_criteria) ? (agreement.terms.acceptance_criteria as string[]).join(" · ") : ""} /><ReadOnly label="Verification" value={String(agreement.terms.verification_method ?? "")}/></div></div><div className="rounded-3xl bg-[#102d52] p-6 text-white"><div className="text-xs font-bold uppercase tracking-[0.16em] text-[#a7d8f6]">Consequence</div><p className="mt-5 text-sm leading-7 text-[#c5dbea]">Once accepted, this version is the reference for verification. Funding still requires a separate explicit action.</p><div className="mt-7 rounded-2xl bg-white/10 p-4"><div className="text-xs text-[#a6c5dc]">Agreement amount</div><div className="mt-1 text-3xl font-semibold">{agreement.amount} <span className="text-sm text-[#a6c5dc]">{agreement.currency}</span></div></div>{agreement.status !== "accepted" && <button disabled={busy} onClick={acceptAgreement} className="mt-5 w-full rounded-full bg-white px-5 py-3 text-sm font-bold text-[#102d52] disabled:opacity-50">I accept version {agreement.proposal_version}</button>}</div></div>}
      <div className="mt-8 flex justify-between"><button onClick={() => nextStep(3)} className="rounded-full border border-[#cad9e7] px-5 py-3 text-sm font-bold text-[#516b84]">Back</button>{agreement?.status === "accepted" && <button onClick={() => nextStep(5)} className="inline-flex items-center gap-2 rounded-full bg-[#102d52] px-5 py-3 text-sm font-bold text-white">Continue to simulated escrow <ArrowRight size={16} /></button>}</div>
    </DemoCard>}

    {step === 5 && <DemoCard>
      <SectionHeading eyebrow="Step 5 · Fund simulated escrow" title="Record a ledger entry, not a payment." text="The amount and currency come from the accepted agreement. The browser cannot override them, and the action does not move or hold real money." />
      <div className="mt-7 grid gap-5 md:grid-cols-3"><SummaryTile label="Accepted amount" value={`${agreement?.amount ?? job?.budget ?? "—"} ${agreement?.currency ?? "USD"}`} /><SummaryTile label="Ledger state" value={escrow?.status ?? "not funded"} /><SummaryTile label="Agreement version" value={String(agreement?.accepted_version ?? "—")} /></div>
      <div className="mt-6 rounded-3xl border border-[#b9dfd0] bg-[#f0fbf6] p-5 text-sm leading-7 text-[#2d705c]"><strong>Demo boundary:</strong> This is a persisted simulated escrow record. No bank, wallet, blockchain, or payment provider is connected.</div>
      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-between"><button onClick={() => nextStep(4)} className="rounded-full border border-[#cad9e7] px-5 py-3 text-sm font-bold text-[#516b84]">Back</button><button disabled={busy || escrow?.status === "funded" || escrow?.status === "released" || escrow?.status === "refunded"} onClick={fundEscrow} className="inline-flex items-center justify-center gap-2 rounded-full bg-[#102d52] px-5 py-3 text-sm font-bold text-white disabled:opacity-40">{escrow ? "Funding recorded" : "Fund simulated escrow"} <ArrowRight size={16} /></button></div>
    </DemoCard>}

    {step === 6 && <DemoCard>
      <SectionHeading eyebrow="Step 6 · Submit work" title="Use the safe local demo executor." text="Starting execution records a state transition. Submissions are stored as immutable versions. The system never executes arbitrary submitted code." />
      <div className="mt-7 rounded-3xl border border-[#d9e7f1] bg-[#f8fbfe] p-5 text-sm leading-7 text-[#60778e]"><strong className="text-[#24496f]">Expected fixture:</strong> the prefilled JSON includes the terms needed for a passing deterministic check. Edit it to demonstrate a failure and retry.</div>
      {!execution?.started_at && <button disabled={busy} onClick={startExecution} className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#102d52] px-5 py-3 text-sm font-bold text-white disabled:opacity-50">Start local demo execution <ArrowRight size={16} /></button>}
      {execution?.can_submit && <div className="mt-6 grid gap-5 md:grid-cols-2"><TextArea label="Submitted output" value={output} onChange={setOutput} className="min-h-[190px]" /><TextArea label="Evidence (JSON)" value={evidence} onChange={setEvidence} className="min-h-[190px]" /></div>}
      {execution && <div className="mt-6 flex flex-wrap items-center gap-3"><StatusPill label={execution.execution_status} tone={execution.execution_status === "awaiting_submission" ? "warning" : "neutral"} /><span className="text-sm text-[#64798e]">{execution.submit_reason}</span></div>}
      <div className="mt-7 flex justify-between"><button onClick={() => nextStep(5)} className="rounded-full border border-[#cad9e7] px-5 py-3 text-sm font-bold text-[#516b84]">Back</button>{execution?.can_submit && <button disabled={busy} onClick={submitWork} className="inline-flex items-center gap-2 rounded-full bg-[#102d52] px-5 py-3 text-sm font-bold text-white disabled:opacity-50">Persist submission <ArrowRight size={16} /></button>}</div>
    </DemoCard>}

    {step === 7 && <DemoCard>
      <SectionHeading eyebrow="Step 7 · Verify the result" title="The backend evaluates the latest submission against accepted terms." text="A pass makes release eligible. A failure or manual-review result keeps settlement blocked and explains what needs attention." />
      <div className="mt-7 flex flex-wrap items-center gap-3"><StatusPill label={verification?.overall_result ?? "awaiting verification"} tone={statusTone} />{verification?.score && <span className="text-sm text-[#637a91]">Automated score {verification.score}/100</span>}</div>
      {!verification && <button disabled={busy} onClick={verifyWork} className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#102d52] px-5 py-3 text-sm font-bold text-white disabled:opacity-50">Verify latest submission <ShieldCheck size={16} /></button>}
       {verification && <div className="mt-6 space-y-3">{verification.individual_checks.map((check, index) => <div key={`${String(check.name)}-${index}`} className="rounded-2xl border border-[#d8e5f0] p-4"><div className="flex items-center justify-between gap-3"><div className="text-sm font-semibold text-[#23476d]">{String(check.name ?? "Check")}</div><StatusPill label={String(check.status ?? "unknown")} tone={check.status === "passed" ? "good" : check.status === "failed" || check.status === "manual_review" ? "bad" : "warning"} /></div><p className="mt-2 text-sm leading-6 text-[#6d8196]">{String(check.explanation ?? "No explanation returned.")}</p></div>)}</div>}
      {verification && verification.overall_result !== "passed" && <div className="mt-6 rounded-3xl border border-[#f0c7c7] bg-[#fff5f5] p-5 text-sm leading-7 text-[#944f4f]"><strong>Settlement blocked.</strong> {verification.reasons.join(" ") || "The outcome needs review before any release can be considered."}</div>}
      <div className="mt-7 flex justify-between"><button onClick={() => nextStep(6)} className="rounded-full border border-[#cad9e7] px-5 py-3 text-sm font-bold text-[#516b84]">Back</button><button onClick={() => nextStep(8)} disabled={!verification} className="inline-flex items-center gap-2 rounded-full bg-[#102d52] px-5 py-3 text-sm font-bold text-white disabled:opacity-40">Resolve outcome <ArrowRight size={16} /></button></div>
    </DemoCard>}

    {step === 8 && <DemoCard>
      <SectionHeading eyebrow="Step 8 · Resolve the outcome" title="Only an eligible state can release simulated funds." text="For a passing verification, release is a separate guarded action. For a failed result, open a dispute and inspect the protected path instead." />
      {verification?.overall_result === "passed" ? <div className="mt-7 grid gap-5 lg:grid-cols-[1fr_0.7fr]"><div className="rounded-3xl border border-[#b9dfd0] bg-[#f0fbf6] p-6"><StatusPill label="settlement eligible" tone="good" /><p className="mt-4 text-sm leading-7 text-[#2d705c]">The job is completed and verification passed. The escrow is still funded until you explicitly release it.</p><button disabled={busy || escrow?.status === "released"} onClick={releaseFunds} className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#2d8d6d] px-5 py-3 text-sm font-bold text-white disabled:opacity-40">{escrow?.status === "released" ? "Released" : "Release simulated escrow"} <ArrowRight size={16} /></button></div><div className="rounded-3xl border border-[#d8e5f0] p-6"><h3 className="font-semibold text-[#23476d]">Want to show the protection path?</h3><p className="mt-3 text-sm leading-6 text-[#6b8096]">A dispute can still be opened for a reviewable outcome. It will block normal settlement until resolved.</p><button onClick={() => nextStep(9)} className="mt-5 rounded-full border border-[#b9cfe1] px-5 py-3 text-sm font-bold text-[#3c6385]">Open record view</button></div></div> : <div className="mt-7 grid gap-5 lg:grid-cols-[1fr_0.7fr]"><div className="rounded-3xl border border-[#f0c7c7] bg-[#fff5f5] p-6"><StatusPill label="settlement blocked" tone="bad" /><p className="mt-4 text-sm leading-7 text-[#944f4f]">The verification outcome is not a pass. Use a corrected retry where allowed, or open a dispute to record the review path.</p><button disabled={busy || !escrow || !selectedAgentId} onClick={openDispute} className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#a55454] px-5 py-3 text-sm font-bold text-white disabled:opacity-40">Open synthetic dispute <ArrowRight size={16} /></button></div><div className="rounded-3xl border border-[#d8e5f0] p-6"><h3 className="font-semibold text-[#23476d]">What remains protected?</h3><ul className="mt-3 space-y-2 text-sm leading-6 text-[#6b8096]"><li>• The funded balance</li><li>• Accepted agreement terms</li><li>• Immutable submission history</li><li>• Audit events explaining each transition</li></ul></div></div>}
      <div className="mt-8 flex justify-between"><button onClick={() => nextStep(7)} className="rounded-full border border-[#cad9e7] px-5 py-3 text-sm font-bold text-[#516b84]">Back</button><button onClick={() => nextStep(9)} className="inline-flex items-center gap-2 rounded-full bg-[#102d52] px-5 py-3 text-sm font-bold text-white">Review record <ArrowRight size={16} /></button></div>
    </DemoCard>}

    {step === 9 && <DemoCard>
      <SectionHeading eyebrow="Step 9 · Review the record" title="The outcome is only useful when you can explain it." text="This view reads the persisted job, ledger, verification, dispute, and audit records so a visitor can see what happened and why." />
      <div className="mt-7 grid gap-5 md:grid-cols-4"><SummaryTile label="Job state" value={job?.status ?? "—"} /><SummaryTile label="Escrow" value={escrow?.status ?? "—"} /><SummaryTile label="Verification" value={verification?.overall_result ?? "—"} /><SummaryTile label="Audit events" value={String(events.length)} /></div>
      {latestDispute && <div className="mt-6 rounded-3xl border border-[#f0ddb1] bg-[#fff9eb] p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-[0.16em] text-[#9b7125]">Dispute #{latestDispute.id}</div><div className="mt-2 text-lg font-semibold text-[#6d531e]">{latestDispute.status} {latestDispute.resolution ? `· ${latestDispute.resolution}` : ""}</div></div><StatusPill label={latestDispute.status} tone={latestDispute.status === "resolved" || latestDispute.status === "rejected" ? "good" : "warning"} /></div><p className="mt-3 text-sm leading-6 text-[#826a38]">{latestDispute.description}</p><div className="mt-5 flex flex-wrap gap-2">{latestDispute.status === "open" && <button disabled={busy} onClick={reviewDispute} className="rounded-full bg-[#9c762e] px-4 py-2 text-xs font-bold text-white">Begin review</button>}{latestDispute.status === "under_review" && <><button disabled={busy} onClick={() => resolveDispute("refund")} className="rounded-full bg-[#9c762e] px-4 py-2 text-xs font-bold text-white">Resolve: refund</button><button disabled={busy} onClick={() => resolveDispute("reject")} className="rounded-full border border-[#d6ba75] px-4 py-2 text-xs font-bold text-[#795f29]">Resolve: reject</button></>}</div></div>}
      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_1fr]"><div className="rounded-3xl border border-[#d8e5f0] p-5"><div className="flex items-center justify-between"><h3 className="font-semibold text-[#23476d]">Ledger history</h3>{escrow && <Link href={`/escrow?job=${escrow.job_id}`} className="text-xs font-bold text-[#3d83b5]">Open escrow page</Link>}</div><div className="mt-4 space-y-2">{escrow?.ledger_entries?.map((entry) => <div key={entry.id} className="flex items-center justify-between rounded-2xl bg-[#f7fafc] p-3 text-sm"><span className="font-semibold text-[#42617e]">{entry.entry_type}</span><span className="font-mono text-[#607891]">{entry.amount} {entry.currency}</span></div>)}{!escrow?.ledger_entries?.length && <p className="text-sm text-[#768a9e]">No ledger entries returned for this job yet.</p>}</div></div><div className="rounded-3xl border border-[#d8e5f0] p-5"><h3 className="font-semibold text-[#23476d]">Audit timeline</h3><div className="mt-4 max-h-72 space-y-3 overflow-auto">{events.map((event) => <div key={event.id} className="border-l-2 border-[#a9cce3] pl-3"><div className="text-xs font-bold text-[#3f769c]">{event.event_type}</div><div className="mt-1 text-xs text-[#74889d]">{new Date(event.created_at).toLocaleString()}</div></div>)}{!events.length && <p className="text-sm text-[#768a9e]">No audit events returned yet.</p>}</div></div></div>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-between"><button onClick={() => nextStep(8)} className="rounded-full border border-[#cad9e7] px-5 py-3 text-sm font-bold text-[#516b84]">Back</button><button onClick={() => { setStep(1); setJob(null); setMatchRun(null); setAgreement(null); setEscrow(null); setExecution(null); setVerification(null); setSubmissions([]); setDisputes([]); setEvents([]); setActiveJobId(null); }} className="inline-flex items-center justify-center gap-2 rounded-full bg-[#102d52] px-5 py-3 text-sm font-bold text-white"><RefreshCw size={16} /> Start another job in this sandbox</button></div>
    </DemoCard>}
  </DemoShell>;
}

function SectionHeading({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) { return <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#4486b7]">{eyebrow}</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-[#173a60]">{title}</h2><p className="mt-4 max-w-3xl leading-7 text-[#657a91]">{text}</p></div>; }
function AgentCard({ agent, selected, onSelect }: { agent: AgentSummary; selected: boolean; onSelect: () => void }) { return <button onClick={onSelect} className={`text-left rounded-3xl border p-5 transition hover:-translate-y-0.5 hover:shadow-lg ${selected ? "border-[#55a6d8] bg-[#f0f8fe] shadow-md" : "border-[#d7e5f0] bg-[#fbfdff]"}`}><div className="flex items-start justify-between gap-3"><div><div className="text-lg font-semibold text-[#23486d]">{agent.name}</div><div className="mt-1 text-xs text-[#71869b]">{agent.external_id}</div></div>{selected && <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#2c8abb] text-white"><Check size={15} /></span>}</div><p className="mt-4 line-clamp-3 text-sm leading-6 text-[#667d93]">{agent.description}</p><div className="mt-4 flex flex-wrap gap-1.5">{agent.skills.slice(0, 4).map((skill) => <span key={skill} className="rounded-full bg-[#eaf4fb] px-2.5 py-1 text-[10px] font-bold text-[#3b76a0]">{skill}</span>)}</div><div className="mt-5 grid grid-cols-2 gap-3 border-t border-[#e0ebf3] pt-4 text-xs"><div><div className="text-[#8495a6]">Availability</div><div className="mt-1 font-semibold text-[#3b6a8f]">{agent.availability}</div></div><div><div className="text-[#8495a6]">Est. completion</div><div className="mt-1 font-semibold text-[#3b6a8f]">{agent.estimated_completion_minutes ? `${agent.estimated_completion_minutes} min` : "Unknown"}</div></div></div></button>; }
function MatchCard({ candidate, selected, onSelect }: { candidate: MatchCandidate; selected: boolean; onSelect: () => void }) { return <div className={`rounded-3xl border p-5 ${candidate.eligible ? "border-[#d4e5ef] bg-white" : "border-[#eadfda] bg-[#fffafa]"}`}><div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold text-[#23486d]">{candidate.agent_name}</h3><StatusPill label={candidate.eligible ? "eligible" : "excluded"} tone={candidate.eligible ? "good" : "bad"} /></div><p className="mt-2 text-sm leading-6 text-[#687e94]">{candidate.explanation}</p></div><div className="text-left md:text-right"><div className="text-3xl font-semibold text-[#2e78a7]">{candidate.score}</div><div className="text-xs uppercase tracking-[0.14em] text-[#8093a5]">heuristic score</div></div></div><div className="mt-4 grid gap-3 text-xs md:grid-cols-3"><div><div className="font-bold uppercase tracking-[0.13em] text-[#8b9bab]">Matched</div><div className="mt-2 text-[#4f718d]">{candidate.matched_skills.join(", ") || "None"}</div></div><div><div className="font-bold uppercase tracking-[0.13em] text-[#8b9bab]">Missing</div><div className="mt-2 text-[#a15f5f]">{candidate.missing_skills.join(", ") || "None"}</div></div><div><div className="font-bold uppercase tracking-[0.13em] text-[#8b9bab]">Warnings</div><div className="mt-2 text-[#8a6f32]">{candidate.warnings.join(" ") || "None"}</div></div></div>{candidate.eligible && <button disabled={selected} onClick={onSelect} className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#102d52] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40">{selected ? "Selected" : "Select this agent"} <ArrowRight size={14} /></button>}</div>; }
function Field({ label, value, onChange, type = "text", help }: { label: string; value: string; onChange: (value: string) => void; type?: string; help?: string }) { return <label className="block"><span className="text-xs font-bold uppercase tracking-[0.13em] text-[#6e8399]">{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-2xl border border-[#d4e3ee] bg-[#fbfdff] px-4 py-3 text-sm text-[#24476a] outline-none transition focus:border-[#72abd1]" />{help && <span className="mt-1.5 block text-xs text-[#8a9aaa]">{help}</span>}</label>; }
function TextArea({ label, value, onChange, help, className = "" }: { label: string; value: string; onChange: (value: string) => void; help?: string; className?: string }) { return <label className={`block ${className}`}><span className="text-xs font-bold uppercase tracking-[0.13em] text-[#6e8399]">{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 min-h-[110px] w-full rounded-2xl border border-[#d4e3ee] bg-[#fbfdff] px-4 py-3 text-sm leading-6 text-[#24476a] outline-none transition focus:border-[#72abd1]" />{help && <span className="mt-1.5 block text-xs text-[#8a9aaa]">{help}</span>}</label>; }
function ReadOnly({ label, value }: { label: string; value: string }) { return <div><div className="text-xs font-bold uppercase tracking-[0.13em] text-[#8798a8]">{label}</div><div className="mt-1 leading-6 text-[#526e88]">{value}</div></div>; }
function SummaryTile({ label, value }: { label: string; value: string }) { return <div className="rounded-3xl border border-[#d7e5f0] bg-[#f8fbfe] p-5"><div className="text-xs font-bold uppercase tracking-[0.13em] text-[#8395a7]">{label}</div><div className="mt-3 break-words text-xl font-semibold text-[#244a70]">{value}</div></div>; }
