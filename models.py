from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import Integer, String, Text, ForeignKey
from database import Base

class Lot(Base):
    __tablename__ = "lots"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    lot_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    farm_name: Mapped[str] = mapped_column(String(255))
    farm_location: Mapped[str] = mapped_column(String(255))
    crop: Mapped[str] = mapped_column(String(100))
    harvest_date: Mapped[str] = mapped_column(String(32))
    events: Mapped[list["Event"]] = relationship("Event", back_populates="lot", cascade="all, delete-orphan")

class Event(Base):
    __tablename__ = "events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    lot_id: Mapped[int] = mapped_column(Integer, ForeignKey("lots.id"))
    type: Mapped[str] = mapped_column(String(50))
    payload: Mapped[str] = mapped_column(Text)
    timestamp: Mapped[str] = mapped_column(String(32))
    prev_hash: Mapped[str] = mapped_column(String(128))
    hash: Mapped[str] = mapped_column(String(128))
    lot: Mapped[Lot] = relationship("Lot", back_populates="events")
