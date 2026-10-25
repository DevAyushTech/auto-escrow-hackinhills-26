import LegacyWorkspace from "@/components/layout/LegacyWorkspace";

export default function EscrowPage() {
  return <LegacyWorkspace eyebrow="Simulated ledger" title="Escrow, without the false promise" description="The connected escrow view is job-scoped in the guided demo. It reads the accepted amount, funding state, ledger entries, eligibility, and audit history from FastAPI." focus={["Funding derives amount and currency from accepted terms.", "No bank, wallet, blockchain, or payment provider is connected.", "Release is blocked until verification, state, dispute, and ledger guards allow it."]} />;
}
