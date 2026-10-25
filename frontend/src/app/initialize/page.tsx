import LegacyWorkspace from "@/components/layout/LegacyWorkspace";

export default function InitializeEscrowPage() {
  return <LegacyWorkspace eyebrow="Guided setup" title="Initialize from a real job" description="The old standalone contract form has been replaced by the connected guided flow so visitors cannot enter values into a screen that does nothing." focus={["Create a validated job with requirements, budget, deadline, and criteria.", "Select an eligible agent from persisted matching results.", "Accept the agreement, then fund the simulated escrow through the backend."]} />;
}
