// ===== TraceChain UI with QR Code & Search/List =====
console.log("TraceChain UI + QR active");

// ---------- helpers ----------
async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    let msg = "";
    try { msg = await res.text(); } catch {}
    throw new Error(msg || res.statusText);
  }
  return res.json();
}
function fmtTime(iso) {
  try { return new Date(iso).toLocaleString("th-TH", { hour12: false }); }
  catch { return iso; }
}
const TYPE_COLOR = {
  harvest_created: "t-harvest",
  sensor_reading: "t-sensor",
  transported: "t-transport",
};
function highlightFromPayload(type, payload) {
  const xs = [];
  if (payload?.temperature_c != null) xs.push(`🌡 ${payload.temperature_c}°C`);
  if (payload?.humidity_pct    != null) xs.push(`💧 RH ${payload.humidity_pct}%`);
  if (payload?.ph              != null) xs.push(`pH ${payload.ph}`);
  if (payload?.location)               xs.push(`📍 ${payload.location}`);
  if (type === "harvest_created" && payload?.farm_name) xs.push(payload.farm_name);
  return xs.join(" • ");
}

// ---------- global ----------
let CURRENT_LOT_ID = null;

// ---------- core: load one lot ----------
async function loadLot(lotId) {
  const sec = document.getElementById("lotSection");
  const data = await fetchJSON(`/api/lots/${encodeURIComponent(lotId)}`);

  CURRENT_LOT_ID = data.lot_id;
  document.getElementById("qrBtn")?.removeAttribute("disabled");

  sec.classList.remove("hidden");
  document.getElementById("lotTitle").textContent = `Lot ${data.lot_id} • ${data.crop}`;
  document.getElementById("lotMeta").textContent =
    `${data.farm_name} • Harvest ${data.harvest_date} • ${data.total_events} events`;

  const badge = document.getElementById("verifyBadge");
  badge.textContent = data.verified ? "VERIFIED" : "TAMPERED";
  badge.className = "badge " + (data.verified ? "ok" : "bad");

  document.getElementById("qualityScore").textContent = data.quality_score ?? "-";
  document.getElementById("riskLabel").textContent    = data.spoilage_risk ?? "-";
  const T = document.getElementById("latestTemp");
  const H = document.getElementById("latestHum");
  const P = document.getElementById("latestPh");
  if (T) T.textContent = data.latest_temperature_c ?? "-";
  if (H) H.textContent = data.latest_humidity_pct ?? "-";
  if (P) P.textContent = data.latest_ph ?? "-";

  const chainDiv = document.getElementById("chain");
  chainDiv.innerHTML = "";

  data.chain.forEach((ev) => {
    const card = document.createElement("div");
    card.className = "event compact";
    card.innerHTML = `
      <div class="ev-head">
        <span class="type ${TYPE_COLOR[ev.type] || ""}">${ev.type.toUpperCase()}</span>
        <span class="time">${fmtTime(ev.timestamp)}</span>
        <div class="hilite">${highlightFromPayload(ev.type, ev.payload)}</div>
      </div>
      <div class="hashes">
        <span class="chip" title="${ev.hash}">hash: ${ev.hash.slice(0,12)}…</span>
        <span class="chip" title="${ev.prev_hash}">prev: ${ev.prev_hash.slice(0,12)}…</span>
      </div>
      <details class="ev-body">
        <summary>ดูรายละเอียด</summary>
        <pre>${JSON.stringify(ev.payload, null, 2)}</pre>
      </details>
    `;
    chainDiv.appendChild(card);
  });
}

