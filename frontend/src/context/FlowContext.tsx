"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, API_BASE_URL, ApiError } from "@/lib/api";
import { Agent, Transaction, MOCK_AGENTS, INITIAL_TRANSACTION } from "@/data/mockData";

export type FlowStep =
  | "DISCOVER"
  | "IDENTIFY"
  | "ASSESS_RISK"
  | "NEGOTIATE"
  | "ESCROW"
  | "EXECUTE"
  | "PROOF"
  | "VERIFY"
  | "SETTLEMENT"
  | "REPUTATION";

type SessionStatus = "idle" | "loading" | "ready" | "error";

interface FlowContextType {
  activeTransaction: Transaction;
  selectedAgent: Agent;
  setSelectedAgent: (agent: Agent) => void;
  setTransactionStatus: (status: Transaction["status"]) => void;
  verificationOutcome: "IDLE" | "IN_PROGRESS" | "PASSED" | "FAILED";
  setVerificationOutcome: (outcome: "IDLE" | "IN_PROGRESS" | "PASSED" | "FAILED") => void;
  resetSimulation: () => void;
  startTransactionWithAgent: (agent: Agent) => void;
  apiBaseUrl: string;
  sessionToken: string | null;
  sessionExpiresAt: string | null;
  sessionStatus: SessionStatus;
  sessionError: string | null;
  activeJobId: number | null;
  setActiveJobId: (jobId: number | null) => void;
  ensureDemoSession: () => Promise<string>;
  startFreshDemoSession: () => Promise<string>;
  resetDemoSession: () => Promise<string>;
}

const FlowContext = createContext<FlowContextType | undefined>(undefined);
const SESSION_STORAGE_KEY = "auto-escrow-demo-session";
const JOB_STORAGE_KEY = "auto-escrow-active-job";

function readStoredSession(): { token: string; expiresAt: string | null } | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as { token?: string; expiresAt?: string | null };
    return parsed.token ? { token: parsed.token, expiresAt: parsed.expiresAt ?? null } : null;
  } catch {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

function persistSession(token: string, expiresAt: string | null) {
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ token, expiresAt }));
}

export const FlowProvider = ({ children }: { children: React.ReactNode }) => {
  const [selectedAgent, setSelectedAgent] = useState<Agent>(MOCK_AGENTS[1]);
  const [activeTransaction, setActiveTransaction] = useState<Transaction>({
    ...INITIAL_TRANSACTION,
    provider: MOCK_AGENTS[1],
  });
  const [verificationOutcome, setVerificationOutcome] = useState<"IDLE" | "IN_PROGRESS" | "PASSED" | "FAILED">("IDLE");
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("idle");
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [activeJobId, setActiveJobIdState] = useState<number | null>(null);

  const setTransactionStatus = useCallback((status: Transaction["status"]) => {
    setActiveTransaction((prev) => ({ ...prev, status }));
  }, []);

  const startTransactionWithAgent = (agent: Agent) => {
    setSelectedAgent(agent);
    setActiveTransaction({
      id: `TX-${Math.floor(10000 + Math.random() * 90000)}-AE`,
      buyer: "Demo requester (synthetic)",
      provider: agent,
      task: `Coordinate a verified task with ${agent.name}`,
      amount: agent.priceAmount,
      currency: "USDC",
      status: "RISK_ASSESSED",
      riskScore: agent.riskLevel === "Low" ? 18 : agent.riskLevel === "Moderate" ? 44 : 78,
      slaMinutes: 20,
      timestamp: "Just now",
    });
    setVerificationOutcome("IDLE");
  };

  const resetSimulation = () => {
    setSelectedAgent(MOCK_AGENTS[1]);
    setActiveTransaction(INITIAL_TRANSACTION);
    setVerificationOutcome("IDLE");
    setActiveJobIdState(null);
    if (typeof window !== "undefined") window.localStorage.removeItem(JOB_STORAGE_KEY);
  };

  const setActiveJobId = useCallback((jobId: number | null) => {
    setActiveJobIdState(jobId);
    if (typeof window !== "undefined") {
      if (jobId === null) window.localStorage.removeItem(JOB_STORAGE_KEY);
      else window.localStorage.setItem(JOB_STORAGE_KEY, String(jobId));
    }
  }, []);

  useEffect(() => {
    const stored = readStoredSession();
    if (stored) {
      setSessionToken(stored.token);
      setSessionExpiresAt(stored.expiresAt);
      setSessionStatus("ready");
    }
    const storedJob = window.localStorage.getItem(JOB_STORAGE_KEY);
    if (storedJob) {
      const parsedJobId = Number(storedJob);
      if (Number.isInteger(parsedJobId) && parsedJobId > 0) setActiveJobIdState(parsedJobId);
    }
  }, []);

  const ensureDemoSession = useCallback(async () => {
    if (sessionToken) return sessionToken;
    const stored = readStoredSession();
    if (stored) {
      setSessionToken(stored.token);
      setSessionExpiresAt(stored.expiresAt);
      setSessionStatus("ready");
      return stored.token;
    }

    setSessionStatus("loading");
    setSessionError(null);
    try {
      const session = await api.startSession();
      if (!session) throw new ApiError(500, "The API returned an empty demo session.");
      setSessionToken(session.session_token);
      setSessionExpiresAt(session.expires_at);
      persistSession(session.session_token, session.expires_at);
      setSessionStatus("ready");
      return session.session_token;
    } catch (error) {
      const message = error instanceof ApiError ? error.detail : "The demo session could not be started.";
      setSessionStatus("error");
      setSessionError(message);
      throw error;
    }
  }, [sessionToken]);

  const startFreshDemoSession = useCallback(async () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      window.localStorage.removeItem(JOB_STORAGE_KEY);
    }
    setSessionToken(null);
    setSessionExpiresAt(null);
    setActiveJobIdState(null);
    setSessionStatus("loading");
    setSessionError(null);
    const session = await api.startSession();
    if (!session) throw new ApiError(500, "The API returned an empty demo session.");
    setSessionToken(session.session_token);
    setSessionExpiresAt(session.expires_at);
    persistSession(session.session_token, session.expires_at);
    setSessionStatus("ready");
    return session.session_token;
  }, []);

  const resetDemoSession = useCallback(async () => {
    const token = await ensureDemoSession();
    setSessionStatus("loading");
    const session = await api.resetSession(token);
    if (!session) throw new ApiError(500, "The API returned an empty reset session.");
    setSessionToken(session.session_token);
    setSessionExpiresAt(session.expires_at);
    persistSession(session.session_token, session.expires_at);
    setActiveJobId(null);
    resetSimulation();
    setSessionStatus("ready");
    return session.session_token;
  }, [ensureDemoSession, resetSimulation, setActiveJobId]);

  return (
    <FlowContext.Provider
      value={{
        activeTransaction,
        selectedAgent,
        setSelectedAgent,
        setTransactionStatus,
        verificationOutcome,
        setVerificationOutcome,
        resetSimulation,
        startTransactionWithAgent,
        apiBaseUrl: API_BASE_URL,
        sessionToken,
        sessionExpiresAt,
        sessionStatus,
        sessionError,
        activeJobId,
        setActiveJobId,
        ensureDemoSession,
        startFreshDemoSession,
        resetDemoSession,
      }}
    >
      {children}
    </FlowContext.Provider>
  );
};

export const useFlow = () => {
  const context = useContext(FlowContext);
  if (!context) throw new Error("useFlow must be used within FlowProvider");
  return context;
};
