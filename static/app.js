<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>TraceChain • Consumer View</title>
  <link rel="stylesheet" href="/static/styles.css" />
</head>
<body>
  <header>
    <h1>TraceChain • Consumer View</h1>
  </header>

  <!-- แถวค้นหา + ปุ่ม -->
  <div class="row" style="margin:16px auto; width:min(1100px,92%)">
    <input id="lotIdInput" placeholder="LOT-001">
    <button id="loadBtn">Load</button>
    <button id="seedBtn" class="ghost">Seed Demo</button>
    <button id="qrBtn" class="ghost" disabled>QR Code</button>
  </div>

  <section id="lotSection" class="hidden">
    <h2 id="lotTitle"></h2>
    <div id="lotMeta" class="muted"></div>
    <div class="stats">
      <span id="verifyBadge" class="badge">—</span>
      <div class="stat">
        <div class="label">Quality Score</div>
        <div id="qualityScore" class="value">—</div>
      </div>
      <div class="stat">
        <div class="label">Risk</div>
        <div id="riskLabel" class="value">—</div>
      </div>
    </div>

    <h3>Chain (Summary)</h3>
    <div id="chain"></div>
  </section>

  <!-- Modal แสดง QR -->
  <dialog id="qrModal">
    <form method="dialog" style="margin:0; padding:0">
      <h3 style="margin:0 0 10px">QR Code</h3>
      <img id="qrImg" alt="QR Code" style="max-width:320px; width:100%; display:block; border-radius:8px"/>
      <div style="display:flex; gap:8px; margin-top:12px">
        <a id="qrDownload" download="lot-qrcode.png" class="ghost" style="padding:10px 14px; border:1px solid #e5e7eb; border-radius:10px; text-decoration:none">Download</a>
        <button value="cancel">Close</button>
      </div>
    </form>
  </dialog>

  <script>
    // ---------- helpers ----------
    async function fetchJSON(url, opts) {
      const r = await fetch(url, opts);
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    }
    function qs(name) { const u=new URL(location.href); return u.searchParams.get(name); }
    function fmtTime(iso){ try{ return new Date(iso).toLocaleString('th-TH',{hour12:false}); }catch{return iso;} }

    // เก็บ lot ที่โหลดอยู่ เพื่อใช้ตอนกดปุ่ม QR
    let CURRENT_LOT_ID = null;

    // ---------- render ----------
    async function loadLot(lotId){
      const sec=document.getElementById('lotSection');
      const data=await fetchJSON(`/api/lots/${encodeURIComponent(lotId)}`);

      // header + stats
      sec.classList.remove('hidden');
      document.getElementById("lotTitle").textContent = `Lot ${data.lot_id} • ${data.crop}`;
      document.getElementById("lotMeta").textContent = `${data.farm_name} • Harvest ${data.harvest_date} • ${data.total_events} events`;
      const badge=document.getElementById('verifyBadge');
      badge.textContent=data.verified?'VERIFIED':'TAMPERED';
      badge.className='badge ' + (data.verified?'ok':'bad');
      document.getElementById('qualityScore').textContent=data.quality_score;
      document.getElementById('riskLabel').textContent=data.spoilage_risk;

      // chain summary
      const chain=document.getElementById('chain'); chain.innerHTML='';
      data.chain.forEach(ev=>{
        const div=document.createElement('div'); div.className='event';
        div.innerHTML = `<b>${ev.type.toUpperCase()}</b> • <span class="muted">${fmtTime(ev.timestamp)}</span>`;
        chain.appendChild(div);
      });

      // เปิดการใช้งานปุ่ม QR
      CURRENT_LOT_ID = data.lot_id;
      document.getElementById('qrBtn')?.removeAttribute('disabled');
    }

    // ---------- bindings ----------
    function bindUI(){
      const input   = document.getElementById('lotIdInput');
      const loadBtn = document.getElementById('loadBtn');
      const seedBtn = document.getElementById('seedBtn');
      const qrBtn   = document.getElementById('qrBtn');
      const qrModal = document.getElementById('qrModal');
      const qrImg   = document.getElementById('qrImg');
      const qrDl    = document.getElementById('qrDownload');

      loadBtn?.addEventListener('click', ()=>{
        const id = input.value.trim();
        if (id) loadLot(id).catch(e=>alert('Load failed: '+e.message));
      });

      input?.addEventListener('keydown', (e)=>{
        if (e.key === 'Enter') loadBtn?.click();
      });

      seedBtn?.addEventListener('click', async ()=>{
        try {
          await fetchJSON('/api/seed');
          input.value = 'LOT-001';
          await loadLot('LOT-001');
        } catch(e){ alert('Seed failed: '+e.message); }
      });

      // ปุ่มสร้าง/แสดง QR
      qrBtn?.addEventListener('click', async ()=>{
        try{
          const lotId = CURRENT_LOT_ID || input.value.trim();
          if(!lotId){ alert('กรุณา Load lot ก่อน'); return; }

          const res = await fetch(`/api/lots/${encodeURIComponent(lotId)}/qrcode`);
          if(!res.ok) throw new Error(await res.text());
          const blob = await res.blob();
          const url  = URL.createObjectURL(blob);

          qrImg.src = url;         // แสดงรูป
          qrDl.href = url;         // ปุ่มดาวน์โหลด
          qrModal.showModal();

          // คืนหน่วยความจำเมื่อปิด
          qrModal.addEventListener('close', ()=>{
            URL.revokeObjectURL(url);
            qrImg.src = '';
          }, { once:true });
        }catch(e){
          alert('สร้าง QR ล้มเหลว: '+e.message);
        }
      });

      // auto-load ถ้ามาพร้อม query ?lot_id=
      const initial = qs('lot_id');
      if (initial) { input.value = initial; loadLot(initial).catch(e=>alert(e.message)); }
    }

    window.addEventListener('DOMContentLoaded', bindUI);
  </script>
</body>
</html>
