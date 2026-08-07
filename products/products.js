/*
MyFarmBox Singapore Products v41
Loading order:
1. Browser cache
2. /data/products.json
3. Apps Script API
4. Error only when all sources are unavailable
*/

(() => {
  "use strict";

  const config = window.MFB_PRODUCTS_CONFIG;
  const cartStore = window.MFBCart;

  const state = {
    products: [],
    filteredProducts: [],
    activeCategory: "all",
    searchTerm: "",
    minimumOrderKg: config.DEFAULT_MINIMUM_ORDER_KG,
    renderedCount: 0,
    renderToken: 0,
    toastTimer: null
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

  const PRODUCTS_JSON_URL =
    "/data/products.json";

  const PRODUCT_CACHE_KEY =
    "mfb_sg_products_cache_v3";

  const PRODUCT_CACHE_MAX_AGE_MS =
    24 * 60 * 60 * 1000;

  const STATIC_FETCH_TIMEOUT_MS =
    8000;

  const API_FETCH_TIMEOUT_MS =
    15000;

  function isValidProductPayload(data) {
    return Boolean(
      data &&
      data.ok !== false &&
      Array.isArray(data.products) &&
      data.products.length > 0
    );
  }

  function readProductCache() {
    try {
      const cached = JSON.parse(
        localStorage.getItem(
          PRODUCT_CACHE_KEY
        ) || "null"
      );

      if (
        !cached ||
        !cached.savedAt ||
        !isValidProductPayload(
          cached.data
        )
      ) {
        return null;
      }

      return cached;
    } catch (error) {
      console.warn(
        "Product cache could not be read:",
        error
      );

      return null;
    }
  }

  function writeProductCache(data) {
    if (!isValidProductPayload(data)) {
      return;
    }

    try {
      localStorage.setItem(
        PRODUCT_CACHE_KEY,
        JSON.stringify({
          savedAt: Date.now(),
          data
        })
      );
    } catch (error) {
      console.warn(
        "Product cache could not be saved:",
        error
      );
    }
  }

  function productPayloadSignature(data) {
    if (!isValidProductPayload(data)) {
      return "";
    }

    return JSON.stringify({
      generatedAt:
        data.generatedAt || "",
      count:
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
  }

  function applyProductData(data) {
    if (!isValidProductPayload(data)) {
      throw new Error(
        "Product catalogue is empty or invalid."
      );
    }

    state.products = data.products;

    state.minimumOrderKg = Number(
      data.settings?.minimumOrderKg ||
      config.DEFAULT_MINIMUM_ORDER_KG
    );

    if (
      typeof cartStore.hydrateFromProducts ===
      "function"
    ) {
      cartStore.hydrateFromProducts(
        cartStore.read(),
        state.products
      );
    }

    const categories =
      Array.isArray(data.categories) &&
      data.categories.length
        ? data.categories
        : [
            ...new Set(
              state.products
                .map(product =>
                  product.collection
                )
                .filter(Boolean)
            )
          ];

    renderFilters(categories);

    elements.loading.hidden = true;
    elements.error.hidden = true;
    elements.grid.hidden = false;

    applyFilters();
    updateSummary();
  }

  async function fetchJsonWithTimeout(
    url,
    timeoutMs
  ) {
    const controller =
      new AbortController();

    const timeout =
      window.setTimeout(
        () => controller.abort(),
        timeoutMs
      );

    try {
      const response = await fetch(
        url,
        {
          method: "GET",
          cache: "no-store",
          signal: controller.signal
        }
      );

      if (!response.ok) {
        throw new Error(
          `${url} returned ${response.status}`
        );
      }

      const data =
        await response.json();

      if (!isValidProductPayload(data)) {
        throw new Error(
          "Invalid product catalogue response."
        );
      }

      return data;

    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function fetchWithRetry(
    loader,
    attempts = 2,
    initialDelayMs = 1200
  ) {
    let lastError = null;

    for (
      let attempt = 1;
      attempt <= attempts;
      attempt += 1
    ) {
      try {
        return await loader();
      } catch (error) {
        lastError = error;

        if (attempt < attempts) {
          await new Promise(resolve =>
            window.setTimeout(
              resolve,
              initialDelayMs * attempt
            )
          );
        }
      }
    }

    throw lastError;
  }

  function currency(value) {
    return new Intl.NumberFormat("en-SG", {
      style: "currency",
      currency: "SGD",
      minimumFractionDigits: 2
    }).format(Number(value || 0));
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

  function displayName(product) {
    const raw = String(
      product.name || product.tanglish || "Fresh produce"
    ).trim();

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

  function totalPhysicalQuantity(product, quantity) {
    const total =
      Number(product.unitValue || 1) *
      Number(quantity || 1);

    const unit = String(product.unitType || "").trim();

    if (unit === "g" && total >= 1000) {
      const kg = total / 1000;
      return `${Number.isInteger(kg) ? kg : kg.toFixed(2)} kg`;
    }

    if (unit === "ml" && total >= 1000) {
      const litre = total / 1000;
      return `${Number.isInteger(litre) ? litre : litre.toFixed(2)} l`;
    }

    return `${Number.isInteger(total) ? total : total.toFixed(2)} ${unit}`.trim();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function updateSummary() {
    const cart = cartStore.read();
    const itemCount = cartStore.totalItems(cart);
    const weightKg = cartStore.totalWeightKg(cart);
    const total = cartStore.totalValue(cart);
    const minimumKg = Number(state.minimumOrderKg);
    const remaining = Math.max(0, minimumKg - weightKg);
    const hasExemptProduct = cart.some(
      item =>
        isMinimumOrderExempt(
          item.minimumOrderExempt
        ) &&
        Number(item.quantity || 0) > 0
    );

    const ready =
      weightKg >= minimumKg ||
      hasExemptProduct;

    const progress = hasExemptProduct
      ? 100
      : minimumKg > 0
        ? Math.min(100, (weightKg / minimumKg) * 100)
        : 100;

    elements.cartCount.textContent = String(itemCount);
    elements.minimumWeight.textContent =
      `${weightKg.toFixed(2)} / ${minimumKg.toFixed(2)} kg`;
    elements.minimumProgress.style.width = `${progress}%`;
    elements.dockProgressFill.style.width = `${progress}%`;
    elements.dockWeight.textContent =
      `${weightKg.toFixed(2)} / ${minimumKg.toFixed(2)} kg`;
    elements.dockTotal.textContent = currency(total);

    if (hasExemptProduct) {
      elements.minimumStatus.textContent =
        "Your harvest is ready for purchase.";

      elements.minimumWeight.textContent =
        "Complete harvest selected";

      elements.dockStatus.textContent =
        "Harvest ready ✓";

      elements.dockWeight.textContent =
        "Ready for purchase";

      elements.minimumProgress.style.width = "100%";
      elements.dockProgressFill.style.width = "100%";

      elements.checkoutButton.classList.remove("disabled");
      elements.checkoutButton.setAttribute("aria-disabled", "false");
    } else if (ready) {
      elements.minimumStatus.textContent = "Your harvest is ready.";
      elements.dockStatus.textContent = "Ready for checkout ✓";
      elements.checkoutButton.classList.remove("disabled");
      elements.checkoutButton.setAttribute("aria-disabled", "false");
    } else {
      elements.minimumStatus.textContent =
        `Add another ${remaining.toFixed(2)} kg.`;
      elements.dockStatus.textContent =
        `Add ${remaining.toFixed(2)} kg more`;
      elements.checkoutButton.classList.add("disabled");
      elements.checkoutButton.setAttribute("aria-disabled", "true");
    }
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

    const settle = showImage => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      loading.hidden = true;

      if (showImage) {
        placeholder.hidden = true;
        image.classList.add("loaded");
      } else {
        image.hidden = true;
        placeholder.hidden = false;
      }
    };

    const timer = window.setTimeout(
      () => settle(false),
      config.IMAGE_TIMEOUT_MS
    );

    image.addEventListener("load", () => settle(true), { once: true });
    image.addEventListener("error", () => settle(false), { once: true });

    if (image.complete) {
      settle(image.naturalWidth > 0);
    }
  }

  function createControl(product, quantity) {
    if (quantity <= 0) {
      return `
        <button class="add-control" type="button" data-add>
          Add
        </button>
      `;
    }

    return `
      <div class="quantity-control">
        <button
          type="button"
          class="${quantity <= 1 ? "remove-button" : ""}"
          data-minus
          aria-label="${quantity <= 1 ? "Remove from harvest" : "Reduce quantity"}"
        >
          ${quantity <= 1 ? "×" : "−"}
        </button>

        <span class="quantity-value">${quantity}</span>

        <button
          type="button"
          data-plus
          aria-label="Increase quantity"
        >
          +
        </button>
      </div>
    `;
  }

  function createCard(product) {
    const name = displayName(product);
    const imageUrl = normalizeImageUrl(product.imageUrl);
    const quantity = cartStore.quantity(product.handleId);
    const inCart = quantity > 0;

    const card = document.createElement("article");
    card.className = `product-card${inCart ? " in-cart" : ""}`;
    card.dataset.productId = product.handleId;

    card.innerHTML = `
      ${inCart ? `<span class="in-harvest-badge">✓ In harvest</span>` : ""}

      <div class="product-image-wrap">
        ${
          imageUrl
            ? `<img
                class="product-image"
                src="${escapeHtml(imageUrl)}"
                alt="${escapeHtml(name.primary)}"
                loading="lazy"
                decoding="async"
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
      </div>

      <div class="product-body">
        <div class="product-copy">
          <h2 class="product-title">${escapeHtml(name.primary)}</h2>

          <p class="product-description">
            ${escapeHtml(product.description || "Fresh produce for everyday cooking")}
          </p>
        </div>

        <div class="product-meta">
          <span class="product-unit">${escapeHtml(product.unitLabel)}</span>
          <strong class="product-price">${currency(product.price)}</strong>
        </div>

        <div class="product-controls">
          ${createControl(product, quantity)}
        </div>

        <p class="selection-copy">
          ${
            inCart
              ? `${quantity} added · ${currency(
                  Number(product.price || 0) * quantity
                )}`
              : ""
          }
        </p>
      </div>
    `;

    initialiseImage(card, imageUrl);

    const add = card.querySelector("[data-add]");
    const minus = card.querySelector("[data-minus]");
    const plus = card.querySelector("[data-plus]");

    if (add) {
      add.addEventListener("click", () => {
        setProductQuantity(
          product,
          Math.max(
            1,
            Number(product.minQuantity || 1)
          )
        );
      });
    }

    if (minus) {
      minus.addEventListener("click", () => {
        setProductQuantity(product, quantity - 1);
      });
    }

    if (plus) {
      plus.addEventListener("click", () => {
        setProductQuantity(product, quantity + 1);
      });
    }

    return card;
  }

  function refreshCard(product) {
    const oldCard = document.querySelector(
      `[data-product-id="${CSS.escape(product.handleId)}"]`
    );

    if (!oldCard) return;

    oldCard.replaceWith(createCard(product));
  }

  function setProductQuantity(product, quantity) {
    product.minimumOrderExempt =
      isMinimumOrderExempt(
        product.minimumOrderExempt
      );
    cartStore.setProduct(product, quantity);
    refreshCard(product);
    updateSummary();

    const finalQuantity = cartStore.quantity(product.handleId);

    showToast(
      finalQuantity > 0 ? "Updated your harvest" : "Removed from harvest",
      finalQuantity > 0
        ? `${finalQuantity} × ${displayName(product).primary}`
        : displayName(product).primary
    );
  }

  function showToast(title, copy) {
    elements.toastTitle.textContent = title;
    elements.toastCopy.textContent = copy;
    elements.toast.hidden = false;

    clearTimeout(state.toastTimer);

    state.toastTimer = window.setTimeout(() => {
      elements.toast.hidden = true;
    }, 2200);
  }

  function renderFilters(categories) {
    const preferredOrder = [
      "Veggie",
      "Fruit",
      "Fruits",
      "Sweeteners",
      "Sweetners",
      "Oil",
      "Oils",
      "Combo Box"
    ];

    const categoryMap = new Map(
      categories.map(category => [
        String(category).trim().toLowerCase(),
        category
      ])
    );

    const ordered = [];

    preferredOrder.forEach(preferred => {
      const key = preferred.toLowerCase();
      const match = categoryMap.get(key);

      if (match && !ordered.includes(match)) {
        ordered.push(match);
        categoryMap.delete(key);
      }
    });

    ordered.push(
      ...[...categoryMap.values()].sort(
        (a, b) => a.localeCompare(b)
      )
    );

    elements.filters.innerHTML = `
      <button class="filter-chip active" type="button" data-category="all">
        All
      </button>
    `;

    ordered.forEach(category => {
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
      ]
        .join(" ")
        .toLowerCase();

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

    renderNextBatch(token, config.INITIAL_RENDER_COUNT);
  }

  function renderNextBatch(token, batchSize = config.RENDER_BATCH_SIZE) {
    if (token !== state.renderToken) return;

    const start = state.renderedCount;
    const end = Math.min(
      start + batchSize,
      state.filteredProducts.length
    );

    const fragment = document.createDocumentFragment();

    for (let index = start; index < end; index += 1) {
      fragment.appendChild(
        createCard(state.filteredProducts[index])
      );
    }

    elements.grid.appendChild(fragment);
    state.renderedCount = end;

    if (state.renderedCount < state.filteredProducts.length) {
      elements.renderStatus.hidden = false;

      requestAnimationFrame(() => {
        window.setTimeout(() => {
          renderNextBatch(token);
        }, 40);
      });
    } else {
      elements.renderStatus.hidden = true;
    }
  }

  async function loadProducts() {
    const cached =
      readProductCache();

    if (cached) {
      applyProductData(
        cached.data
      );

      const cacheAge =
        Date.now() - cached.savedAt;

      elements.summary.textContent =
        cacheAge <
        PRODUCT_CACHE_MAX_AGE_MS
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

    let staticData = null;

    try {
      staticData =
        await fetchWithRetry(
          () =>
            fetchJsonWithTimeout(
              `${PRODUCTS_JSON_URL}?v=${Date.now()}`,
              STATIC_FETCH_TIMEOUT_MS
            ),
          2,
          1000
        );

      writeProductCache(
        staticData
      );

      if (
        productPayloadSignature(
          staticData
        ) !==
        productPayloadSignature(
          cached?.data
        )
      ) {
        applyProductData(
          staticData
        );
      }

    } catch (staticError) {
      console.warn(
        "Static product catalogue unavailable:",
        staticError
      );
    }

    const apiUrl =
      String(config.API_URL || "")
        .trim();

    if (apiUrl) {
      try {
        const apiData =
          await fetchWithRetry(
            () =>
              fetchJsonWithTimeout(
                `${apiUrl}?action=getProducts`,
                API_FETCH_TIMEOUT_MS
              ),
            2,
            1600
          );

        writeProductCache(
          apiData
        );

        if (
          productPayloadSignature(
            apiData
          ) !==
          productPayloadSignature(
            staticData ||
            cached?.data
          )
        ) {
          applyProductData(
            apiData
          );
        }

      } catch (apiError) {
        console.warn(
          "Live product API unavailable:",
          apiError
        );
      }
    }

    if (
      state.products.length > 0
    ) {
      elements.loading.hidden = true;
      elements.error.hidden = true;
      elements.grid.hidden = false;

      elements.summary.textContent =
        state.products.length === 1
          ? "1 product"
          : `${state.products.length} products`;

      return;
    }

    elements.loading.hidden = true;
    elements.grid.hidden = true;
    elements.error.hidden = false;
    elements.summary.textContent =
      "Harvest unavailable";
  }

  function clearFilters() {
    state.activeCategory = "all";
    state.searchTerm = "";
    elements.search.value = "";

    elements.filters.querySelectorAll(".filter-chip").forEach(chip => {
      chip.classList.toggle(
        "active",
        chip.dataset.category === "all"
      );
    });

    applyFilters();
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

  elements.checkoutButton.addEventListener("click", event => {
    const cart = cartStore.read();

    const hasExemptProduct = cart.some(
      item =>
        isMinimumOrderExempt(
          item.minimumOrderExempt
        ) &&
        Number(item.quantity || 0) > 0
    );

    if (
      cartStore.totalWeightKg() < state.minimumOrderKg &&
      !hasExemptProduct
    ) {
      event.preventDefault();
    }
  });

  window.addEventListener("mfb:cart-changed", updateSummary);

  updateSummary();
  loadProducts();
})();
