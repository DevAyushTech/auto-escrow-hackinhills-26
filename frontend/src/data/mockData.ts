export interface Agent {
  id: string;
  name: string;
  category: "Engineering" | "Data & ML" | "Security Audit" | "Market Analysis" | "Vision";
  trustScore: number;
  successRate: number;
  completedTasks: number;
  avgResponseTime: string;
  priceRate: string;
  priceAmount: number;
  riskLevel: "Low" | "Moderate" | "High";
  verified: boolean;
  avatar: string;
  description: string;
  capabilities: string[];
  publicKey: string;
  autonomyLevel: "Restricted" | "Standard" | "Autonomous Prime";
}

export const MOCK_AGENTS: Agent[] = [
  {
    id: "ag-01",
    name: "CodeForge AI",
    category: "Engineering",
    trustScore: 98.2,
    successRate: 99.4,
    completedTasks: 1420,
    avgResponseTime: "4.2 min",
    priceRate: "45 USDC / task",
    priceAmount: 45,
    riskLevel: "Low",
    verified: true,
    avatar: "CF",
    description: "Autonomous software synthesizer specializing in Rust & Solidity smart contracts with formal invariants.",
    capabilities: ["Deterministic Code Generation", "EVM Bytecode Analysis", "Unit Test Synthesizer"],
    publicKey: "0x8F3b...9E21",
    autonomyLevel: "Autonomous Prime"
  },
  {
    id: "ag-02",
    name: "DataPilot",
    category: "Data & ML",
    trustScore: 94.7,
    successRate: 97.4,
    completedTasks: 890,
    avgResponseTime: "8.1 min",
    priceRate: "35 USDC / task",
    priceAmount: 35,
    riskLevel: "Low",
    verified: true,
    avatar: "DP",
    description: "Multi-stream tabular data processor providing anomaly detection, regression modeling, and vector sanitization.",
    capabilities: ["Vector Anomaly Scan", "Statistical Outlier Pruning", "Zero-Knowledge Proof Reports"],
    publicKey: "0x3A21...7C44",
    autonomyLevel: "Autonomous Prime"
  },
  {
    id: "ag-03",
    name: "AuditCore Sentinel",
    category: "Security Audit",
    trustScore: 96.8,
    successRate: 98.9,
    completedTasks: 640,
    avgResponseTime: "14.5 min",
    priceRate: "90 USDC / task",
    priceAmount: 90,
    riskLevel: "Low",
    verified: true,
    avatar: "AC",
    description: "Autonomous penetration testing and fuzzing agent for decentralized protocol contracts.",
    capabilities: ["Symbolic Execution", "Reentrancy Scanner", "Gas Optimization Prover"],
    publicKey: "0x17D9...FF02",
    autonomyLevel: "Autonomous Prime"
  },
  {
    id: "ag-04",
    name: "VisionInspect",
    category: "Vision",
    trustScore: 88.5,
    successRate: 91.2,
    completedTasks: 310,
    avgResponseTime: "2.8 min",
    priceRate: "20 USDC / task",
    priceAmount: 20,
    riskLevel: "Moderate",
    verified: true,
    avatar: "VI",
    description: "Visual defect recognition, OCR transcription and cryptographic pixel authenticity verification.",
    capabilities: ["Object Localization", "Deepfake Artifact Scan", "Resolution Upscale"],
    publicKey: "0x98C1...41E9",
    autonomyLevel: "Standard"
  },
  {
    id: "ag-05",
    name: "MarketIntel Zero",
    category: "Market Analysis",
    trustScore: 79.1,
    successRate: 84.5,
    completedTasks: 185,
    avgResponseTime: "1.2 min",
    priceRate: "15 USDC / task",
    priceAmount: 15,
    riskLevel: "High",
    verified: false,
    avatar: "MI",
    description: "Sub-second cross-DEX liquidity depth and mempool arbitration watcher.",
    capabilities: ["Mempool Tracking", "Spread Arbitrage Modeling", "Sentiment Scraping"],
    publicKey: "0x54F2...11A3",
    autonomyLevel: "Restricted"
  }
];

export interface Transaction {
  id: string;
  buyer: string;
  provider: Agent;
  task: string;
  amount: number;
  currency: string;
  status: "DISCOVERY" | "RISK_ASSESSED" | "NEGOTIATED" | "FUNDS_LOCKED" | "EXECUTING" | "VERIFICATION_PENDING" | "VERIFICATION_PASSED" | "PAYMENT_RELEASED" | "VERIFICATION_FAILED" | "DISPUTED" | "REFUNDED";
  riskScore: number;
  slaMinutes: number;
  timestamp: string;
}

export const INITIAL_TRANSACTION: Transaction = {
  id: "TX-90218-AE",
  buyer: "MasterProtocol Agent (0x4E...8B91)",
  provider: MOCK_AGENTS[1], // DataPilot
  task: "Real-time dataset analysis with anomaly detection & SHA256 integrity seal",
  amount: 35,
  currency: "USDC",
  status: "DISCOVERY",
  riskScore: 18,
  slaMinutes: 20,
  timestamp: "Just now"
};