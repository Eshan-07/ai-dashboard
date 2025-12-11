# backend/routes/upload.py
import os
import uuid
import re
import traceback
from datetime import datetime
from typing import Dict, Any, List

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.encoders import jsonable_encoder
import pandas as pd
import numpy as np
from urllib.parse import unquote
import json

router = APIRouter()

# Optional mongo helper (if your utils.mongo exposes an upload/save or list function)
try:
    from utils.mongo import list_datasets as mongo_list_datasets  # type: ignore
except Exception:
    mongo_list_datasets = None

# Directories
BASE_DIR = os.path.dirname(os.path.dirname(__file__))  # backend/
UPLOADS_DIR = os.path.join(BASE_DIR, "database", "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)


def _sanitize_filename(name: str) -> str:
    """Sanitize an incoming filename to a safe basename."""
    name = os.path.basename(name or "")
    name = name.replace(" ", "_")
    # keep only alphanumeric, dot, dash, underscore
    name = re.sub(r"[^A-Za-z0-9._-]", "", name)
    return name or "uploadedfile"


def _safe_value(v):
    """Convert pandas/numpy scalars and NaN/NaT to JSON-safe Python types."""
    try:
        if v is None:
            return None
        # numpy / pandas NA handling
        if isinstance(v, float) and (np.isnan(v) or np.isinf(v)):
            return None
        # datetime-like
        if hasattr(v, "isoformat"):
            try:
                return v.isoformat()
            except Exception:
                pass
        # numpy scalar -> python scalar
        if hasattr(v, "item"):
            try:
                return v.item()
            except Exception:
                pass
        if isinstance(v, (np.integer,)):
            return int(v)
        if isinstance(v, (np.floating,)):
            fv = float(v)
            if np.isnan(fv) or np.isinf(fv):
                return None
            return fv
        return v
    except Exception:
        return None


def _safe_preview_from_df(df: pd.DataFrame, max_rows: int = 5) -> List[Dict[str, Any]]:
    """Return list-of-dicts preview with NaN->None and numpy->python conversions."""
    if df is None or df.shape[0] == 0:
        return []
    df2 = df.head(max_rows).copy()
    df2 = df2.where(pd.notnull(df2), None)
    records = []
    for _, row in df2.iterrows():
        rec = {}
        for col in df2.columns:
            rec[col] = _safe_value(row[col])
        records.append(rec)
    return records


def _read_json_lines_preview(path: str, max_items: int = 5) -> pd.DataFrame:
    """
    Read first `max_items` JSON-lines records into a DataFrame without loading the entire file.
    If file is not JSON-lines, this may raise and caller will fallback to other methods.
    """
    items = []
    with open(path, "r", encoding="utf-8", errors="ignore") as fh:
        for i, line in enumerate(fh):
            if not line.strip():
                continue
            try:
                items.append(json.loads(line))
            except Exception:
                # if any line fails to parse, stop and raise to allow fallback
                raise
            if i + 1 >= max_items:
                break
    if not items:
        return pd.DataFrame()
    return pd.DataFrame(items)


def _metadata_from_path(path: str) -> Dict[str, Any]:
    """
    Build JSON-safe metadata for a saved file:
    includes dataset_id, original filename, saved path, rows, columns, schema, preview, upload_time.
    """
    base = os.path.basename(path)
    original_filename = base
    if "__" in base:
        try:
            _uid, orig = base.split("__", 1)
            original_filename = orig
        except Exception:
            original_filename = base

    try:
        # Attempt to load a small peek for schema & preview
        df = None
        try:
            if path.lower().endswith((".csv", ".txt")):
                df = pd.read_csv(path, nrows=5)
            elif path.lower().endswith((".xlsx", ".xls")):
                df = pd.read_excel(path, nrows=5)
            elif path.lower().endswith(".json"):
                # Try JSON-lines preview without reading the whole file
                try:
                    df = _read_json_lines_preview(path, max_items=5)
                except Exception:
                    # fallback to pandas read_json (may read whole file; acceptable for small uploads)
                    try:
                        df = pd.read_json(path)
                        if isinstance(df, (dict,)):
                            # if top-level is dict, wrap to DataFrame
                            df = pd.DataFrame([df])
                        df = df.head(5)
                    except Exception:
                        df = pd.DataFrame()
            else:
                df = pd.read_csv(path, nrows=5)
        except Exception:
            df = pd.DataFrame()

        # fast row count for CSV/TXT (avoid reading big files fully)
        rows = None
        try:
            if path.lower().endswith((".csv", ".txt")):
                with open(path, "r", encoding="utf-8", errors="ignore") as f:
                    total = sum(1 for _ in f)
                    rows = max(0, total - 1)
        except Exception:
            rows = None

        schema: Dict[str, str] = {}
        if df is not None and not df.empty:
            for c in df.columns:
                try:
                    schema[c] = str(df[c].dtype)
                except Exception:
                    schema[c] = "object"

        preview = _safe_preview_from_df(df, max_rows=5)

        meta = {
            "_id": base,
            "dataset_id": base,
            "original_filename": original_filename,
            "saved_path": os.path.abspath(path),
            "rows": int(rows) if isinstance(rows, (int, np.integer)) else rows,
            "columns": int(len(df.columns)) if df is not None else None,
            "schema": schema,
            "upload_time": datetime.fromtimestamp(os.path.getmtime(path)).isoformat(),
            "preview": preview,
        }
        return jsonable_encoder(meta)
    except Exception:
        # Fallback minimal metadata
        try:
            ut = datetime.fromtimestamp(os.path.getmtime(path)).isoformat()
        except Exception:
            ut = datetime.utcnow().isoformat()
        return jsonable_encoder(
            {
                "_id": base,
                "dataset_id": base,
                "original_filename": original_filename,
                "saved_path": os.path.abspath(path),
                "rows": None,
                "columns": None,
                "schema": {},
                "upload_time": ut,
                "preview": [],
            }
        )


@router.post("/", status_code=200)
async def upload_file(file: UploadFile = File(...)):
    """
    Upload a CSV/Excel/JSON file, save it under database/uploads with a UID prefix,
    attempt basic cleaning and return JSON metadata including a small preview.
    """
    try:
        if not file:
            raise HTTPException(status_code=400, detail="No file uploaded")

        ext = os.path.splitext(file.filename or "")[1] or ".csv"
        uid = uuid.uuid4().hex
        original_basename = _sanitize_filename(file.filename or f"upload_{uid}")
        # Ensure extension present
        safe_name = f"{uid}__{original_basename}"
        if not original_basename.lower().endswith(ext.lower()):
            safe_name = f"{safe_name}{ext}"
        save_path = os.path.join(UPLOADS_DIR, safe_name)

        # Read uploaded bytes and write to disk
        contents = await file.read()
        if not contents:
            raise HTTPException(status_code=400, detail="Uploaded file was empty")

        with open(save_path, "wb") as f:
            f.write(contents)

        # Attempt to read into pandas for light cleaning
        df = None
        try:
            if save_path.lower().endswith((".csv", ".txt")):
                df = pd.read_csv(save_path)
            elif save_path.lower().endswith((".xlsx", ".xls")):
                df = pd.read_excel(save_path)
            elif save_path.lower().endswith(".json"):
                try:
                    df = pd.read_json(save_path, lines=True)
                except Exception:
                    df = pd.read_json(save_path)
            else:
                df = pd.read_csv(save_path)
        except Exception:
            df = pd.DataFrame()

        # Basic cleaning best-effort
        try:
            if df is not None and not df.empty:
                df.columns = [str(c).strip() for c in df.columns]
                df = df.replace(["", "NA", "N/A", "null", "None"], np.nan)
                df = df.drop_duplicates()
                # Attempt to save cleaned CSV (ignore failures)
                try:
                    df.to_csv(save_path, index=False)
                except Exception:
                    pass
        except Exception:
            pass

        metadata = _metadata_from_path(save_path)

        # Optionally: persist metadata to Mongo if you have helper (not required)
        # try:
        #     if hasattr(utils.mongo, "insert_dataset_metadata"):
        #         utils.mongo.insert_dataset_metadata(metadata)
        # except Exception:
        #     traceback.print_exc()

        return jsonable_encoder({"status": "ok", "message": "Uploaded", "metadata": metadata})
    except HTTPException:
        # Allow FastAPI to handle HTTPExceptions
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Upload failed: {e}")


@router.get("/list")
def list_datasets(limit: int = 20):
    """
    Return recent dataset metadata.
    Try mongo_list_datasets first (if available), otherwise scan local uploads folder.
    """
    # Try mongo-backed listing first
    if mongo_list_datasets is not None:
        try:
            docs = mongo_list_datasets(limit=limit)
            return jsonable_encoder({"datasets": docs if isinstance(docs, list) else [docs]})
        except Exception:
            traceback.print_exc()

    # Fallback: scan local uploads folder
    try:
        os.makedirs(UPLOADS_DIR, exist_ok=True)
        files = sorted(
            [
                os.path.join(UPLOADS_DIR, f)
                for f in os.listdir(UPLOADS_DIR)
                if os.path.isfile(os.path.join(UPLOADS_DIR, f))
                and f.lower().endswith((".csv", ".json", ".xlsx", ".xls", ".txt"))
            ],
            key=lambda p: os.path.getmtime(p),
            reverse=True,
        )
        files = files[:limit]
        items = [_metadata_from_path(p) for p in files]
        return jsonable_encoder({"datasets": items})
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to list datasets: {e}")


@router.delete("/{dataset_id}", status_code=200)
def delete_dataset(dataset_id: str):
    """
    Delete a dataset file by its dataset_id (saved filename basename).
    Performs sanitization and containment checks to avoid traversal.
    """
    try:
        if not dataset_id:
            raise HTTPException(status_code=400, detail="dataset_id is required")

        dataset_id = unquote(dataset_id)
        candidate = os.path.basename(dataset_id)

        # sanitize candidate - keep safe chars only
        if not re.match(r"^[A-Za-z0-9._-]+$", candidate):
            candidate = re.sub(r"[^A-Za-z0-9._-]", "", candidate)
            if not candidate:
                raise HTTPException(status_code=400, detail="Invalid dataset id after sanitization")

        try:
            files = [f for f in os.listdir(UPLOADS_DIR) if os.path.isfile(os.path.join(UPLOADS_DIR, f))]
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"Failed to access uploads folder: {e}")

        match = None
        for f in files:
            if f == candidate or f == dataset_id:
                match = f
                break

        if not match:
            for f in files:
                if f.endswith(candidate) or candidate in f:
                    match = f
                    break

        if not match:
            raise HTTPException(status_code=404, detail=f"Dataset '{dataset_id}' not found")

        full_path = os.path.join(UPLOADS_DIR, match)
        real_uploads = os.path.realpath(UPLOADS_DIR)
        real_target = os.path.realpath(full_path)
        if not (real_target.startswith(real_uploads + os.sep) or real_target == real_uploads):
            raise HTTPException(status_code=400, detail="Invalid dataset path")

        try:
            os.remove(real_target)
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail="Dataset already removed")
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"Failed to delete dataset: {e}")

        return jsonable_encoder({"status": "ok", "message": "Deleted", "dataset": match})
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to delete dataset: {e}")
