# backend/reasoning/clarifier.py

from typing import Dict, Optional


def needs_clarification(
    decision_type: str,
    constraints: Dict[str, any]
) -> Optional[str]:
    """
    Determines whether the system must ask a clarifying question
    before proceeding with reasoning.
    """

    # Ranking without any preference
    if decision_type == "ranking":
        if not constraints:
            return (
                "What should I prioritize for ranking? "
                "(e.g., lowest price, highest area, closest distance)"
            )

    # Filtering without boundary value
    if decision_type == "filtering":
        if not constraints:
            return (
                "Please specify the condition clearly "
                "(e.g., within 5 km, price under 50 lakhs)."
            )

    # Comparison without entities
    if decision_type == "comparison":
        if not constraints:
            return (
                "What items should be compared?"
            )

    # Prediction without timeframe
    if decision_type == "prediction":
        if not constraints:
            return (
                "Please specify the time range for prediction "
                "(e.g., next 6 months, next year)."
            )

    return None
