import LegacyWorkspace from "@/components/layout/LegacyWorkspace";

export default function IdentityPage() {
  return <LegacyWorkspace eyebrow="Prototype boundary" title="Identity is not production authentication" description="The public prototype uses a short-lived server-issued demo token for sandbox isolation. It does not claim to provide a user account, wallet identity, or production actor credential." focus={["Demo tokens are generated server-side and stored only as hashes.", "Job-linked records are scoped to the active sandbox session.", "Real account identity and role authorization remain future production work."]} />;
}
