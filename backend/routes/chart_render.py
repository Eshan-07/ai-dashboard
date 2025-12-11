# backend/routes/chart_render.py
import os
import math
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel
from fastapi.encoders import jsonable_encoder

BASE_DIR = os.path.dirname(os.path.dirname(__file__))  # backend/
UPLOADS_DIR = os.path.join(BASE_DIR, "database", "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)

router = APIRouter(tags=["charts"])

# ---------------- Helpers ----------------
def _safe_value(v: Any) -> Any:
    try:
        if v is None:
            return None

        if hasattr(v, "item"):
            try:
                return _safe_value(v.item())
            except Exception:
                pass

        if isinstance(v, float):
            if math.isnan(v) or math.isinf(v):
                return None
            return float(v)

        try:
            if isinstance(v, (np.integer,)):
                return int(v)
            if isinstance(v, (np.floating,)):
                fv = float(v)
                if math.isnan(fv) or math.isinf(fv):
                    return None
                return fv
        except Exception:
            pass

        if hasattr(v, "isoformat"):
            try:
                return v.isoformat()
            except Exception:
                pass

        if isinstance(v, (str, bool, int)):
            return v

        return v
    except Exception:
        return None


def _resolve_dataset_path(dataset_id: str) -> str:
    """
    Be VERY forgiving when resolving the dataset:
    1) Try backend/database/uploads/<basename(dataset_id)>
    2) If dataset_id itself is an existing absolute path, use that
    3) Fallback: search uploads for any file that contains the basename
    """
    if not dataset_id:
        raise HTTPException(status_code=400, detail="dataset_id is required")

    # just the filename part, no directories
    base = os.path.basename(dataset_id)

    # 1) most common: file is under uploads with that name
    candidate = os.path.join(UPLOADS_DIR, base)
    if os.path.exists(candidate):
        return candidate

    # 2) sometimes API might send full path as dataset_id
    if os.path.isabs(dataset_id) and os.path.exists(dataset_id):
        return dataset_id

    # 3) fallback: search uploads for any file that contains this base as substring
    matches: List[str] = []
    try:
        for fname in os.listdir(UPLOADS_DIR):
            if base in fname:
                full = os.path.join(UPLOADS_DIR, fname)
                if os.path.isfile(full):
                    matches.append(full)
    except FileNotFoundError:
        pass

    if matches:
        # choose the largest match (usually the real dataset)
        matches.sort(key=lambda p: os.path.getsize(p), reverse=True)
        return matches[0]

    # If still nothing: raise clear 404 with where we looked
    raise HTTPException(
        status_code=404,
        detail=(
            f"Dataset file not found for id '{dataset_id}'. "
            f"Looked in '{UPLOADS_DIR}' using name '{base}'."
        ),
    )


def _load_df_for_dataset(dataset_id: str) -> pd.DataFrame:
    csv_path = _resolve_dataset_path(dataset_id)

    try:
        lower = csv_path.lower()
        if lower.endswith((".csv", ".txt")):
            df = pd.read_csv(csv_path, low_memory=False)
        elif lower.endswith((".xlsx", ".xls")):
            df = pd.read_excel(csv_path)
        elif lower.endswith(".json"):
            try:
                df = pd.read_json(csv_path, lines=True)
            except Exception:
                df = pd.read_json(csv_path)
        else:
            df = pd.read_csv(csv_path, low_memory=False)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read dataset '{dataset_id}': {e}")

    return df


# ---------------- Pydantic models ----------------
class ChartSpec(BaseModel):
    type: str                               # bar, line, pie, histogram, scatter
    x: Optional[str] = None
    y: Optional[str] = None
    agg: Optional[str] = None              # sum, mean, count
    title: Optional[str] = None
    options: Optional[Dict[str, Any]] = None
    drilldownKey: Optional[str] = None


class ChartSuggestRequest(BaseModel):
    dataset_id: Optional[str] = None
    top_n: int = 5


class RenderRequest(BaseModel):
    dataset_id: str
    chart_spec: ChartSpec
    max_sample_rows: int = 2000


class RenderResponse(BaseModel):
    dataset_id: str
    chart_spec: ChartSpec
    aggregated: Dict[str, Any]


# ---------------- Suggest charts ----------------
@router.post("/suggest")
def suggest_charts(payload: ChartSuggestRequest = Body(...)):
    """
    Suggest a few charts based on the dataset:
      - bar/line by Year for revenue/income if present
      - bar by Company for revenue/income if present
      - generic bar & pie fallback using first categorical vs numeric column
    """
    dataset_id = payload.dataset_id
    top_n = max(1, payload.top_n or 5)

    df = _load_df_for_dataset(dataset_id)

    # Try to coerce obviously numeric string columns (with commas) into numbers
    df_numeric = df.copy()
    for col in df_numeric.columns:
        if df_numeric[col].dtype == "object":
            sample = df_numeric[col].dropna().astype(str).head(20)
            if len(sample) and sample.str.replace(",", "").str.replace(" ", "").str.match(
                r"^-?\d+(\.\d+)?$"
            ).mean() > 0.6:
                df_numeric[col] = pd.to_numeric(
                    df_numeric[col].astype(str).str.replace(",", ""),
                    errors="coerce",
                )

    numeric_cols = list(df_numeric.select_dtypes(include=["number"]).columns)
    cat_cols = [c for c in df_numeric.columns if c not in numeric_cols]

    suggestions: List[ChartSpec] = []

    def add_if_space(spec: ChartSpec):
        if len(suggestions) < top_n:
            suggestions.append(spec)

    def find_first(cols: List[str], names: List[str]) -> Optional[str]:
        for n in names:
            for c in cols:
                if n in c.lower():
                    return c
        return None

    year_col = find_first(df_numeric.columns.tolist(), ["year"])
    revenue_col = find_first(df_numeric.columns.tolist(), ["revenue"])
    income_col = find_first(df_numeric.columns.tolist(), ["income"])
    assets_col = find_first(df_numeric.columns.tolist(), ["asset"])
    company_col = find_first(df_numeric.columns.tolist(), ["company"])

    if year_col and revenue_col:
        add_if_space(
            ChartSpec(
                type="bar",
                x=year_col,
                y=revenue_col,
                agg="sum",
                title="Total Revenue by Year",
            )
        )
        add_if_space(
            ChartSpec(
                type="line",
                x=year_col,
                y=revenue_col,
                agg="sum",
                title="Total Revenue Trend by Year",
            )
        )

    if year_col and income_col:
        add_if_space(
            ChartSpec(
                type="line",
                x=year_col,
                y=income_col,
                agg="sum",
                title="Net Income by Year",
            )
        )

    if company_col and revenue_col:
        add_if_space(
            ChartSpec(
                type="bar",
                x=company_col,
                y=revenue_col,
                agg="sum",
                title="Total Revenue by Company",
            )
        )

    if company_col and income_col:
        add_if_space(
            ChartSpec(
                type="bar",
                x=company_col,
                y=income_col,
                agg="sum",
                title="Net Income by Company",
            )
        )

    if len(suggestions) < top_n and cat_cols and numeric_cols:
        add_if_space(
            ChartSpec(
                type="bar",
                x=cat_cols[0],
                y=numeric_cols[0],
                agg="sum",
                title=f"{numeric_cols[0]} by {cat_cols[0]}",
            )
        )
        add_if_space(
            ChartSpec(
                type="pie",
                x=cat_cols[0],
                y=numeric_cols[0],
                agg="sum",
                title=f"{numeric_cols[0]} share by {cat_cols[0]}",
            )
        )

    return jsonable_encoder(
        {
            "dataset_id": dataset_id,
            "suggestions": [spec.dict() for spec in suggestions],
        }
    )


# ---------------- Render data for a chart ----------------
@router.post("/render-data", response_model=RenderResponse)
def render_data(payload: RenderRequest = Body(...)):
    """
    Given a dataset_id and a ChartSpec, load the dataset and return
    aggregated data for visualisation.
    """
    dataset_id = payload.dataset_id
    spec = payload.chart_spec
    df = _load_df_for_dataset(dataset_id)

    if spec.y and spec.y in df.columns and df[spec.y].dtype == "object":
        df[spec.y] = pd.to_numeric(
            df[spec.y].astype(str).str.replace(",", ""),
            errors="coerce",
        )

    labels: List[Any] = []
    values: List[Any] = []
    raw_table: List[Dict[str, Any]] = []

    if spec.type == "histogram" and spec.x and spec.x in df.columns:
        counts = df[spec.x].value_counts().sort_index()
        for idx, val in counts.items():
            labels.append(_safe_value(idx))
            values.append(_safe_value(val))
            raw_table.append({spec.x: _safe_value(idx), "count": _safe_value(val)})

    elif spec.x and spec.y and spec.x in df.columns and spec.y in df.columns:
        agg = (spec.agg or "sum").lower()
        if agg not in ("sum", "mean", "count"):
            agg = "sum"

        if agg == "count":
            grouped = df.groupby(spec.x)[spec.y].count()
        else:
            grouped = df.groupby(spec.x)[spec.y].agg(agg)

        grouped = grouped.sort_index()
        for idx, val in grouped.items():
            labels.append(_safe_value(idx))
            values.append(_safe_value(val))
            raw_table.append({spec.x: _safe_value(idx), spec.y: _safe_value(val)})

    else:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot render chart for spec {spec.dict()} — missing x/y columns in dataset.",
        )

    aggregated = {
        "labels": labels,
        "values": values,
        "raw_table": raw_table,
    }

    resp = RenderResponse(
        dataset_id=dataset_id,
        chart_spec=spec,
        aggregated=aggregated,
    )
    return jsonable_encoder(resp)
