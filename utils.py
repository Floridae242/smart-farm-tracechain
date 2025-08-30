import hashlib
import json
from typing import List, Dict, Any

IDEAL_RANGES = {
    "temperature_c": (8, 15),
    "humidity_pct": (85, 95),
    "soil_moisture_pct": (25, 45),
    "ph": (6.0, 7.0),
}

def compute_hash(prev_hash: str, payload: dict, timestamp: str) -> str:
    block = json.dumps({
        "prev_hash": prev_hash,
        "payload": payload,
        "timestamp": timestamp
    }, sort_keys=True)
    return hashlib.sha256(block.encode("utf-8")).hexdigest()

def verify_chain(events: List[Dict[str, Any]]) -> bool:
    prev = "GENESIS"
    for ev in events:
        expected = compute_hash(prev, ev["payload"], ev["timestamp"])
        if ev["hash"] != expected or ev["prev_hash"] != prev:
            return False
        prev = ev["hash"]
    return True

def simple_quality_score(readings: List[Dict[str, Any]]) -> float:
    if not readings:
        return 50.0
    latest = readings[-1]
    penalties = 0.0
    for k, (lo, hi) in IDEAL_RANGES.items():
        if k in latest and latest[k] is not None:
            v = latest[k]
            if v < lo:
                penalties += (lo - v) * 1.5
            elif v > hi:
                penalties += (v - hi) * 1.2
    score = max(0.0, 100.0 - penalties)
    return round(score, 2)

def risk_label(score: float) -> str:
    if score >= 80: return "LOW"
    if score >= 60: return "MEDIUM"
    return "HIGH"
