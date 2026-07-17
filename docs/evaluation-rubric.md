# Evaluation Rubric — v1.0.0

Scoring rubric used by the `evaluate-use-case` function (see
[architecture.md](../architecture.md) §9.1). Any change to anchors or
categories requires a `RUBRIC_VERSION` bump; every stored evaluation records
the rubric version it was scored against.

All categories use a 0–100 scale. For the two risk categories, a **higher
score means lower risk**.

## Categories and anchors

### Business value
| Range | Anchor |
|---|---|
| 80–100 | Clear strategic alignment, quantified outcome, broad user benefit |
| 50–79 | Plausible value with partially defined metrics |
| 20–49 | Value asserted but unmeasured or narrow |
| 0–19 | No articulated business problem or outcome |

### Technical feasibility
| Range | Anchor |
|---|---|
| 80–100 | Well-understood pattern, ready integrations, low operational burden |
| 50–79 | Moderate complexity or some unproven integration points |
| 20–49 | Significant unknowns, custom infrastructure, or scale risk |
| 0–19 | Not implementable with current capabilities |

### Data readiness
| Range | Anchor |
|---|---|
| 80–100 | Approved, accessible, classified data with a defined lifecycle |
| 50–79 | Data identified but approvals or quality partially unresolved |
| 20–49 | Data sources unclear, unapproved, or of unknown quality |
| 0–19 | No identified data source |

### Security and privacy risk (higher = lower risk)
| Range | Anchor |
|---|---|
| 80–100 | Internal, non-sensitive data; minimal exposure surface |
| 50–79 | Confidential data with defined controls |
| 20–49 | Personal or confidential data with gaps in controls or retention |
| 0–19 | Restricted data or uncontrolled external exposure |

### Responsible-AI risk (higher = lower risk)
| Range | Anchor |
|---|---|
| 80–100 | Low human impact, full human oversight, explainable output |
| 50–79 | Moderate impact with human review in the loop |
| 20–49 | Affects individuals with limited oversight |
| 0–19 | High-impact automated decisions about people without oversight |

## Recommendation thresholds (guidance)

| Recommendation | Typical profile |
|---|---|
| PROCEED | All categories ≥ 70, no deterministic flags |
| PROCEED_WITH_CONTROLS | Value ≥ 60 and risks manageable with named controls |
| REVISE_AND_RESUBMIT | Key information missing or value unproven |
| SPECIALIST_REVIEW_REQUIRED | High-impact domain or restricted data (rule floor) |
| DO_NOT_PROCEED | Unmitigable risk or no viable value |

Deterministic rules (`rules.ts`, `RULES_VERSION`) can cap the final
recommendation regardless of model output.
