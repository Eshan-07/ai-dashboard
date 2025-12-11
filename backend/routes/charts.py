# backend/routes/charts.py
import os
import logging
from typing import Any, Dict, List, Optional

import numpy as np
import pd as pandas
import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger("ai-dashboard-charts")

router = APIRouter(tags=["charts"])

# ---- Paths -----------------------------------------------------------------

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
UPLOADS_DIR = os.path.join(BASE_DIR, "database", "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)


# ---- Models (used by both suggest + render) --------------------------------

class ChartSpec(BaseModel):
    type: str               # "bar", "line", "pie", "histogram", "scatter"
    x: Optional[str] = None
    y: Optional[str] = None
    agg: Optional[str] = None
    title: Optional[str] = None
    options: Optional[Dict[str, Any]] = None
    drilldownKey: Optional[str] = None  # used by frontend for click-drilldown


class ChartSuggestRequest(BaseModel):
    dataset_id: str
    top_n: int = 5


# ---------------------------------------------------------------------------
# Helper: resolve dataset_id -> actual CSV path
# ---------------------------------------------------------------------------

def _resolve_dataset_path(dataset_id: str) -> str:
    """
    Given a dataset_id (like 'abcd1234__financials.csv'), try VERY HARD to
    find the actual file under backend/database/uploads.
    """
    if not dataset_id:
        raise HTTPException(status_code=400, detail="dataset_id is required")

    # 1) direct match
    direct = os.path.join(UPLOADS_DIR, dataset_id)
    if os.path.exists(direct):
        return direct

    # 2) search by core id (before "__")
    core = os.path.splitext(dataset_id)[0]
    core = core.split("__", 1)[0]

    candidates: List[str] = []
    for fname in os.listdir(UPLOADS_DIR):
        lower = fname.lower()
        if (
            fname == dataset_id
            or lower == dataset_id.lower()
            or lower.startswith(core.lower())
            or core.lower() in lower
        ):
            candidates.append(os.path.join(UPLOADS_DIR, fname))

    if candidates:
        # pick the biggest file (usually the real one)
        best = max(candidates, key=lambda p: os.path.getsize(p))
        logger.info("[charts] Resolved dataset_id=%s -> %s", dataset_id, best)
        return best

    # 3) nothing found -> helpful error
    available = [f for f in os.listdir(UPLOADS_DIR)]
    msg = (
        f"Dataset file not found for id '{dataset_id}'. "
        f"Looked in {UPLOADS_DIR}. Available files: {available}"
    )
    logger.warning("[charts] %s", msg)
    raise HTTPException(status_code=404, detail=msg)


def _coerce_numeric(col: pd.Series) -> pd.Series:
    """
    Try to convert a column with commas/strings to numeric.
    Returns float series with NaNs for non-numeric.
    """
    # remove common formatting and cast to numeric
    s = col.astype(str).str.replace(",", "").str.replace(" ", "")
    return pd.to_numeric(s, errors="coerce")


def _infer_column_types(df: pd.DataFrame) -> Dict[str, str]:
    """
    Rough classification: "numeric" vs "categorical"
    """
    types: Dict[str, str] = {}
    for c in df.columns:
        s = df[c]
        numeric = False

        if np.issubdtype(s.dtype, np.number):
            numeric = True
        else:
            # try to coerce
            coerced = _coerce_numeric(s)
            if coerced.notna().sum() > 0:
                numeric = True

        types[c] = "numeric" if numeric else "categorical"
    return types


# ---------------------------------------------------------------------------
# Insight helper (used by render-data to analyse a single series)
# ---------------------------------------------------------------------------

def analyze_series_for_insights(
    labels: List[Any],
    values: List[Optional[float]],
    metric_name: str = "value",
):
    """
    Given x labels and numeric values, return:
      - highlights: { high_indices, low_indices, mean, std }
      - analysis: human-readable explanation string
      - recommendations: list of strings (tips)
      - accuracy: simple confidence/accuracy dict

    NOTE: This function does NOT depend on FastAPI and DOES NOT touch I/O.
    It can be safely imported from other modules, e.g.:

        from routes.charts import analyze_series_for_insights
    """
    if not labels or not values:
        return (
            {},
            "Not enough data to analyze.",
            [],
            {"confidence": "low", "reason": "no data"},
        )

    # Filter out None, but keep positions for highlights
    clean_vals = [v for v in values if v is not None]
    if len(clean_vals) == 0:
        return (
            {},
            "Not enough numeric data to analyze.",
            [],
            {"confidence": "low", "reason": "non-numeric"},
        )

    vals = np.array(clean_vals, dtype=float)
    mean = float(np.mean(vals))
    std = float(np.std(vals)) if vals.size > 1 else 0.0
    vmax = float(np.max(vals))
    vmin = float(np.min(vals))

    # Indices of global max/min in the full list (not filtered)
    try:
        idx_max = int(np.nanargmax(vals))
        idx_min = int(np.nanargmin(vals))
    except ValueError:
        idx_max = 0
        idx_min = 0

    # Highlight “significantly high/low” based on z-score-ish rule
    high_indices: List[int] = []
    low_indices: List[int] = []
    for i, v in enumerate(values):
        if v is None:
            continue
        if std > 0 and v > mean + 0.7 * std:
            high_indices.append(i)
        elif std > 0 and v < mean - 0.7 * std:
            low_indices.append(i)

    # Simple trend using slope of best-fit line
    x = np.arange(len(vals))
    if len(vals) > 1:
        slope = float(np.polyfit(x, vals, 1)[0])
    else:
        slope = 0.0

    if slope > 0.01 * mean:
        trend = "increasing"
    elif slope < -0.01 * mean:
        trend = "decreasing"
    else:
        trend = "relatively stable"

    # Labels for global max/min (fallbacks in case of mismatch)
    high_label = labels[idx_max] if 0 <= idx_max < len(labels) else "the highest period"
    low_label = labels[idx_min] if 0 <= idx_min < len(labels) else "the lowest period"

    analysis_lines = [
        f"The highest {metric_name} is in **{high_label}** ({vmax:,.0f}).",
        f"The lowest {metric_name} is in **{low_label}** ({vmin:,.0f}).",
        f"The average {metric_name} is about {mean:,.0f} with variation ~{std:,.0f}.",
        f"Overall, the trend looks **{trend}** over time.",
    ]
    analysis = " ".join(analysis_lines)

    recommendations: List[str] = []
    if trend == "increasing":
        recommendations.append(
            f"{metric_name.capitalize()} is increasing. Put a limit or budget on the highest periods like {high_label}."
        )
    elif trend == "decreasing":
        recommendations.append(
            f"{metric_name.capitalize()} is decreasing. Try to keep the same pattern by repeating what you did in periods like {low_label}."
        )
    else:
        recommendations.append(
            f"{metric_name.capitalize()} is stable. You can set your default target close to the average ({mean:,.0f})."
        )

    if high_indices:
        recommendations.append(
            f"Focus on reducing {metric_name} in highlighted periods (red bars) because they are far above the average."
        )

    highlights = {
        "high_indices": high_indices,
        "low_indices": low_indices,
        "mean": mean,
        "std": std,
    }

    accuracy = {
        "confidence": "high" if len(values) >= 6 else "medium",
        "rows_used": int(len(values)),
        "metric": metric_name,
    }

    return highlights, analysis, recommendations, accuracy


# ---------------------------------------------------------------------------
# /charts/suggest
# ---------------------------------------------------------------------------

@router.post("/suggest")
async def suggest_charts(req: ChartSuggestRequest) -> Dict[str, Any]:
    """
    Suggest a small set of charts for the given dataset.

    Returns:
      {
        "dataset_id": ...,
        "suggestions": [ ChartSpec, ChartSpec, ... ]
      }
    """
    try:
        csv_path = _resolve_dataset_path(req.dataset_id)

        try:
            df = pd.read_csv(csv_path, low_memory=False)
        except Exception:
            df = pd.read_csv(csv_path, engine="python", low_memory=False)

        if df.empty:
            raise HTTPException(status_code=400, detail="Dataset appears to be empty")

        col_types = _infer_column_types(df)

        numeric_cols = [c for c, t in col_types.items() if t == "numeric"]
        cat_cols = [c for c, t in col_types.items() if t == "categorical"]

        suggestions: List[ChartSpec] = []

        # Prefer "Year" as a time dimension if it exists
        year_col = None
        for c in df.columns:
            if c.lower() == "year":
                year_col = c
                break

        # 1) Bar / line charts: numeric by Year (or first categorical)
        x_dim = year_col or (cat_cols[0] if cat_cols else None)

        if x_dim and numeric_cols:
            for num_col in numeric_cols:
                # Bar
                suggestions.append(
                    ChartSpec(
                        type="bar",
                        x=x_dim,
                        y=num_col,
                        agg="sum",
                        title=f"{num_col} by {x_dim}",
                        drilldownKey=x_dim,
                    )
                )
                # Line (good for Year)
                if year_col:
                    suggestions.append(
                        ChartSpec(
                            type="line",
                            x=year_col,
                            y=num_col,
                            agg="sum",
                            title=f"{num_col} trend by {year_col}",
                            drilldownKey=year_col,
                        )
                    )

        # 2) Optional: pie over first numeric vs first categorical
        if cat_cols and numeric_cols:
            suggestions.append(
                ChartSpec(
                    type="pie",
                    x=cat_cols[0],
                    y=numeric_cols[0],
                    agg="sum",
                    title=f"{numeric_cols[0]} share by {cat_cols[0]}",
                    drilldownKey=cat_cols[0],
                )
            )

        # Avoid empty result
        if not suggestions:
            # Fallback: simple table-ish spec
            suggestions.append(
                ChartSpec(
                    type="table",
                    title="Sample rows",
                )
            )

        # Respect top_n
        suggestions = suggestions[: max(1, req.top_n)]

        return {
            "dataset_id": req.dataset_id,
            "suggestions": [s.dict() for s in suggestions],
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Chart suggestion failed for dataset_id=%s", req.dataset_id)
        raise HTTPException(status_code=500, detail=f"Chart suggestion failed: {e}")
