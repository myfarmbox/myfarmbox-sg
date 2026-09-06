const CFG = window.MFB_CONFIG || {};
let deliveries = [];
let selectedDelivery = null;
let activeDelivery = null;
let selectedEta = "15 min";
let selectedCompletionStatus = "";
let currentPosition = null;
let map = null;
let userMarker = null;
let markers = new Map();
let infoWindow = null;
let refreshTimer = null;
let watchId = null;

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", () => {
  bindUI();
  loadDeliveries();
  startLocationWatch();
});

window.initMap = function () {
  const center = CFG.DEFAULT_CENTER || { lat: 1.3521, lng: 103.8198 };
  map = new google.maps.Map($("map"), {
    center,
    zoom: 12,
    disableDefaultUI: true,
    zoomControl: true,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false
  });
  infoWindow = new google.maps.InfoWindow();
  renderMarkers();
  updateUserMarker();
};

function bindUI() {
  $("refreshBtn").addEventListener("click", loadDeliveries);
  $("locateBtn").addEventListener("click", centerOnUser);
  $("searchInput").addEventListener("input", renderList);

  document.querySelectorAll(".toggle-btn").forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  document.querySelectorAll("[data-close='sheet']").forEach(el => {
    el.addEventListener("click", closeSheet);
  });

  document.querySelectorAll(".eta-chip").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".eta-chip").forEach(x => x.classList.remove("active"));
      btn.classList.add("active");
      selectedEta = btn.dataset.eta;
      $("customEta").value = "";
    });
  });

  $("customEta").addEventListener("input", e => {
    if (e.target.value.trim()) {
      selectedEta = e.target.value.trim();
      document.querySelectorAll(".eta-chip").forEach(x => x.classList.remove("active"));
    }
  });

  $("sheetNavigateBtn").addEventListener("click", () => openMaps(selectedDelivery));
  $("sheetCallBtn").addEventListener("click", () => callCustomer(selectedDelivery));
  $("sheetWhatsappBtn").addEventListener("click", () => openWhatsApp(selectedDelivery));
  $("startDeliveryBtn").addEventListener("click", startDelivery);

  $("activeNavigateBtn").addEventListener("click", () => openMaps(activeDelivery));
  $("activeWhatsappBtn").addEventListener("click", () => openWhatsApp(activeDelivery));
  $("completeBtn").addEventListener("click", () => openDeliverySheet(activeDelivery, true));

  document.querySelectorAll(".status-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".status-btn").forEach(x => x.classList.remove("selected"));
      btn.classList.add("selected");
      selectedCompletionStatus = btn.dataset.status;
      $("failureReason").classList.toggle("hidden", selectedCompletionStatus !== "Not Delivered");
      $("confirmDeliveryBtn").disabled = false;
    });
  });

  $("confirmDeliveryBtn").addEventListener("click", completeDelivery);
}

async function loadDeliveries(silent = false) {
  if (!silent) showLoader(true);
  try {
    const data = await apiGet("getDeliveries", {
      driverId: CFG.DRIVER_ID || "",
      date: localDateString()
    });

    if (!data.ok) throw new Error(data.message || "Unable to load deliveries.");

    deliveries = (data.deliveries || []).map(normalizeDelivery);
    activeDelivery = deliveries.find(d => d.status === "Out for Delivery") || null;

    updateUI();
  } catch (err) {
    console.error(err);
    showToast(err.message || "Could not load deliveries.");
    // Demo data helps first-time setup / UI testing.
    if (!deliveries.length) {
      deliveries = demoDeliveries();
      activeDelivery = deliveries.find(d => d.status === "Out for Delivery") || null;
      updateUI();
    }
  } finally {
    if (!silent) showLoader(false);
  }
}

function normalizeDelivery(d) {
  return {
    orderId: d.orderId || "",
    customerName: d.customerName || "Customer",
    phone: String(d.phone || "").replace(/\s+/g, ""),
    address: d.address || "",
    area: d.area || "",
    boxes: Number(d.boxes || 0),
    lat: numOrNull(d.lat),
    lng: numOrNull(d.lng),
    status: d.status || "Pending",
    eta: d.eta || "",
    deliveryNote: d.deliveryNote || "",
    deliveredBy: d.deliveredBy || "",
    startedAt: d.startedAt || "",
    deliveredAt: d.deliveredAt || "",
    failureReason: d.failureReason || "",
    driverId: d.driverId || CFG.DRIVER_ID || "",
    driverName: d.driverName || CFG.DRIVER_NAME || ""
  };
}

