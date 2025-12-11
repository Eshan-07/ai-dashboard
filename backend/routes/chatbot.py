# backend/routes/chatbot.py
import logging
import re
import time
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Query, HTTPException, Body
import httpx

router = APIRouter(tags=["chat"])
logger = logging.getLogger("ai-dashboard-chatbot")


# ---------------- Memory Store ----------------
# { user_id: [ {"role": "...", "text": "...", "ts": float}, ... ] }
_memory_store: Dict[str, List[Dict[str, Any]]] = {}
MEMORY_LIMIT = 5


def _append_memory(user_id: str, role: str, text: str) -> None:
    """Append a message to user memory and keep last MEMORY_LIMIT entries."""
    if not user_id:
        return
    lst = _memory_store.setdefault(user_id, [])
    lst.append({"role": role, "text": text, "ts": time.time()})
    if len(lst) > MEMORY_LIMIT:
        lst[:] = lst[-MEMORY_LIMIT:]


# ---------------- Intent Detection ----------------
def detect_intent(message: str) -> str:
    m = (message or "").lower().strip()
    if re.search(r"\b(compare|vs|versus)\b", m):
        return "compare"
    if re.search(r"\b(show|plot|draw|chart|graph)\b", m):
        return "show_chart"
    if re.search(r"\b(summarize|summary|summarise|sum up)\b", m):
        return "summarize"
    if re.search(r"\b(explain|what is|why|how)\b", m):
        return "explain"
    return "unknown"


# ---------------- Transformer Helpers ----------------
async def safe_get(url: str, params: dict, timeout: float = 30) -> dict:
    """
    Safe httpx GET wrapper that:
      - returns {} on error instead of raising
      - logs full stack for debugging
      - returns parsed JSON on success (or {} on parse failure)
    """
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            try:
                # httpx.Response.json() is synchronous and returns parsed JSON
                return resp.json() if resp.content else {}
            except Exception:
                logger.warning("[Transformer GET] Non-JSON response from %s params=%s", url, params)
                return {}
    except Exception as e:
        logger.warning("[Transformer GET Failed] URL=%s params=%s err=%s", url, params, e, exc_info=True)
        return {}


async def _call_transformer_generate(
    query: str, dataset: Optional[str], top_k: int = 5, base_url: str = "http://127.0.0.1:8000"
) -> dict:
    return await safe_get(
        f"{base_url}/models/transformer/generate",
        {"query": query, "dataset": dataset or "", "top_k": top_k},
        timeout=30,
    )


async def _call_transformer_retrieve(
    query: str, dataset: Optional[str], top_k: int = 5, base_url: str = "http://127.0.0.1:8000"
) -> dict:
    return await safe_get(
        f"{base_url}/models/transformer/retrieve",
        {"query": query, "dataset": dataset or "", "top_k": top_k},
        timeout=20,
    )


async def _call_transformer_chart(
    dataset: str, question: str, base_url: str = "http://127.0.0.1:8000"
) -> dict:
    return await safe_get(
        f"{base_url}/models/transformer/chart",
        {"dataset": dataset or "", "question": question},
        timeout=30,
    )


# ---------------- Text Cleaner ----------------
def _clean_answer(text: str) -> str:
    if not text:
        return ""
    out = text.replace("â¢", "•").replace("\uFFFD", "•").replace("�", "•")
    lines = [ln.strip() for ln in out.splitlines() if ln.strip()]
    return "\n".join(lines)


