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

# NOTE: router has NO prefix here; main.py includes it with prefix="/models/transformer"
router = APIRouter(tags=["transformer"])

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
INDEX_BASE = os.path.join(BASE_DIR, "database", "indexes")
UPLOADS_DIR = os.path.join(BASE_DIR, "database", "uploads")

os.makedirs(INDEX_BASE, exist_ok=True)
os.makedirs(UPLOADS_DIR, exist_ok=True)

# ---- JSON-safe helper -----------------------------------------------------
def _safe_value(v: Any) -> Any:
    """
    Convert pandas/numpy scalars and NaN/Inf to JSON-safe Python types.
    - None -> None
    - numpy/pandas scalars -> python native (int/float/str)
    - NaN/Inf -> None
    - datetimes with isoformat -> isoformat string
    """
    try:
        # None
        if v is None:
            return None

        # numpy / pandas scalar with .item()
        if hasattr(v, "item"):
            try:
                return _safe_value(v.item())
            except Exception:
                pass

        # floats (python float)
        if isinstance(v, float):
            if math.isnan(v) or math.isinf(v):
                return None
            return float(v)

        # numpy numeric types
        try:
            import numpy as _np
            if isinstance(v, (_np.integer,)):
                return int(v)
            if isinstance(v, (_np.floating,)):
                fv = float(v)
                if math.isnan(fv) or math.isinf(fv):
                    return None
                return fv
        except Exception:
            # numpy may not be importable here (but it is in your env)
            pass

        # pandas Timestamp / datetime-like
        if hasattr(v, "isoformat"):
            try:
                return v.isoformat()
            except Exception:
                pass

        # basic types allowed by json
        if isinstance(v, (str, bool, int)):
            return v

        # fallback for objects: return as-is (jsonable_encoder will further handle)
        return v
    except Exception:
        return None
# ---------------------------------------------------------------------------

# Load embedding model once (for retrieval)
model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")

# Load small text-generation model
gen_tokenizer = AutoTokenizer.from_pretrained("google/flan-t5-small")
gen_model = AutoModelForSeq2SeqLM.from_pretrained("google/flan-t5-small")


def _find_index_files(dataset: str) -> Tuple[str, str]:
    flat_index = os.path.join(INDEX_BASE, f"{dataset}.faiss")
    flat_meta = os.path.join(INDEX_BASE, f"{dataset}_meta.json")
    if os.path.exists(flat_index) and os.path.exists(flat_meta):
        return flat_index, flat_meta

    folder = os.path.join(INDEX_BASE, dataset)
    folder_index = os.path.join(folder, "index.faiss")
    folder_meta = os.path.join(folder, "meta.jsonl")
    if os.path.exists(folder_index) and os.path.exists(folder_meta):
        return folder_index, folder_meta

    raise HTTPException(
        status_code=404,
        detail=(
            f"Index files not found for dataset '{dataset}' "
            f"(searched: {flat_index}, {flat_meta}, {folder_index}, {folder_meta})"
        ),
    )


def _load_meta(meta_path: str) -> Any:
    if meta_path.endswith(".jsonl"):
        with open(meta_path, "r", encoding="utf-8") as f:
            return [json.loads(line) for line in f if line.strip()]
    else:
        with open(meta_path, "r", encoding="utf-8") as f:
            return json.load(f)


def _find_best_csv_for_dataset(dataset: str) -> Optional[str]:
    candidate = os.path.join(UPLOADS_DIR, f"{dataset}.csv")
    if os.path.exists(candidate):
        return candidate

    core = dataset or ""
    if core.endswith("_index"):
        core = core[:-6]
    core = core.replace("index", "").strip("_-")

    files = [
        os.path.join(UPLOADS_DIR, f)
        for f in os.listdir(UPLOADS_DIR)
        if os.path.isfile(os.path.join(UPLOADS_DIR, f))
           and f.lower().endswith((".csv", ".xlsx", ".xls", ".json", ".txt"))
    ]

    if not files:
        return None

    core_matches: List[str] = []
    if core:
        lc = core.lower()
        for p in files:
            if lc in os.path.basename(p).lower():
                core_matches.append(p)

    if core_matches:
        return max(core_matches, key=lambda p: os.path.getsize(p))

    return max(files, key=lambda p: os.path.getsize(p))


