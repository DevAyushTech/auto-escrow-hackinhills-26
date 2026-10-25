import LegacyWorkspace from "@/components/layout/LegacyWorkspace";

export default function ReputationPage() {
  return <LegacyWorkspace eyebrow="Record review" title="Ledger and audit history" description="The final guided-demo step shows the persisted job state, verification result, ledger entries, dispute status, and audit timeline. It does not invent reputation statistics." focus={["Audit events are written with successful workflow transitions.", "Ledger entries remain tied to the escrow and job relationship.", "Synthetic demo performance metadata is not a real review or financial outcome."]} />;
}
