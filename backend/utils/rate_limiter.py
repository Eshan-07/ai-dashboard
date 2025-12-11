# utils/rate_limiter.py

import time
from fastapi import Request, HTTPException

RATE_LIMITS = {
    "/models/transformer/generate": (20, 3600),  # 20 req per 1 hour
    "/models/transformer/retrieve": (200, 3600),  # 200 req per 1 hour
    "/models/transformer/summaries/precompute": (5, 3600),
}

last_calls = {}  # { ip: {route: [timestamps...] } }


async def rate_limiter(request: Request, call_next):
    ip = request.client.host
    path = request.url.path

    # Only limit specific routes
    for route_prefix, (limit, window) in RATE_LIMITS.items():
        if path.startswith(route_prefix):
            now = time.time()
            user_routes = last_calls.setdefault(ip, {})
            timestamps = user_routes.setdefault(path, [])

            # Keep only recent timestamps inside the window
            timestamps = [t for t in timestamps if now - t < window]
            user_routes[path] = timestamps

            if len(timestamps) >= limit:
                raise HTTPException(
                    status_code=429,
                    detail=f"Rate limit exceeded for {path}. Try again later."
                )

            timestamps.append(now)
            break

    response = await call_next(request)
    return response
