# backend/routes/transformer.py
import os
import json
import math
import time
import faiss
import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, Query, Body
from fastapi.encoders import jsonable_encoder
from sentence_transformers import SentenceTransformer
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
from typing import Any, Tuple, List, Dict, Optional

router = APIRouter(tags=["transformer"])

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
INDEX_BASE = os.path.join(BASE_DIR, "database", "indexes")
UPLOADS_DIR = os.path.join(BASE_DIR, "database", "uploads")

os.makedirs(INDEX_BASE, exist_ok=True)
os.makedirs(UPLOADS_DIR, exist_ok=True)

# ---------------- JSON-safe helper ----------------
def _safe_value(v: Any) -> Any:
    try:
        if v is None:
            return None
        if hasattr(v, "item"):
            return _safe_value(v.item())
        if isinstance(v, float):
            if math.isnan(v) or math.isinf(v):
                return None
            return float(v)
        if hasattr(v, "isoformat"):
            return v.isoformat()
        if isinstance(v, (str, bool, int)):
            return v
        return v
    except Exception:
        return None

# ==================================================
# >>> ADDED: aggregation intent detector
# ==================================================
def detect_aggregation(question: str) -> Optional[str]:
    q = (question or "").lower()
    if any(k in q for k in ["total", "sum", "overall"]):
        return "sum"
    if any(k in q for k in ["average", "avg", "mean"]):
        return "mean"
    if any(k in q for k in ["max", "maximum", "highest"]):
        return "max"
    if any(k in q for k in ["min", "minimum", "lowest"]):
        return "min"
    return None
# ==================================================

# Load models
model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
gen_tokenizer = AutoTokenizer.from_pretrained("google/flan-t5-small")
gen_model = AutoModelForSeq2SeqLM.from_pretrained("google/flan-t5-small")

# ---------------- chart helpers ----------------
def _resolve_dataset_path(dataset_name: str) -> str:
    candidate = os.path.join(UPLOADS_DIR, os.path.basename(dataset_name))
    if os.path.exists(candidate):
        return candidate
    raise HTTPException(status_code=404, detail="Dataset not found")

def _to_numeric_series(s: pd.Series) -> pd.Series:
    cleaned = s.astype(str).str.replace(r"[^\d\.-]", "", regex=True)
    return pd.to_numeric(cleaned, errors="coerce")

def _guess_xy_from_question(question: str, df: pd.DataFrame) -> Dict[str, Optional[str]]:
    q = (question or "").lower()
    cols = {c.lower(): c for c in df.columns}
    x_col, y_col = None, None

    for cand in ("year", "date", "month"):
        if cand in cols:
            x_col = cols[cand]
            break

    for keyword in ("revenue", "income", "price", "cost", "amount"):
        if keyword in q:
            for c_low, orig in cols.items():
                if keyword in c_low:
                    y_col = orig
                    break

    if not y_col:
        scores = {c: _to_numeric_series(df[c]).notna().sum() for c in df.columns}
        y_col = max(scores, key=scores.get)

    return {"x": x_col, "y": y_col}

# ==================================================
# CHART ENDPOINT
# ==================================================
@router.get("/chart")
async def chart_suggestion(
    dataset: str = Query(...),
    question: str = Query("")
):
    path = _resolve_dataset_path(dataset)

    df = pd.read_csv(path, dtype=str)
    df.columns = [c.strip() for c in df.columns]
    df = df.loc[:, ~(df.isnull().all())]

    # ==================================================
    # >>> ADDED: block unrelated questions
    # ==================================================
    q_lower = (question or "").lower()
    if not any(col.lower() in q_lower for col in df.columns):
        raise HTTPException(
            status_code=400,
            detail="Question is not related to dataset columns"
        )
    # ==================================================

    guess = _guess_xy_from_question(question, df)
    x_col = guess.get("x")
    y_col = guess.get("y")

    agg = detect_aggregation(question)

    # ==================================================
    # >>> ADDED: single-value aggregation (total income etc.)
    # ==================================================
    if agg and y_col and not x_col:
        series = _to_numeric_series(df[y_col])
        value = getattr(series, agg)()
        return {
            "chart_spec": {
                "type": "single_stat",
                "title": f"{agg.title()} of {y_col}"
            },
            "aggregated": {"value": float(value)},
            "dataset": dataset
        }
    # ==================================================

    numeric_series = _to_numeric_series(df[y_col])

    # ==================================================
    # >>> ADDED: correct aggregation logic
    # ==================================================
    if agg == "mean":
        grouped = df.assign(_y=numeric_series).groupby(x_col)["_y"].mean()
    elif agg == "max":
        grouped = df.assign(_y=numeric_series).groupby(x_col)["_y"].max()
    elif agg == "min":
        grouped = df.assign(_y=numeric_series).groupby(x_col)["_y"].min()
    else:
        grouped = df.assign(_y=numeric_series).groupby(x_col)["_y"].sum()
    # ==================================================

    grouped = grouped.reset_index()
    labels = grouped[x_col].astype(str).tolist()
    values = grouped["_y"].fillna(0).astype(float).tolist()

    return {
        "chart_spec": {
            "type": "bar",
            "x": x_col,
            "y": y_col,
            "title": question or f"{y_col} by {x_col}"
        },
        "aggregated": {
            "labels": labels,
            "values": values,
            "raw_table": df.head(50).to_dict(orient="records")
        },
        "dataset": dataset
    }
