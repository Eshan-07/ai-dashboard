# backend/routes/chatbot.py
import logging
import re
import time
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Query, HTTPException, Body
import httpx

from utils.reasoning_router import route_reasoning  # ✅ NEW (SAFE)

router = APIRouter(tags=["chat"])
logger = logging.getLogger("ai-dashboard-chatbot")

# ---------------- Memory Store ----------------
_memory_store: Dict[str, List[Dict[str, Any]]] = {}
MEMORY_LIMIT = 5


def _append_memory(user_id: str, role: str, text: str) -> None:
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
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            return resp.json() if resp.content else {}
    except Exception as e:
        logger.warning("[Transformer GET Failed] %s %s", url, e)
        return {}


async def _call_transformer_generate(query, dataset, top_k):
    return await safe_get(
        "http://127.0.0.1:8000/models/transformer/generate",
        {"query": query, "dataset": dataset or "", "top_k": top_k},
    )


async def _call_transformer_retrieve(query, dataset, top_k):
    return await safe_get(
        "http://127.0.0.1:8000/models/transformer/retrieve",
        {"query": query, "dataset": dataset or "", "top_k": top_k},
    )


async def _call_transformer_chart(dataset, question):
    return await safe_get(
        "http://127.0.0.1:8000/models/transformer/chart",
        {"dataset": dataset or "", "question": question},
    )


# ---------------- Text Cleaner ----------------
def _clean_answer(text: str) -> str:
    if not text:
        return ""
    out = text.replace("â¢", "•").replace("�", "•")
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

    logger.info("[CHAT] user_id=%s message=%s dataset=%s", user_id, message, dataset)

    if user_id:
        _append_memory(user_id, "user", message)

    intent = detect_intent(message)

    final_answer = ""
    chart_spec = None

    # ---------------- RETRIEVE ROWS FIRST ----------------
    retrieved_rows: List[Dict[str, Any]] = []
    ret_resp = await _call_transformer_retrieve(message, dataset, top_k)
    if isinstance(ret_resp, dict):
        retrieved_rows = ret_resp.get("results", []) or []

    # ---------------- REASONING LAYER (NEW CORE LOGIC) ----------------
    reasoning_result = route_reasoning(message, retrieved_rows)

    status = reasoning_result.get("status")

    if status == "clarification_required":
        final_answer = reasoning_result.get("question", "Please clarify your request.")

    elif status == "ready":
        decision_type = reasoning_result.get("decision_type")

        # AGGREGATION
        if decision_type == "aggregation":
            total = 0
            for r in retrieved_rows:
                for v in r.values():
                    if isinstance(v, (int, float)):
                        total += v
            final_answer = f"• The computed total value is {round(total, 2)}."

        # RANKING / FILTERING → let charts handle it
        else:
            gen_resp = await _call_transformer_generate(message, dataset, top_k)
            final_answer = _clean_answer(gen_resp.get("answer", ""))

    else:
        gen_resp = await _call_transformer_generate(message, dataset, top_k)
        final_answer = _clean_answer(gen_resp.get("answer", ""))

    # ---------------- CHART ONLY WHEN MEANINGFUL ----------------
    if intent in ("show_chart", "compare") and dataset:
        chart_resp = await _call_transformer_chart(dataset, message)
        chart_spec = chart_resp.get("chart_spec")

    if user_id:
        _append_memory(user_id, "bot", final_answer)

    return {
        "user_message": message,
        "dataset": dataset,
        "intent": intent,
        "bot_reply": final_answer,
        "chart_spec": chart_spec,
        "memory": _memory_store.get(user_id, []).copy() if user_id else [],
    }


# ---------------- POST Wrapper ----------------
@router.post("/respond")
async def respond(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    message = payload.get("message")
    dataset = payload.get("dataset")
    top_k = int(payload.get("top_k", 5))
    user_id = payload.get("user_id")

    if not message:
        raise HTTPException(status_code=400, detail="message is required")

    return await ask(
        message=message,
        dataset=dataset,
        top_k=top_k,
        user_id=user_id,
    )
