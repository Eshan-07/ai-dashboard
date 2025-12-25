# backend/utils/reasoning_router.py

from typing import Dict, Any

from reasoning.decision_classifier import classify_decision
from reasoning.constraint_handler import extract_constraints
from reasoning.scoring_engine import score_rows
from reasoning.clarifier import needs_clarification


def route_reasoning(
    query: str,
    rows: list[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Central reasoning router.
    Determines how the system should reason before charts / explanations.
    """

    # 1️⃣ Classify decision type
    decision = classify_decision(query)
    decision_type = decision.get("type", "unknown")

    # 2️⃣ Extract constraints
    constraints = extract_constraints(query)

    # 3️⃣ Clarification check
    clarification = needs_clarification(decision_type, constraints)
    if clarification:
        return {
            "status": "clarification_required",
            "question": clarification,
            "decision_type": decision_type
        }

    # 4️⃣ Route based on decision type
    if decision_type == "aggregation":
        return {
            "status": "ready",
            "decision_type": decision_type,
            "operation": "aggregate",
            "constraints": constraints
        }

    if decision_type == "filtering":
        return {
            "status": "ready",
            "decision_type": decision_type,
            "operation": "filter",
            "constraints": constraints
        }

    if decision_type == "ranking":
        scored = score_rows(rows, constraints)
        return {
            "status": "ready",
            "decision_type": decision_type,
            "operation": "rank",
            "results": scored[:5]  # top 5 results
        }

    if decision_type == "comparison":
        return {
            "status": "ready",
            "decision_type": decision_type,
            "operation": "compare",
            "constraints": constraints
        }

    if decision_type == "prediction":
        return {
            "status": "ready",
            "decision_type": decision_type,
            "operation": "predict",
            "constraints": constraints
        }

    # 5️⃣ Fallback
    return {
        "status": "unknown",
        "message": "Unable to reason about this query deterministically.",
        "decision_type": decision_type
    }
