# backend/utils/query_executor.py
from typing import Dict, Any
import pandas as pd
import numpy as np
from datetime import datetime
import os

# Try importing optional mongo helpers
try:
    from utils.mongo import get_db, get_dataset_metadata  # optional helpers
except Exception:
    get_db = None
    get_dataset_metadata = None


# ------------------ Helper ------------------
def _to_dataframe_from_preview(preview: list) -> pd.DataFrame:
    """Build DataFrame from stored sample rows (list of dicts)."""
    if preview is None:
        return pd.DataFrame()
    return pd.DataFrame(preview)


# ------------------ CSV Loader ------------------
def load_preview(dataset_id: str, max_rows: int = 2000) -> pd.DataFrame:
    """
    Load a preview of the cleaned dataset.

    ✅ 1. Tries to read from local folder: backend/database/uploads/{dataset_id}.csv
    ✅ 2. Falls back to get_dataset_metadata() if MongoDB integration is available.
    """

    # Step 1 — Try to load from local uploads folder
    base_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "database", "uploads")
    file_name = dataset_id if dataset_id.lower().endswith(".csv") else f"{dataset_id}.csv"
    file_path = os.path.join(base_path, file_name)

    if os.path.exists(file_path):
        print(f"✅ Loading local CSV: {file_path}")
        return pd.read_csv(file_path, nrows=max_rows)

    # Step 2 — Try loading from MongoDB metadata (if available)
    if get_dataset_metadata is not None:
        try:
            meta = get_dataset_metadata(dataset_id)
            if meta:
                preview = meta.get("preview")
                if preview:
                    return _to_dataframe_from_preview(preview).head(max_rows)
                storage_path = meta.get("storage_path") or meta.get("file_path")
                if storage_path and os.path.exists(storage_path):
                    return pd.read_csv(storage_path, nrows=max_rows)
        except Exception as e:
            raise RuntimeError(f"MongoDB metadata loader failed: {e}")

    # Step 3 — If none found, raise a clear message
    raise FileNotFoundError(
        f"No local dataset found at {file_path}.\n"
        "Please place your CSV in backend/database/uploads/ or set up MongoDB metadata."
    )


# ------------------ Aggregation ------------------
def aggregate_for_chart(df: pd.DataFrame, chart_spec: Dict[str, Any]) -> Dict[str, Any]:
    """
    Returns a dict: { labels: [...], values: [...], raw_table: [ {...}, ... ] }

    Supports chart_spec.type:
    - 'line'
    - 'bar'
    - 'histogram'
    - 'scatter'
    - 'pie'
    """
    spec_type = chart_spec.get("type")
    x = chart_spec.get("x")
    y = chart_spec.get("y")
    agg = chart_spec.get("agg", "sum")
    options = chart_spec.get("options", {}) or {}

    if df is None or df.shape[0] == 0:
        return {"labels": [], "values": [], "raw_table": []}

    # Convert columns safely
    def col_safe(series, dtype):
        try:
            if dtype == "datetime":
                return pd.to_datetime(series, errors="coerce")
            if dtype == "numeric":
                return pd.to_numeric(series, errors="coerce")
            return series
        except Exception:
            return series

    # ---------- LINE ----------
    if spec_type == "line":
        if x not in df.columns or y not in df.columns:
            return {"labels": [], "values": [], "raw_table": []}
        df_copy = df[[x, y]].copy()
        df_copy[x] = pd.to_datetime(df_copy[x], errors="coerce")
        df_copy[y] = pd.to_numeric(df_copy[y], errors="coerce")
        df_copy = df_copy.dropna(subset=[x, y])
        if df_copy.empty:
            return {"labels": [], "values": [], "raw_table": []}
        span_days = (df_copy[x].max() - df_copy[x].min()).days
        freq = "M" if span_days > 60 else "D"
        df_copy.set_index(x, inplace=True)
        grouped = (
            df_copy[y].resample(freq).sum().reset_index()
            if agg == "sum"
            else df_copy[y].resample(freq).mean().reset_index()
        )
        labels = grouped.iloc[:, 0].astype(str).tolist()
        values = grouped.iloc[:, 1].fillna(0).tolist()
        return {"labels": labels, "values": values, "raw_table": grouped.to_dict(orient="records")}

    # ---------- BAR ----------
    if spec_type == "bar":
        if x not in df.columns:
            return {"labels": [], "values": [], "raw_table": []}
        if y and y in df.columns:
            df_copy = df[[x, y]].copy()
            df_copy[y] = pd.to_numeric(df_copy[y], errors="coerce")
            df_copy = df_copy.dropna(subset=[x, y])
            if df_copy.empty:
                return {"labels": [], "values": [], "raw_table": []}
            grp = (
                df_copy.groupby(x)[y].sum().reset_index()
                if agg == "sum"
                else df_copy.groupby(x)[y].mean().reset_index()
            )
            labels = grp[x].astype(str).tolist()
            values = grp[y].tolist()
            return {"labels": labels, "values": values, "raw_table": grp.to_dict(orient="records")}
        else:
            counts = df[x].value_counts().reset_index()
            counts.columns = [x, "count"]
            labels = counts[x].astype(str).tolist()
            values = counts["count"].tolist()
            return {"labels": labels, "values": values, "raw_table": counts.to_dict(orient="records")}

    # ---------- HISTOGRAM ----------
    if spec_type == "histogram":
        if x not in df.columns:
            return {"labels": [], "values": [], "raw_table": []}
        arr = pd.to_numeric(df[x], errors="coerce").dropna()
        if arr.empty:
            return {"labels": [], "values": [], "raw_table": []}
        bins = int(options.get("bins", 10))
        values, bin_edges = np.histogram(arr, bins=bins)
        labels = [f"{bin_edges[i]:.3g} - {bin_edges[i+1]:.3g}" for i in range(len(values))]
        return {"labels": labels, "values": values.tolist(), "raw_table": []}

    # ---------- SCATTER ----------
    if spec_type == "scatter":
        if x not in df.columns or y not in df.columns:
            return {"labels": [], "values": [], "raw_table": []}
        table = df[[x, y]].dropna()
        return {"labels": table[x].astype(str).tolist(), "values": table[y].tolist(), "raw_table": table.to_dict(orient="records")}

    # ---------- PIE ----------
    if spec_type == "pie":
        if x not in df.columns:
            return {"labels": [], "values": [], "raw_table": []}
        if y and y in df.columns:
            df_copy = df[[x, y]].copy()
            df_copy[y] = pd.to_numeric(df_copy[y], errors="coerce")
            df_copy = df_copy.dropna(subset=[x, y])
            grp = df_copy.groupby(x)[y].sum().reset_index()
            labels = grp[x].astype(str).tolist()
            values = grp[y].tolist()
            return {"labels": labels, "values": values, "raw_table": grp.to_dict(orient="records")}
        counts = df[x].value_counts().reset_index()
        counts.columns = [x, "count"]
        labels = counts[x].astype(str).tolist()
        values = counts["count"].tolist()
        return {"labels": labels, "values": values, "raw_table": counts.to_dict(orient="records")}

    # ---------- Fallback ----------
    return {"labels": [], "values": [], "raw_table": []}