function updateUI() {
  updateSummary();
  renderList();
  renderMarkers();
  renderActiveCard();
  renderLivePanel();
}

function updateSummary() {
  const total = deliveries.length;
  const delivered = deliveries.filter(d => successStatuses().includes(d.status)).length;
  const active = deliveries.filter(d => d.status === "Out for Delivery").length;
  const failed = deliveries.filter(d => d.status === "Not Delivered").length;
  const pending = Math.max(0, total - delivered - active - failed);

  $("totalCount").textContent = total;
  $("pendingCount").textContent = pending;
  $("activeCount").textContent = active;
  $("deliveredCount").textContent = delivered;
  $("failedCount").textContent = failed;
  $("progressText").textContent = `${delivered} / ${total} delivered`;
  $("progressFill").style.width = total ? `${(delivered / total) * 100}%` : "0%";

  const d = new Date();
  $("deliveryDayLabel").textContent =
    `${d.toLocaleDateString("en-SG", { weekday:"long", day:"numeric", month:"short" })} Harvest`;
}

function renderList() {
  const q = ($("searchInput").value || "").trim().toLowerCase();
  let items = [...deliveries].filter(d => {
    const hay = `${d.customerName} ${d.orderId} ${d.address} ${d.area} ${d.phone}`.toLowerCase();
    return !q || hay.includes(q);
  });

  items.forEach(d => d._distance = distanceFromUser(d));
  items.sort((a,b) => {
    const rank = statusRank(a.status) - statusRank(b.status);
    if (rank !== 0) return rank;
    if (a._distance == null && b._distance != null) return 1;
    if (a._distance != null && b._distance == null) return -1;
    if (a._distance != null && b._distance != null) return a._distance - b._distance;
    return a.customerName.localeCompare(b.customerName);
  });

  $("deliveryList").innerHTML = items.map(d => `
    <article class="delivery-card ${cardClass(d.status)}" data-order="${escapeHtml(d.orderId)}">
      <div>
        <div class="delivery-title">
          <strong>${escapeHtml(d.customerName)}</strong>
          <span class="order-no">${escapeHtml(d.orderId)}</span>
        </div>
        <div class="delivery-address">
          ${escapeHtml([d.area, d.address].filter(Boolean).join(" · "))}${d.boxes ? ` · ${d.boxes} box${d.boxes > 1 ? "es":""}` : ""}
        </div>
      </div>
      <div class="delivery-right">
        <span class="status-pill ${pillClass(d.status)}">${escapeHtml(d.status)}</span>
        <div class="distance">${formatDistance(d._distance)}</div>
      </div>
    </article>
  `).join("") || `<div class="muted">No deliveries found.</div>`;

  document.querySelectorAll(".delivery-card").forEach(card => {
    card.addEventListener("click", () => {
      const delivery = deliveries.find(d => d.orderId === card.dataset.order);
      openDeliverySheet(delivery, delivery?.status === "Out for Delivery");
    });
  });
}

function renderActiveCard() {
  if (!activeDelivery) {
    $("activeCard").classList.add("hidden");
    return;
  }
  $("activeCard").classList.remove("hidden");
  $("activeCustomer").textContent = activeDelivery.customerName;
  $("activeMeta").textContent =
    `${activeDelivery.area || activeDelivery.address || ""}${activeDelivery.eta ? ` · ETA ${activeDelivery.eta}` : ""}`;
}

function renderLivePanel() {
  const grouped = {};
  deliveries.forEach(d => {
    const key = d.driverName || d.driverId || "Delivery Team";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(d);
  });

  $("driverCards").innerHTML = Object.entries(grouped).map(([name, rows]) => {
    const done = rows.filter(r => successStatuses().includes(r.status)).length;
    const active = rows.find(r => r.status === "Out for Delivery");
    return `
      <div class="driver-card">
        <strong>${escapeHtml(name)}</strong>
        <div class="muted">${done} / ${rows.length} completed</div>
        <div style="margin-top:8px;font-size:13px">
          ${active ? `Currently → <b>${escapeHtml(active.customerName)}</b>` : "No active delivery"}
        </div>
      </div>
    `;
  }).join("");
}

