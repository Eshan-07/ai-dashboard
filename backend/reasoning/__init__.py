# backend/reasoning/decision_classifier.py

from typing import Dict


AGGREGATION_KEYWORDS = (
    "total", "sum", "average", "avg", "mean", "count",
    "maximum", "minimum", "max", "min"
)

RANKING_KEYWORDS = (
    "best", "top", "highest", "lowest", "most", "least"
)

FILTER_KEYWORDS = (
    "within", "under", "below", "above", "between", "less than", "greater than"
)

COMPARISON_KEYWORDS = (
    "compare", "vs", "versus", "difference", "better than"
)

PREDICTION_KEYWORDS = (
    "future", "predict", "estimate", "will", "forecast"
)


def classify_decision(query: str) -> Dict[str, str]:
    """
    Classifies the user's question into a decision type.
    This function is deterministic and dataset-agnostic.
    """

    if not query:
        return {"type": "unknown"}

    q = query.lower()

    for kw in AGGREGATION_KEYWORDS:
        if kw in q:
            return {"type": "aggregation"}

    for kw in RANKING_KEYWORDS:
        if kw in q:
            return {"type": "ranking"}

    for kw in FILTER_KEYWORDS:
        if kw in q:
            return {"type": "filtering"}

    for kw in COMPARISON_KEYWORDS:
        if kw in q:
            return {"type": "comparison"}

    for kw in PREDICTION_KEYWORDS:
        if kw in q:
            return {"type": "prediction"}

    return {"type": "unknown"}
