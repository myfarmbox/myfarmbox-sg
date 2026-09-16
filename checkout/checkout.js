(() => {
  "use strict";

  const API_URL =
    "https://script.google.com/macros/s/AKfycbw4ioZTLJKaFXWad3zJqyWXzde7-I5S6Q9LndoF2zu7EzgnEku75U2nAkceQBXLjpJi/exec";

  const CART_KEY = "mfb_sg_cart_v1";
  const DRAFT_KEY = "mfb_sg_checkout_draft_v1";
  const CUSTOMER_SESSION_KEY = "mfb_sg_customer_session_v1";
  const PRODUCTS_CACHE_KEY = "mfb_sg_products_checkout_cache_v1";
  const PRODUCTS_CACHE_TTL_MS = 60 * 1000;
  const DEFAULT_MAP_CENTER = [1.3521, 103.8198];

  let deliveryMap = null;
  let deliveryMarker = null;

  const state = {
    cart: [],
    settings: {
      minimumOrderKg: 5,
      maximumOrderKg: 20,
      deliveryFee: 0
    },
    delivery: null,
    profileFound: false,
    lookupComplete: false,
    profileSource: "",
    selectedAddressId: "",
    submitting: false
  };

  const $ = id => document.getElementById(id);

  const els = {
    guard: $("guard-state"),
    empty: $("empty-state"),
    emptyMessage: $("empty-message"),
    layout: $("checkout-layout"),
    lookupPhone: $("lookup-phone"),
    lookupButton: $("lookup-button"),
    lookupMessage: $("lookup-message"),
    foundProfile: $("found-profile"),
    foundName: $("found-name"),
    foundSource: $("found-source"),
    savedAddresses: $("saved-addresses"),
    manageAddresses: $("manage-addresses-link"),
    form: $("customer-form"),
    name: $("customer-name"),
    phone: $("customer-phone"),
    email: $("customer-email"),
    addressLine: $("address-line"),
    unitNumber: $("unit-number"),
    building: $("building"),
    postalCode: $("postal-code"),
    placeName: $("place-name"),
    deliveryInstructions: $("delivery-instructions"),
    latLong: $("lat-long"),
    deliveryMap: $("checkout-address-map"),
    deliveryMapStatus: $("checkout-map-status"),
    useCurrentLocation: $("use-current-location"),
    sourceWaitlistId: $("source-waitlist-id"),
    deliveryContactCard: $("delivery-contact-card"),
    deliveryContactName: $("delivery-contact-name"),
    deliveryContactPhone: $("delivery-contact-phone"),
    deliveryDate: $("delivery-date"),
    summaryItems: $("summary-items"),
    summaryWeight: $("summary-weight"),
    summarySubtotal: $("summary-subtotal"),
    summaryDeliveryFee: $("summary-delivery-fee"),
    summaryTotal: $("summary-total"),
    warning: $("checkout-warning"),
    placeOrder: $("place-order-button"),
    successDialog: $("success-dialog"),
    successOrderId: $("success-order-id"),
    successDelivery: $("success-delivery"),
    paymentStatus: $("payment-status"),
    paymentCopy: $("payment-copy"),
    paynowDetails: $("paynow-details"),
    paynowQr: $("paynow-qr"),
    paynowAmount: $("paynow-amount"),
    paynowPayee: $("paynow-payee"),
    paynowReference: $("paynow-reference"),
    paynowLink: $("paynow-link"),
    closeSuccess: $("close-success-button"),
    toast: $("toast"),
    toastTitle: $("toast-title"),
    toastCopy: $("toast-copy"),
    confirmingOverlay: $("confirming-overlay")
    ,authSignedOut: $("auth-signed-out")
    ,authSignedIn: $("auth-signed-in")
    ,authUserEmail: $("auth-user-email")
    ,authMessage: $("auth-message")
    ,googleLogin: $("google-login-button")
    ,magicEmail: $("magic-link-email")
    ,magicLogin: $("magic-link-button")
    ,guestCheckout: $("guest-checkout-button")
    ,guestLookup: $("guest-lookup")
    ,signOut: $("sign-out-button")
  };

  function readJson(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "");
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function readFreshProductsCache() {
    const cache = readJson(PRODUCTS_CACHE_KEY, null);
    if (!cache || !cache.data || Date.now() - Number(cache.savedAt || 0) > PRODUCTS_CACHE_TTL_MS) return null;
    return cache.data;
  }

  async function getProductsForCheckout() {
    const cached = readFreshProductsCache();
    if (cached) return cached;
    const response = await fetch(`${API_URL}?action=getProducts`, { cache: "no-store" });
    const data = await response.json();
    if (!data.ok || !Array.isArray(data.products)) {
      throw new Error("We couldn’t validate the current harvest.");
    }
    writeJson(PRODUCTS_CACHE_KEY, { savedAt: Date.now(), data });
    return data;
  }

  function currency(value) {
    return new Intl.NumberFormat("en-SG", {
      style: "currency",
      currency: "SGD",
      minimumFractionDigits: 2
    }).format(Number(value || 0));
  }

  function unitEquivalentKg(item) {
    const value = Number(item.unitValue || 0);
    const unit = String(item.unitType || "")
      .trim()
      .toLowerCase();

    if (unit === "kg") return value;
    if (unit === "g") return value / 1000;
    if (unit === "ml") return value / 1000;

    if (
      unit === "l" ||
      unit === "ltr" ||
      unit === "litre" ||
      unit === "liter"
    ) {
      return value;
    }

    return 0;
  }

  function totals(cart) {
    const minimumKg = Number(
      state.settings.minimumOrderKg || 5
    );

    const maximumKg = Number(
      state.settings.maximumOrderKg || 20
    );

    if (window.MFBCart) {
      return window.MFBCart.summarize(
        cart,
        {
          minimumKg,
          maximumKg
        }
      );
    }

    const equivalentKg = cart.reduce(
      (sum, item) =>
        sum +
        unitEquivalentKg(item) *
        Number(item.quantity || 0),
      0
    );

    const subtotal = cart.reduce(
      (sum, item) =>
        sum +
        Number(
          item.unitPrice ||
          item.price ||
          0
        ) *
        Number(item.quantity || 0),
      0
    );

    const hasExemptProduct = cart.some(
      item =>
        (
          item.minimumOrderExempt === true ||
          String(item.minimumOrderExempt)
            .trim()
            .toLowerCase() === "true"
        ) &&
        Number(item.quantity || 0) > 0
    );

    const minimumReached =
      equivalentKg >= minimumKg;

    const withinMaximum =
      equivalentKg <= maximumKg;

    return {
      weight: equivalentKg,
      weightKg: equivalentKg,
      equivalentKg,
      subtotal,
      minimumKg,
      maximumKg,
      remainingKg:
        Math.max(0, minimumKg - equivalentKg),
      remainingMinimumKg:
        Math.max(0, minimumKg - equivalentKg),
      remainingMaximumKg:
        Math.max(0, maximumKg - equivalentKg),
      minimumReached,
      withinMaximum,
      hasExemptProduct,
      qualified:
        (minimumReached || hasExemptProduct) &&
        withinMaximum
    };
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

  function paymentMethod() {
    return (
      document.querySelector(
        'input[name="paymentMethod"]:checked'
      )?.value || "PayNow"
    );
  }

  function resetPaymentDetails() {
    els.paymentStatus.textContent = "Preparing payment details";
    els.paymentCopy.textContent =
      "Please keep this page open while we prepare your PayNow details.";
    els.paynowDetails.hidden = true;
    els.paynowQr.hidden = true;
    els.paynowQr.removeAttribute("src");
    els.paynowLink.hidden = true;
    els.paynowLink.removeAttribute("href");
  }

  function showPayNowDetails(payment, currency) {
    const amount = Number(payment.amount || 0);
    const formattedAmount = new Intl.NumberFormat("en-SG", {
      style: "currency",
      currency: currency || "SGD"
    }).format(amount);

    els.paymentStatus.textContent = "Ready for payment";
    els.paymentCopy.textContent =
      "Use PayNow with the exact amount and reference below.";
    els.paynowAmount.textContent = `Amount: ${formattedAmount}`;
    els.paynowPayee.textContent = payment.payee
      ? `Pay to: ${payment.payeeName || "MyFarmBox SG"} (${payment.payee})`
      : `Pay to: ${payment.payeeName || "MyFarmBox SG"}`;
    els.paynowReference.textContent = `Reference: ${payment.reference || "Use your order number"}`;

    if (payment.paymentQrDataUrl) {
      els.paynowQr.src = payment.paymentQrDataUrl;
      els.paynowQr.hidden = false;
    }

    if (payment.paymentUrl) {
      els.paynowLink.href = payment.paymentUrl;
      els.paynowLink.hidden = false;
    }

    els.paynowDetails.hidden = false;
  }

  function draft() {
    return readJson(DRAFT_KEY, {});
  }

  function showToast(title, copy) {
    els.toastTitle.textContent = title;
    els.toastCopy.textContent = copy;
    els.toast.hidden = false;

    window.setTimeout(() => {
      els.toast.hidden = true;
    }, 2400);
  }

  function focusConfirmation(input) {
    if (!input) return;

    const card = input.closest(".confirmation-card");

    card?.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });

    card?.classList.add("needs-attention");

    window.setTimeout(() => {
      card?.classList.remove("needs-attention");
    }, 1400);
  }

  function showConfirmingOverlay() {
    if (!els.confirmingOverlay) return;

    els.confirmingOverlay.hidden = false;
    document.body.classList.add("checkout-submitting");
  }

  function hideConfirmingOverlay() {
    if (!els.confirmingOverlay) return;

    els.confirmingOverlay.hidden = true;
    document.body.classList.remove("checkout-submitting");
  }

  function wait(ms) {
    return new Promise(resolve =>
      window.setTimeout(resolve, ms)
    );
  }

  function unlockStep(number) {
    const card = document.querySelector(
      `[data-step-card="${number}"]`
    );

    if (!card) return;

    card.classList.remove("locked");
    card.classList.add("active");
  }

  function lockStep(number) {
    const card = document.querySelector(
      `[data-step-card="${number}"]`
    );

    if (!card) return;

    card.classList.add("locked");
    card.classList.remove("active");
  }

  function renderSummary() {
    const summary = totals(state.cart);
    const deliveryFee = Number(state.settings.deliveryFee || 0);

    els.summaryItems.innerHTML = "";

    state.cart.forEach(item => {
      const row = document.createElement("div");
      row.className = "summary-item";
      row.innerHTML = `
        <span>${Number(item.quantity)} × ${escapeHtml(displayName(item.productName))}</span>
        <strong>${currency(Number(item.unitPrice) * Number(item.quantity))}</strong>
      `;
      els.summaryItems.appendChild(row);
    });

    els.summaryWeight.textContent =
      `${Number(
        summary.equivalentKg ??
        summary.weightKg ??
        summary.weight ??
        0
      ).toFixed(2)} kg eq.`;
    els.summarySubtotal.textContent = currency(summary.subtotal);
    els.summaryDeliveryFee.textContent =
      deliveryFee > 0 ? currency(deliveryFee) : "FREE";
    els.summaryTotal.textContent =
      currency(summary.subtotal + deliveryFee);
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

  function formIsValid() {
    const fieldsValid =
      els.name.value.trim() &&
      normalizePhone(els.phone.value).length >= 10 &&
      els.email.validity.valid &&
      els.email.value.trim() &&
      els.addressLine.value.trim() &&
      /^\d{6}$/.test(els.postalCode.value.trim());

    const summary = totals(state.cart);

    return Boolean(
      state.lookupComplete &&
      fieldsValid &&
      state.cart.length &&
      summary.qualified
    );
  }

  function displayPhone(value) {
    const digits = normalizePhone(value);
    return digits.length === 10
      ? `+${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6)}`
      : String(value || "").trim();
  }

  function parseLatLong(value) {
    const parts = String(value || "")
      .split(",")
      .map(part => Number(part.trim()));

    if (
      parts.length !== 2 ||
      !Number.isFinite(parts[0]) ||
      !Number.isFinite(parts[1])
    ) return null;

    return parts;
  }

  function setDeliveryPin(lat, lng, message) {
    els.latLong.value =
      `${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`;
    els.deliveryMapStatus.textContent = message;
    els.deliveryMapStatus.className = "checkout-map-status ready";

    if (!deliveryMap || typeof L === "undefined") return;

    const point = [lat, lng];

    if (!deliveryMarker) {
      deliveryMarker = L.marker(point, {
        draggable: true,
        autoPan: true
      }).addTo(deliveryMap);

      deliveryMarker.on("dragend", event => {
        const position = event.target.getLatLng();
        setDeliveryPin(
          position.lat,
          position.lng,
          "Delivery pin updated."
        );
      });
    } else {
      deliveryMarker.setLatLng(point);
    }

    deliveryMap.setView(point, Math.max(deliveryMap.getZoom(), 17), {
      animate: false
    });
  }

  function initialiseDeliveryMap() {
    if (deliveryMap || !els.deliveryMap) return;

    if (typeof L === "undefined") {
      els.deliveryMapStatus.textContent =
        "The map is unavailable right now. Your written address is enough to continue.";
      return;
    }

    const buildMap = () => {
      const rect = els.deliveryMap.getBoundingClientRect();
      if (rect.width < 200 || rect.height < 160) {
        window.setTimeout(buildMap, 80);
        return;
      }

      const saved = parseLatLong(els.latLong.value);
      const initial = saved || DEFAULT_MAP_CENTER;

      deliveryMap = L.map(els.deliveryMap, {
        zoomControl: true,
        scrollWheelZoom: false
      }).setView(initial, saved ? 17 : 11);

      L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }
      ).addTo(deliveryMap);

      deliveryMap.on("click", event => {
        setDeliveryPin(
          event.latlng.lat,
          event.latlng.lng,
          "Delivery pin added. Drag it to the exact entrance if needed."
        );
      });

      if (saved) {
        setDeliveryPin(
          saved[0],
          saved[1],
          "Delivery pin loaded. Drag it if needed."
        );
      }

      window.setTimeout(
        () => deliveryMap?.invalidateSize({ animate: false }),
        150
      );
    };

    window.setTimeout(buildMap, 80);
  }

  function useCurrentLocationForDelivery() {
    if (!navigator.geolocation) {
      els.deliveryMapStatus.textContent =
        "Current location is not supported on this device.";
      return;
    }

    els.useCurrentLocation.disabled = true;
    els.useCurrentLocation.textContent = "Finding…";
    els.deliveryMapStatus.textContent = "Requesting your current location…";

    navigator.geolocation.getCurrentPosition(
      position => {
        initialiseDeliveryMap();
        window.setTimeout(() => {
          setDeliveryPin(
            position.coords.latitude,
            position.coords.longitude,
            "Current location selected. Drag the pin if needed."
          );
        }, 120);
        els.useCurrentLocation.disabled = false;
        els.useCurrentLocation.textContent = "Use my location";
      },
      () => {
        els.deliveryMapStatus.textContent =
          "We couldn’t get your location. You can place the pin manually.";
        els.useCurrentLocation.disabled = false;
        els.useCurrentLocation.textContent = "Use my location";
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }

  function renderDeliveryContact() {
    const name = els.name.value.trim();
    const phone = normalizePhone(els.phone.value);
    const ready = Boolean(name && /^65[89]\d{7}$/.test(phone));

    els.deliveryContactCard.hidden = !ready;

    if (!ready) return;

    els.deliveryContactName.textContent = name;
    els.deliveryContactPhone.textContent = displayPhone(phone);
  }

  function updateCheckoutState() {
    renderDeliveryContact();
    const valid = formIsValid();

    els.placeOrder.disabled = !valid || state.submitting;

    const summary = totals(state.cart);

    if (!summary.withinMaximum) {
      els.warning.textContent =
        `Your harvest exceeds the ${Number(
          summary.maximumKg || 20
        ).toFixed(0)} kg equivalent maximum. Please return to your cart and reduce the order.`;
      els.warning.className = "checkout-warning error";
    } else if (
      !summary.minimumReached &&
      !summary.hasExemptProduct
    ) {
      els.warning.textContent =
        `Add ${Number(
          summary.remainingMinimumKg ??
          summary.remainingKg ??
          0
        ).toFixed(2)} kg equivalent to reach the minimum harvest.`;
      els.warning.className = "checkout-warning error";
    } else if (!state.lookupComplete) {
      els.warning.textContent = "Sign in or continue as a guest to continue.";
      els.warning.className = "checkout-warning";
    } else if (!valid) {
      els.warning.textContent =
        "Please complete all required customer and address fields.";
      els.warning.className = "checkout-warning error";
    } else {
      els.warning.textContent =
        "Your harvest is ready to be placed.";
      els.warning.className = "checkout-warning ready";
    }
  }

  function populateProfile(profile) {
    const customer = profile.customer || {};
    const signedIn = readJson("mfb_sg_auth_user_v1", {});
    if (signedIn.email && customer.name) {
      localStorage.setItem("mfb_sg_auth_user_v1", JSON.stringify({ ...signedIn, name: customer.name }));
      window.renderMfbHeader?.();
    }
    const address = profile.address || {};

    els.name.value = customer.name || "";
    els.phone.value = customer.phone || els.lookupPhone.value || "";
    els.email.value = customer.email || "";
    els.addressLine.value = address.addressLine || "";
    els.unitNumber.value = address.unitNumber || "";
    els.building.value = address.building || "";
    els.postalCode.value = address.postalCode || "";
    els.placeName.value = address.placeName || "Home";
    els.deliveryInstructions.value =
      address.deliveryInstructions || "";
    els.latLong.value = address.latLong || "";
    els.sourceWaitlistId.value =
      customer.sourceWaitlistId || "";

    renderAddressChoices(profile.addresses || []);

    if (profile.found) {
      els.foundProfile.hidden = false;
      els.foundName.textContent =
        customer.name || "Founding Harvest member";
      els.foundSource.textContent =
        profile.source === "Customers"
          ? "Existing MyFarmBox.sg customer"
          : "Founding Harvest waitlist profile";
    } else {
      els.foundProfile.hidden = true;
    }

    state.profileFound = Boolean(profile.found);
    state.profileSource = profile.source || "New Customer";
    state.lookupComplete = true;

    unlockStep(2);
    unlockStep(3);
    if (!(profile.addresses || []).length) {
      initialiseDeliveryMap();
    }
    updateCheckoutState();
  }

  function renderAddressChoices(addresses) {
    const list = Array.isArray(addresses) ? addresses : [];
    els.savedAddresses.innerHTML = "";
    els.savedAddresses.hidden = !list.length;
    els.manageAddresses.hidden = !list.length;

    if (!list.length) {
      state.selectedAddressId = "";
      return;
    }

    list.forEach(address => {
      const button = document.createElement("button");
      const parts = [address.addressLine, address.unitNumber, address.building, address.postalCode ? `Singapore ${address.postalCode}` : ""].filter(Boolean);
      button.type = "button";
      button.className = "saved-address-card";
      button.dataset.addressId = address.addressId;
      button.innerHTML = `<span>${escapeHtml(address.label || "Address")}</span><strong>${escapeHtml(parts.join(", "))}</strong>${address.isDefault ? "<small>Default delivery address</small>" : ""}`;
      button.addEventListener("click", () => selectAddress(address, list));
      els.savedAddresses.appendChild(button);
    });

    selectAddress(list.find(address => address.isDefault) || list[0], list);
  }

  function selectAddress(address, addresses) {
    state.selectedAddressId = address.addressId || "";
    els.addressLine.value = address.addressLine || "";
    els.unitNumber.value = address.unitNumber || "";
    els.building.value = address.building || "";
    els.postalCode.value = address.postalCode || "";
    els.placeName.value = address.placeName || address.label || "Home";
    els.deliveryInstructions.value = address.deliveryInstructions || "";
    els.latLong.value = address.latLong || "";
    els.savedAddresses.querySelectorAll(".saved-address-card").forEach(card => {
      card.classList.toggle("selected", card.dataset.addressId === state.selectedAddressId);
    });
    updateCheckoutState();
  }

  async function lookupCustomer() {
    const phone = normalizePhone(els.lookupPhone.value);

    if (phone.length < 10) {
      els.lookupMessage.textContent =
        "Enter a valid Singapore mobile number.";
      els.lookupMessage.className = "form-message error";
      return;
    }

    els.lookupButton.disabled = true;
    els.lookupButton.textContent = "Searching…";
    els.lookupMessage.textContent = "";

    try {
      window.showMfbLoader?.("Finding your saved profile…");
      const response = await fetch(
        `${API_URL}?action=lookupCustomer&phone=${encodeURIComponent(phone)}`,
        { cache: "no-store" }
      );

      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.message || "Customer lookup failed.");
      }

      populateProfile(data);

      els.lookupMessage.textContent = data.found
        ? "We found your profile. Please verify the details below."
        : "No existing profile was found. Please enter your delivery details.";

      els.lookupMessage.className = "form-message success";

      if (!data.found) {
        els.phone.value = els.lookupPhone.value;
      }

      window.setTimeout(() => {
        document
          .querySelector('[data-step-card="2"]')
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    } catch (error) {
      els.lookupMessage.textContent =
        error.message || "We couldn’t look up your profile.";
      els.lookupMessage.className = "form-message error";
    } finally {
      window.hideMfbLoader?.();
      els.lookupButton.disabled = false;
      els.lookupButton.textContent = "Find My Profile";
    }
  }

  async function loadSignedInProfile(user) {
    if (!user?.email) return;
    els.authSignedOut.hidden = true;
    els.authSignedIn.hidden = false;
    els.authUserEmail.textContent = user.email;
    els.authMessage.textContent = "";
    localStorage.setItem("mfb_sg_auth_user_v1", JSON.stringify({ email: user.email }));
    document.querySelector('[data-step-card="1"]')?.setAttribute("hidden", "");

    try {
      window.showMfbLoader?.("Loading your saved delivery details…");
      const response = await fetch(`${API_URL}?action=getAccount&phone=&email=${encodeURIComponent(user.email)}`, { cache: "no-store" });
      const data = await response.json();
      if (data.ok && data.found) {
        populateProfile({ found: true, source: "Customers", customer: data.customer, address: data.address, addresses: data.addresses || [] });
        els.lookupMessage.textContent = "Your saved delivery address is ready.";
        els.lookupMessage.className = "form-message success";
      } else {
        populateProfile({ found: false, source: "New Customer", customer: { email: user.email }, address: {} });
        els.lookupMessage.textContent = "Welcome. Add your delivery details once; we’ll remember them for your next harvest.";
        els.lookupMessage.className = "form-message success";
      }
    } catch {
      populateProfile({ found: false, source: "New Customer", customer: { email: user.email }, address: {} });
      els.lookupMessage.textContent = "Add your delivery details to continue.";
      els.lookupMessage.className = "form-message";
    } finally {
      window.hideMfbLoader?.();
    }
  }

  async function startGoogleLogin() {
    els.googleLogin.disabled = true;
    els.googleLogin.textContent = "Opening Google…";
    try { window.showMfbLoader?.("Opening secure Google sign-in…"); await window.MFBAuth.signInWithGoogle(); }
    catch (error) {
      window.hideMfbLoader?.();
      els.authMessage.textContent = error.message || "Google sign-in could not start.";
      els.authMessage.className = "form-message error";
      els.googleLogin.disabled = false;
      els.googleLogin.innerHTML = '<span aria-hidden="true">G</span> Continue with Google';
    }
  }

  async function sendMagicLink() {
    const email = els.magicEmail.value.trim();
    if (!els.magicEmail.validity.valid || !email) {
      els.authMessage.textContent = "Enter a valid email address.";
      els.authMessage.className = "form-message error";
      return;
    }
    els.magicLogin.disabled = true;
    els.magicLogin.textContent = "Sending…";
    try {
      window.showMfbLoader?.("Sending your secure sign-in link…");
      await window.MFBAuth.sendMagicLink(email);
      els.authMessage.textContent = "Check your email and open the sign-in link to return here.";
      els.authMessage.className = "form-message success";
    } catch (error) {
      els.authMessage.textContent = error.message || "We could not send the sign-in link.";
      els.authMessage.className = "form-message error";
    } finally {
      window.hideMfbLoader?.();
      els.magicLogin.disabled = false;
      els.magicLogin.textContent = "Send link";
    }
  }

  function openGuestCheckout() {
    els.guestLookup.hidden = false;
    els.guestCheckout.hidden = true;
    els.lookupPhone.focus();
  }

  async function validateCheckout() {
    state.cart = window.MFBCart
      ? window.MFBCart.read()
      : readJson(CART_KEY, []);

    if (!state.cart.length) {
      throw new Error("Your harvest basket is empty.");
    }

    const data = await getProductsForCheckout();

    const productMap = new Map(
      data.products.map(product => [
        product.handleId,
        product
      ])
    );

    const refreshed = state.cart.map(item => {
      const live = productMap.get(item.productId);

      if (!live) {
        throw new Error(
          `${displayName(item.productName)} is no longer available.`
        );
      }

      const max = Math.min(
        Number(live.maxQuantity || live.stockUnits || 99),
        Number(live.stockUnits || 99)
      );

      if (Number(item.quantity) > max) {
        throw new Error(
          `${displayName(item.productName)} quantity is no longer available.`
        );
      }

      return {
        ...item,
        productName: live.name,
        imageUrl: live.imageUrl,
        unitLabel: live.unitLabel,
        unitValue: Number(live.unitValue),
        unitType: live.unitType,
        unitPrice: Number(live.price),
        minimumOrderExempt:
          live.minimumOrderExempt === true ||
          String(live.minimumOrderExempt)
            .trim()
            .toLowerCase() === "true",
        minQuantity:
          Number(live.minQuantity || 1),
        maxQuantity: max
      };
    });

    state.cart = refreshed;

    if (window.MFBCart) {
      window.MFBCart.write(refreshed);
    } else {
      writeJson(CART_KEY, refreshed);
    }

    state.settings = {
      minimumOrderKg:
        Number(data.settings?.minimumOrderKg || 5),
      maximumOrderKg:
        Number(
          data.settings?.maximumOrderKg ||
          window.MFBCart?.maximumOrderEquivalentKg ||
          20
        ),
      deliveryFee:
        Number(data.settings?.deliveryFee || 0)
    };

    const summary = totals(refreshed);

    if (!summary.withinMaximum) {
      throw new Error(
        `Your harvest exceeds the ${Number(
          summary.maximumKg || 20
        ).toFixed(0)} kg equivalent maximum. Please return to your cart and reduce the order.`
      );
    }

    if (
      !summary.minimumReached &&
      !summary.hasExemptProduct
    ) {
      throw new Error(
        `Add ${Number(
          summary.remainingMinimumKg ??
          summary.remainingKg ??
          0
        ).toFixed(2)} kg equivalent more, or choose a qualifying Combo Box.`
      );
    }

    state.delivery =
      data.delivery || null;

    const draftData = draft();

    if (draftData.delivery?.date) {
      els.deliveryDate.textContent =
        formatDeliveryDate(draftData.delivery.date);
    }

    renderSummary();
  }

  function formatDeliveryDate(dateValue) {
    if (!dateValue) return "Sunday";

    const date = new Date(`${dateValue}T00:00:00Z`);

    return new Intl.DateTimeFormat("en-SG", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC"
    }).format(date);
  }

  function collectPayload() {
    const draftData = draft();
    const summary = totals(state.cart);

    return {
      action: "createOrder",
      customer: {
        name: els.name.value.trim(),
        phone: els.phone.value.trim(),
        email: els.email.value.trim(),
        sourceWaitlistId:
          els.sourceWaitlistId.value.trim()
      },
      addressId: state.selectedAddressId,
      address: {
        label: "Home",
        addressLine: els.addressLine.value.trim(),
        unitNumber: els.unitNumber.value.trim(),
        building: els.building.value.trim(),
        postalCode: els.postalCode.value.trim(),
        placeName: els.placeName.value.trim(),
        deliveryInstructions:
          els.deliveryInstructions.value.trim(),
        latLong: els.latLong.value.trim()
      },
      items: state.cart.map(item => ({
        productId: item.productId,
        quantity: Number(item.quantity)
      })),
      paymentMethod: paymentMethod(),
      notes: draftData.notes || "",
      returns: Array.isArray(draftData.returns)
        ? draftData.returns
        : [],
      source: "myfarmbox.sg",
      clientSummary: {
        weightKg:
          Number(
            summary.equivalentKg ??
            summary.weightKg ??
            summary.weight ??
            0
          ),
        equivalentKg:
          Number(
            summary.equivalentKg ??
            summary.weightKg ??
            summary.weight ??
            0
          ),
        minimumKg:
          Number(summary.minimumKg || 5),
        maximumKg:
          Number(summary.maximumKg || 20),
        subtotal:
          Number(summary.subtotal || 0),
        qualified:
          Boolean(summary.qualified),
        withinMaximum:
          Boolean(summary.withinMaximum),
        hasExemptProduct:
          Boolean(summary.hasExemptProduct)
      }
    };
  }

  async function placeOrder() {
    updateCheckoutState();

    if (state.submitting) {
      return;
    }

    if (!formIsValid()) {
      showToast("Add delivery details", "Sign in and select a delivery address before continuing.");
      return;
    }

    state.submitting = true;
    els.placeOrder.disabled = true;
    els.placeOrder.textContent = "Preparing PayNow…";

    showConfirmingOverlay();
    resetPaymentDetails();

    const startedAt = Date.now();
    const minimumLoaderMs = 800;

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        body: JSON.stringify(collectPayload())
      });

      const data = await response.json();

      const elapsed = Date.now() - startedAt;

      if (elapsed < minimumLoaderMs) {
        await wait(minimumLoaderMs - elapsed);
      }

      if (!data.ok) {
        throw new Error(
          data.message || "Order creation failed."
        );
      }

      writeJson(CUSTOMER_SESSION_KEY, {
        customerId: data.customerId,
        phoneKey: normalizePhone(els.phone.value),
        name: els.name.value.trim(),
        orderId: data.orderId,
        updatedAt: new Date().toISOString()
      });

      if (window.MFBCart) {
        window.MFBCart.clear();
      } else {
        localStorage.removeItem(CART_KEY);

        if (
          typeof window.updateSharedCartCount === "function"
        ) {
          window.updateSharedCartCount();
        }
      }

      localStorage.removeItem(DRAFT_KEY);

      els.successOrderId.textContent = data.orderId;

      els.successDelivery.textContent =
        `Expected delivery: ${formatDeliveryDate(data.deliveryDate)}, between 9:00 a.m. and 9:00 p.m.`;

      hideConfirmingOverlay();
      els.successDialog.showModal();

      if (paymentMethod() !== "PayNow") {
        els.paymentStatus.textContent = data.paymentStatus || "Pending";
        els.paymentCopy.textContent =
          data.paymentInstructions || "Payment details will be shared shortly.";
        return;
      }

      try {
        const paymentResponse = await fetch(API_URL, {
          method: "POST",
          body: JSON.stringify({
            action: "createCheckoutPayment",
            orderId: data.orderId,
            customerId: data.customerId
          })
        });

        const payment = await paymentResponse.json();

        if (!payment.ok) {
          throw new Error(payment.message || "Could not prepare PayNow details.");
        }

        showPayNowDetails(payment, data.currency);
      } catch (paymentError) {
        els.paymentStatus.textContent = "Payment details are being prepared";
        els.paymentCopy.textContent =
          "Your order is confirmed. Our team will share the PayNow details shortly.";
      }

    } catch (error) {
      hideConfirmingOverlay();

      showToast(
        "Order not placed",
        error.message || "Please try again."
      );

    } finally {
      state.submitting = false;
      els.placeOrder.textContent = "Continue to PayNow";
      updateCheckoutState();
    }
  }

  async function initialise() {
    try {
      await validateCheckout();

      els.guard.hidden = true;
      els.layout.hidden = false;

      const session = readJson(CUSTOMER_SESSION_KEY, {});
      const draftData = draft();

      if (session.phoneKey) {
        els.lookupPhone.value = session.phoneKey;
      }

      const user = await window.MFBAuth?.getUser();
      if (user) await loadSignedInProfile(user);

      if (draftData.delivery?.date) {
        els.deliveryDate.textContent =
          formatDeliveryDate(draftData.delivery.date);
      }

      renderSummary();
      updateCheckoutState();
    } catch (error) {
      hideConfirmingOverlay();
      els.guard.hidden = true;
      els.empty.hidden = false;
      els.emptyMessage.textContent =
        error.message || "Please review your harvest.";
    }
  }

  els.lookupButton.addEventListener("click", lookupCustomer);
  els.googleLogin.addEventListener("click", startGoogleLogin);
  els.magicLogin.addEventListener("click", sendMagicLink);
  els.guestCheckout.addEventListener("click", openGuestCheckout);
  els.signOut.addEventListener("click", async () => {
    await window.MFBAuth?.signOut();
    localStorage.removeItem("mfb_sg_auth_user_v1");
    window.location.reload();
  });

  els.lookupPhone.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      lookupCustomer();
    }
  });

  els.form.addEventListener("input", updateCheckoutState);
  els.useCurrentLocation.addEventListener(
    "click",
    useCurrentLocationForDelivery
  );
  document
    .querySelectorAll('input[name="paymentMethod"]')
    .forEach(input => {
      input.addEventListener("change", updateCheckoutState);
    });

  els.placeOrder.addEventListener("click", placeOrder);

  els.closeSuccess.addEventListener("click", () => {
    els.successDialog.close();
    window.location.href = "/";
  });

  window.MFBAuth?.onChange(user => {
    if (user?.email && !state.lookupComplete) {
      loadSignedInProfile(user);
    }
  });

  initialise();
})();
