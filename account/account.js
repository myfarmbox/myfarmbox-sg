(() => {
  "use strict";

  const API_URL =
    "https://script.google.com/macros/s/AKfycbw4ioZTLJKaFXWad3zJqyWXzde7-I5S6Q9LndoF2zu7EzgnEku75U2nAkceQBXLjpJi/exec";

  const SESSION_KEY = "mfb_sg_customer_session_v1";
  const CART_KEY = "mfb_sg_cart_v1";

  let account = null;
  let selectedOrder = null;
  let toastTimer = null;
  let addressMap = null;
  let addressMarker = null;
  let savedAddressMap = null;
  let savedAddressMarker = null;
  const DEFAULT_MAP_CENTER = [1.3521, 103.8198];

  const $ = id => document.getElementById(id);

  const els = {
    loginView: $("login-view"),
    accountView: $("account-view"),
    loginPhone: $("login-phone"),
    loginEmail: $("login-email"),
    loginButton: $("login-button"),
    loginMessage: $("login-message"),
    avatar: $("avatar"),
    heroName: $("hero-name"),
    heroCustomerId: $("hero-customer-id"),
    statOrders: $("stat-orders"),
    statSpent: $("stat-spent"),
    statUpcoming: $("stat-upcoming"),
    statStatus: $("stat-status"),
    upcomingSection: $("upcoming-section"),
    upcomingOrderId: $("upcoming-order-id"),
    upcomingDelivery: $("upcoming-delivery"),
    upcomingOrderStatus: $("upcoming-order-status"),
    upcomingTotal: $("upcoming-total"),
    upcomingViewButton: $("upcoming-view-button"),
    profileName: $("profile-name"),
    profilePhone: $("profile-phone"),
    profileEmail: $("profile-email"),
    profileAdults: $("profile-adults"),
    profileChildren: $("profile-children"),
    addressLabel: $("address-label"),
    addressDisplay: $("address-display"),
    addressInstructions: $("address-instructions"),
    ordersList: $("orders-list"),
    ordersEmpty: $("orders-empty"),
    supportWhatsapp: $("support-whatsapp"),
    supportCall: $("support-call"),
    profileDialog: $("profile-dialog"),
    addressDialog: $("address-dialog"),
    orderDialog: $("order-dialog"),
    editName: $("edit-name"),
    editPhone: $("edit-phone"),
    editEmail: $("edit-email"),
    editAdults: $("edit-adults"),
    editChildren: $("edit-children"),
    editAddressLine: $("edit-address-line"),
    editUnitNumber: $("edit-unit-number"),
    editBuilding: $("edit-building"),
    editPostalCode: $("edit-postal-code"),
    editPlaceName: $("edit-place-name"),
    editDeliveryInstructions: $("edit-delivery-instructions"),
    editLatLong: $("edit-lat-long"),
    addressMap: $("address-map"),
    useCurrentLocation: $("use-current-location"),
    mapStatus: $("map-status"),
    mapCoordinates: $("map-coordinates"),
    savedLocationWrap: $("saved-location-wrap"),
    savedLocationCoordinates: $("saved-location-coordinates"),
    savedAddressMap: $("saved-address-map"),
    orderDialogId: $("order-dialog-id"),
    orderDialogDelivery: $("order-dialog-delivery"),
    orderDialogStatus: $("order-dialog-status"),
    orderDialogPayment: $("order-dialog-payment"),
    orderDialogItems: $("order-dialog-items"),
    orderDialogTotal: $("order-dialog-total"),
    reorderButton: $("reorder-button"),
    toast: $("toast"),
    toastTitle: $("toast-title"),
    toastCopy: $("toast-copy")
  };

  function readSession() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function saveSession(value) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(value));
  }

  function money(value) {
    return new Intl.NumberFormat("en-SG", {
      style: "currency",
      currency: "SGD",
      minimumFractionDigits: 2
    }).format(Number(value || 0));
  }

  function normalizePhone(value) {
    let digits = String(value || "").replace(/\D/g, "");

    if (digits.startsWith("65") && digits.length >= 10) {
      return digits;
    }

    if (digits.length === 8) {
      return `65${digits}`;
    }

    return digits;
  }

  function initials(name) {
    return String(name || "My FarmBox")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part.charAt(0).toUpperCase())
      .join("");
  }

  function formatDate(value) {
    if (!value) return "—";

    return new Intl.DateTimeFormat("en-SG", {
      day: "numeric",
      month: "short",
      year: "numeric"
    }).format(new Date(value));
  }

  function showToast(title, copy) {
    els.toastTitle.textContent = title;
    els.toastCopy.textContent = copy;
    els.toast.hidden = false;

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
      els.toast.hidden = true;
    }, 2400);
  }

  function accountQuery(phone, email) {
    const params = new URLSearchParams({
      action: "getAccount",
      phone: normalizePhone(phone || ""),
      email: String(email || "").trim()
    });

    return `${API_URL}?${params.toString()}`;
  }

  async function loadAccount(phone, email) {
    els.loginButton.disabled = true;
    els.loginButton.textContent = "Opening Account…";
    els.loginMessage.textContent = "";

    try {
      const response = await fetch(accountQuery(phone, email), {
        cache: "no-store"
      });

      const data = await response.json();

      if (!data.ok || !data.found) {
        throw new Error(
          data.message || "We couldn’t find a matching account."
        );
      }

      account = data;

      saveSession({
        customerId: data.customer.customerId,
        phoneKey: data.customer.phoneKey,
        email: data.customer.email,
        name: data.customer.name,
        updatedAt: new Date().toISOString()
      });

      renderAccount();
    } catch (error) {
      els.loginMessage.textContent =
        error.message || "Unable to open account.";
    } finally {
      els.loginButton.disabled = false;
      els.loginButton.textContent = "Find My Account";
    }
  }

  function renderAccount() {
    const customer = account.customer || {};
    const address = account.address || {};
    const orders = Array.isArray(account.orders)
      ? account.orders
      : [];

    els.loginView.hidden = true;
    els.accountView.hidden = false;

    els.avatar.textContent = initials(customer.name);
    els.heroName.textContent = customer.name || "Member";
    els.heroCustomerId.textContent =
      `Customer ID: ${customer.customerId || "—"}`;

    els.statOrders.textContent =
      Number(customer.orderCount || orders.length);
    els.statSpent.textContent =
      money(customer.totalSpent);
    els.statUpcoming.textContent =
      String(orders.filter(order => !["Delivered", "Cancelled", "Closed"].includes(order.orderStatus)).length);
    els.statStatus.textContent =
      customer.status || "Active";

    els.profileName.textContent = customer.name || "—";
    els.profilePhone.textContent = customer.phone || "—";
    els.profileEmail.textContent = customer.email || "—";
    els.profileAdults.textContent = Number(customer.adults || 0);
    els.profileChildren.textContent = Number(customer.children || 0);

    els.addressLabel.textContent =
      address.label || "Home";

    const addressParts = [
      address.addressLine,
      address.unitNumber,
      address.building,
      address.postalCode
        ? `Singapore ${address.postalCode}`
        : ""
    ].filter(Boolean);

    els.addressDisplay.innerHTML =
      addressParts.length
        ? addressParts.map(part => `<div>${escapeHtml(part)}</div>`).join("")
        : "<div>No saved address.</div>";

    els.addressInstructions.textContent =
      address.deliveryInstructions
        ? `Delivery instructions: ${address.deliveryInstructions}`
        : "";

    renderSavedAddressMap(address.latLong || "");

    renderOrders(orders);
    renderUpcoming(orders);
    prepareSupportLinks();
  }

  function renderUpcoming(orders) {
    const upcoming = orders.find(
      order =>
        !["Delivered", "Cancelled", "Closed"].includes(
          order.orderStatus
        )
    );

    if (!upcoming) {
      els.upcomingSection.hidden = true;
      return;
    }

    els.upcomingSection.hidden = false;
    els.upcomingOrderId.textContent = upcoming.orderId;
    els.upcomingDelivery.textContent =
      `${formatDate(upcoming.deliveryDate)} · 9:00 a.m.–9:00 p.m.`;
    els.upcomingOrderStatus.textContent =
      upcoming.orderStatus;
    els.upcomingTotal.textContent =
      money(upcoming.grandTotal);

    els.upcomingViewButton.onclick = () =>
      openOrder(upcoming.orderId);
  }

  function renderOrders(orders) {
    els.ordersList.innerHTML = "";
    els.ordersEmpty.hidden = orders.length > 0;

    orders.forEach(order => {
      const card = document.createElement("article");
      card.className = "order-card";

      card.innerHTML = `
        <div class="order-main">
          <strong>${escapeHtml(order.orderId)}</strong>
          <small>${formatDate(order.orderDate)}</small>
        </div>

        <div class="order-meta">
          <strong>${formatDate(order.deliveryDate)}</strong>
          <small>${Number(order.itemCount || 0)} products</small>
        </div>

        <span class="order-status">${escapeHtml(order.orderStatus)}</span>

        <div>
          <strong>${money(order.grandTotal)}</strong>
          <button type="button">View</button>
        </div>
      `;

      card.querySelector("button").onclick = () =>
        openOrder(order.orderId);

      els.ordersList.appendChild(card);
    });
  }

  async function openOrder(orderId) {
    try {
      const session = readSession();

      const params = new URLSearchParams({
        action: "getOrderDetails",
        orderId,
        customerId: session.customerId || ""
      });

      const response = await fetch(
        `${API_URL}?${params.toString()}`,
        { cache: "no-store" }
      );

      const data = await response.json();

      if (!data.ok) {
        throw new Error(
          data.message || "Unable to open order."
        );
      }

      selectedOrder = data;

      els.orderDialogId.textContent =
        data.order.orderId;
      els.orderDialogDelivery.textContent =
        formatDate(data.order.deliveryDate);
      els.orderDialogStatus.textContent =
        data.order.orderStatus;
      els.orderDialogPayment.textContent =
        data.order.paymentStatus;
      els.orderDialogTotal.textContent =
        money(data.order.grandTotal);

      els.orderDialogItems.innerHTML = "";

      data.items.forEach(item => {
        const row = document.createElement("div");
        row.className = "order-dialog-item";
        row.innerHTML = `
          <span>${Number(item.quantity)} × ${escapeHtml(displayName(item.productName))}</span>
          <strong>${money(item.lineTotal)}</strong>
        `;
        els.orderDialogItems.appendChild(row);
      });

      els.orderDialog.showModal();
    } catch (error) {
      showToast(
        "Order unavailable",
        error.message || "Please try again."
      );
    }
  }

  function displayName(name) {
    const raw = String(name || "Fresh produce");
    const parts = raw.split(" - ");

    return parts.length > 1
      ? parts.slice(1).join(" - ").trim()
      : raw;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function openProfileEditor() {
    const customer = account.customer || {};

    els.editName.value = customer.name || "";
    els.editPhone.value = customer.phone || "";
    els.editEmail.value = customer.email || "";
    els.editAdults.value = Number(customer.adults || 0);
    els.editChildren.value = Number(customer.children || 0);

    els.profileDialog.showModal();
  }


  function deliveryPinIcon() {
    return L.divIcon({
      className: "mfb-map-pin-wrap",
      html: '<div class="mfb-map-pin" aria-hidden="true"></div>',
      iconSize: [34, 42],
      iconAnchor: [17, 40],
      popupAnchor: [0, -40]
    });
  }

  function refreshMapSize(map, delays = [0, 80, 220, 500]) {
    if (!map) return;

    delays.forEach(delay => {
      window.setTimeout(() => {
        map.invalidateSize({ animate: false });
      }, delay);
    });
  }

  function renderSavedAddressMap(latLong) {
    const point = parseLatLong(latLong);

    if (
      !point ||
      typeof L === "undefined" ||
      !els.savedAddressMap
    ) {
      els.savedLocationWrap.hidden = true;
      return;
    }

    els.savedLocationWrap.hidden = false;
    els.savedLocationCoordinates.textContent =
      formatLatLong(point[0], point[1]);

    if (!savedAddressMap) {
      savedAddressMap = L.map("saved-address-map", {
        zoomControl: true,
        attributionControl: true,
        dragging: true,
        scrollWheelZoom: false
      }).setView(point, 17);

      L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }
      ).addTo(savedAddressMap);
    } else {
      savedAddressMap.setView(point, 17);
    }

    if (!savedAddressMarker) {
      savedAddressMarker = L.marker(point, {
        icon: deliveryPinIcon(),
        interactive: false
      }).addTo(savedAddressMap);
    } else {
      savedAddressMarker.setLatLng(point);
    }

    refreshMapSize(savedAddressMap);
  }

  function parseLatLong(value) {
    const parts = String(value || "")
      .split(",")
      .map(part => Number(part.trim()));

    if (
      parts.length !== 2 ||
      !Number.isFinite(parts[0]) ||
      !Number.isFinite(parts[1])
    ) {
      return null;
    }

    const [lat, lng] = parts;

    if (
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return null;
    }

    return [lat, lng];
  }

  function formatLatLong(lat, lng) {
    return `${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`;
  }

  function updateMapFields(lat, lng, message = "Delivery pin selected.") {
    const value = formatLatLong(lat, lng);

    els.editLatLong.value = value;
    els.mapCoordinates.textContent = value;
    els.mapStatus.textContent = message;
    els.mapStatus.className = "ready";
  }

  function setMapError(message) {
    els.mapStatus.textContent = message;
    els.mapStatus.className = "error";
  }

  function createOrMoveMarker(lat, lng, message) {
    if (!addressMap) return;

    const point = [lat, lng];

    if (!addressMarker) {
      addressMarker = L.marker(point, {
        draggable: true,
        autoPan: true,
        icon: deliveryPinIcon()
      }).addTo(addressMap);

      addressMarker.on("dragend", event => {
        const position = event.target.getLatLng();

        updateMapFields(
          position.lat,
          position.lng,
          "Delivery pin updated."
        );
      });
    } else {
      addressMarker.setLatLng(point);
    }

    addressMap.setView(point, Math.max(addressMap.getZoom(), 17));
    updateMapFields(lat, lng, message);
  }

  function initialiseAddressMap(savedLatLong) {
    if (typeof L === "undefined") {
      setMapError("The map could not be loaded. You can still save the written address.");
      return;
    }

    const saved = parseLatLong(savedLatLong);
    const initial = saved || DEFAULT_MAP_CENTER;

    if (!addressMap) {
      addressMap = L.map("address-map", {
        zoomControl: true,
        attributionControl: true
      }).setView(initial, saved ? 17 : 11);

      L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }
      ).addTo(addressMap);

      addressMap.on("click", event => {
        createOrMoveMarker(
          event.latlng.lat,
          event.latlng.lng,
          "Delivery pin moved to the selected point."
        );
      });
    }

    refreshMapSize(addressMap);

    window.setTimeout(() => {
      if (saved) {
        createOrMoveMarker(
          saved[0],
          saved[1],
          "Saved delivery pin loaded."
        );
      } else {
        if (addressMarker) {
          addressMap.removeLayer(addressMarker);
          addressMarker = null;
        }

        addressMap.setView(DEFAULT_MAP_CENTER, 11);
        els.editLatLong.value = "";
        els.mapCoordinates.textContent = "";
        els.mapStatus.textContent =
          "Tap the map or use your current location.";
        els.mapStatus.className = "";
      }

      refreshMapSize(addressMap);
    }, 120);
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setMapError("Current location is not supported on this device.");
      return;
    }

    els.useCurrentLocation.disabled = true;
    els.useCurrentLocation.textContent = "Finding Location…";
    els.mapStatus.textContent = "Requesting your current location…";
    els.mapStatus.className = "";

    navigator.geolocation.getCurrentPosition(
      position => {
        createOrMoveMarker(
          position.coords.latitude,
          position.coords.longitude,
          "Current location selected. Drag the pin if needed."
        );

        els.useCurrentLocation.disabled = false;
        els.useCurrentLocation.textContent = "Use Current Location";
      },
      error => {
        const messages = {
          1: "Location permission was denied.",
          2: "Your location is currently unavailable.",
          3: "Location request timed out."
        };

        setMapError(
          messages[error.code] ||
          "We could not find your current location."
        );

        els.useCurrentLocation.disabled = false;
        els.useCurrentLocation.textContent = "Use Current Location";
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 60000
      }
    );
  }

  function openAddressEditor() {
    const address = account.address || {};

    els.editAddressLine.value =
      address.addressLine || "";
    els.editUnitNumber.value =
      address.unitNumber || "";
    els.editBuilding.value =
      address.building || "";
    els.editPostalCode.value =
      address.postalCode || "";
    els.editPlaceName.value =
      address.placeName || address.label || "Home";
    els.editDeliveryInstructions.value =
      address.deliveryInstructions || "";
    els.editLatLong.value =
      address.latLong || "";

    els.addressDialog.showModal();

    window.requestAnimationFrame(() => {
      initialiseAddressMap(address.latLong || "");
      refreshMapSize(addressMap);
    });
  }

  async function postAction(payload) {
    const response = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.message || "Update failed.");
    }

    return data;
  }

  async function saveProfile() {
    try {
      await postAction({
        action: "updateCustomer",
        customerId: account.customer.customerId,
        customer: {
          name: els.editName.value.trim(),
          phone: els.editPhone.value.trim(),
          email: els.editEmail.value.trim(),
          adults: Number(els.editAdults.value || 0),
          children: Number(els.editChildren.value || 0)
        }
      });

      els.profileDialog.close();

      await loadAccount(
        els.editPhone.value,
        els.editEmail.value
      );

      showToast(
        "Profile updated",
        "Your customer information has been saved."
      );
    } catch (error) {
      showToast(
        "Profile not updated",
        error.message || "Please try again."
      );
    }
  }

  async function saveAddress() {
    try {
      await postAction({
        action: "updateAddress",
        customerId: account.customer.customerId,
        addressId: account.address?.addressId || "",
        address: {
          label: els.editPlaceName.value.trim() || "Home",
          addressLine: els.editAddressLine.value.trim(),
          unitNumber: els.editUnitNumber.value.trim(),
          building: els.editBuilding.value.trim(),
          postalCode: els.editPostalCode.value.trim(),
          placeName: els.editPlaceName.value.trim(),
          deliveryInstructions:
            els.editDeliveryInstructions.value.trim(),
          latLong: els.editLatLong.value.trim()
        }
      });

      els.addressDialog.close();

      await loadAccount(
        account.customer.phone,
        account.customer.email
      );

      showToast(
        "Address updated",
        "Your delivery address has been saved."
      );
    } catch (error) {
      showToast(
        "Address not updated",
        error.message || "Please try again."
      );
    }
  }

  function reorder() {
    if (!selectedOrder?.items?.length) return;

    const cart = selectedOrder.items.map(item => ({
      productId: item.productId,
      productName: item.productName,
      tanglish: "",
      collection: "",
      imageUrl: "",
      unitLabel: item.unitLabel,
      unitValue: Number(item.unitValue),
      unitType: item.unitType,
      unitPrice: Number(item.unitPrice),
      quantity: Number(item.quantity),
      minQuantity: 1,
      maxQuantity: 99,
      incrementBy: 1
    }));

    localStorage.setItem(CART_KEY, JSON.stringify(cart));

    if (typeof window.updateSharedCartCount === "function") {
      window.updateSharedCartCount();
    }

    window.location.href = "/cart/";
  }

  function prepareSupportLinks() {
    const phone =
      account.settings?.supportPhone ||
      "+65 8575 6146";

    const digits = phone.replace(/\D/g, "");

    els.supportWhatsapp.href =
      `https://wa.me/${digits}`;
    els.supportCall.href =
      `tel:+${digits}`;
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    account = null;
    els.accountView.hidden = true;
    els.loginView.hidden = false;
    els.loginMessage.textContent = "";
  }

  async function initialise() {
    const session = readSession();

    if (session.phoneKey || session.email) {
      els.loginPhone.value = session.phoneKey || "";
      els.loginEmail.value = session.email || "";

      await loadAccount(
        session.phoneKey,
        session.email
      );
    }
  }

  els.loginButton.onclick = () =>
    loadAccount(
      els.loginPhone.value,
      els.loginEmail.value
    );

  els.loginPhone.onkeydown = event => {
    if (event.key === "Enter") {
      event.preventDefault();
      els.loginButton.click();
    }
  };

  $("edit-profile-button").onclick = openProfileEditor;
  $("edit-profile-button-2").onclick = openProfileEditor;
  $("edit-address-button").onclick = openAddressEditor;
  $("logout-button").onclick = logout;

  $("cancel-profile").onclick = () =>
    els.profileDialog.close();
  $("cancel-address").onclick = () =>
    els.addressDialog.close();

  $("save-profile").onclick = saveProfile;
  $("save-address").onclick = saveAddress;
  els.useCurrentLocation.onclick = useCurrentLocation;

  $("close-order-dialog").onclick = () =>
    els.orderDialog.close();

  els.reorderButton.onclick = reorder;

  initialise();
})();