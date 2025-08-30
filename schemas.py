from pydantic import BaseModel, Field
from typing import Optional, Any, Dict, List

class CreateLot(BaseModel):
    lot_id: str = Field(..., min_length=3, max_length=64)
    farm_name: str
    farm_location: str
    crop: str
    harvest_date: str  # YYYY-MM-DD

class SensorReading(BaseModel):
    lot_id: str
    farm_name: str
    temperature_c: float
    humidity_pct: float
    soil_moisture_pct: float
    ph: float
    timestamp: Optional[str] = None

class TransportEvent(BaseModel):
    lot_id: str
    location: str
    temperature_c: float
    humidity_pct: float
    note: Optional[str] = None
    timestamp: Optional[str] = None

class GenericEvent(BaseModel):
    lot_id: str
    type: str
    data: Dict[str, Any]
    timestamp: Optional[str] = None

class LotSummary(BaseModel):
    lot_id: str
    farm_name: str
    crop: str
    harvest_date: str
    total_events: int
    verified: bool
    quality_score: float
    spoilage_risk: str
    latest_temperature_c: Optional[float] = None
    latest_humidity_pct: Optional[float] = None
    latest_ph: Optional[float] = None
    chain: List[Dict[str, Any]]
