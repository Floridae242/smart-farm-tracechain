import os
import io
import json
import random
from datetime import datetime, timedelta
from typing import Optional

from fastapi import FastAPI, HTTPException, Depends, Response, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from sqlalchemy import select, func
from sqlalchemy.orm import Session

import qrcode

from database import Base, engine, SessionLocal
from models import Lot, Event
import schemas  # <<=== สำคัญ: ใช้งาน LotSummary/LotList/LotBrief ผ่านโมดูลนี้
from schemas import CreateLot, SensorReading, TransportEvent, GenericEvent, LotSummary
from utils import compute_hash, verify_chain, simple_quality_score, risk_label

# ---------- Config ----------
BASE_URL = os.getenv("BASE_URL", "http://localhost:8000")

app = FastAPI(title="Smart Farm TraceChain", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # ปรับให้ จำกัดโดเมนในโปรดักชัน
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- DB ----------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)

# ---------- Helpers ----------
def _append_event(db: Session, lot: Lot, ev_type: str, payload: dict, ts_iso: str) -> Event:
    prev = db.scalar(select(Event).where(Event.lot_id == lot.id).order_by(Event.id.desc()))
    prev_hash = prev.hash if prev else "GENESIS"
    h = compute_hash(prev_hash, payload, ts_iso)
    ev = Event(
        lot_id=lot.id,
        type=ev_type,
        payload=json.dumps(payload),
        timestamp=ts_iso,
        prev_hash=prev_hash,
        hash=h,
    )
    db.add(ev); db.commit(); db.refresh(ev)
    return ev

# ---------- APIs: one lot ----------
@app.post("/api/harvests", response_model=LotSummary)
def create_lot(body: CreateLot, db: Session = Depends(get_db)):
    lot = db.scalar(select(Lot).where(Lot.lot_id == body.lot_id))
    if lot:
        raise HTTPException(status_code=400, detail="lot_id already exists")
    lot = Lot(
        lot_id=body.lot_id,
        farm_name=body.farm_name,
        farm_location=body.farm_location,
        crop=body.crop,
        harvest_date=body.harvest_date,
    )
    db.add(lot); db.commit(); db.refresh(lot)
    ts = datetime.utcnow().isoformat()
    _append_event(db, lot, "harvest_created", body.model_dump(), ts)
    return get_lot_summary(body.lot_id, db)

@app.post("/api/sensors")
def add_sensor_reading(body: SensorReading, db: Session = Depends(get_db)):
    lot = db.scalar(select(Lot).where(Lot.lot_id == body.lot_id))
    if not lot:
        raise HTTPException(status_code=404, detail="lot not found")
    ts = body.timestamp or datetime.utcnow().isoformat()
    payload = {
        "farm_name": body.farm_name,
        "temperature_c": body.temperature_c,
        "humidity_pct": body.humidity_pct,
        "soil_moisture_pct": body.soil_moisture_pct,
        "ph": body.ph,
    }
    _append_event(db, lot, "sensor_reading", payload, ts)
    return {"status": "ok"}

@app.post("/api/transport")
def add_transport_event(body: TransportEvent, db: Session = Depends(get_db)):
    lot = db.scalar(select(Lot).where(Lot.lot_id == body.lot_id))
    if not lot:
        raise HTTPException(status_code=404, detail="lot not found")
    ts = body.timestamp or datetime.utcnow().isoformat()
    payload = {
        "location": body.location,
        "temperature_c": body.temperature_c,
        "humidity_pct": body.humidity_pct,
        "note": body.note,
    }
    _append_event(db, lot, "transported", payload, ts)
    return {"status": "ok"}

@app.post("/api/events")
def add_generic_event(body: GenericEvent, db: Session = Depends(get_db)):
    lot = db.scalar(select(Lot).where(Lot.lot_id == body.lot_id))
    if not lot:
        raise HTTPException(status_code=404, detail="lot not found")
    ts = body.timestamp or datetime.utcnow().isoformat()
    _append_event(db, lot, body.type, body.data, ts)
    return {"status": "ok"}

