
/*
UI UPDATE (v9 — fast cached product loading)
- Cards should display "In Harvest" state when quantity > 0 in cart.
- Quantity shown as "🧺 X added".
- Card receives class 'in-cart'.
- Add button changes to "Update".
This package is prepared for integrating those UI hooks.
*/
(() => {
  "use strict";

  const API_URL =
    "https://script.google.com/macros/s/AKfycbw4ioZTLJKaFXWad3zJqyWXzde7-I5S6Q9LndoF2zu7EzgnEku75U2nAkceQBXLjpJi/exec";

  const CART_STORAGE_KEY = "mfb_sg_cart_v1";
  const DEFAULT_MINIMUM_ORDER_KG = 5;
  const INITIAL_RENDER_COUNT = 15;
  const RENDER_BATCH_SIZE = 9;
  const IMAGE_TIMEOUT_MS = 3000;
  const PRODUCT_CACHE_KEY = "mfb_sg_products_cache_v2";
  const PRODUCT_CACHE_MAX_AGE_MS = 10 * 60 * 1000;

  const state = {
    products: [],
    filteredProducts: [],
    quantities: new Map(),
    activeCategory: "all",
    searchTerm: "",
    minimumOrderKg: DEFAULT_MINIMUM_ORDER_KG,
    renderedCount: 0,
    renderToken: 0,
    toastTimer: null,
    observer: null
  };

  const elements = {
    grid: document.getElementById("product-grid"),
    loading: document.getElementById("loading-state"),
    error: document.getElementById("error-state"),
    empty: document.getElementById("empty-state"),
    summary: document.getElementById("results-summary"),
    search: document.getElementById("search-input"),
    filters: document.getElementById("category-filters"),
    cartCount: document.getElementById("cart-count"),
    retry: document.getElementById("retry-button"),
    clearFilters: document.getElementById("clear-filters-button"),
    toast: document.getElementById("cart-toast"),
    toastTitle: document.getElementById("cart-toast-title"),
    toastCopy: document.getElementById("cart-toast-copy"),
    minimumStatus: document.getElementById("minimum-status"),
    minimumWeight: document.getElementById("minimum-weight"),
    minimumProgress: document.getElementById("minimum-progress"),
    dockStatus: document.getElementById("dock-status"),
    dockWeight: document.getElementById("dock-weight"),
    dockProgressFill: document.getElementById("dock-progress-fill"),
    dockTotal: document.getElementById("dock-total"),
    checkoutButton: document.getElementById("checkout-button"),
    renderStatus: document.getElementById("render-status")
  };

  function readProductCache() {
    try {
      const cached = JSON.parse(
        localStorage.getItem(PRODUCT_CACHE_KEY) || "null"
      );

      if (
        !cached ||
        !cached.savedAt ||
        !cached.data ||
        !Array.isArray(cached.data.products)
      ) {
        return null;
      }

      return cached;
    } catch {
      return null;
    }
  }

  function writeProductCache(data) {
    try {
      localStorage.setItem(
        PRODUCT_CACHE_KEY,
        JSON.stringify({
          savedAt: Date.now(),
          data
        })
      );
    } catch {
      // Storage may be unavailable or full.
    }
  }

  function applyProductData(data) {
    state.products = data.products;
    state.minimumOrderKg = Number(
      data.settings?.minimumOrderKg ||
      DEFAULT_MINIMUM_ORDER_KG
    );

    state.products.forEach(product =>
      getQuantity(product)
    );

    hydrateCartFromProducts();

    renderFilters(
      Array.isArray(data.categories)
        ? data.categories
        : [
            ...new Set(
              data.products.map(
                product => product.collection
              )
            )
          ]
    );

    elements.loading.hidden = true;
    elements.error.hidden = true;
    elements.grid.hidden = false;

    applyFilters();
    updateCartSummary();
  }

  function readCart() {
    if (window.MFBCart) {
      return window.MFBCart.read();
    }

    try {
      const value = JSON.parse(
        localStorage.getItem(CART_STORAGE_KEY) || "[]"
      );

      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function writeCart(cart) {
    if (window.MFBCart) {
      window.MFBCart.write(cart);
    } else {
      localStorage.setItem(
        CART_STORAGE_KEY,
        JSON.stringify(cart)
      );

      if (
        typeof window.updateSharedCartCount === "function"
      ) {
        window.updateSharedCartCount();
      }
    }

    updateCartSummary();
  }

  function unitWeightKg(item) {
    const directWeight = Number(
      item.weightKg ||
      item.unitWeightKg ||
      0
    );

    if (directWeight > 0) {
      return directWeight;
    }

    let value = Number(item.unitValue || 0);
    let unit = String(item.unitType || "")
      .trim()
      .toLowerCase();

    if ((!value || !unit) && item.unitLabel) {
      const match = String(item.unitLabel)
        .trim()
        .toLowerCase()
        .match(/([0-9]*\.?[0-9]+)\s*(kg|g|kilogram|kilograms|gram|grams)\b/);

      if (match) {
        value = Number(match[1] || 0);
        unit = match[2] || "";
      }
    }

    if (
      unit === "kg" ||
      unit === "kilogram" ||
      unit === "kilograms"
    ) {
      return value;
    }

    if (
      unit === "g" ||
      unit === "gram" ||
      unit === "grams"
    ) {
      return value / 1000;
    }

    return 0;
  }

  function calculateCartWeightKg(cart = readCart()) {
    return cart.reduce(
      (total, item) =>
        total +
        unitWeightKg(item) *
        Number(item.quantity || 0),
      0
    );
  }

  function hasMinimumOrderExemptProduct(cart = readCart()) {
    return cart.some(
      item =>
        item.minimumOrderExempt === true &&
        Number(item.quantity || 0) > 0
    );
  }

  function getCartEligibility(cart = readCart()) {
    if (window.MFBCart) {
      return window.MFBCart.summarize(
        cart,
        {
          minimumKg:
            Number(
              state.minimumOrderKg ||
              DEFAULT_MINIMUM_ORDER_KG
            )
        }
      );
    }

    const weightKg = calculateCartWeightKg(cart);
    const minimumKg = Number(
      state.minimumOrderKg ||
      DEFAULT_MINIMUM_ORDER_KG
    );
    const exempt =
      hasMinimumOrderExemptProduct(cart);

    return {
      weightKg,
      minimumKg,
      exempt,
      hasExemptProduct: exempt,
      qualified:
        weightKg >= minimumKg ||
        exempt,
      subtotal: cart.reduce(
        (sum, item) =>
          sum +
          Number(
            item.unitPrice ||
            item.price ||
            0
          ) *
          Number(item.quantity || 0),
        0
      )
    };
  }

  function hydrateCartFromProducts() {
    const cart = readCart();

    if (!cart.length || !state.products.length) {
      return;
    }

    if (window.MFBCart) {
      window.MFBCart.hydrateFromProducts(
        cart,
        state.products
      );
      return;
    }

    let changed = false;

    cart.forEach(item => {
      const product = state.products.find(
        entry => entry.handleId === item.productId
      );

      if (!product) return;

      const updates = {
        productName: product.name,
        tanglish: product.tanglish,
        collection: product.collection,
        imageUrl: normalizeImageUrl(product.imageUrl),
        unitLabel: product.unitLabel,
        unitValue: Number(product.unitValue || 0),
        unitType: product.unitType,
        unitPrice: Number(product.price || 0),
        minimumOrderExempt:
          Boolean(product.minimumOrderExempt),
        minQuantity:
          Number(product.minQuantity || 1),
        maxQuantity:
          Number(
            product.maxQuantity ||
            product.stockUnits ||
            99
          ),
        incrementBy:
          Number(product.incrementBy || 1)
      };

      Object.entries(updates).forEach(([key, value]) => {
        if (item[key] !== value) {
          item[key] = value;
          changed = true;
        }
      });
    });

    if (changed) {
      localStorage.setItem(
        CART_STORAGE_KEY,
        JSON.stringify(cart)
      );
    }
  }

  function updateCartSummary() {
    const cart = readCart();

    const count = cart.reduce(
      (total, item) =>
        total + Number(item.quantity || 0),
      0
    );

    const eligibility = getCartEligibility(cart);
    const {
      weightKg,
      minimumKg,
      qualified
    } = eligibility;

    const exempt =
      eligibility.hasExemptProduct ??
      eligibility.exempt ??
      false;

    const subtotal =
      Number(eligibility.subtotal || 0);

    const remainingKg =
      Math.max(0, minimumKg - weightKg);

    const progress = exempt
      ? 100
      : minimumKg > 0
        ? Math.min(
            100,
            (weightKg / minimumKg) * 100
          )
        : 100;

    elements.cartCount.textContent = String(count);

    elements.minimumWeight.textContent =
      `${weightKg.toFixed(2)} / ${minimumKg.toFixed(2)} kg`;

    elements.minimumProgress.style.width =
      `${progress}%`;

    elements.dockProgressFill.style.width =
      `${progress}%`;

    elements.dockWeight.textContent =
      `${weightKg.toFixed(2)} / ${minimumKg.toFixed(2)} kg`;

    if (elements.dockTotal) {
      elements.dockTotal.textContent =
        currency(subtotal);
    }

    if (exempt) {
      elements.minimumStatus.textContent =
        "Your harvest is ready for purchase.";

      elements.dockStatus.textContent =
        "Harvest ready ✓";

      elements.minimumWeight.textContent =
        "Complete harvest selected";

      elements.dockWeight.textContent =
        "Ready for purchase";

      elements.minimumProgress.style.width =
        "100%";

      elements.dockProgressFill.style.width =
        "100%";

      if (elements.dockTotal) {
        elements.dockTotal.textContent =
          currency(subtotal);
      }

      elements.checkoutButton.classList.remove(
        "disabled"
      );

      elements.checkoutButton.setAttribute(
        "aria-disabled",
        "false"
      );

      return;
    }

    if (qualified) {
      elements.minimumStatus.textContent =
        "Your harvest is ready.";

      elements.dockStatus.textContent =
        "Ready for checkout ✓";

      elements.checkoutButton.classList.remove(
        "disabled"
      );

      elements.checkoutButton.setAttribute(
        "aria-disabled",
        "false"
      );
    } else {
      elements.minimumStatus.textContent =
        `Add another ${remainingKg.toFixed(2)} kg.`;

      elements.dockStatus.textContent =
        `Add ${remainingKg.toFixed(2)} kg more`;

      elements.checkoutButton.classList.add(
        "disabled"
      );

      elements.checkoutButton.setAttribute(
        "aria-disabled",
        "true"
      );
    }
  }

  function normalizeImageUrl(url) {
    const value = String(url || "").trim();

    if (!value) return "";

    if (
      value.startsWith("https://") ||
      value.startsWith("http://") ||
      value.startsWith("/")
    ) {
      return value;
    }

    return `/${value.replace(/^\.\//, "")}`;
  }

  function productDisplayName(product) {
    const raw = String(product.name || product.tanglish || "Fresh produce").trim();
    const parts = raw.split(" - ");

    if (parts.length > 1) {
      return {
        primary: parts.slice(1).join(" - ").trim(),
        native: parts[0].trim()
      };
    }

    return {
      primary: raw,
      native: product.tanglish || ""
    };
  }

  function currency(value) {
    return new Intl.NumberFormat("en-SG", {
      style: "currency",
      currency: "SGD",
      minimumFractionDigits: 2
    }).format(Number(value || 0));
  }

  function totalPhysicalQuantity(product, quantity) {
    const total = Number(product.unitValue || 1) * Number(quantity || 1);
    const unit = String(product.unitType || "").trim();

    if (unit === "g" && total >= 1000) {
      const kg = total / 1000;
      return `${Number.isInteger(kg) ? kg : kg.toFixed(2)} kg`;
    }

    if (unit === "ml" && total >= 1000) {
      const litres = total / 1000;
      return `${Number.isInteger(litres) ? litres : litres.toFixed(2)} l`;
    }

    return `${Number.isInteger(total) ? total : total.toFixed(2)} ${unit}`.trim();
  }

  function getQuantity(product) {
    if (!state.quantities.has(product.handleId)) {
      state.quantities.set(
        product.handleId,
        Math.max(1, Number(product.minQuantity || 1))
      );
    }

    return state.quantities.get(product.handleId);
  }

  function setQuantity(product, nextValue) {
    const min = Math.max(1, Number(product.minQuantity || 1));
    const max = Math.min(
      Number(product.maxQuantity || product.stockUnits || 99),
      Number(product.stockUnits || 99)
    );
    const increment = Math.max(1, Number(product.incrementBy || 1));

    let value = Math.max(min, Math.min(max, Number(nextValue || min)));
    const steps = Math.round((value - min) / increment);
    value = Math.max(min, Math.min(max, min + steps * increment));

    state.quantities.set(product.handleId, value);
    updateProductQuantityUI(product);
  }

  function updateProductQuantityUI(product) {
    const card = document.querySelector(
      `[data-product-id="${CSS.escape(product.handleId)}"]`
    );

    if (!card) return;

    const quantity = getQuantity(product);
    const min = Math.max(1, Number(product.minQuantity || 1));
    const max = Math.min(
      Number(product.maxQuantity || product.stockUnits || 99),
      Number(product.stockUnits || 99)
    );

    card.querySelector("[data-quantity-value]").textContent = String(quantity);
    card.querySelector("[data-quantity-minus]").disabled = quantity <= min;
    card.querySelector("[data-quantity-plus]").disabled = quantity >= max;
    card.querySelector("[data-product-total]").textContent =
      `${totalPhysicalQuantity(product, quantity)} · ` +
      `${currency(Number(product.price || 0) * quantity)}`;
  }

  function initialiseImage(card, imageUrl) {
    const image = card.querySelector(".product-image");
    const loading = card.querySelector(".image-loading");
    const placeholder = card.querySelector(".product-placeholder");

    if (!image || !imageUrl) {
      if (loading) loading.hidden = true;
      if (placeholder) placeholder.hidden = false;
      return;
    }

    let settled = false;

    function showImage() {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      loading.hidden = true;
      placeholder.hidden = true;
      image.classList.add("loaded");
    }

    function showFallback() {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      image.hidden = true;
      loading.hidden = true;
      placeholder.hidden = false;
    }

    const timer = window.setTimeout(showFallback, IMAGE_TIMEOUT_MS);

    image.addEventListener("load", showImage, { once: true });
    image.addEventListener("error", showFallback, { once: true });

    if (image.complete) {
      image.naturalWidth > 0 ? showImage() : showFallback();
    }
  }

  function createProductCard(product, renderIndex = 0) {
    const name = productDisplayName(product);
    const imageUrl = normalizeImageUrl(product.imageUrl);
    const quantity = getQuantity(product);

    const card = document.createElement("article");
    card.className = "product-card";
    card.dataset.productId = product.handleId;

    card.innerHTML = `
      <div class="product-image-wrap">
        ${
          imageUrl
            ? `<img
                class="product-image"
                src="${escapeHtml(imageUrl)}"
                alt="${escapeHtml(name.primary)}"
                loading="${renderIndex < 6 ? "eager" : "lazy"}"
                decoding="async"
                fetchpriority="${renderIndex < 6 ? "high" : "auto"}"
              >`
            : ""
        }

        <div class="image-loading"${imageUrl ? "" : " hidden"}></div>

        <div class="product-placeholder"${imageUrl ? " hidden" : ""}>
          <div>
            <span aria-hidden="true">🌿</span>
            <strong>MyFarmBox</strong>
          </div>
        </div>

        <span class="product-category">
          ${escapeHtml(product.collection || "Harvest")}
        </span>

        ${
          product.minimumOrderExempt === true
            ? `
              <span class="complete-harvest-badge">
                Complete harvest
              </span>
            `
            : ""
        }
      </div>

      <div class="product-body">
        <h2 class="product-title">${escapeHtml(name.primary)}</h2>
        <p class="product-native">${escapeHtml(name.native)}</p>

        <span class="product-unit">${escapeHtml(product.unitLabel)}</span>
        <strong class="product-price">${currency(product.price)}</strong>

        <div class="product-controls">
          <div class="quantity-control">
            <button type="button" data-quantity-minus aria-label="Reduce quantity">−</button>
            <span class="quantity-value" data-quantity-value>${quantity}</span>
            <button type="button" data-quantity-plus aria-label="Increase quantity">+</button>
          </div>

          <button class="add-button" type="button" data-add-to-cart>Add</button>
        </div>

        <p class="product-total" data-product-total></p>
      </div>
    `;

    initialiseImage(card, imageUrl);

    card.querySelector("[data-quantity-minus]").addEventListener("click", () => {
      setQuantity(
        product,
        getQuantity(product) - Number(product.incrementBy || 1)
      );
    });

    card.querySelector("[data-quantity-plus]").addEventListener("click", () => {
      setQuantity(
        product,
        getQuantity(product) + Number(product.incrementBy || 1)
      );
    });

    card.querySelector("[data-add-to-cart]").addEventListener("click", event => {
      addToCart(product, getQuantity(product), event.currentTarget);
    });

    requestAnimationFrame(() => updateProductQuantityUI(product));

    return card;
  }

  function addToCart(product, quantity, button) {
    const cart = readCart();
    const existing = cart.find(item => item.productId === product.handleId);

    if (existing) {
      existing.quantity = Math.min(
        Number(product.maxQuantity || product.stockUnits || 99),
        Number(existing.quantity || 0) + Number(quantity || 1)
      );
      existing.unitPrice = Number(product.price);
      existing.unitLabel = product.unitLabel;
      existing.unitValue = Number(product.unitValue);
      existing.unitType = product.unitType;
      existing.imageUrl = normalizeImageUrl(product.imageUrl);
      existing.productName = product.name;
      existing.collection = product.collection;
      existing.minimumOrderExempt =
        Boolean(product.minimumOrderExempt);
    } else {
      cart.push({
        productId: product.handleId,
        productName: product.name,
        tanglish: product.tanglish,
        collection: product.collection,
        imageUrl: normalizeImageUrl(product.imageUrl),
        unitLabel: product.unitLabel,
        unitValue: Number(product.unitValue),
        unitType: product.unitType,
        unitPrice: Number(product.price),
        quantity: Number(quantity),
        minQuantity: Number(product.minQuantity || 1),
        maxQuantity: Number(product.maxQuantity || product.stockUnits || 99),
        incrementBy: Number(product.incrementBy || 1),
        minimumOrderExempt:
          Boolean(product.minimumOrderExempt)
      });
    }

    writeCart(cart);

    const original = button.textContent;
    button.textContent = "✓";

    window.setTimeout(() => {
      button.textContent = original;
    }, 900);

    const displayName = productDisplayName(product).primary;

    showToast(
      "Added to your harvest",
      `${quantity} × ${displayName}`
    );
  }

  function showToast(title, copy) {
    elements.toastTitle.textContent = title;
    elements.toastCopy.textContent = copy;
    elements.toast.hidden = false;

    clearTimeout(state.toastTimer);

    state.toastTimer = window.setTimeout(() => {
      elements.toast.hidden = true;
    }, 2500);
  }

  function renderFilters(categories) {
    elements.filters.innerHTML = `
      <button class="filter-chip active" type="button" data-category="all">
        All
      </button>
    `;

    categories.forEach(category => {
      const button = document.createElement("button");
      button.className = "filter-chip";
      button.type = "button";
      button.dataset.category = category;
      button.textContent = category;
      elements.filters.appendChild(button);
    });
  }

  function applyFilters() {
    const term = state.searchTerm.trim().toLowerCase();

    state.filteredProducts = state.products.filter(product => {
      const categoryMatch =
        state.activeCategory === "all" ||
        product.collection === state.activeCategory;

      const searchable = [
        product.name,
        product.tanglish,
        product.collection,
        product.unitLabel,
        product.description
      ].join(" ").toLowerCase();

      return categoryMatch && (!term || searchable.includes(term));
    });

    renderProducts();
  }

  function renderProducts() {
    state.renderToken += 1;
    const token = state.renderToken;

    state.renderedCount = 0;
    elements.grid.innerHTML = "";
    elements.renderStatus.hidden = true;

    const total = state.filteredProducts.length;

    elements.summary.textContent =
      total === 1 ? "1 product" : `${total} products`;

    elements.empty.hidden = total > 0;
    elements.grid.hidden = total === 0;

    if (!total) return;

    renderNextBatch(token, INITIAL_RENDER_COUNT);
  }

  function renderNextBatch(token, batchSize = RENDER_BATCH_SIZE) {
    if (token !== state.renderToken) return;

    const start = state.renderedCount;
    const end = Math.min(
      start + batchSize,
      state.filteredProducts.length
    );

    const fragment = document.createDocumentFragment();

    for (let index = start; index < end; index += 1) {
      fragment.appendChild(
        createProductCard(
          state.filteredProducts[index],
          index
        )
      );
    }

    elements.grid.appendChild(fragment);
    state.renderedCount = end;

    if (state.renderedCount < state.filteredProducts.length) {
      elements.renderStatus.hidden = false;

      requestAnimationFrame(() => {
        window.setTimeout(() => {
          renderNextBatch(token);
        }, 45);
      });
    } else {
      elements.renderStatus.hidden = true;
    }
  }

  async function loadProducts() {
    const cached = readProductCache();
    const cacheIsFresh =
      cached &&
      Date.now() - cached.savedAt <
        PRODUCT_CACHE_MAX_AGE_MS;

    if (cached) {
      applyProductData(cached.data);

      elements.summary.textContent =
        cacheIsFresh
          ? "Showing this week’s harvest"
          : "Refreshing this week’s harvest…";
    } else {
      elements.loading.hidden = false;
      elements.error.hidden = true;
      elements.empty.hidden = true;
      elements.grid.hidden = true;
      elements.summary.textContent =
        "Loading this week’s harvest…";
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      12000
    );

    try {
      const response = await fetch(
        `${API_URL}?action=getProducts`,
        {
          method: "GET",
          cache: "no-store",
          signal: controller.signal
        }
      );

      if (!response.ok) {
        throw new Error(
          `Product API returned ${response.status}`
        );
      }

      const data = await response.json();

      if (
        !data.ok ||
        !Array.isArray(data.products)
      ) {
        throw new Error(
          data.message ||
          "Invalid product response"
        );
      }

      writeProductCache(data);

      const cachedSignature = cached
        ? JSON.stringify({
            generatedAt:
              cached.data.generatedAt || "",
            count:
              cached.data.count ||
              cached.data.products.length,
            products:
              cached.data.products.map(product => [
                product.handleId,
                product.price,
                product.available,
                product.stockUnits,
                product.imageUrl,
                product.description,
                product.minimumOrderExempt,
                product.updatedAt
              ])
          })
        : "";

      const liveSignature = JSON.stringify({
        generatedAt:
          data.generatedAt || "",
        count:
          data.count ||
          data.products.length,
        products:
          data.products.map(product => [
            product.handleId,
            product.price,
            product.available,
            product.stockUnits,
            product.imageUrl,
            product.description,
            product.minimumOrderExempt,
            product.updatedAt
          ])
      });

      if (
        !cached ||
        cachedSignature !== liveSignature
      ) {
        applyProductData(data);
      } else {
        elements.summary.textContent =
          data.count === 1
            ? "1 product"
            : `${data.count} products`;

        updateCartSummary();
      }
    } catch (error) {
      console.error(
        "Unable to refresh products:",
        error
      );

      if (!cached) {
        elements.loading.hidden = true;
        elements.grid.hidden = true;
        elements.error.hidden = false;
        elements.summary.textContent =
          "Harvest unavailable";
      } else {
        elements.error.hidden = true;
        elements.summary.textContent =
          `${state.filteredProducts.length} products`;
      }
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function clearFilters() {
    state.activeCategory = "all";
    state.searchTerm = "";
    elements.search.value = "";

    elements.filters.querySelectorAll(".filter-chip").forEach(chip => {
      chip.classList.toggle("active", chip.dataset.category === "all");
    });

    applyFilters();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  elements.search.addEventListener("input", event => {
    state.searchTerm = event.target.value;
    applyFilters();
  });

  elements.filters.addEventListener("click", event => {
    const button = event.target.closest("[data-category]");
    if (!button) return;

    state.activeCategory = button.dataset.category;

    elements.filters.querySelectorAll(".filter-chip").forEach(chip => {
      chip.classList.toggle("active", chip === button);
    });

    applyFilters();
  });

  elements.retry.addEventListener("click", loadProducts);
  elements.clearFilters.addEventListener("click", clearFilters);

  elements.checkoutButton.addEventListener(
    "click",
    event => {
      if (!getCartEligibility().qualified) {
        event.preventDefault();
      }
    }
  );

  updateCartSummary();
  loadProducts();
})();