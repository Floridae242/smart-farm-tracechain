// ===== TraceChain Compact UI =====
console.log("TraceChain compact UI v2");

// ---------- helpers ----------
async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

function chip(text, title = "") {
  const c = document.createElement("span");
  c.className = "chip";
  c.textContent = text;
  if (title) c.title = title;
  return c;
}

function copyBtn(text) {
  const b = document.createElement("button");
  b.className = "chip copy";
  b.type = "button";
  b.textContent = "Copy";
  b.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(text);
      b.textContent = "Copied!";
      setTimeout(() => (b.textContent = "Copy"), 1000);
    } catch {
      alert("Copy failed");
    }
  });
  return b;
}

const TYPE_COLOR = {
  harvest_created: "t-harvest",
  sensor_reading: "t-sensor",
  transported: "t-transport",
};

function fmtTime(iso) {
  try {
    return new Date(iso).toLocaleString("th-TH", { hour12: false });
  } catch {
    return iso;
  }
}

function highlightFromPayload(type, payload) {
  const items = [];
  if (payload.temperature_c != null) items.push(`Temp ${payload.temperature_c}°C`);
  if (payload.humidity_pct != null) items.push(`RH ${payload.humidity_pct}%`);
  if (payload.ph != null) items.push(`pH ${payload.ph}`);
  if (payload.location) items.push(`📍 ${payload.location}`);
  if (payload.farm_name && type === "harvest_created") items.push(payload.farm_name);
  return items.join(" • ");
}

// ---------- render ----------
async function loadLot(lotId) {
  console.log("loadLot called with", lotId);
  const sec = document.getElementById("lotSection");
  try {
    const data = await fetchJSON(`/api/lots/${encodeURIComponent(lotId)}`);

    // header + stats
    sec.classList.remove("hidden");
    document.getElementById("lotTitle").textContent = `Lot ${data.lot_id} • ${data.crop}`;
    document.getElementById("lotMeta").textContent = `${data.farm_name} • Harvest ${data.harvest_date} • ${data.total_events} events`;
    const badge = document.getElementById("verifyBadge");
    badge.textContent = data.verified ? "VERIFIED" : "TAMPERED";
    badge.className = "badge " + (data.verified ? "ok" : "bad");
    document.getElementById("qualityScore").textContent = data.quality_score;
    document.getElementById("riskLabel").textContent = data.spoilage_risk;
    const t = document.getElementById("latestTemp");
    const h = document.getElementById("latestHum");
    const p = document.getElementById("latestPh");
    if (t) t.textContent = data.latest_temperature_c ?? "-";
    if (h) h.textContent = data.latest_humidity_pct ?? "-";
    if (p) p.textContent = data.latest_ph ?? "-";

    // chain
    const chainDiv = document.getElementById("chain");
    chainDiv.innerHTML = "";

    data.chain.forEach((ev, idx) => {
      console.log("render ev", idx, ev.type);

      const card = document.createElement("div");
      card.className = "event compact";

      // header
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

      // hashes
      const hashes = document.createElement("div");
      hashes.className = "hashes";
      const hShort = `${ev.hash.slice(0, 12)}…`;
      const pShort = `${ev.prev_hash.slice(0, 12)}…`;
      hashes.appendChild(chip(`hash: ${hShort}`, ev.hash));
      hashes.appendChild(copyBtn(ev.hash));
      hashes.appendChild(chip(`prev: ${pShort}`, ev.prev_hash));
      hashes.appendChild(copyBtn(ev.prev_hash));

      // details (collapsible JSON)
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
  const loadBtn = document.getElementById("loadBtn");
  const seedBtn = document.getElementById("seedBtn");
  const input = document.getElementById("lotIdInput");

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

  // auto-load if input already has value
  if (input && input.value.trim()) loadLot(input.value.trim());
}

window.addEventListener("DOMContentLoaded", bindUI);