@router.get("/retrieve")
async def retrieve(
    query: str = Query(...),
    dataset: str = Query(...),
    top_k: int = Query(5),
):
    try:
        index_path, meta_path = _find_index_files(dataset)
        index = faiss.read_index(index_path)
        meta = _load_meta(meta_path)

        csv_candidates: List[str] = []
        if isinstance(meta, dict):
            for k in ("source_csv", "source", "csv_filename", "source_file", "original_filename"):
                v = meta.get(k)
                if v:
                    # prefer uploads dir if relative
                    cand = os.path.join(UPLOADS_DIR, v) if not os.path.isabs(v) else v
                    csv_candidates.append(cand)

        smart = _find_best_csv_for_dataset(dataset)
        if smart:
            csv_candidates.append(smart)

        seen = set()
        csv_candidates = [p for p in csv_candidates if p and not (p in seen or seen.add(p))]

        csv_path = None
        for p in csv_candidates:
            if p and os.path.exists(p):
                csv_path = p
                break

        if not csv_path:
            raise HTTPException(status_code=404, detail=f"CSV not found. Tried: {csv_candidates}")

        # Load dataframe safely
        try:
            df = pd.read_csv(csv_path, low_memory=False)
        except Exception:
            df = pd.read_csv(csv_path, engine="python", low_memory=False)

        # Create query embedding and search index
        q_emb = model.encode([query]).astype("float32")
        D, I = index.search(q_emb, top_k)

        results = []
        for sim_score, idx in zip(D[0], I[0]):
            # handle negative or missing indexes
            if idx is None:
                continue
            try:
                i = int(idx)
            except Exception:
                continue
            if i < 0 or i >= len(df):
                continue

            raw_row = df.iloc[i].to_dict()
            # sanitize all values
            safe_row = {str(k): _safe_value(v) for k, v in raw_row.items()}
            # sanitize similarity score
            try:
                safe_row["similarity_score"] = _safe_value(float(sim_score))
            except Exception:
                safe_row["similarity_score"] = _safe_value(sim_score)
            results.append(safe_row)

        response = {"query": query, "dataset": dataset, "results_found": len(results), "results": results}
        return jsonable_encoder(response)

    except HTTPException:
        raise
    except Exception as e:
        # avoid leaking internal trace to client, but return informative message
        raise HTTPException(status_code=500, detail=f"Transformer retrieval failed: {e}")


# ---------------------------------------------------------------
# ✅ GENERATION ENDPOINT
# ---------------------------------------------------------------

