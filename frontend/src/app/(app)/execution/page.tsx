import LegacyWorkspace from "@/components/layout/LegacyWorkspace";

export default function ExecutionPage() {
  return <LegacyWorkspace eyebrow="Safe local executor" title="Submit work without executing code" description="The MVP records a local demo execution boundary and stores immutable submissions. Use the guided demo to see the state transitions and retry behavior." focus={["Starting execution requires accepted terms, a selected agent, and funded escrow.", "Submitted output is persisted as a versioned record.", "The application never runs arbitrary submitted code or calls an external agent runtime."]} />;
}