@app.get("/api/lots/{lot_id}", response_model=LotSummary)
def get_lot_summary(lot_id: str, db: Session = Depends(get_db)):
    lot = db.scalar(select(Lot).where(Lot.lot_id == lot_id))
    if not lot:
        raise HTTPException(status_code=404, detail="lot not found")
    events = db.scalars(select(Event).where(Event.lot_id == lot.id).order_by(Event.id.asc())).all()
    chain = [{
        "id": e.id,
        "type": e.type,
        "payload": json.loads(e.payload),
        "timestamp": e.timestamp,
        "prev_hash": e.prev_hash,
        "hash": e.hash,
    } for e in events]
    verified = verify_chain(chain)

    temp = hum = ph = None
    readings = []
    for e in chain:
        if e["type"] in ("sensor_reading", "transported"):
            r = {
                "temperature_c": e["payload"].get("temperature_c"),
                "humidity_pct": e["payload"].get("humidity_pct"),
                "soil_moisture_pct": e["payload"].get("soil_moisture_pct"),
                "ph": e["payload"].get("ph"),
            }
            readings.append(r)
            temp = r.get("temperature_c") if r.get("temperature_c") is not None else temp
            hum = r.get("humidity_pct") if r.get("humidity_pct") is not None else hum
            ph  = r.get("ph") if r.get("ph") is not None else ph

    q = simple_quality_score(readings)

    return LotSummary(
        lot_id=lot.lot_id,
        farm_name=lot.farm_name,
        crop=lot.crop,
        harvest_date=lot.harvest_date,
        total_events=len(chain),
        verified=verified,
        quality_score=q,
        spoilage_risk=risk_label(q),
        latest_temperature_c=temp,
        latest_humidity_pct=hum,
        latest_ph=ph,
        chain=chain,
    )

@app.get("/api/lots/{lot_id}/verify")
def verify_lot(lot_id: str, db: Session = Depends(get_db)):
    lot = db.scalar(select(Lot).where(Lot.lot_id == lot_id))
    if not lot:
        raise HTTPException(status_code=404, detail="lot not found")
    events = db.scalars(select(Event).where(Event.lot_id == lot.id).order_by(Event.id.asc())).all()
    chain = [{
        "payload": json.loads(e.payload),
        "timestamp": e.timestamp,
        "prev_hash": e.prev_hash,
        "hash": e.hash,
    } for e in events]
    return {"verified": verify_chain(chain), "events": len(chain)}

@app.get("/api/lots/{lot_id}/qrcode")
def lot_qrcode(lot_id: str, db: Session = Depends(get_db)):
    lot = db.scalar(select(Lot).where(Lot.lot_id == lot_id))
    if not lot:
        raise HTTPException(status_code=404, detail="lot not found")
    url = f"{BASE_URL}/lot.html?lot_id={lot_id}"
    img = qrcode.make(url)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png")

@app.get("/api/seed")
def seed(db: Session = Depends(get_db)):
    default_id = "LOT-001"
    if db.scalar(select(Lot).where(Lot.lot_id == default_id)):
        return {"status": "exists", "lot_id": default_id}

    ls = CreateLot(
        lot_id=default_id,
        farm_name="Baan Mae Rim Farm",
        farm_location="Mae Rim, Chiang Mai",
        crop="Hydro Lettuce",
        harvest_date="2025-08-15",
    )
    create_lot(ls, db)
    add_sensor_reading(SensorReading(lot_id=default_id, farm_name="Baan Mae Rim Farm",
                                     temperature_c=12.5, humidity_pct=90,
                                     soil_moisture_pct=35, ph=6.5), db)
    add_transport_event(TransportEvent(lot_id=default_id, location="Cold Room #1",
                                       temperature_c=10.5, humidity_pct=88), db)
    add_sensor_reading(SensorReading(lot_id=default_id, farm_name="Baan Mae Rim Farm",
                                     temperature_c=16.8, humidity_pct=80,
                                     soil_moisture_pct=30, ph=6.6), db)
    return {"status": "seeded", "lot_id": default_id}