function renderMarkers() {
  if (!map || !window.google) return;
  markers.forEach(m => m.setMap(null));
  markers.clear();

  deliveries.forEach(d => {
    if (d.lat == null || d.lng == null) return;

    const marker = new google.maps.Marker({
      position: { lat:d.lat, lng:d.lng },
      map,
      title: d.customerName,
      label: markerLabel(d.status)
    });

    marker.addListener("click", () => {
      const content = `
        <div style="min-width:190px;font-family:Arial,sans-serif">
          <strong>${escapeHtml(d.customerName)}</strong><br>
          <span style="font-size:12px">${escapeHtml(d.area || d.address || "")}</span><br>
          <span style="font-size:11px;color:#667">${escapeHtml(d.status)}</span><br><br>
          <button onclick="window.openDeliveryById('${jsString(d.orderId)}')" style="border:0;border-radius:8px;padding:8px 10px;background:#438d35;color:white;font-weight:700">Open delivery</button>
        </div>`;
      infoWindow.setContent(content);
      infoWindow.open({ anchor:marker, map });
    });
    markers.set(d.orderId, marker);
  });
}

window.openDeliveryById = function(orderId) {
  const d = deliveries.find(x => x.orderId === orderId);
  if (d) openDeliverySheet(d, d.status === "Out for Delivery");
};

function markerLabel(status) {
  if (successStatuses().includes(status)) return "✓";
  if (status === "Out for Delivery") return "→";
  if (status === "Not Delivered") return "!";
  return "";
}

function openDeliverySheet(d, forceComplete = false) {
  if (!d) return;
  selectedDelivery = d;
  selectedCompletionStatus = "";
  $("sheetCustomer").textContent = d.customerName;
  $("sheetMeta").textContent = `${d.orderId}${d.area ? " · "+d.area : ""}${d.address ? " · "+d.address : ""}`;
  $("deliveryNote").value = d.deliveryNote || "";
  $("failureReason").value = "";
  $("confirmDeliveryBtn").disabled = true;
  document.querySelectorAll(".status-btn").forEach(x => x.classList.remove("selected"));

  const completed = isCompleted(d.status);
  $("startArea").classList.toggle("hidden", forceComplete || d.status === "Out for Delivery" || completed);
  $("completeArea").classList.toggle("hidden", !(forceComplete || d.status === "Out for Delivery") || completed);

  $("deliverySheet").classList.remove("hidden");
}

function closeSheet() {
  $("deliverySheet").classList.add("hidden");
}

async function startDelivery() {
  if (!selectedDelivery) return;
  const eta = ($("customEta").value || "").trim() || selectedEta || "30 min";

  setActionBusy($("startDeliveryBtn"), true, "Starting…");
  try {
    const payload = {
      action: "updateDeliveryStatus",
      orderId: selectedDelivery.orderId,
      status: "Out for Delivery",
      eta,
      driverId: CFG.DRIVER_ID || "",
      driverName: CFG.DRIVER_NAME || "",
      lat: currentPosition?.lat || "",
      lng: currentPosition?.lng || ""
    };

    const result = await apiPost(payload);
    if (!result.ok) throw new Error(result.message || "Could not update delivery.");

    selectedDelivery.status = "Out for Delivery";
    selectedDelivery.eta = eta;
    selectedDelivery.startedAt = result.startedAt || new Date().toISOString();
    activeDelivery = selectedDelivery;

    updateUI();
    closeSheet();

    const msg = outForDeliveryMessage(selectedDelivery, eta);
    openWhatsApp(selectedDelivery, msg);
    showToast("Delivery started");
  } catch (err) {
    showToast(err.message || "Unable to start delivery.");
  } finally {
    setActionBusy($("startDeliveryBtn"), false, "Start Delivery");
  }
}

