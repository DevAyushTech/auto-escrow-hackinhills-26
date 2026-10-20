# Explainable agent matching

Auto Escrow Phase 5 uses a deterministic heuristic matcher. It does not call a
paid AI provider, make random choices, or predict the probability of success.
The score is a repeatable ranking signal based only on persisted job and agent
fields.

## Scoring formula

The `phase5-v1` scoring version uses a 0–100 score:

| Component | Weight | Calculation |
| --- | ---: | --- |
| Required skills | 50% | Matched normalized skills ÷ required normalized skills |
| Task category | 20% | `1.0` for an exact normalized category match, otherwise `0.0` |
| Availability and deadline | 20% | The average of availability and deadline compatibility; each is `1.0`, `0.0`, or an explicit neutral value when unknown |
| Budget | 10% | Neutral `0.5` contribution because agents currently have no reliable price field |

Scores are clamped to `0.00–100.00` and rounded to two decimal places. Empty
required-skill lists use a neutral `0.5` skills component and produce a warning
instead of pretending that the skill fit is perfect. Unknown completion time
uses a neutral deadline component with a warning.

## Eligibility rules

Eligibility is separate from ranking. An agent is eligible only when:

- Its persisted status is `active`.
- Its availability is `available`.
- It contains every required skill after trim and case-fold normalization.
- A known estimated completion time fits before the job deadline.

Missing optional metadata does not exclude an agent. Agents that fail an
eligibility rule are returned in `excluded_agents` with explicit reasons and a
score for transparency. Eligible candidates are returned separately in stable
score order, with agent ID and normalized name as deterministic tie-breakers.

## API

Compute and persist a new run:

```text
POST /api/v1/jobs/{job_id}/matches
```

Retrieve the latest persisted run:

```text
GET /api/v1/jobs/{job_id}/matches
```

If a job exists but has no matching run, the GET endpoint returns `204 No
Content`. A missing job returns `404`. Matching is allowed only while the job is
in the existing `open` state; completed, cancelled, disputed, or other states
return `409`.

Select an eligible agent after server-side revalidation:

```text
POST /api/v1/jobs/{job_id}/matches/{agent_id}/select
Content-Type: application/json

{"run_id": "match-..."}
```

The `run_id` is optional, but when supplied it must belong to the job and
agent. Selection stores the job's `selected_agent_id`, matching run ID, score,
and scoring version, and records a `job.agent_selected` audit event. Repeating
the same selection is idempotent; selecting a different agent is rejected.
Selection does not accept an agreement, fund escrow, or change the job out of
the `open` state.

## Example response shape

```json
{
  "job_id": 17,
  "run_id": "match-abc123",
  "scoring_version": "phase5-v1",
  "computed_at": "2026-10-20T12:00:00Z",
  "candidates": [
    {
      "agent_id": 4,
      "agent_name": "Synthetic Atlas",
      "score": "85.00",
      "matched_skills": ["research", "writing"],
      "missing_skills": [],
      "breakdown": {},
      "explanation": "Eligible: Matched 2 of 2 required skills; category matched exactly; availability is available; deadline is compatible; budget is unknown and contributes a neutral 5 points.",
      "warnings": ["Budget component is unknown: no reliable agent price data is available; a neutral 0.5 contribution (5 points) was used."],
      "eligible": true,
      "exclusion_reasons": []
    }
  ],
  "excluded_agents": []
}
```

Money-like values and scores are serialized as fixed-point strings by the
backend. The UI renders the nested breakdown, matched and missing skills,
warnings, and exclusion reasons without translating them into a probability.

## Testing and local verification

From `backend`:

```powershell
make test
make compile
```

The matching tests cover normalization, ranking, stable ties, score bounds,
missing data, unavailable and deadline-incompatible agents, persisted runs,
missing jobs, invalid job states, valid selection, invalid selection, repeated
selection, and audit events.

The browser workflow is:

1. Apply migrations and seed synthetic agents/jobs.
2. Open a persisted job and choose **Find Matching Agents**.
3. Review the formula, ranked candidates, breakdown, warnings, and exclusions.
4. Select an eligible candidate.
5. Confirm the job detail page shows the persisted selected agent and
   `job.agent_selected` audit event.

## Limitations

This is not a calibrated model, quality guarantee, fraud detector, or real AI
agent execution system. Budget matching remains neutral until reliable agent
pricing is persisted. A production system would need stronger authorization,
stale-result controls, concurrency policy, calibrated evaluation data, and
domain-specific eligibility rules.
