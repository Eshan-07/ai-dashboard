# backend/reasoning/constraint_handler.py

import re
from typing import Dict, Any, List


DISTANCE_PATTERN = re.compile(r"within\s+(\d+)\s*(km|kilometer|kilometers)", re.IGNORECASE)
LESS_THAN_PATTERN = re.compile(r"(below|under|less than)\s+([\d,]+)", re.IGNORECASE)
GREATER_THAN_PATTERN = re.compile(r"(above|greater than|more than)\s+([\d,]+)", re.IGNORECASE)
BETWEEN_PATTERN = re.compile(
    r"between\s+([\d,]+)\s+and\s+([\d,]+)", re.IGNORECASE
)

PERIODIC_PATTERN = re.compile(
    r"(\d+)\s*(rupees|rs|₹)?\s*(per|every)\s*(month|year)", re.IGNORECASE
)


def _to_number(value: str) -> float:
    """Convert numeric strings like '1,00,000' to float."""
    return float(value.replace(",", ""))


def extract_constraints(query: str) -> Dict[str, Any]:
    """
    Extracts constraints from a natural language query.

    This function is:
    - deterministic
    - dataset-agnostic
    - safe to run before any AI model
    """

    constraints: Dict[str, Any] = {}

    if not query:
        return constraints

    q = query.lower()

    # ---- Distance constraints (e.g., within 5 km)
    dist_match = DISTANCE_PATTERN.search(q)
    if dist_match:
        constraints["distance"] = {
            "operator": "<=",
            "value": _to_number(dist_match.group(1)),
            "unit": "km",
        }

    # ---- Less than / Under
    lt_match = LESS_THAN_PATTERN.search(q)
    if lt_match:
        constraints["value_constraint"] = {
            "operator": "<=",
            "value": _to_number(lt_match.group(2)),
        }

    # ---- Greater than / Above
    gt_match = GREATER_THAN_PATTERN.search(q)
    if gt_match:
        constraints["value_constraint"] = {
            "operator": ">=",
            "value": _to_number(gt_match.group(2)),
        }

    # ---- Between range
    between_match = BETWEEN_PATTERN.search(q)
    if between_match:
        constraints["range"] = {
            "min": _to_number(between_match.group(1)),
            "max": _to_number(between_match.group(2)),
        }

    # ---- Periodic saving / recurring values
    periodic_match = PERIODIC_PATTERN.search(q)
    if periodic_match:
        constraints["recurring"] = {
            "amount": _to_number(periodic_match.group(1)),
            "frequency": periodic_match.group(4).lower(),
        }

    return constraints