async function completeDelivery() {
  if (!selectedDelivery || !selectedCompletionStatus) return;

  const reason = ($("failureReason").value || "").trim();
  if (selectedCompletionStatus === "Not Delivered" && !reason) {
    showToast("Please enter the reason.");
    $("failureReason").focus();
    return;
  }

  setActionBusy($("confirmDeliveryBtn"), true, "Saving…");
  try {
    const note = ($("deliveryNote").value || "").trim();
    const result = await apiPost({
      action: "updateDeliveryStatus",
      orderId: selectedDelivery.orderId,
      status: selectedCompletionStatus,
      deliveryNote: note,
      failureReason: reason,
      driverId: CFG.DRIVER_ID || "",
      driverName: CFG.DRIVER_NAME || "",
      lat: currentPosition?.lat || "",
      lng: currentPosition?.lng || ""
    });

    if (!result.ok) throw new Error(result.message || "Could not complete delivery.");

    selectedDelivery.status = selectedCompletionStatus;
    selectedDelivery.deliveryNote = note;
    selectedDelivery.failureReason = reason;
    selectedDelivery.deliveredAt = result.deliveredAt || new Date().toISOString();

    if (activeDelivery?.orderId === selectedDelivery.orderId) activeDelivery = null;

    updateUI();
    closeSheet();

    const msg = completionMessage(selectedDelivery);
    openWhatsApp(selectedDelivery, msg);
    showToast("Delivery status saved");
  } catch (err) {
    showToast(err.message || "Unable to save delivery.");
  } finally {
    setActionBusy($("confirmDeliveryBtn"), false, "Confirm Delivery");
  }
}

function outForDeliveryMessage(d, eta) {
  return `Hi ${firstName(d.customerName)} 👋\n\nYour MyFarmBox harvest is now out for delivery.\n\nEstimated arrival: ${eta}.\n\nSee you soon! 🌱\nMyFarmBox Singapore`;
}

function completionMessage(d) {
  const name = firstName(d.customerName);
  switch (d.status) {
    case "Delivered in Hand":
      return `Hi ${name} 👋\n\nYour MyFarmBox harvest has been delivered to you successfully. 🌱\n\nThank you and enjoy your harvest!\nMyFarmBox Singapore`;
    case "Left at Door":
      return `Hi ${name} 👋\n\nYour MyFarmBox harvest has been delivered and left safely at your door. 🌱\n\nThank you and enjoy your harvest!\nMyFarmBox Singapore`;
    case "Given to Neighbour":
      return `Hi ${name} 👋\n\nYour MyFarmBox harvest has been delivered and handed to your neighbour. 🌱\n\nThank you!\nMyFarmBox Singapore`;
    case "Not Delivered":
      return `Hi ${name},\n\nWe were unable to complete your MyFarmBox delivery today${d.failureReason ? ` because: ${d.failureReason}` : "."}\n\nOur team will follow up with you shortly.\nMyFarmBox Singapore`;
    default:
      return `Hi ${name}, your MyFarmBox delivery status has been updated.`;
  }
}

function openWhatsApp(d, message = "") {
  if (!d?.phone) return showToast("Customer phone number is missing.");
  let phone = d.phone.replace(/[^\d+]/g, "");
  if (phone.startsWith("+")) phone = phone.slice(1);
  if (phone.length === 8) phone = "65" + phone;
  const url = `https://wa.me/${phone}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
  window.open(url, "_blank");
}

function callCustomer(d) {
  if (!d?.phone) return showToast("Customer phone number is missing.");
  window.location.href = `tel:${d.phone}`;
}

function openMaps(d) {
  if (!d) return;
  let target = "";
  if (d.lat != null && d.lng != null) target = `${d.lat},${d.lng}`;
  else if (d.address) target = d.address;
  else return showToast("No delivery location available.");
  window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(target)}`, "_blank");
}