@router.get("/generate")
async def generate(
    query: str = Query(..., description="Ask something about the dataset or insights"),
    dataset: str = Query(None, description="Optional dataset context name"),
    top_k: int = Query(5, description="How many similar rows to fetch for context (if index exists)"),
):
    """
    Grounded generation:
    - If a FAISS index + CSV exist, fetch top_k similar rows for context.
    - Else sample a few rows from a CSV (best-effort).
    - Use FLAN-T5 with a clearer prompt + few-shot examples so it produces a helpful explanation.
    """
    try:
        dataset_context_parts: List[str] = []
        retrieved_rows: List[Dict[str, Any]] = []
        csv_path: Optional[str] = None
        index_path: Optional[str] = None
        meta_path: Optional[str] = None

        # Try to locate index files (best-effort)
        try:
            if dataset:
                idx_p, meta_p = _find_index_files(dataset)
                index_path, meta_path = idx_p, meta_p
        except Exception:
            index_path, meta_path = None, None

        # Find CSV: meta -> smart -> fallback
        try:
            if meta_path:
                meta = _load_meta(meta_path)
                if isinstance(meta, dict):
                    for k in ("source_csv", "source", "csv_filename", "source_file", "original_filename"):
                        v = meta.get(k)
                        if v:
                            cand = os.path.join(UPLOADS_DIR, v) if not os.path.isabs(v) else v
                            if os.path.exists(cand):
                                csv_path = cand
                                break
            if not csv_path and dataset:
                smart = _find_best_csv_for_dataset(dataset)
                if smart and os.path.exists(smart):
                    csv_path = smart
            if not csv_path:
                files = [
                    os.path.join(UPLOADS_DIR, f)
                    for f in os.listdir(UPLOADS_DIR)
                    if os.path.isfile(os.path.join(UPLOADS_DIR, f)) and f.lower().endswith((".csv", ".json", ".txt", ".xlsx", ".xls"))
                ]
                if files:
                    csv_path = max(files, key=lambda p: os.path.getsize(p))
        except Exception:
            csv_path = None

        # If index exists and csv_path, retrieve similar rows
        if index_path and csv_path:
            try:
                idx = faiss.read_index(index_path)
                q_emb = model.encode([query]).astype("float32")
                D, I = idx.search(q_emb, top_k)
                try:
                    df = pd.read_csv(csv_path, low_memory=False)
                except Exception:
                    df = pd.read_csv(csv_path, engine="python", low_memory=False)
                for sim_score, row_idx in zip(D[0], I[0]):
                    try:
                        ridx = int(row_idx)
                    except Exception:
                        continue
                    if 0 <= ridx < len(df):
                        r = df.iloc[ridx].to_dict()
                        r["_score"] = _safe_value(sim_score)
                        retrieved_rows.append(r)
            except Exception:
                retrieved_rows = []

        # If retrieval failed, sample a few rows from CSV
        if not retrieved_rows and csv_path:
            try:
                try:
                    df = pd.read_csv(csv_path, low_memory=False)
                except Exception:
                    df = pd.read_csv(csv_path, engine="python", low_memory=False)
                for _, r in df.head(6).iterrows():
                    retrieved_rows.append(r.to_dict())
            except Exception:
                retrieved_rows = []

        # Small numeric stats for common columns (best-effort)
        stats_text = ""
        try:
            if csv_path:
                df_stats = pd.read_csv(csv_path, usecols=lambda c: True, low_memory=False)
                if "median_income" in df_stats.columns:
                    col = pd.to_numeric(df_stats["median_income"], errors="coerce").dropna()
                    if len(col) > 0:
                        stats_text = (
                            f"median_income: count={int(col.count())}, mean={col.mean():.3f}, "
                            f"median={col.median():.3f}, min={col.min():.3f}, max={col.max():.3f}"
                        )
        except Exception:
            stats_text = ""

        # Build compact context summary
        def row_to_line(r: Dict[str, Any], max_chars: int = 240) -> str:
            try:
                kv_pairs: List[str] = []
                for k, v in r.items():
                    if k == "_score":
                        continue
                    vs = str(v)
                    if len(vs) > 80:
                        vs = vs[:77] + "..."
                    kv_pairs.append(f"{k}:{vs}")
                line = ", ".join(kv_pairs)
                if "_score" in r:
                    try:
                        line += f", score:{float(r['_score']):.3f}"
                    except Exception:
                        line += f", score:{r.get('_score')}"
                return line[:max_chars]
            except Exception:
                return ""

        sample_rows_text = "\n".join(row_to_line(r) for r in retrieved_rows[:6]) if retrieved_rows else ""

        if stats_text:
            dataset_context_parts.append(f"Stats: {stats_text}")
        if sample_rows_text:
            dataset_context_parts.append(f"Sample rows:\n{sample_rows_text}")
        if csv_path:
            dataset_context_parts.append(f"CSV: {os.path.basename(csv_path)}")

        dataset_context = "\n\n".join(dataset_context_parts).strip()
        dataset_context_used = bool(dataset_context)

        # --- Improved prompt with few-shot examples ---
        few_shot = (
            "Example 1:\nQ: Explain the trend in median_house_value over time in plain language.\n"
            "A: • Prices rose steadily from 2010–2016, then flattened; • Coastal areas show higher values; • Action: investigate supply constraints in high-price areas.\n\n"
            "Example 2:\nQ: Summarize median_income distribution.\n"
            "A: • Most households have income between 2.5–4.5; • A small tail above 8; • Action: segment by region for deeper insight.\n\n"
        )

        if dataset_context_used:
            prompt = (
                "You are a helpful data analyst assistant. Use the dataset context below when useful and be concise.\n\n"
                f"DATASET CONTEXT:\n{dataset_context}\n\n"
                f"{few_shot}"
                f"QUESTION: {query}\n\n"
                "Answer in plain English with 3-6 short bullet points. Each bullet must start with '•'. "
                "Then on a new line write 'Next step: <one short recommended step>'. Do NOT repeat the question."
            )
        else:
            prompt = (
                "You are a helpful data analyst assistant. Be concise and clear.\n\n"
                f"{few_shot}"
                f"QUESTION: {query}\n\n"
                "Answer as 3–6 short, clear bullet points in plain language and give 1 recommended next step."
            )

        # Tokenize & generate
        inputs = gen_tokenizer(prompt, return_tensors="pt", truncation=True, max_length=1024)

        gen_kwargs = dict(
            max_new_tokens=420,
            min_new_tokens=40,
            num_beams=4,
            temperature=0.15,
            no_repeat_ngram_size=3,
            early_stopping=True,
        )
        outputs = gen_model.generate(**inputs, **gen_kwargs)

        raw_answer = gen_tokenizer.decode(
            outputs[0],
            skip_special_tokens=True,
            clean_up_tokenization_spaces=True,
        ) or ""

        # Post-process bullets & encoding artifacts
        repl_map = {
            "â¢": "•",
            "\uFFFD": "•",
            "�": "•",
            "Â•": "•",
            "Ã¢": "•",
            "\r\n": "\n",
            "\r": "\n",
        }
        answer = raw_answer
        for k, v in repl_map.items():
            answer = answer.replace(k, v)

        lines = [ln.strip() for ln in answer.splitlines() if ln.strip()]
        normalized: List[str] = []
        for ln in lines:
            if ln and not ln.startswith("•") and ("•" in ln[:3] or ln.startswith("-")):
                ln = "• " + ln.lstrip("-• \t")
            normalized.append(ln)
        answer = "\n".join(normalized).strip()

        if len(answer) < 6:
            answer = "• I couldn't produce a full explanation. Next step: ask for 'summarize dataset' or 'show chart for X'."

        resp = {
            "query": query,
            "dataset": dataset,
            "dataset_context_used": dataset_context_used,
            "context_summary": dataset_context,
            "generation_raw": {
                "query": query,
                "dataset": (dataset or ""),
                "dataset_context_used": dataset_context_used,
                "context_summary": dataset_context,
            },
            "answer": answer,
        }
        return jsonable_encoder(resp)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Generation failed: {e}")