// ---------- list/search (NEW) ----------
async function searchLots(q = "", page = 1, page_size = 10) {
  const params = new URLSearchParams({ page, page_size });
  if (q) params.set("q", q);
  return fetchJSON(`/api/lots?${params.toString()}`);
}
function renderLotList(resp) {
  const wrap = document.getElementById("listContainer");
  if (!wrap) return;

  const { items = [] } = resp || {};
  if (!items.length) {
    wrap.innerHTML = `<div class="muted">ไม่พบรายการ</div>`;
    return;
  }

  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";
  table.innerHTML = `
    <thead>
      <tr>
        <th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb">Lot ID</th>
        <th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb">Farm</th>
        <th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb">Crop</th>
        <th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb">Harvest</th>
        <th style="text-align:right;padding:8px;border-bottom:1px solid #e5e7eb">Events</th>
        <th style="text-align:center;padding:8px;border-bottom:1px solid #e5e7eb">Status</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector("tbody");

  items.forEach((it) => {
    const tr = document.createElement("tr");
    tr.style.cursor = "pointer";
    tr.addEventListener("click", () => {
      document.getElementById("lotIdInput").value = it.lot_id;
      loadLot(it.lot_id).catch((e)=>alert("Load failed: "+e.message));
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    tr.innerHTML = `
      <td style="padding:8px;border-bottom:1px solid #f0f2f5">${it.lot_id}</td>
      <td style="padding:8px;border-bottom:1px solid #f0f2f5">${it.farm_name}</td>
      <td style="padding:8px;border-bottom:1px solid #f0f2f5">${it.crop}</td>
      <td style="padding:8px;border-bottom:1px solid #f0f2f5">${it.harvest_date}</td>
      <td style="padding:8px;border-bottom:1px solid #f0f2f5;text-align:right">${it.total_events}</td>
      <td style="padding:8px;border-bottom:1px solid #f0f2f5;text-align:center">
        <span class="badge ${it.verified ? "ok" : "bad"}">${it.verified ? "VERIFIED" : "TAMPERED"}</span>
      </td>
    `;
    tbody.appendChild(tr);
  });

  wrap.innerHTML = "";
  wrap.appendChild(table);
}

// ---------- bindings ----------
window.addEventListener("DOMContentLoaded", () => {
  const input     = document.getElementById("lotIdInput");
  const loadBtn   = document.getElementById("loadBtn");
  const seedBtn   = document.getElementById("seedBtn");
  const qrBtn     = document.getElementById("qrBtn");
  const qrModal   = document.getElementById("qrModal");
  const qrImg     = document.getElementById("qrImg");
  const qrDl      = document.getElementById("qrDownload");

  const searchInp = document.getElementById("searchInput");
  const searchBtn = document.getElementById("searchBtn");
  const seedMany  = document.getElementById("seedManyBtn");

  loadBtn?.addEventListener("click", () => {
    const id = input.value.trim();
    if (id) loadLot(id).catch(e=>alert("Load failed: " + e.message));
  });
  input?.addEventListener("keydown", (e) => { if (e.key === "Enter") loadBtn.click(); });

  seedBtn?.addEventListener("click", async () => {
    const r = await fetchJSON("/api/seed");
    input.value = r.lot_id || "LOT-001";
    await loadLot(input.value);
    // refresh list
    searchLots("").then(renderLotList).catch(()=>{});
  });

  // QR button
  qrBtn?.addEventListener("click", async () => {
    try {
      const lotId = CURRENT_LOT_ID || input.value.trim();
      if (!lotId) { alert("กรุณา Load lot ก่อน"); return; }

      const res = await fetch(`/api/lots/${encodeURIComponent(lotId)}/qrcode`);
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);

      qrImg.src = url;
      qrDl.href = url;

      if (qrModal.showModal) qrModal.showModal();
      else qrModal.setAttribute("open",""); // fallback

      const closeBtn = qrModal.querySelector('button[value="cancel"]');
      closeBtn?.addEventListener("click", () => {
        if (qrModal.close) qrModal.close(); else qrModal.removeAttribute("open");
      }, { once:true });

      qrModal.addEventListener("close", () => {
        URL.revokeObjectURL(url);
        qrImg.src = "";
      }, { once:true });

    } catch (e) {
      alert("สร้าง QR ล้มเหลว: " + e.message);
    }
  });

  // search/list
  searchBtn?.addEventListener("click", async () => {
    renderLotList(await searchLots(searchInp.value.trim()));
  });
  searchInp?.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") renderLotList(await searchLots(searchInp.value.trim()));
  });

  // seed many (ต้องมี /api/seed_many ใน backend)
  seedMany?.addEventListener("click", async () => {
    seedMany.disabled = true; seedMany.textContent = "Seeding...";
    try {
      await fetchJSON("/api/seed_many", { method: "POST" });
      renderLotList(await searchLots(""));
      alert("สร้าง LOT ตัวอย่างแล้ว");
    } catch (e) {
      alert("Seed หลาย LOT ล้มเหลว: " + e.message);
    }
    seedMany.disabled = false; seedMany.textContent = "Seed 10 LOTs";
  });

  // auto-load list รอบแรก
  searchLots("").then(renderLotList).catch(()=>{});
  // auto-load ถ้า input มีค่า
  if (input && input.value.trim()) loadLot(input.value.trim()).catch(()=>{});
});
