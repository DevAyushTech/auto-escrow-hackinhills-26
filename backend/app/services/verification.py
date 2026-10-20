"""Deterministic verification and persisted verification workflows."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
import json
import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.job_states import InvalidJobTransition
from app.models import Agreement, Job, Submission, Verification
from app.services.audit import record_event
from app.services.jobs import transition_job


MANUAL_REVIEW_MARKERS = (
    "manual review",
    "human review",
    "subjective",
    "factual accuracy",
    "originality",
    "professional quality",
    "safety review",
)
SAFE_EXCERPT_LENGTH = 240


class VerificationServiceError(Exception):
    """Base class for expected verification workflow failures."""


class VerificationJobNotFoundError(VerificationServiceError):
    pass


class VerificationAgreementRequiredError(VerificationServiceError):
    pass


class VerificationStateConflictError(VerificationServiceError):
    pass


class VerificationSubmissionRequiredError(VerificationServiceError):
    pass


@dataclass(frozen=True)
class CheckResult:
    name: str
    status: str
    explanation: str
    evidence: Any = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "status": self.status,
            "passed": self.status == "passed",
            "explanation": self.explanation,
            "evidence": self.evidence,
        }


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _excerpt(value: str) -> str:
    compact = " ".join(value.strip().split())
    if len(compact) <= SAFE_EXCERPT_LENGTH:
        return compact
    return f"{compact[:SAFE_EXCERPT_LENGTH - 1]}…"


def _as_list(value: Any) -> list[str]:
    if isinstance(value, str):
        values = re.split(r"[,;\n]", value)
    elif isinstance(value, list):
        values = value
    else:
        return []
    return [item.strip() for item in values if isinstance(item, str) and item.strip()]


def _parse_named_values(criterion: str, label: str) -> list[str]:
    match = re.search(
        rf"{label}\s*(?:are|is|must be|include|includes|:)\s*(.+)$",
        criterion,
        flags=re.IGNORECASE,
    )
    return _as_list(match.group(1)) if match else []


def _json_value(output: str) -> tuple[Any | None, str | None]:
    try:
        return json.loads(output), None
    except json.JSONDecodeError as exc:
        return None, f"JSON parsing failed at line {exc.lineno}, column {exc.colno}."


def _check_json_schema(value: Any, schema: Any) -> tuple[str, str, Any]:
    """Validate a deliberately small, safe JSON-schema subset.

    The evaluator never executes schema expressions.  Unsupported schema
    keywords are manual-review work rather than an automatic pass.
    """

    if not isinstance(schema, dict):
        return "manual_review", "The configured JSON schema is not an object.", None
    supported = {"type", "required", "properties", "minProperties"}
    if any(key not in supported for key in schema):
        return "manual_review", "The configured schema uses unsupported keywords and needs manual review.", None
    expected_type = schema.get("type")
    type_matches = {
        "object": isinstance(value, dict),
        "array": isinstance(value, list),
        "string": isinstance(value, str),
        "number": isinstance(value, (int, float)) and not isinstance(value, bool),
        "integer": isinstance(value, int) and not isinstance(value, bool),
        "boolean": isinstance(value, bool),
        "null": value is None,
    }
    if isinstance(expected_type, str) and expected_type in type_matches and not type_matches[expected_type]:
        return "failed", f"The JSON output must have type {expected_type}.", {"actual_type": type(value).__name__}
    if expected_type not in (None, *type_matches):
        return "manual_review", "The configured JSON schema has an unsupported type.", None
    if isinstance(schema.get("required"), list) and isinstance(value, dict):
        missing = [field for field in schema["required"] if isinstance(field, str) and field not in value]
        if missing:
            return "failed", "Required JSON schema fields are missing.", {"missing_fields": missing}
    if isinstance(schema.get("minProperties"), int) and isinstance(value, dict):
        if len(value) < schema["minProperties"]:
            return "failed", "The JSON output does not contain enough object properties.", {
                "minimum": schema["minProperties"],
                "actual": len(value),
            }
    properties = schema.get("properties")
    if isinstance(properties, dict) and isinstance(value, dict):
        for field, field_schema in properties.items():
            if field not in value or not isinstance(field_schema, dict):
                continue
            field_status, field_explanation, field_evidence = _check_json_schema(value[field], field_schema)
            if field_status != "passed":
                return field_status, f"JSON field {field!r}: {field_explanation}", {
                    "field": field,
                    "details": field_evidence,
                }
    return "passed", "The JSON output satisfies the configured schema subset.", {"schema_checked": True}


def _criterion_check(criterion: str, output: str, evidence: dict[str, Any], parsed_json: Any | None, json_error: str | None) -> CheckResult:
    lowered = criterion.lower()
    if any(marker in lowered for marker in MANUAL_REVIEW_MARKERS):
        return CheckResult(
            name=criterion,
            status="manual_review",
            explanation="This criterion cannot be established reliably by deterministic checks.",
            evidence={"next_step": "A requester or operator must review this criterion."},
        )

    required_fields = _parse_named_values(criterion, r"(?:required|must\s+include)\s+(?:json\s+)?fields?")
    if required_fields:
        if not isinstance(parsed_json, dict):
            return CheckResult(
                name=f"Required fields: {', '.join(required_fields)}",
                status="failed",
                explanation="Required fields can only be checked when the submission is a JSON object.",
                evidence={"missing_fields": required_fields, "json_error": json_error},
            )
        missing = [field for field in required_fields if field not in parsed_json]
        return CheckResult(
            name=f"Required fields: {', '.join(required_fields)}",
            status="failed" if missing else "passed",
            explanation="Required JSON fields are missing." if missing else "All required JSON fields are present.",
            evidence={"missing_fields": missing, "present_fields": [field for field in required_fields if field in parsed_json]},
        )

    required_sections = _parse_named_values(criterion, r"(?:required|must\s+include)\s+sections?")
    if required_sections:
        missing = [section for section in required_sections if section.lower() not in output.lower()]
        return CheckResult(
            name=f"Required sections: {', '.join(required_sections)}",
            status="failed" if missing else "passed",
            explanation="Required sections are missing from the output." if missing else "All required sections appear in the output.",
            evidence={"missing_sections": missing},
        )

    required_terms = _parse_named_values(criterion, r"(?:required|must\s+include)\s+terms?")
    if not required_terms:
        quoted_terms = re.findall(r"(?:include|contain|mention)\s+(?:the\s+)?(?:term|text|phrase)?\s*[\"']([^\"']+)[\"']", criterion, flags=re.IGNORECASE)
        required_terms = [term.strip() for term in quoted_terms if term.strip()]
    if not required_terms:
        unquoted_term = re.search(r"(?:must|should)\s+(?:include|contain|mention)\s+(?:the\s+)?(?:term|text|phrase)?\s*([\w][\w -]{1,80})$", criterion, flags=re.IGNORECASE)
        if unquoted_term:
            required_terms = [unquoted_term.group(1).strip()]
    if required_terms:
        missing = [term for term in required_terms if term.lower() not in output.lower()]
        return CheckResult(
            name=f"Required terms: {', '.join(required_terms)}",
            status="failed" if missing else "passed",
            explanation="Required terms are missing from the output." if missing else "All required terms appear in the output.",
            evidence={"missing_terms": missing},
        )

    length_match = re.search(r"(?:minimum|min)\s+length\s*(?:of|is|must be|:)\s*(\d+)\s*(characters?|words?)?", lowered)
    if length_match:
        raw_minimum, unit = length_match.groups()
        unit = unit or "characters"
    else:
        length_match = re.search(r"(?:minimum|min)\s+(characters?|words?)\s*(?:of|is|must be|:)\s*(\d+)", lowered)
        if length_match:
            unit, raw_minimum = length_match.groups()
        else:
            length_match = re.search(r"at\s+least\s+(\d+)\s+(characters?|words?)", lowered)
            if length_match:
                raw_minimum, unit = length_match.groups()
    if length_match:
        minimum = int(raw_minimum)
        actual = len(output.split()) if "word" in unit else len(output)
        return CheckResult(
            name=f"Minimum {unit}: {minimum}",
            status="passed" if actual >= minimum else "failed",
            explanation=f"The output contains {actual} {unit}; minimum is {minimum}.",
            evidence={"actual": actual, "minimum": minimum},
        )

    if "valid json" in lowered or "json output" in lowered or "format" in lowered and "json" in lowered:
        return CheckResult(
            name="Valid JSON output",
            status="passed" if json_error is None else "failed",
            explanation="The output parses as JSON." if json_error is None else json_error,
            evidence={"top_level_type": type(parsed_json).__name__ if json_error is None else None},
        )

    evidence_fields = _parse_named_values(criterion, r"(?:required|must\s+include)\s+evidence\s+fields?")
    if not evidence_fields:
        evidence_match = re.search(r"evidence\s+(?:must|should)\s+include\s*:?\s*(.+)$", criterion, flags=re.IGNORECASE)
        evidence_fields = _as_list(evidence_match.group(1)) if evidence_match else []
    if evidence_fields:
        missing = [field for field in evidence_fields if field not in evidence]
        return CheckResult(
            name=f"Required evidence fields: {', '.join(evidence_fields)}",
            status="failed" if missing else "passed",
            explanation="Required evidence fields are missing." if missing else "All required evidence fields are present.",
            evidence={"missing_fields": missing},
        )

    return CheckResult(
        name=criterion,
        status="manual_review",
        explanation="No safe deterministic rule matches this criterion; it requires manual review.",
        evidence={"criterion": _excerpt(criterion)},
    )


def evaluate_submission(agreement: Agreement, submission: Submission) -> dict[str, Any]:
    """Evaluate one submission using only the accepted agreement snapshot."""

    terms = agreement.terms if isinstance(agreement.terms, dict) else {}
    criteria = terms.get("acceptance_criteria")
    criteria = [item for item in criteria if isinstance(item, str) and item.strip()] if isinstance(criteria, list) else []
    evidence = submission.evidence if isinstance(submission.evidence, dict) else {}
    parsed_json, json_error = _json_value(submission.submitted_output)
    checks = [_criterion_check(criterion, submission.submitted_output, evidence, parsed_json, json_error) for criterion in criteria]

    rules = terms.get("verification_rules") if isinstance(terms.get("verification_rules"), dict) else {}
    if rules.get("output_format"):
        output_format = str(rules["output_format"]).lower()
        if output_format == "json":
            checks.append(_criterion_check("Valid JSON output", submission.submitted_output, evidence, parsed_json, json_error))
        elif output_format in {"markdown", "text", "csv"}:
            checks.append(
                CheckResult(
                    name=f"Expected {output_format} output",
                    status="passed" if output_format != "csv" or all("," in line for line in submission.submitted_output.splitlines() if line.strip()) else "failed",
                    explanation=f"The output contains the requested {output_format} representation.",
                    evidence={"format": output_format},
                )
            )
        else:
            checks.append(CheckResult(
                name="Configured output format",
                status="manual_review",
                explanation="The configured output format is not supported by the deterministic evaluator.",
                evidence={"format": output_format},
            ))
    for field in _as_list(rules.get("required_fields")):
        checks.append(_criterion_check(f"Required fields: {field}", submission.submitted_output, evidence, parsed_json, json_error))
    for term in _as_list(rules.get("required_terms")):
        checks.append(_criterion_check(f"Required terms: {term}", submission.submitted_output, evidence, parsed_json, json_error))
    for field in _as_list(rules.get("required_evidence_fields")):
        checks.append(_criterion_check(f"Required evidence fields: {field}", submission.submitted_output, evidence, parsed_json, json_error))
    if isinstance(rules.get("min_length"), int):
        checks.append(_criterion_check(f"Minimum length: {rules['min_length']}", submission.submitted_output, evidence, parsed_json, json_error))
    if rules.get("json_schema") is not None:
        if json_error is not None:
            checks.append(CheckResult(
                name="Configured JSON schema",
                status="failed",
                explanation="The output cannot satisfy the JSON schema because it is not valid JSON.",
                evidence={"json_error": json_error},
            ))
        else:
            status, explanation, schema_evidence = _check_json_schema(parsed_json, rules["json_schema"])
            checks.append(CheckResult("Configured JSON schema", status, explanation, schema_evidence))

    if not checks:
        checks.append(CheckResult(
            name="Acceptance criteria configured",
            status="manual_review",
            explanation="The accepted agreement does not contain an automatically evaluable criterion.",
            evidence={"next_step": "Add criteria or perform manual review."},
        ))
    failed = [check for check in checks if check.status == "failed"]
    manual = [check for check in checks if check.status == "manual_review"]
    if manual:
        overall = "manual_review"
    elif failed:
        overall = "failed"
    else:
        overall = "passed"
    automated_checks = [check for check in checks if check.status in {"passed", "failed"}]
    score = None if not automated_checks else Decimal(str(round(sum(check.status == "passed" for check in automated_checks) / len(automated_checks) * 100, 2)))
    reasons = [check.explanation for check in failed + manual]
    return {
        "overall_result": overall,
        "checks": [check.as_dict() for check in checks],
        "reasons": reasons,
        "score": score,
        "feedback": {
            "limitations": [
                "Deterministic checks do not establish factual accuracy, originality, safety, or professional quality.",
            ],
            "manual_review_required": bool(manual),
        },
    }


def latest_submission(db: Session, job_id: int) -> Submission | None:
    return db.scalar(
        select(Submission)
        .where(Submission.job_id == job_id)
        .order_by(Submission.version.desc(), Submission.id.desc())
        .limit(1)
    )


def list_submissions(db: Session, job_id: int) -> list[Submission]:
    return list(
        db.scalars(
            select(Submission)
            .where(Submission.job_id == job_id)
            .order_by(Submission.version.asc(), Submission.id.asc())
        ).all()
    )


def latest_verification(db: Session, job_id: int) -> Verification | None:
    return db.scalar(
        select(Verification)
        .join(Submission, Verification.submission_id == Submission.id)
        .where(Submission.job_id == job_id)
        .order_by(Verification.evaluated_at.desc(), Verification.id.desc())
        .limit(1)
    )


def verification_for_submission(db: Session, submission_id: int) -> Verification | None:
    return db.scalar(select(Verification).where(Verification.submission_id == submission_id))


def verify_latest_submission(db: Session, job_id: int) -> Verification:
    """Evaluate the latest submission once; repeated requests are idempotent."""

    try:
        job = db.scalar(select(Job).where(Job.id == job_id).with_for_update())
        if job is None:
            raise VerificationJobNotFoundError("job not found")
        agreement = db.scalar(select(Agreement).where(Agreement.job_id == job.id))
        if agreement is None or agreement.status != "accepted" or agreement.accepted_version is None:
            raise VerificationAgreementRequiredError("accepted agreement is required before verification")
        submission = latest_submission(db, job.id)
        if submission is None:
            raise VerificationSubmissionRequiredError("a submission is required before verification")
        existing = verification_for_submission(db, submission.id)
        if existing is not None:
            # The database has one verification per immutable submission.  A
            # repeated request returns that result instead of inventing a new
            # result or audit event.
            return existing
        if job.status not in {"submitted", "under_review"}:
            raise VerificationStateConflictError("job must be submitted before verification")
        if job.status == "submitted":
            try:
                transition_job(job, "under_review")
            except InvalidJobTransition as exc:
                raise VerificationStateConflictError(str(exc)) from exc
        record_event(
            db,
            "verification.started",
            job_id=job.id,
            description="verification.started",
            data={
                "submission_id": submission.id,
                "submission_version": submission.version,
                "evaluator_type": "automated",
            },
        )
        result = evaluate_submission(agreement, submission)
        now = utc_now()
        verification = Verification(
            submission_id=submission.id,
            status="passed" if result["overall_result"] == "passed" else "failed",
            overall_result=result["overall_result"],
            individual_checks=result["checks"],
            reasons=result["reasons"],
            evaluator_type="automated",
            score=result["score"],
            feedback=result["feedback"],
            evaluated_at=now,
            verified_at=now,
        )
        db.add(verification)
        submission.status = "accepted" if result["overall_result"] == "passed" else "rejected"
        db.flush()
        if result["overall_result"] == "passed":
            try:
                transition_job(job, "completed")
            except InvalidJobTransition as exc:
                raise VerificationStateConflictError(str(exc)) from exc
            record_event(
                db,
                "verification.passed",
                job_id=job.id,
                description="verification.passed",
                data={
                    "submission_id": submission.id,
                    "submission_version": submission.version,
                    "verification_id": verification.id,
                    "evaluator_type": verification.evaluator_type,
                },
            )
            record_event(
                db,
                "job.settlement_ready",
                job_id=job.id,
                description="job.settlement_ready",
                data={
                    "submission_id": submission.id,
                    "verification_id": verification.id,
                    "escrow_release_required": True,
                },
            )
        elif result["overall_result"] == "manual_review":
            submission.status = "pending"
            record_event(
                db,
                "verification.manual_review_required",
                job_id=job.id,
                description="verification.manual_review_required",
                data={
                    "submission_id": submission.id,
                    "submission_version": submission.version,
                    "verification_id": verification.id,
                },
            )
        else:
            record_event(
                db,
                "verification.failed",
                job_id=job.id,
                description="verification.failed",
                data={
                    "submission_id": submission.id,
                    "submission_version": submission.version,
                    "verification_id": verification.id,
                    "failed_checks": [check["name"] for check in result["checks"] if check["status"] == "failed"],
                },
            )
        db.commit()
        db.refresh(verification)
        return verification
    except Exception:
        db.rollback()
        raise


__all__ = [
    "VerificationAgreementRequiredError",
    "VerificationJobNotFoundError",
    "VerificationServiceError",
    "VerificationStateConflictError",
    "VerificationSubmissionRequiredError",
    "evaluate_submission",
    "latest_submission",
    "latest_verification",
    "list_submissions",
    "verify_latest_submission",
    "verification_for_submission",
]