# ---------------------------------------------------------------
# ✅ CHART SUGGESTION ENDPOINT  (this is what fixes your charts)
# ---------------------------------------------------------------

def _resolve_dataset_path(dataset_name: str) -> str:
    """
    Resolve a dataset id (like '9137...__financials.csv') to an absolute path
    inside backend/database/uploads.
    """
    if not dataset_name:
        raise HTTPException(status_code=400, detail="dataset is required")

    # 1) if dataset_name is already an absolute path inside uploads, accept
    candidate = os.path.abspath(dataset_name)
    uploads_real = os.path.realpath(UPLOADS_DIR)
    if os.path.exists(candidate) and os.path.realpath(candidate).startswith(uploads_real + os.sep):
        return candidate

    # 2) basename inside uploads
    base = os.path.basename(dataset_name)
    candidate2 = os.path.join(UPLOADS_DIR, base)
    if os.path.exists(candidate2) and os.path.realpath(candidate2).startswith(uploads_real + os.sep):
        return os.path.realpath(candidate2)

    # 3) fallback: any file in uploads containing the dataset_name
    try:
        for f in os.listdir(UPLOADS_DIR):
            if dataset_name in f:
                cand = os.path.join(UPLOADS_DIR, f)
                if os.path.exists(cand) and os.path.realpath(cand).startswith(uploads_real + os.sep):
                    return os.path.realpath(cand)
    except Exception:
        pass

    # debug helper: show sample files
    sample = []
    try:
        sample = os.listdir(UPLOADS_DIR)[:20]
    except Exception:
        sample = []

    raise HTTPException(
        status_code=404,
        detail=f"Failed to read dataset '{dataset_name}': not found in uploads. Sample files: {sample}",
    )


def _to_numeric_series(s: pd.Series) -> pd.Series:
    """
    Convert messy string numbers like '2,45,122' or '97,690' into numeric values.
    """
    cleaned = s.astype(str).str.replace(r"[^\d\.-]", "", regex=True)
    return pd.to_numeric(cleaned, errors="coerce")


