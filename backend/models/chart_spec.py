# backend/models/chart_spec.py
import pandas as pd
import os
import math
from typing import Dict, Any, Optional, List
from urllib.parse import urlparse

NUMERIC_DTYPES = ("int64", "float64", "int32", "float32")

def _read_dataset(path_or_url: str, nrows: int = 10000) -> pd.DataFrame:
    """
    Attempt to read dataset. Supports local file paths and http(s) CSVs.
    Will try common formats (csv, parquet, json).
    """
    if not path_or_url:
        raise ValueError("No dataset path provided")
    parsed = urlparse(path_or_url)
    try:
        if parsed.scheme in ("http", "https"):
            # remote CSV
            df = pd.read_csv(path_or_url, nrows=nrows)
        else:
            # local file - detect extension
            if path_or_url.lower().endswith(".csv") or path_or_url.lower().endswith(".txt"):
                df = pd.read_csv(path_or_url, nrows=nrows)
            elif path_or_url.lower().endswith(".parquet"):
                df = pd.read_parquet(path_or_url)
            elif path_or_url.lower().endswith(".json"):
                df = pd.read_json(path_or_url)
            else:
                # fallback try CSV
                df = pd.read_csv(path_or_url, nrows=nrows)
    except Exception as e:
        # bubble up a helpful message
        raise RuntimeError(f"Failed to read dataset '{path_or_url}': {e}")
    return df

def _is_datetime_series(s: pd.Series) -> bool:
    try:
        return pd.api.types.is_datetime64_any_dtype(s) or pd.api.types.is_datetime64tz_dtype(s)
    except:
        try:
            pd.to_datetime(s, errors="coerce")
            return True
        except:
            return False

def choose_chart_spec(df: pd.DataFrame, question: str = "", prefer_agg: Optional[str] = None) -> Dict[str, Any]:
    """
    Simple heuristics:
     - If a time-like column exists and question contains 'time'/'trend'/'over time' -> line/time-series
     - If both numeric and categorical columns exist -> bar grouped by categorical
     - If multi-numeric ask -> scatter/compare
     - If question contains 'compare' -> compare
    """
    q = (question or "").lower()
    cols = df.columns.tolist()
    # infer dtypes (using sample)
    num_cols = [c for c in cols if str(df[c].dtype) in NUMERIC_DTYPES]
    dt_cols = [c for c in cols if _is_datetime_series(df[c]) or c.lower() in ("date", "time", "timestamp", "day", "month", "year")]
    cat_cols = [c for c in cols if c not in num_cols and c not in dt_cols]

    # pick defaults
    spec = {
        "chart_spec_version": "1.0",
        "type": "bar",
        "title": None,
        "description": None,
        "x": None,
        "y": None,
        "y_agg": prefer_agg or "sum",
        "group_by": None,
        "filters": [],
        "style": {"stacked": False, "palette": "vivid", "show_legend": True},
        "confidence": 0.6,
        "raw_hint": {"question": question},
    }

    # heuristics for intent
    if "trend" in q or "over time" in q or "time" in q or "monthly" in q or "daily" in q:
        if dt_cols:
            spec["type"] = "line"
            spec["x"] = dt_cols[0]
            spec["y"] = num_cols[0] if num_cols else None
            spec["title"] = spec["title"] or f"{spec['y']} over time"
            spec["confidence"] = 0.9
            return spec

    if "compare" in q or "vs" in q or "versus" in q:
        # try to pick two numeric columns
        if len(num_cols) >= 2:
            spec["type"] = "scatter"
            spec["x"] = num_cols[0]
            spec["y"] = num_cols[1]
            spec["title"] = spec["title"] or f"Compare {spec['x']} vs {spec['y']}"
            spec["confidence"] = 0.85
            return spec

    # if categorical present and numeric present -> group by categorical and agg numeric
    if cat_cols and num_cols:
        spec["type"] = "bar"
        spec["x"] = cat_cols[0]
        spec["y"] = num_cols[0]
        spec["y_agg"] = prefer_agg or "sum"
        spec["group_by"] = None
        spec["title"] = spec["title"] or f"{spec['y_agg'].title()} of {spec['y']} by {spec['x']}"
        spec["confidence"] = 0.9
        return spec

    # if only numeric columns -> show distribution or compare
    if len(num_cols) == 1:
        spec["type"] = "histogram"  # frontend can map histogram -> bar with bins
        spec["x"] = num_cols[0]
        spec["title"] = spec["title"] or f"Distribution of {spec['x']}"
        spec["confidence"] = 0.8
        return spec
    if len(num_cols) >= 2:
        spec["type"] = "scatter"
        spec["x"] = num_cols[0]
        spec["y"] = num_cols[1]
        spec["title"] = spec["title"] or f"{spec['y']} vs {spec['x']}"
        spec["confidence"] = 0.7
        return spec

    # fallback: return first two columns
    spec["type"] = "bar"
    spec["x"] = cols[0]
    spec["y"] = cols[1] if len(cols) > 1 else cols[0]
    spec["title"] = spec["title"] or f"{spec['y']} by {spec['x']}"
    spec["confidence"] = 0.5
    return spec

# convenience: full flow
def build_chart_spec_from_dataset(path_or_url: str, question: str = "") -> Dict[str, Any]:
    df = _read_dataset(path_or_url, nrows=5000)
    # attempt to coerce common date columns
    for c in df.columns:
        if c.lower() in ("date", "timestamp", "time", "day", "month", "year"):
            try:
                df[c] = pd.to_datetime(df[c], errors="coerce")
            except:
                pass
    spec = choose_chart_spec(df, question)
    # ensure required keys exist
    spec.setdefault("filters", [])
    return spec
