import LegacyWorkspace from "@/components/layout/LegacyWorkspace";

export default function VerificationPage() {
  return <LegacyWorkspace eyebrow="Deterministic checks" title="Verification you can explain" description="The verifier reads the accepted agreement snapshot and returns individual checks, reasons, scores, and manual-review outcomes in the guided demo." focus={["JSON, fields, terms, lengths, evidence, formats, and a restricted schema subset are supported.", "Subjective criteria become manual review rather than an automatic pass.", "A passed result enables a separate release action; it does not release funds by itself."]} />;
}
