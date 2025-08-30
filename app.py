from fastapi import FastAPI, HTTPException, Depends, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import select
from datetime import datetime
import json
import io
import qrcode

from database import Base, engine, SessionLocal
from models import Lot, Event
from schemas import CreateLot, SensorReading, TransportEvent, GenericEvent, LotSummary
from utils import compute_hash, verify_chain, simple_quality_score, risk_label


app = FastAPI(title="Smart Farm TraceChain", version="0.1.0")

# CORS (ปรับโดเมนตามที่ต้องการได้)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- DB Session ----------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------- Startup: create tables ----------
@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)


# ---------- Helpers ----------
def _append_event(db: Session, lot: Lot, ev_type: str, payload: dict, ts_iso: str) -> Event:
    prev = db.scalar(
        select(Event).where(Event.lot_id == lot.id).order_by(Event.id.desc())
    )
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
    db.add(ev)
    db.commit()
    db.refresh(ev)
    return ev


# ---------- API ----------
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
    db.add(lot)
    db.commit()
    db.refresh(lot)

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

    events = db.scalars(
        select(Event).where(Event.lot_id == lot.id).order_by(Event.id.asc())
    ).all()

    chain = [
        {
            "id": e.id,
            "type": e.type,
            "payload": json.loads(e.payload),
            "timestamp": e.timestamp,
            "prev_hash": e.prev_hash,
            "hash": e.hash,
        }
        for e in events
    ]

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
            ph = r.get("ph") if r.get("ph") is not None else ph

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

    events = db.scalars(
        select(Event).where(Event.lot_id == lot.id).order_by(Event.id.asc())
    ).all()

    chain = [
        {
            "payload": json.loads(e.payload),
            "timestamp": e.timestamp,
            "prev_hash": e.prev_hash,
            "hash": e.hash,
        }
        for e in events
    ]

    return {"verified": verify_chain(chain), "events": len(chain)}


@app.get("/api/lots/{lot_id}/qrcode")
def lot_qrcode(lot_id: str, db: Session = Depends(get_db)):
    lot = db.scalar(select(Lot).where(Lot.lot_id == lot_id))
    if not lot:
        raise HTTPException(status_code=404, detail="lot not found")

    # เปลี่ยนเป็น IP/โดเมนจริงของคุณเมื่อ deploy
    url = f"http://localhost:8000/lot.html?lot_id={lot_id}"
    img = qrcode.make(url)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png")


@app.get("/api/seed")
def seed(db: Session = Depends(get_db)):
    if db.scalar(select(Lot).where(Lot.lot_id == "LOT-001")):
        return {"status": "exists"}

    ls = CreateLot(
        lot_id="LOT-001",
        farm_name="Baan Mae Rim Farm",
        farm_location="Mae Rim, Chiang Mai",
        crop="Hydro Lettuce",
        harvest_date="2025-08-15",
    )
    # ใช้ฟังก์ชัน API เดิมเพื่อสร้าง genesis event ให้ครบ
    create_lot(ls, db)

    add_sensor_reading(
        SensorReading(
            lot_id="LOT-001",
            farm_name="Baan Mae Rim Farm",
            temperature_c=12.5,
            humidity_pct=90,
            soil_moisture_pct=35,
            ph=6.5,
        ),
        db,
    )
    add_transport_event(
        TransportEvent(
            lot_id="LOT-001", location="Cold Room #1", temperature_c=10.5, humidity_pct=88
        ),
        db,
    )
    add_sensor_reading(
        SensorReading(
            lot_id="LOT-001",
            farm_name="Baan Mae Rim Farm",
            temperature_c=16.8,
            humidity_pct=80,
            soil_moisture_pct=30,
            ph=6.6,
        ),
        db,
    )
    return {"status": "seeded", "lot_id": "LOT-001"}


# ---------- Static & Root (วางท้ายสุด) ----------
# เสิร์ฟไฟล์ static ที่ /static
app.mount("/static", StaticFiles(directory="static"), name="static")

# เสิร์ฟหน้า index ที่ /
@app.get("/")
def root():
    return FileResponse("static/index.html")