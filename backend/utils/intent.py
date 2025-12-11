# backend/utils/intent.py
import re
from typing import Tuple, Optional
from sentence_transformers import SentenceTransformer
import numpy as np

# load a lightweight embedding model once
_embed_model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")

# Pre-defined intents & example utterances (embedding fallback)
_INTENT_TEMPLATES = {
    "show_chart": ["show me a chart", "plot", "visualize", "display chart", "make a chart"],
    "compare": ["compare", "comparison between", "compare x and y", "compare A and B"],
    "summarize": ["summarize", "summary", "give me a summary", "what's the summary"],
    "anomaly": ["anomaly", "outlier", "find anomalies", "detect anomalies", "unusual"],
    "explain": ["explain", "what is", "explain median_income", "explain trend"],
    "list_columns": ["list columns", "what columns", "show columns", "schema"],
    "help": ["help", "how to", "what can you do"],
}

# thresholds
EMBED_SIM_THRESHOLD = 0.55  # tune if needed

# simple rule-based checks (fast)
def _rule_intent(text: str) -> Optional[str]:
    txt = text.lower().strip()
    if re.search(r"\b(compare|vs|versus|vs\.)\b", txt):
        return "compare"
    if re.search(r"\b(chart|plot|visualize|draw|graph|histogram|scatter)\b", txt):
        return "show_chart"
    if re.search(r"\b(summariz|summary|summarize|overview)\b", txt):
        return "summarize"
    if re.search(r"\b(anomal|outlier|outliers|detect anomaly|find anomaly)\b", txt):
        return "anomaly"
    if re.search(r"\b(list columns|what columns|columns|schema|headers)\b", txt):
        return "list_columns"
    if re.search(r"\b(explain|what is|how|why)\b", txt) and len(txt.split()) <= 8:
        # short explain-style queries
        return "explain"
    if re.search(r"\b(help|what can you do|options)\b", txt):
        return "help"
    return None

# embedding fallback
def _embed_intent(text: str) -> Optional[Tuple[str, float]]:
    try:
        candidates = []
        # compute embedding for text and each template group average
        text_emb = _embed_model.encode([text], convert_to_numpy=True)[0]
        for intent, examples in _INTENT_TEMPLATES.items():
            ex_embs = _embed_model.encode(examples, convert_to_numpy=True)
            mean_emb = np.mean(ex_embs, axis=0)
            # cosine similarity
            sim = np.dot(text_emb, mean_emb) / (np.linalg.norm(text_emb) * np.linalg.norm(mean_emb) + 1e-10)
            candidates.append((intent, float(sim)))
        # pick best
        candidates.sort(key=lambda x: x[1], reverse=True)
        best_intent, best_sim = candidates[0]
        if best_sim >= EMBED_SIM_THRESHOLD:
            return best_intent, best_sim
        return None
    except Exception:
        return None

def detect_intent(text: str) -> Tuple[str, Optional[float]]:
    """
    Returns (intent_name, score). Always returns a fallback 'unknown' if nothing matched.
    """
    # 1) rule-based
    r = _rule_intent(text)
    if r:
        return r, None
    # 2) embedding fallback
    emb = _embed_intent(text)
    if emb:
        return emb[0], emb[1]
    return "unknown", None
