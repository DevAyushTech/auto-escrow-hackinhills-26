import LegacyWorkspace from "@/components/layout/LegacyWorkspace";

export default function DisputesPage() {
  return <LegacyWorkspace eyebrow="Protected outcome" title="Disputes need evidence" description="Open, review, and resolve a dispute from the guided demo after a funded job has a submission or verification context." focus={["An unresolved dispute moves the job and escrow into protected states.", "Review and resolution are explicit transitions with audit events.", "Refund and release outcomes call the same guarded escrow services as normal settlement."]} />;
}
