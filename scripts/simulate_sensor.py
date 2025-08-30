"""
Simple simulator: send a few sensor readings to the API.
Run:
    python scripts/simulate_sensor.py
"""
import time
import random
import requests

API = "https://smart-farm-tracechain.onrender.com"

def main():
    r = requests.get(f"{API}/api/seed")
    print("Seed:", r.json())

    lot_id = "LOT-001"
    for i in range(5):
        body = {
            "lot_id": lot_id,
            "farm_name": "Baan Mae Rim Farm",
            "temperature_c": round(random.uniform(9, 18), 2),
            "humidity_pct": round(random.uniform(75, 95), 2),
            "soil_moisture_pct": round(random.uniform(25, 45), 2),
            "ph": round(random.uniform(5.8, 7.2), 2),
        }
        rr = requests.post(f"{API}/api/sensors", json=body)
        print("sensor", i, rr.status_code, rr.text)
        time.sleep(1)

    rr = requests.post(f"{API}/api/transport", json={
        "lot_id": lot_id,
        "location": "Truck CM-102",
        "temperature_c": 11.2,
        "humidity_pct": 89.0,
        "note": "Departed Mae Rim",
    })
    print("transport:", rr.status_code, rr.text)

if __name__ == "__main__":
    main()
