(() => {
  "use strict";

  const API_URL =
    "https://script.google.com/macros/s/AKfycbw4ioZTLJKaFXWad3zJqyWXzde7-I5S6Q9LndoF2zu7EzgnEku75U2nAkceQBXLjpJi/exec";

  const CART_KEY = "mfb_sg_cart_v1";
  const DRAFT_KEY = "mfb_sg_checkout_draft_v1";
  const CUSTOMER_SESSION_KEY = "mfb_sg_customer_session_v1";

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
    sourceWaitlistId: $("source-waitlist-id"),
    detailsConfirmed: $("details-confirmed"),
    deliveryDate: $("delivery-date"),
    termsConfirmed: $("terms-confirmed"),
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
    paymentCopy: $("payment-copy"),
    closeSuccess: $("close-success-button"),
    toast: $("toast"),
    toastTitle: $("toast-title"),
    toastCopy: $("toast-copy"),
    confirmingOverlay: $("confirming-overlay")
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
      els.detailsConfirmed.checked &&
      els.termsConfirmed.checked &&
      state.cart.length &&
      summary.qualified
    );
  }

  function updateCheckoutState() {
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
      els.warning.textContent = "Find your profile to continue.";
      els.warning.className = "checkout-warning";
    } else if (!els.detailsConfirmed.checked) {
      els.warning.textContent =
        "Please confirm your profile and address.";
      els.warning.className = "checkout-warning";
    } else if (!els.termsConfirmed.checked) {
      els.warning.textContent =
        "Please confirm the harvest terms.";
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
      els.lookupButton.disabled = false;
      els.lookupButton.textContent = "Find My Profile";
    }
  }

  async function validateCheckout() {
    state.cart = window.MFBCart
      ? window.MFBCart.read()
      : readJson(CART_KEY, []);

    if (!state.cart.length) {
      throw new Error("Your harvest basket is empty.");
    }

    const response = await fetch(
      `${API_URL}?action=getProducts`,
      { cache: "no-store" }
    );

    const data = await response.json();

    if (!data.ok || !Array.isArray(data.products)) {
      throw new Error("We couldn’t validate the current harvest.");
    }

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

    if (!formIsValid() || state.submitting) {
      return;
    }

    state.submitting = true;
    els.placeOrder.disabled = true;
    els.placeOrder.textContent = "Confirming Harvest…";

    showConfirmingOverlay();

    const startedAt = Date.now();
    const minimumLoaderMs = 800;

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        body: JSON.stringify(collectPayload())
      });

      const data = await response.json();

      const elapsed =
        Date.now() - startedAt;

      if (elapsed < minimumLoaderMs) {
        await wait(
          minimumLoaderMs - elapsed
        );
      }

      if (!data.ok) {
        throw new Error(
          data.message ||
          "Order creation failed."
        );
      }

      writeJson(
        CUSTOMER_SESSION_KEY,
        {
          customerId: data.customerId,
          phoneKey:
            normalizePhone(
              els.phone.value
            ),
          name:
            els.name.value.trim(),
          orderId:
            data.orderId,
          updatedAt:
            new Date().toISOString()
        }
      );

      if (window.MFBCart) {
        window.MFBCart.clear();
      } else {
        localStorage.removeItem(
          CART_KEY
        );

        if (
          typeof window.updateSharedCartCount ===
          "function"
        ) {
          window.updateSharedCartCount();
        }
      }

      localStorage.removeItem(
        DRAFT_KEY
      );

      els.successOrderId.textContent =
        data.orderId;

      els.successDelivery.textContent =
        `Expected delivery: ${formatDeliveryDate(
          data.deliveryDate
        )}, between 9:00 a.m. and 9:00 p.m.`;

      els.paymentCopy.textContent =
        data.paymentInstructions ||
        "Our Singapore team will share the payment instructions.";

      hideConfirmingOverlay();

      els.successDialog.showModal();

    } catch (error) {
      hideConfirmingOverlay();

      showToast(
        "Order not placed",
        error.message ||
        "Please try again."
      );

    } finally {
      state.submitting = false;
      els.placeOrder.textContent =
        "Place Harvest Order";

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

  els.lookupPhone.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      lookupCustomer();
    }
  });

  els.form.addEventListener("input", updateCheckoutState);
  els.detailsConfirmed.addEventListener(
    "change",
    updateCheckoutState
  );
  els.termsConfirmed.addEventListener(
    "change",
    updateCheckoutState
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

  initialise();
})();