def _guess_xy_from_question(question: str, df: pd.DataFrame) -> Dict[str, Optional[str]]:
    """
    Very small heuristic to guess which columns should be X (group) and Y (value).
    """
    q = (question or "").lower()
    cols = {c.lower(): c for c in df.columns}
    x_col: Optional[str] = None
    y_col: Optional[str] = None

    # prefer year/date/month as X
    for cand in ("year", "date", "month"):
        if cand in cols:
            x_col = cols[cand]
            break

    # y based on keywords in question
    for keyword in (
        "total revenue",
        "revenue",
        "net income",
        "income",
        "total assets",
        "assets",
        "liabilities",
        "cash",
    ):
        if keyword in q:
            for c_low, orig in cols.items():
                if keyword in c_low or any(k in c_low for k in keyword.split()):
                    y_col = orig
                    break
            if y_col:
                break

    # fallback Y: most numeric-looking column
    if not y_col:
        numeric_scores: Dict[str, int] = {}
        for c in df.columns:
            s = _to_numeric_series(df[c])
            numeric_scores[c] = s.notna().sum()
        if numeric_scores:
            best = max(numeric_scores.items(), key=lambda kv: kv[1])
            if best[1] > 0:
                y_col = best[0]

    return {"x": x_col, "y": y_col}