function switchView(view) {
  document.querySelectorAll(".toggle-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
  $("livePanel").classList.toggle("hidden", view !== "live");

  if (refreshTimer) clearInterval(refreshTimer);
  if (view === "live") {
    refreshTimer = setInterval(() => loadDeliveries(true), Number(CFG.LIVE_REFRESH_MS || 15000));
  }
}

function startLocationWatch() {
  if (!navigator.geolocation) return;
  watchId = navigator.geolocation.watchPosition(
    pos => {
      currentPosition = { lat:pos.coords.latitude, lng:pos.coords.longitude, accuracy:pos.coords.accuracy };
      updateUserMarker();
      renderList();
      sendLocationPing();
    },
    err => console.warn("Location unavailable:", err.message),
    { enableHighAccuracy:true, maximumAge:15000, timeout:15000 }
  );
}

let lastLocationPing = 0;
async function sendLocationPing() {
  const now = Date.now();
  if (!currentPosition || now - lastLocationPing < 30000) return;
  lastLocationPing = now;
  try {
    await apiPost({
      action:"driverLocation",
      driverId: CFG.DRIVER_ID || "",
      driverName: CFG.DRIVER_NAME || "",
      lat: currentPosition.lat,
      lng: currentPosition.lng,
      accuracy: currentPosition.accuracy || ""
    });
  } catch (_) {}
}

function updateUserMarker() {
  if (!map || !window.google || !currentPosition) return;
  const position = { lat:currentPosition.lat, lng:currentPosition.lng };
  if (!userMarker) {
    userMarker = new google.maps.Marker({
      position,
      map,
      title:"My current location",
      icon:{
        path:google.maps.SymbolPath.CIRCLE,
        scale:8,
        fillColor:"#2563eb",
        fillOpacity:1,
        strokeColor:"#fff",
        strokeWeight:3
      }
    });
  } else {
    userMarker.setPosition(position);
  }
}

function centerOnUser() {
  if (!map) return;
  if (!currentPosition) return showToast("Waiting for current location…");
  map.panTo({ lat:currentPosition.lat, lng:currentPosition.lng });
  map.setZoom(15);
}

function distanceFromUser(d) {
  if (!currentPosition || d.lat == null || d.lng == null) return null;
  return haversineKm(currentPosition.lat, currentPosition.lng, d.lat, d.lng);
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2-lat1);
  const dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 +
    Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function formatDistance(km) {
  if (km == null) return "";
  return km < 1 ? `${Math.round(km*1000)} m away` : `${km.toFixed(1)} km away`;
}

function statusRank(status) {
  if (status === "Out for Delivery") return 0;
  if (status === "Pending" || !status) return 1;
  if (status === "Not Delivered") return 2;
  return 3;
}

function cardClass(status) {
  if (status === "Out for Delivery") return "active";
  if (status === "Not Delivered") return "failed";
  if (successStatuses().includes(status)) return "completed";
  return "";
}

function pillClass(status) {
  if (status === "Out for Delivery") return "active";
  if (status === "Not Delivered") return "failed";
  if (successStatuses().includes(status)) return "done";
  return "";
}

function successStatuses() {
  return ["Delivered in Hand","Left at Door","Given to Neighbour","Delivered"];
}

function isCompleted(status) {
  return successStatuses().includes(status) || status === "Not Delivered";
}

async function apiGet(action, params = {}) {
  if (!CFG.API_URL || CFG.API_URL.includes("PASTE_")) throw new Error("API URL not configured.");
  const url = new URL(CFG.API_URL);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v ?? ""));
  const res = await fetch(url.toString(), { method:"GET" });
  return await res.json();
}

async function apiPost(payload) {
  if (!CFG.API_URL || CFG.API_URL.includes("PASTE_")) throw new Error("API URL not configured.");
  const res = await fetch(CFG.API_URL, {
    method:"POST",
    headers:{ "Content-Type":"text/plain;charset=utf-8" },
    body:JSON.stringify(payload)
  });
  return await res.json();
}

function showLoader(show) {
  $("appLoader").classList.toggle("hidden", !show);
}
function setActionBusy(btn, busy, text) {
  btn.disabled = busy;
  btn.textContent = text;
}
function showToast(message) {
  const t = $("toast");
  t.textContent = message;
  t.classList.remove("hidden");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add("hidden"), 2400);
}
function firstName(name) {
  return String(name || "there").trim().split(/\s+/)[0];
}
function localDateString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function escapeHtml(s="") {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
function jsString(s="") {
  return String(s).replace(/\\/g,"\\\\").replace(/'/g,"\\'");
}

function demoDeliveries() {
  return [
    {orderId:"SG-0128",customerName:"Sarah Lim",phone:"91234567",area:"Tampines",address:"Tampines Ave 4",boxes:2,lat:1.3531,lng:103.9447,status:"Pending",driverName:CFG.DRIVER_NAME},
    {orderId:"SG-0129",customerName:"Daniel Tan",phone:"92345678",area:"Bedok",address:"Bedok North",boxes:1,lat:1.3266,lng:103.9273,status:"Out for Delivery",eta:"30 min",driverName:CFG.DRIVER_NAME},
    {orderId:"SG-0130",customerName:"Mei Chen",phone:"93456789",area:"Punggol",address:"Punggol Field",boxes:1,lat:1.3984,lng:103.9072,status:"Delivered in Hand",driverName:CFG.DRIVER_NAME}
  ].map(normalizeDelivery);
}
