# backend/utils/memory.py
import time
from collections import deque
from typing import Dict, Deque, Any, List, Optional

# Keep last N messages per user/session
MAX_MESSAGES_PER_USER = 5

# Simple in-process store: {user_id: deque([...])}
_store: Dict[str, Deque[Dict[str, Any]]] = {}

def add_message(user_id: str, role: str, text: str, ts: Optional[float] = None) -> None:
    """
    Add a message to memory. role: 'user' or 'bot'
    """
    if ts is None:
        ts = time.time()
    if user_id not in _store:
        _store[user_id] = deque(maxlen=MAX_MESSAGES_PER_USER)
    _store[user_id].append({
        "role": role,
        "text": text,
        "ts": ts
    })

def get_messages(user_id: str) -> List[Dict[str, Any]]:
    """
    Return list of messages in chronological order (oldest first).
    """
    if user_id not in _store:
        return []
    return list(_store[user_id])

def clear(user_id: str) -> None:
    if user_id in _store:
        del _store[user_id]

def get_last_user_message(user_id: str) -> Optional[str]:
    msgs = get_messages(user_id)
    for m in reversed(msgs):
        if m.get("role") == "user":
            return m.get("text")
    return None