@router.get("/chart")
async def chart_suggestion(
    dataset: str = Query(..., description="Dataset id from uploads"),
    question: str = Query("", description="User question to guide chart type/columns"),
):
    """
    Suggest a chart specification + aggregated data for a dataset.

    Returns:
    {
      "chart_spec": { "type": "bar", "x": "Year", "y": "Total Revenue", "title": "..." },
      "aggregated": {
        "labels": [...],
        "values": [...],
        "raw_table": [...]
      },
      "dataset": "<dataset_id>"
    }
    """
    # 1) resolve absolute dataset path
    path = _resolve_dataset_path(dataset)

    # 2) read CSV (as strings first, we will handle numeric conversion)
    try:
        df = pd.read_csv(path, dtype=str)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Chart suggestion failed: Failed to read dataset '{dataset}': {e}",
        )

    if df is None or df.shape[0] == 0:
        return {
            "chart_spec": None,
            "aggregated": None,
            "dataset": dataset,
            "error": "Empty dataset",
        }

    # clean columns
    df.columns = [str(c).strip() for c in df.columns]
    df = df.loc[:, ~(df.isnull().all())]

    # 3) guess x / y
    guess = _guess_xy_from_question(question, df)
    x_col = guess.get("x")
    y_col = guess.get("y")

    if x_col is None:
        x_col = df.columns[0]

    aggregated: Dict[str, Any] = {
        "labels": [],
        "values": [],
        "raw_table": [],
    }

    # 4) if we have a Y column, aggregate numeric values by X
    if y_col:
        try:
            numeric_series = _to_numeric_series(df[y_col])
            grouped = df.assign(_y=numeric_series).groupby(x_col, sort=True)["_y"].sum().reset_index()

            # try to sort X numerically if possible
            try:
                grouped[x_col] = pd.to_numeric(grouped[x_col], errors="coerce")
                grouped = grouped.sort_values(by=x_col)
            except Exception:
                grouped = grouped.sort_values(by=x_col)

            labels = grouped[x_col].astype(str).tolist()
            values = [float(v) if not pd.isna(v) else 0.0 for v in grouped["_y"].tolist()]

            aggregated["labels"] = labels
            aggregated["values"] = values
            aggregated["raw_table"] = df.head(50).to_dict(orient="records")

            chart_spec = {
                "type": "bar",
                "x": x_col,
                "y": y_col,
                "title": question or f"{y_col} by {x_col}",
            }
            return {
                "chart_spec": chart_spec,
                "aggregated": aggregated,
                "dataset": dataset,
            }
        except Exception:
            # fall back to frequency counts on X
            pass

    # 5) fallback: just show counts by X
    try:
        counts = df[x_col].value_counts().sort_index()
        labels = counts.index.astype(str).tolist()
        values = [float(v) for v in counts.tolist()]

        aggregated["labels"] = labels
        aggregated["values"] = values
        aggregated["raw_table"] = df.head(50).to_dict(orient="records")

        chart_spec = {
            "type": "bar",
            "x": x_col,
            "y": "count",
            "title": question or f"Count by {x_col}",
        }
        return {
            "chart_spec": chart_spec,
            "aggregated": aggregated,
            "dataset": dataset,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chart suggestion failed: {e}")


# -------------------------
# Dataset summaries (precompute & cache)
# -------------------------
SUMMARIES_DIR = os.path.join(INDEX_BASE, "summaries")
os.makedirs(SUMMARIES_DIR, exist_ok=True)


@router.post("/summaries/precompute")
async def summaries_precompute(dataset: str = Query(..., description="Dataset index name")):
    """
    Precompute and cache a dataset summary file.
    Output is written to: database/indexes/summaries/<dataset>_summary.json
    """
    try:
        # find CSV with existing logic (best-effort)
        csv_path: Optional[str] = None
        try:
            # try meta -> smart -> fallback
            idx_meta = None
            try:
                _, meta_p = _find_index_files(dataset)
                idx_meta = _load_meta(meta_p)
            except Exception:
                idx_meta = None

            if isinstance(idx_meta, dict):
                for k in ("source_csv", "source", "csv_filename", "source_file", "original_filename"):
                    v = idx_meta.get(k)
                    if v:
                        cand = os.path.join(UPLOADS_DIR, v) if not os.path.isabs(v) else v
                        if os.path.exists(cand):
                            csv_path = cand
                            break

            if csv_path is None:
                csv_path = _find_best_csv_for_dataset(dataset)
        except Exception:
            csv_path = _find_best_csv_for_dataset(dataset)

        if not csv_path or not os.path.exists(csv_path):
            raise HTTPException(
                status_code=404,
                detail=f"CSV file for dataset '{dataset}' not found. Tried to locate: {csv_path}",
            )

        # load a lightweight sample / compute stats
        try:
            df = pd.read_csv(csv_path, low_memory=False)
        except Exception:
            df = pd.read_csv(csv_path, engine="python", low_memory=False)

        # compute basic numeric stats for all numeric columns (safe)
        stats: Dict[str, Dict[str, float]] = {}
        for c in df.columns:
            try:
                col = pd.to_numeric(df[c], errors="coerce")
                non_na = col.dropna()
                if len(non_na) > 0:
                    stats[c] = {
                        "count": int(non_na.count()),
                        "mean": float(np.nanmean(non_na)),
                        "median": float(np.nanmedian(non_na)),
                        "min": float(np.nanmin(non_na)),
                        "max": float(np.nanmax(non_na)),
                    }
            except Exception:
                continue

        # sample some rows for quick context (limit: 6)
        sample_rows: List[Dict[str, Any]] = []
        for _, row in df.head(6).iterrows():
            rec: Dict[str, Any] = {}
            for k, v in row.items():
                try:
                    if pd.isna(v):
                        rec[k] = None
                    elif hasattr(v, "item"):
                        rec[k] = v.item()
                    else:
                        rec[k] = v
                except Exception:
                    rec[k] = None
            sample_rows.append(rec)

        summary_text = ""
        if "median_income" in df.columns:
            try:
                col = pd.to_numeric(df["median_income"], errors="coerce").dropna()
                if len(col) > 0:
                    summary_text = (
                        "median_income: "
                        f"count={int(col.count())}, mean={col.mean():.3f}, "
                        f"median={col.median():.3f}, min={col.min():.3f}, max={col.max():.3f}"
                    )
            except Exception:
                summary_text = ""

        out = {
            "dataset": dataset,
            "csv_basename": os.path.basename(csv_path),
            "summary_text": summary_text,
            "sample_rows": sample_rows,
            "sample_rows_text": "\n".join(
                ", ".join(f"{k}:{str(v)[:80]}" for k, v in r.items()) for r in sample_rows
            ),
            "computed_at": int(time.time()),
            "stats": stats,
        }

        out_path = os.path.join(SUMMARIES_DIR, f"{dataset}_summary.json")
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=2)

        return {"status": "ok", "cached_at": out_path, "summary": out}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Precompute failed: {e}")
