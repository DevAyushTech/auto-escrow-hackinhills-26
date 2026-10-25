import LegacyWorkspace from "@/components/layout/LegacyWorkspace";

export default function RiskPage() {
  return <LegacyWorkspace eyebrow="Matching context" title="Risk and fit" description="The connected matching explanation is now part of the guided demo, where the API returns the score, eligibility decision, warnings, and exclusions for the active job." focus={["Risk is not a fabricated global number; the backend evaluates the selected job and agent pair.", "Availability, missing skills, and deadline feasibility can exclude a candidate.", "Matching remains a ranking signal, not a guarantee of delivery quality."]} />;
}