# ---------- Lots listing & search ----------
@app.get("/api/lots", response_model=schemas.LotList)
def list_lots(
    q: Optional[str] = Query(None, description="ค้นหาจาก lot_id/farm_name/crop"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
):
    base = select(Lot)
    if q:
        like = f"%{q}%"
        # ilike จะถูก emulate ให้กับ SQLite โดย SQLAlchemy
        base = base.where(
            (Lot.lot_id.ilike(like)) |
            (Lot.farm_name.ilike(like)) |
            (Lot.crop.ilike(like))
        )

    total = db.scalar(select(func.count()).select_from(base.subquery()))
    rows = db.scalars(
        base.order_by(Lot.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
    ).all()

    items = []
    for lot in rows:
        events = db.scalars(
            select(Event).where(Event.lot_id == lot.id).order_by(Event.id.asc())
        ).all()
        chain = [{
            "payload": json.loads(e.payload),
            "timestamp": e.timestamp,
            "prev_hash": e.prev_hash,
            "hash": e.hash,
            "type": e.type
        } for e in events]
        verified = verify_chain(chain)
        items.append(schemas.LotBrief(
            lot_id=lot.lot_id,
            farm_name=lot.farm_name,
            crop=lot.crop,
            harvest_date=lot.harvest_date,
            total_events=len(chain),
            verified=verified
        ))

    return schemas.LotList(
        items=items,
        total=total or 0,
        page=page,
        page_size=page_size
    )

@app.post("/api/seed_many")
def seed_many(n: int = 10, db: Session = Depends(get_db)):
    farms = [
        ("Baan Mae Rim Farm", "Mae Rim, Chiang Mai"),
        ("Doi Saket Hydro", "Doi Saket, Chiang Mai"),
        ("Hang Dong Greens", "Hang Dong, Chiang Mai"),
        ("Mae Hia Organic", "Mae Hia, Chiang Mai"),
    ]
    crops = ["Hydro Lettuce", "Kale", "Spinach", "Pak Choi", "Rocket"]

    created = 0
    today = datetime.utcnow().date()
    for i in range(1, n + 1):
        lot_id = f"LOT-{i:03d}"
        if db.scalar(select(Lot).where(Lot.lot_id == lot_id)):
            continue

        farm_name, farm_loc = random.choice(farms)
        crop = random.choice(crops)
        harvest_date = str(today - timedelta(days=random.randint(1, 20)))

        body = CreateLot(
            lot_id=lot_id,
            farm_name=farm_name,
            farm_location=farm_loc,
            crop=crop,
            harvest_date=harvest_date
        )
        create_lot(body, db)

        # random sensor/transport events
        for _ in range(random.randint(2, 4)):
            add_sensor_reading(SensorReading(
                lot_id=lot_id,
                farm_name=farm_name,
                temperature_c=round(random.uniform(8, 20), 1),
                humidity_pct=random.randint(60, 95),
                soil_moisture_pct=random.randint(25, 40),
                ph=round(random.uniform(6.0, 7.0), 1)
            ), db)

            if random.random() < 0.5:
                add_transport_event(TransportEvent(
                    lot_id=lot_id,
                    location=random.choice(["Cold Room #1", "Cold Truck A", "Warehouse CM"]),
                    temperature_c=round(random.uniform(8, 16), 1),
                    humidity_pct=random.randint(60, 90),
                    note=None
                ), db)

        created += 1

    return {"status": "ok", "created": created}

# ---------- Static (วางท้ายไฟล์เสมอ) ----------
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def root():
    return FileResponse("static/index.html")
