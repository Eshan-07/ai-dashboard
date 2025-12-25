# backend/reasoning/scoring_engine.py

from typing import Dict, List, Any


def score_rows(
    rows: List[Dict[str, Any]],
    constraints: Dict[str, Any] | None = None
) -> List[Dict[str, Any]]:
    """
    Generic scoring engine.
    Works for ANY dataset with numeric columns.

    Higher score = better result
    """

    if not rows:
        return []

    scored_rows = []

    for row in rows:
        score = 0.0

        for key, value in row.items():
            # Only numeric values contribute to score
            if isinstance(value, (int, float)):
                score += value

        scored_rows.append({
            **row,
            "_score": round(score, 2)
        })

    # Sort descending by score
    scored_rows.sort(key=lambda r: r["_score"], reverse=True)

    return scored_rows
