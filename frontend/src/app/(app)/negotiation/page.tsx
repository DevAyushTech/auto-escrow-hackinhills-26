import LegacyWorkspace from "@/components/layout/LegacyWorkspace";

export default function NegotiationPage() {
  return <LegacyWorkspace eyebrow="Agreement workspace" title="Review terms before funding" description="Agreement creation, acceptance, version freezing, and the consequences of acceptance are connected in the guided demo." focus={["A proposal starts from the persisted job and selected executor.", "Acceptance freezes the version used by later verification.", "Acceptance assigns the job but never silently funds escrow."]} />;
}
