// ===== TraceChain UI with QR Code =====
console.log("TraceChain UI + QR active");

// ---------- helpers ----------
async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) throw new Error(await res.text() || res.statusText);
  return res.json();
}

function fmtTime(iso) {
  try {
    return new Date(iso).toLocaleString("th-TH", { hour12: false });
  } catch {
    return iso;
  }
}

const TYPE_COLOR = {
  harvest_created: "t-harvest",
  sensor_reading: "t-sensor",
  transported: "t-transport",
};

function highlightFromPayload(type, payload) {
  const items = [];
  if (payload.temperature_c != null) items.push(`🌡 ${payload.temperature_c}°C`);
  if (payload.humidity_pct != null) items.push(`💧 RH ${payload.humidity_pct}%`);
  if (payload.ph != null) items.push(`pH ${payload.ph}`);
  if (payload.location) items.push(`📍 ${payload.location}`);
  if (payload.farm_name && type === "harvest_created") items.push(payload.farm_name);
  return items.join(" • ");
}

// ---------- global state ----------
let CURRENT_LOT_ID = null;

// ---------- render ----------
async function loadLot(lotId) {
  console.log("Loading lot:", lotId);
  const sec = document.getElementById("lotSection");
  try {
    const data = await fetchJSON(`/api/lots/${encodeURIComponent(lotId)}`);

    CURRENT_LOT_ID = data.lot_id;
    document.getElementById("qrBtn")?.removeAttribute("disabled");

    // header + stats
    sec.classList.remove("hidden");
    document.getElementById("lotTitle").textContent = `Lot ${data.lot_id} • ${data.crop}`;
    document.getElementById("lotMeta").textContent = `${data.farm_name} • Harvest ${data.harvest_date} • ${data.total_events} events`;
    const badge = document.getElementById("verifyBadge");
    badge.textContent = data.verified ? "VERIFIED" : "TAMPERED";
    badge.className = "badge " + (data.verified ? "ok" : "bad");
    document.getElementById("qualityScore").textContent = data.quality_score;
    document.getElementById("riskLabel").textContent = data.spoilage_risk;
    if (document.getElementById("latestTemp")) document.getElementById("latestTemp").textContent = data.latest_temperature_c ?? "-";
    if (document.getElementById("latestHum")) document.getElementById("latestHum").textContent = data.latest_humidity_pct ?? "-";
    if (document.getElementById("latestPh")) document.getElementById("latestPh").textContent = data.latest_ph ?? "-";

    // chain
    const chainDiv = document.getElementById("chain");
    chainDiv.innerHTML = "";

    data.chain.forEach((ev) => {
      const card = document.createElement("div");
      card.className = "event compact";

      const header = document.createElement("div");
      header.className = "ev-head";
      const type = document.createElement("span");
      type.className = `type ${TYPE_COLOR[ev.type] || ""}`;
      type.textContent = ev.type.toUpperCase();
      const time = document.createElement("span");
      time.className = "time";
      time.textContent = fmtTime(ev.timestamp);
      const hilite = document.createElement("div");
      hilite.className = "hilite";
      hilite.textContent = highlightFromPayload(ev.type, ev.payload);

      header.appendChild(type);
      header.appendChild(time);
      header.appendChild(hilite);

      const hashes = document.createElement("div");
      hashes.className = "hashes";
      const hShort = `${ev.hash.slice(0, 12)}…`;
      const pShort = `${ev.prev_hash.slice(0, 12)}…`;
      hashes.innerHTML = `
        <span class="chip">hash: ${hShort}</span>
        <span class="chip">prev: ${pShort}</span>
      `;

      const details = document.createElement("details");
      details.className = "ev-body";
      const summary = document.createElement("summary");
      summary.textContent = "ดูรายละเอียด";
      const pre = document.createElement("pre");
      pre.textContent = JSON.stringify(ev.payload, null, 2);
      details.appendChild(summary);
      details.appendChild(pre);

      card.appendChild(header);
      card.appendChild(hashes);
      card.appendChild(details);
      chainDiv.appendChild(card);
    });
  } catch (e) {
    alert("Load failed: " + e.message);
  }
}

// ---------- bindings ----------
function bindUI() {
  const input = document.getElementById("lotIdInput");
  const loadBtn = document.getElementById("loadBtn");
  const seedBtn = document.getElementById("seedBtn");
  const qrBtn = document.getElementById("qrBtn");
  const qrModal = document.getElementById("qrModal");
  const qrImg = document.getElementById("qrImg");
  const qrDl = document.getElementById("qrDownload");

  loadBtn?.addEventListener("click", () => {
    const id = input.value.trim();
    if (id) loadLot(id);
  });

  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") loadBtn?.click();
  });

  seedBtn?.addEventListener("click", async () => {
    await fetchJSON("/api/seed");
    input.value = "LOT-001";
    loadLot("LOT-001");
  });

  qrBtn?.addEventListener("click", async () => {
    try {
      const lotId = CURRENT_LOT_ID || input.value.trim();
      if (!lotId) { alert("กรุณา Load lot ก่อน"); return; }

      const res = await fetch(`/api/lots/${encodeURIComponent(lotId)}/qrcode`);
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      qrImg.src = url;
      qrDl.href = url;
      qrModal.showModal();

      qrModal.addEventListener("close", () => {
        URL.revokeObjectURL(url);
        qrImg.src = "";
      }, { once: true });
    } catch (e) {
      alert("สร้าง QR ล้มเหลว: " + e.message);
    }
  });

  if (input && input.value.trim()) loadLot(input.value.trim());
}

window.addEventListener("DOMContentLoaded", bindUI);
