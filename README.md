# Smart Farm TraceChain (Prototype)

Prototype สำหรับไอเดีย **From Farm to Table with Trust**: ตรวจสอบย้อนกลับผลผลิตด้วย Hash Chain + IoT Mock + Quality Scoring

## จุดเด่น
- 🧱 **Immutable Hash Chain**: ทุก event ถูกผูกด้วย `prev_hash` และ `hash` เพื่อตรวจสอบการแก้ไขข้อมูล
- 📡 **Sensor Intake API**: รองรับการส่งค่าจาก IoT (mock) เช่น อุณหภูมิ ความชื้น pH
- 📊 **Quality Score & Risk**: คำนวณคะแนนคุณภาพ (0-100) และป้ายความเสี่ยง (LOW/MEDIUM/HIGH)
- 🔗 **QR Code Linking**: สร้าง QR ที่ลิงก์ไปหน้า lot detail
- 🖥️ **Web UI**: หน้าเว็บเบาๆ ใช้งานง่ายสำหรับเดโมบนเวที

## โครงสร้างไฟล์
```
smart-farm-tracechain/
├─ app.py
├─ database.py
├─ models.py
├─ schemas.py
├─ utils.py
├─ requirements.txt
├─ static/
│  ├─ index.html
│  ├─ lot.html
│  ├─ app.js
│  └─ styles.css
└─ scripts/
   └─ simulate_sensor.py
```

## วิธีรัน (Local)
1) ติดตั้งไลบรารี
```bash
pip install -r requirements.txt
```
2) รันเซิร์ฟเวอร์
```bash
uvicorn app:app --reload
```
3) เปิดเว็บที่ `http://127.0.0.1:8000`
   - กด **Seed Demo** → จะมี `LOT-001`
   - กด **Load** เพื่อดู chain

4) (ทางเลือก) รันตัวจำลองเซนเซอร์
```bash
python scripts/simulate_sensor.py
```

## API ตัวอย่าง
ดูในหัวข้อคำอธิบายที่ฉันส่งในแชต หรือใช้ Postman ทดลองเรียก endpoints
