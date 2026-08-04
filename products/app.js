(() => {
  "use strict";

  const API_URL =
    "https://script.google.com/macros/s/AKfycbw4ioZTLJKaFXWad3zJqyWXzde7-I5S6Q9LndoF2zu7EzgnEku75U2nAkceQBXLjpJi/exec";

  const CART_STORAGE_KEY = "mfb_sg_cart_v1";
  const DEFAULT_MINIMUM_ORDER_KG = 5;

  const state = {
    products: [],
    filteredProducts: [],
    quantities: new Map(),
    activeCategory: "all",
    searchTerm: "",
    toastTimer: null,
    minimumOrderKg: DEFAULT_MINIMUM_ORDER_KG
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
    heroCartWeight: document.getElementById("hero-cart-weight"),
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
    checkoutButton: document.getElementById("checkout-button")
  };

  function readCart() {
    try {
      const value = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || "[]");
      return Array.isArray(value) ? value : [];
    } catch (error) {
      console.warn("Unable to read cart:", error);
      return [];
    }
  }

  function writeCart(cart) {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    updateCartSummary();
  }

  function unitWeightKg(item) {
    const value = Number(item.unitValue || 0);
    const unit = String(item.unitType || "").trim().toLowerCase();

    if (unit === "kg") return value;
    if (unit === "g") return value / 1000;

    return 0;
  }

  function calculateCartWeightKg(cart = readCart()) {
    return cart.reduce((total, item) => {
      return total + unitWeightKg(item) * Number(item.quantity || 0);
    }, 0);
  }

  function updateCartSummary() {
    const cart = readCart();
    const count = cart.reduce(
      (total, item) => total + Number(item.quantity || 0),
      0
    );
    const weightKg = calculateCartWeightKg(cart);
    const minimumKg = Number(state.minimumOrderKg || DEFAULT_MINIMUM_ORDER_KG);
    const remainingKg = Math.max(0, minimumKg - weightKg);
    const progress = minimumKg > 0
      ? Math.min(100, (weightKg / minimumKg) * 100)
      : 100;
    const qualified = weightKg >= minimumKg;

    if (elements.cartCount) {
      elements.cartCount.textContent = String(count);
    }

    if (elements.heroCartWeight) {
      elements.heroCartWeight.textContent = `${weightKg.toFixed(2)} kg selected`;
    }

    if (elements.minimumWeight) {
      elements.minimumWeight.textContent =
        `${weightKg.toFixed(2)} kg / ${minimumKg.toFixed(2)} kg`;
    }

    if (elements.minimumProgress) {
      elements.minimumProgress.style.width = `${progress}%`;
    }

    if (elements.dockProgressFill) {
      elements.dockProgressFill.style.width = `${progress}%`;
    }

    if (elements.dockWeight) {
      elements.dockWeight.textContent =
        `${weightKg.toFixed(2)} / ${minimumKg.toFixed(2)} kg`;
    }

    if (qualified) {
      elements.minimumStatus.textContent =
        "Your harvest has reached the minimum order quantity.";
      elements.dockStatus.textContent =
        "Harvest ready for checkout ✓";
      elements.checkoutButton.classList.remove("disabled");
      elements.checkoutButton.setAttribute("aria-disabled", "false");
    } else {
      elements.minimumStatus.textContent =
        `Add another ${remainingKg.toFixed(2)} kg to complete your harvest.`;
      elements.dockStatus.textContent =
        `Add ${remainingKg.toFixed(2)} kg more`;
      elements.checkoutButton.classList.add("disabled");
      elements.checkoutButton.setAttribute("aria-disabled", "true");
    }

    document.querySelectorAll("[data-shared-cart-count]").forEach(node => {
      node.textContent = String(count);
    });
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
      const kilograms = total / 1000;
      return `${Number.isInteger(kilograms) ? kilograms : kilograms.toFixed(2)} kg`;
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

    let value = Number(nextValue || min);
    value = Math.max(min, Math.min(max, value));

    const steps = Math.round((value - min) / increment);
    value = min + steps * increment;
    value = Math.max(min, Math.min(max, value));

    state.quantities.set(product.handleId, value);
    updateProductQuantityUI(product);
  }

  function updateProductQuantityUI(product) {
    const quantity = getQuantity(product);
    const card = document.querySelector(
      `[data-product-id="${CSS.escape(product.handleId)}"]`
    );

    if (!card) return;

    const valueNode = card.querySelector("[data-quantity-value]");
    const minusButton = card.querySelector("[data-quantity-minus]");
    const plusButton = card.querySelector("[data-quantity-plus]");
    const totalNode = card.querySelector("[data-product-total]");

    const min = Math.max(1, Number(product.minQuantity || 1));
    const max = Math.min(
      Number(product.maxQuantity || product.stockUnits || 99),
      Number(product.stockUnits || 99)
    );

    if (valueNode) valueNode.textContent = String(quantity);
    if (minusButton) minusButton.disabled = quantity <= min;
    if (plusButton) plusButton.disabled = quantity >= max;

    if (totalNode) {
      totalNode.textContent =
        `${totalPhysicalQuantity(product, quantity)} · ` +
        `${currency(Number(product.price || 0) * quantity)}`;
    }
  }

  function createProductCard(product) {
    const name = productDisplayName(product);
    const imageUrl = normalizeImageUrl(product.imageUrl);
    const quantity = getQuantity(product);

    const article = document.createElement("article");
    article.className = "product-card";
    article.dataset.productId = product.handleId;

    article.innerHTML = `
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

        <div class="product-placeholder"${imageUrl ? " hidden" : ""}>
          <div>
            <span aria-hidden="true">🌿</span>
            <strong>Fresh from MyFarmBox</strong>
          </div>
        </div>

        <span class="product-category">
          ${escapeHtml(product.collection || "Harvest")}
        </span>
      </div>

      <div class="product-body">
        <h2 class="product-title">${escapeHtml(name.primary)}</h2>
        ${
          name.native
            ? `<p class="product-tanglish">${escapeHtml(name.native)}</p>`
            : ""
        }

        <div class="product-meta">
          <div>
            <span class="product-unit">${escapeHtml(product.unitLabel)}</span>
            <strong class="product-price">
              ${currency(product.price)}
              <small>/ unit</small>
            </strong>
          </div>

          <div class="quantity-control" aria-label="Choose quantity">
            <button type="button" data-quantity-minus>−</button>
            <span class="quantity-value" data-quantity-value>${quantity}</span>
            <button type="button" data-quantity-plus>+</button>
          </div>
        </div>

        <p class="product-total" data-product-total></p>

        <button class="add-button" type="button" data-add-to-cart>
          Add to harvest
        </button>
      </div>
    `;

    const image = article.querySelector(".product-image");
    const placeholder = article.querySelector(".product-placeholder");

    if (image) {
      image.addEventListener("error", () => {
        image.hidden = true;
        placeholder.hidden = false;
      });
    }

    article.querySelector("[data-quantity-minus]").addEventListener("click", () => {
      setQuantity(
        product,
        getQuantity(product) - Number(product.incrementBy || 1)
      );
    });

    article.querySelector("[data-quantity-plus]").addEventListener("click", () => {
      setQuantity(
        product,
        getQuantity(product) + Number(product.incrementBy || 1)
      );
    });

    article.querySelector("[data-add-to-cart]").addEventListener("click", event => {
      addToCart(product, getQuantity(product), event.currentTarget);
    });

    requestAnimationFrame(() => updateProductQuantityUI(product));
    return article;
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
        incrementBy: Number(product.incrementBy || 1)
      });
    }

    writeCart(cart);

    if (button) {
      const original = button.textContent;
      button.textContent = "Added ✓";
      button.classList.add("added");

      window.setTimeout(() => {
        button.textContent = original;
        button.classList.remove("added");
      }, 1200);
    }

    const displayName = productDisplayName(product).primary;
    showToast(
      "Added to your harvest",
      `${quantity} × ${displayName} · ${currency(product.price * quantity)}`
    );
  }

  function showToast(title, copy) {
    if (!elements.toast) return;

    elements.toastTitle.textContent = title;
    elements.toastCopy.textContent = copy;
    elements.toast.hidden = false;

    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => {
      elements.toast.hidden = true;
    }, 3500);
  }

  function renderFilters(categories) {
    const allButton = elements.filters.querySelector('[data-category="all"]');
    elements.filters.innerHTML = "";
    elements.filters.appendChild(allButton);

    categories.forEach(category => {
      const button = document.createElement("button");
      button.className = "filter-chip";
      button.type = "button";
      button.dataset.category = category;
      button.textContent = category;
      elements.filters.appendChild(button);
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
  }

  function applyFilters() {
    const term = state.searchTerm.trim().toLowerCase();

    state.filteredProducts = state.products.filter(product => {
      const matchesCategory =
        state.activeCategory === "all" ||
        product.collection === state.activeCategory;

      const haystack = [
        product.name,
        product.tanglish,
        product.collection,
        product.unitLabel
      ].join(" ").toLowerCase();

      return matchesCategory && (!term || haystack.includes(term));
    });

    renderProducts();
  }

  function renderProducts() {
    elements.grid.innerHTML = "";

    const count = state.filteredProducts.length;
    elements.summary.textContent =
      count === 1 ? "1 product available" : `${count} products available`;

    elements.empty.hidden = count > 0;
    elements.grid.hidden = count === 0;

    state.filteredProducts.forEach(product => {
      elements.grid.appendChild(createProductCard(product));
    });
  }

  async function loadProducts() {
    elements.loading.hidden = false;
    elements.error.hidden = true;
    elements.empty.hidden = true;
    elements.grid.hidden = true;
    elements.summary.textContent = "Loading this week’s harvest…";

    try {
      const response = await fetch(`${API_URL}?action=getProducts`, {
        method: "GET",
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error(`Product API returned ${response.status}`);
      }

      const data = await response.json();

      if (!data.ok || !Array.isArray(data.products)) {
        throw new Error(data.message || "Invalid product response");
      }

      state.products = data.products;
      state.filteredProducts = data.products;
      state.minimumOrderKg = Number(
        data.settings?.minimumOrderKg || DEFAULT_MINIMUM_ORDER_KG
      );

      state.products.forEach(product => getQuantity(product));

      renderFilters(
        Array.isArray(data.categories)
          ? data.categories
          : [...new Set(data.products.map(product => product.collection))]
      );

      elements.loading.hidden = true;
      elements.grid.hidden = false;
      applyFilters();
      updateCartSummary();
    } catch (error) {
      console.error("Unable to load products:", error);
      elements.loading.hidden = true;
      elements.grid.hidden = true;
      elements.error.hidden = false;
      elements.summary.textContent = "Harvest unavailable";
      updateCartSummary();
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

  elements.retry.addEventListener("click", loadProducts);
  elements.clearFilters.addEventListener("click", clearFilters);

  elements.checkoutButton.addEventListener("click", event => {
    const weightKg = calculateCartWeightKg();
    if (weightKg < state.minimumOrderKg) {
      event.preventDefault();
    }
  });

  updateCartSummary();
  loadProducts();
})();