# ---------------- Main Chat Route ----------------
@router.get("/ask")
async def ask(
    message: str = Query(...),
    dataset: Optional[str] = Query(None),
    top_k: int = Query(5),
    user_id: Optional[str] = Query(None),
) -> Dict[str, Any]:
    """
    Ask the chatbot:
      - intent detection
      - generation & fallback retrieval
      - chart suggestion (if needed)
      - memory tracking

    Returns a JSON object with fields:
      user_message, dataset, intent, bot_reply, used_context, chart_spec,
      generation_raw (optional), retrieval_results (optional), memory (optional)
    """
    logger.info("[CHAT] user_id=%s message=%s dataset=%s", user_id, message, dataset)

    # Store user message
    if user_id:
        _append_memory(user_id, "user", message)

    intent = detect_intent(message)

    final_answer = ""
    used_context = False
    gen_resp: dict = {}
    ret_resp: dict = {}

    # 1) GENERATION (best-effort)
    try:
        gen_resp = await _call_transformer_generate(message, dataset, top_k)
        if isinstance(gen_resp, dict) and gen_resp:
            final_answer = (gen_resp.get("answer") or gen_resp.get("final_answer") or "") or ""
            used_context = bool(gen_resp.get("dataset_context_used") or gen_resp.get("context_summary"))
            final_answer = _clean_answer(final_answer)
    except Exception as e:
        logger.warning("Generation helper failed: %s", e, exc_info=True)
        gen_resp = {}

    # 2) RETRIEVAL FALLBACK IF EMPTY
    try:
        if not final_answer:
            ret_resp = await _call_transformer_retrieve(message, dataset, top_k)
            rows = ret_resp.get("results", []) if isinstance(ret_resp, dict) else []
            if rows:
                bullets = []
                for r in rows[:5]:
                    if not isinstance(r, dict):
                        continue
                    first_keys = list(r.keys())[:3]
                    bullets.append("• " + ", ".join(f"{k}: {r.get(k)}" for k in first_keys))
                final_answer = "I couldn't produce a full explanation, but here are relevant rows:\n\n" + "\n".join(bullets)
            else:
                final_answer = "Sorry — I couldn't find relevant rows to answer this question."
    except Exception as e:
        logger.warning("Retrieval helper failed: %s", e, exc_info=True)
        ret_resp = {}

    # 3) If still empty, fallback generic
    if not final_answer:
        final_answer = final_answer or "Sorry — I couldn't generate an answer for that."

    # 4) CHART SPEC (only for chart-intents)
    chart_spec = None
    if intent in ("show_chart", "compare"):
        try:
            chart_resp = await _call_transformer_chart(dataset or "", message)
            if isinstance(chart_resp, dict) and chart_resp:
                chart_spec = chart_resp.get("chart_spec") or chart_resp
        except Exception as e:
            logger.warning("Chart helper failed: %s", e, exc_info=True)
            chart_spec = None

    # Save bot message
    if user_id:
        _append_memory(user_id, "bot", final_answer)

    # ---------------- Response ----------------
    resp: Dict[str, Any] = {
        "user_message": message,
        "dataset": dataset,
        "intent": intent,
        "bot_reply": final_answer,
        "used_context": used_context,
        "chart_spec": chart_spec,
    }

    if isinstance(gen_resp, dict) and gen_resp:
        resp["generation_raw"] = gen_resp
    if isinstance(ret_resp, dict) and ret_resp:
        resp["retrieval_results"] = ret_resp.get("results", [])

    if user_id:
        resp["memory"] = _memory_store.get(user_id, []).copy()

    return resp


# ---------------- Backwards-compatible POST wrapper ----------------
@router.post("/respond")
async def respond(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    """
    Backwards-compatible POST endpoint so frontends that POST to /chat/respond continue to work.
    Accepts JSON payload with fields: message, dataset, top_k, user_id
    Internally calls the existing `ask` handler to reuse logic.
    """
    try:
        if not isinstance(payload, dict):
            raise HTTPException(status_code=400, detail="Invalid JSON body (expected object)")

        message = payload.get("message")
        dataset = payload.get("dataset")
        top_k = payload.get("top_k", 5)
        user_id = payload.get("user_id")

        if not message or not isinstance(message, str):
            raise HTTPException(status_code=400, detail="`message` (string) is required in body")

        # normalize top_k to int safely
        try:
            top_k_int = int(top_k) if top_k is not None else 5
        except Exception:
            top_k_int = 5

        # Reuse ask() => call directly (it's async)
        return await ask(message=message, dataset=dataset, top_k=top_k_int, user_id=user_id)

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("POST /chat/respond wrapper failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Chat respond failed: {e}")
