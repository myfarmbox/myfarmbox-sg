/*
MyFarmBox Singapore Cart v49

Order rules:
- Minimum: 5 kg equivalent
- Maximum: 20 kg equivalent
- kg + g + ml + litre count together
- 1000 ml = 1 kg equivalent for order-limit purposes
- Minimum-order-exempt products bypass the 5 kg minimum
- The 20 kg maximum still applies
*/

(() => {
  "use strict";

  const API =
    "https://script.google.com/macros/s/AKfycbw4ioZTLJKaFXWad3zJqyWXzde7-I5S6Q9LndoF2zu7EzgnEku75U2nAkceQBXLjpJi/exec";

  const CART_KEY =
    "mfb_sg_cart_v1";

  const DRAFT_KEY =
    "mfb_sg_checkout_draft_v1";

  const MIN_DEFAULT = 5;
  const MAX_DEFAULT = 20;

  const $ = id =>
    document.getElementById(id);

  const els = {
    loading: $("loading"),
    empty: $("empty"),
    layout: $("layout"),
    items: $("items"),
    sumItems: $("sumItems"),
    sumWeight: $("sumWeight"),
    sumDelivery: $("sumDelivery"),
    sumTotal: $("sumTotal"),
    deliveryDate: $("deliveryDate"),
    minimumStatus: $("minimumStatus"),
    minimumWeight: $("minimumWeight"),
    progressBar: $("progressBar"),
    subtotal: $("subtotal"),
    deliveryFee: $("deliveryFee"),
    grandTotal: $("grandTotal"),
    warning: $("warning"),
    confirmBtn: $("confirmBtn"),
    clearBtn: $("clearBtn"),
    clearDialog: $("clearDialog"),
    keepBtn: $("keepBtn"),
    clearAllBtn: $("clearAllBtn"),
    notes: $("notes"),
    notesCount: $("notesCount")
  };

  let minimumKg = MIN_DEFAULT;

  let maximumKg = Number(
    window.MFBCart?.maximumOrderEquivalentKg ||
    MAX_DEFAULT
  );

  let deliveryFee = 0;
  let productMap = new Map();

  const readCart = () => {
    if (
      window.MFBCart &&
      typeof window.MFBCart.read === "function"
    ) {
      return window.MFBCart.read();
    }

    try {
      const parsed = JSON.parse(
        localStorage.getItem(CART_KEY) || "[]"
      );

      return Array.isArray(parsed)
        ? parsed
        : [];
    } catch {
      return [];
    }
  };

  const writeCart = cart => {
    if (
      window.MFBCart &&
      typeof window.MFBCart.write === "function"
    ) {
      window.MFBCart.write(cart);
      return;
    }

    localStorage.setItem(
      CART_KEY,
      JSON.stringify(cart)
    );

    window.dispatchEvent(
      new CustomEvent("mfb:cart-changed", {
        detail: { cart }
      })
    );

    if (
      typeof window.updateSharedCartCount ===
      "function"
    ) {
      window.updateSharedCartCount();
    }
  };

  const money = value =>
    new Intl.NumberFormat(
      "en-SG",
      {
        style: "currency",
        currency: "SGD",
        minimumFractionDigits: 2
      }
    ).format(
      Number(value || 0)
    );

  function unitEquivalentKg(item) {
    const value =
      Number(item.unitValue || 0);

    const unit =
      String(item.unitType || "")
        .trim()
        .toLowerCase();

    if (unit === "kg") {
      return value;
    }

    if (unit === "g") {
      return value / 1000;
    }

    if (unit === "ml") {
      return value / 1000;
    }

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

  function totalEquivalentKg(
    cart = readCart()
  ) {
    if (
      window.MFBCart &&
      typeof window.MFBCart.totalEquivalentKg ===
      "function"
    ) {
      return Number(
        window.MFBCart.totalEquivalentKg(
          cart
        ) || 0
      );
    }

    if (
      window.MFBCart &&
      typeof window.MFBCart.totalWeightKg ===
      "function"
    ) {
      return Number(
        window.MFBCart.totalWeightKg(
          cart
        ) || 0
      );
    }

    return cart.reduce(
      (sum, item) =>
        sum +
        unitEquivalentKg(item) *
          Number(item.quantity || 0),
      0
    );
  }

  function totalItems(
    cart = readCart()
  ) {
    if (
      window.MFBCart &&
      typeof window.MFBCart.totalItems ===
      "function"
    ) {
      return Number(
        window.MFBCart.totalItems(
          cart
        ) || 0
      );
    }

    return cart.reduce(
      (sum, item) =>
        sum +
        Number(item.quantity || 0),
      0
    );
  }

  function totalValue(
    cart = readCart()
  ) {
    if (
      window.MFBCart &&
      typeof window.MFBCart.totalValue ===
      "function"
    ) {
      return Number(
        window.MFBCart.totalValue(
          cart
        ) || 0
      );
    }

    return cart.reduce(
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
  }

  function itemTotal(item) {
    return (
      Number(
        item.unitPrice ||
        item.price ||
        0
      ) *
      Number(item.quantity || 0)
    );
  }

  function hasMinimumExemptProduct(
    cart = readCart()
  ) {
    return cart.some(
      item =>
        item.minimumOrderExempt === true &&
        Number(item.quantity || 0) > 0
    );
  }

  function cartSummary(
    cart = readCart()
  ) {
    const quantity =
      totalItems(cart);

    const equivalentKg =
      totalEquivalentKg(cart);

    const subtotal =
      totalValue(cart);

    const hasExemptProduct =
      hasMinimumExemptProduct(cart);

    const qualified =
      equivalentKg >= minimumKg ||
      hasExemptProduct;

    const remainingMinimumKg =
      Math.max(
        0,
        minimumKg - equivalentKg
      );

    const remainingMaximumKg =
      Math.max(
        0,
        maximumKg - equivalentKg
      );

    const minimumProgress =
      hasExemptProduct
        ? 100
        : Math.min(
            100,
            minimumKg > 0
              ? (
                  equivalentKg /
                  minimumKg
                ) * 100
              : 100
          );

    const displayProgress =
      qualified
        ? Math.min(
            100,
            maximumKg > 0
              ? (
                  equivalentKg /
                  maximumKg
                ) * 100
              : 100
          )
        : minimumProgress;

    return {
      quantity,
      equivalentKg,
      subtotal,
      minimumKg,
      maximumKg,
      remainingMinimumKg,
      remainingMaximumKg,
      minimumProgress,
      displayProgress,
      hasExemptProduct,
      qualified
    };
  }

  function displayName(item) {
    const raw =
      String(
        item.productName ||
        "Fresh produce"
      );

    const parts =
      raw.split(" - ");

    return parts.length > 1
      ? parts
          .slice(1)
          .join(" - ")
          .trim()
      : raw;
  }

  function imageUrl(url) {
    const value =
      String(url || "").trim();

    if (!value) {
      return "";
    }

    return /^(https?:\/\/|\/)/.test(
      value
    )
      ? value
      : `/${value.replace(/^\.\//, "")}`;
  }

  function deliveryDate() {
    const nowParts =
      new Intl.DateTimeFormat(
        "en-CA",
        {
          timeZone: "Asia/Singapore",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false
        }
      )
        .formatToParts(new Date())
        .reduce(
          (obj, part) => {
            if (
              part.type !== "literal"
            ) {
              obj[part.type] =
                part.value;
            }

            return obj;
          },
          {}
        );

    const now =
      new Date(
        Date.UTC(
          +nowParts.year,
          +nowParts.month - 1,
          +nowParts.day,
          +nowParts.hour,
          +nowParts.minute
        )
      );

    const day =
      now.getUTCDay();

    const afterWednesday =
      day > 3 ||
      (
        day === 3 &&
        (
          now.getUTCHours() > 23 ||
          (
            now.getUTCHours() === 23 &&
            now.getUTCMinutes() > 59
          )
        )
      );

    let add =
      (7 - day) % 7;

    if (
      add === 0 ||
      afterWednesday
    ) {
      add += 7;
    }

    const date =
      new Date(now);

    date.setUTCDate(
      date.getUTCDate() + add
    );

    return date;
  }

  function saveDraft() {
    let draft = {};

    try {
      draft =
        JSON.parse(
          localStorage.getItem(
            DRAFT_KEY
          ) || "{}"
        );
    } catch {}

    draft.notes =
      els.notes.value.trim();

    draft.returns = [
      ...document.querySelectorAll(
        ".return-grid input:checked"
      )
    ].map(
      input => input.value
    );

    draft.deliveryDate =
      deliveryDate()
        .toISOString()
        .slice(0, 10);

    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify(draft)
    );
  }

  function restoreDraft() {
    let draft = {};

    try {
      draft =
        JSON.parse(
          localStorage.getItem(
            DRAFT_KEY
          ) || "{}"
        );
    } catch {}

    els.notes.value =
      String(
        draft.notes || ""
      );

    els.notesCount.textContent =
      `${els.notes.value.length} / 500`;

    const returns =
      Array.isArray(
        draft.returns
      )
        ? draft.returns
        : [];

    document
      .querySelectorAll(
        ".return-grid input"
      )
      .forEach(
        input => {
          input.checked =
            returns.includes(
              input.value
            );
        }
      );
  }

  function productEquivalentText(
    item
  ) {
    const total =
      Number(
        item.unitValue || 0
      ) *
      Number(
        item.quantity || 0
      );

    const unit =
      String(
        item.unitType || ""
      ).trim();

    if (
      unit.toLowerCase() === "g" &&
      total >= 1000
    ) {
      const kg =
        total / 1000;

      return `${
        Number.isInteger(kg)
          ? kg
          : kg.toFixed(2)
      } kg`;
    }

    if (
      unit.toLowerCase() === "ml" &&
      total >= 1000
    ) {
      const litres =
        total / 1000;

      return `${
        Number.isInteger(litres)
          ? litres
          : litres.toFixed(2)
      } l`;
    }

    return `${
      Number.isInteger(total)
        ? total
        : total.toFixed(2)
    } ${unit}`.trim();
  }

  function itemNode(item) {
    const live =
      productMap.get(
        item.productId
      );

    const available =
      Boolean(live);

    const article =
      document.createElement(
        "article"
      );

    article.className =
      `item${
        available
          ? ""
          : " unavailable"
      }`;

    const img =
      imageUrl(
        item.imageUrl
      );

    article.innerHTML = `
      <div class="item-img">
        ${
          img
            ? `<img
                src="${img}"
                alt=""
                loading="lazy"
                decoding="async"
              >`
            : ""
        }

        <div
          class="placeholder"
          ${img ? "hidden" : ""}
        >
          🌿
        </div>
      </div>

      <div class="item-info">
        <h3>
          ${displayName(item)}
        </h3>

        <p>
          ${item.unitLabel} ·
          ${money(item.unitPrice)} each
        </p>

        <b>
          ${productEquivalentText(item)}
        </b>

        ${
          item.minimumOrderExempt ===
          true
            ? `<p style="color:#438d35;font-weight:700">
                Complete harvest
              </p>`
            : ""
        }

        ${
          available
            ? ""
            : `<p style="color:#9f4338;font-weight:700">
                Currently unavailable
              </p>`
        }
      </div>

      <div class="item-actions">
        <div class="qty">
          <button
            data-minus
            type="button"
          >
            −
          </button>

          <span>
            ${item.quantity}
          </span>

          <button
            data-plus
            type="button"
            ${available ? "" : "disabled"}
          >
            +
          </button>
        </div>

        <button
          data-remove
          class="remove"
          type="button"
        >
          Remove
        </button>

        <strong class="line-total">
          ${money(
            itemTotal(item)
          )}
        </strong>
      </div>
    `;

    const image =
      article.querySelector(
        "img"
      );

    const placeholder =
      article.querySelector(
        ".placeholder"
      );

    if (image) {
      image.addEventListener(
        "error",
        () => {
          image.hidden = true;

          if (placeholder) {
            placeholder.hidden =
              false;
          }
        }
      );
    }

    article
      .querySelector(
        "[data-minus]"
      )
      .onclick =
        () =>
          updateQty(
            item.productId,
            Number(
              item.quantity
            ) - 1
          );

    article
      .querySelector(
        "[data-plus]"
      )
      .onclick =
        () =>
          updateQty(
            item.productId,
            Number(
              item.quantity
            ) + 1
          );

    article
      .querySelector(
        "[data-remove]"
      )
      .onclick =
        () =>
          updateQty(
            item.productId,
            0
          );

    return article;
  }

  function canUseQuantity(
    product,
    quantity
  ) {
    if (
      quantity <= 0
    ) {
      return true;
    }

    if (
      window.MFBCart &&
      typeof window.MFBCart.canSetProduct ===
      "function"
    ) {
      return window.MFBCart.canSetProduct(
        product,
        quantity
      );
    }

    const cart =
      readCart();

    const index =
      cart.findIndex(
        item =>
          item.productId ===
          product.handleId
      );

    const projected =
      [...cart];

    const cartItem = {
      ...(
        index >= 0
          ? projected[index]
          : {}
      ),
      productId:
        product.handleId,
      productName:
        product.name,
      unitValue:
        Number(
          product.unitValue
        ),
      unitType:
        product.unitType,
      unitPrice:
        Number(
          product.price
        ),
      quantity
    };

    if (index >= 0) {
      projected[index] =
        cartItem;
    } else {
      projected.push(
        cartItem
      );
    }

    return (
      totalEquivalentKg(
        projected
      ) <=
      maximumKg
    );
  }

  function updateQty(
    id,
    qty
  ) {
    const cart =
      readCart();

    const index =
      cart.findIndex(
        item =>
          item.productId === id
      );

    if (index < 0) {
      return;
    }

    const currentItem =
      cart[index];

    const live =
      productMap.get(id);

    const min =
      Number(
        currentItem.minQuantity ||
        1
      );

    const max =
      Number(
        currentItem.maxQuantity ||
        99
      );

    if (qty <= 0) {
      cart.splice(
        index,
        1
      );

      writeCart(cart);
      render();
      return;
    }

    const nextQuantity =
      Math.max(
        min,
        Math.min(
          max,
          qty
        )
      );

    if (
      nextQuantity >
        Number(
          currentItem.quantity ||
          0
        )
    ) {
      const productForCheck =
        live || {
          handleId:
            currentItem.productId,
          name:
            currentItem.productName,
          unitValue:
            currentItem.unitValue,
          unitType:
            currentItem.unitType,
          price:
            currentItem.unitPrice,
          minimumOrderExempt:
            currentItem.minimumOrderExempt,
          minQuantity:
            currentItem.minQuantity,
          maxQuantity:
            currentItem.maxQuantity,
          stockUnits:
            currentItem.maxQuantity
        };

      if (
        !canUseQuantity(
          productForCheck,
          nextQuantity
        )
      ) {
        els.warning.textContent =
          `Maximum harvest reached. Your order can include up to ${maximumKg.toFixed(0)} kg equivalent.`;

        els.warning.classList.remove(
          "ready"
        );

        return;
      }
    }

    if (
      window.MFBCart &&
      typeof window.MFBCart.setProduct ===
      "function" &&
      live
    ) {
      window.MFBCart.setProduct(
        live,
        nextQuantity
      );
    } else {
      cart[index].quantity =
        nextQuantity;

      writeCart(cart);
    }

    render();
  }

  function render() {
    const cart =
      readCart();

    if (!cart.length) {
      els.layout.hidden =
        true;

      els.empty.hidden =
        false;

      return;
    }

    els.empty.hidden =
      true;

    els.layout.hidden =
      false;

    els.items.innerHTML =
      "";

    cart.forEach(
      item =>
        els.items.appendChild(
          itemNode(item)
        )
    );

    const summary =
      cartSummary(cart);

    const date =
      deliveryDate();

    const dateLabel =
      new Intl.DateTimeFormat(
        "en-SG",
        {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "UTC"
        }
      ).format(date);

    const shortLabel =
      new Intl.DateTimeFormat(
        "en-SG",
        {
          day: "numeric",
          month: "short",
          timeZone: "UTC"
        }
      ).format(date);

    const unavailable =
      cart.some(
        item =>
          !productMap.has(
            item.productId
          )
      );

    const ready =
      summary.qualified &&
      !unavailable;

    els.sumItems.textContent =
      summary.quantity;

    els.sumWeight.textContent =
      `${summary.equivalentKg.toFixed(2)} kg eq.`;

    els.sumDelivery.textContent =
      shortLabel;

    els.sumTotal.textContent =
      money(
        summary.subtotal +
        deliveryFee
      );

    els.deliveryDate.textContent =
      dateLabel;

    if (
      summary.qualified
    ) {
      els.minimumWeight.textContent =
        `${summary.equivalentKg.toFixed(2)} / ${summary.maximumKg.toFixed(2)} kg eq.`;
    } else {
      els.minimumWeight.textContent =
        `${summary.equivalentKg.toFixed(2)} / ${summary.minimumKg.toFixed(2)} kg eq.`;
    }

    els.progressBar.style.width =
      `${summary.displayProgress}%`;

    els.subtotal.textContent =
      money(
        summary.subtotal
      );

    els.deliveryFee.textContent =
      deliveryFee
        ? money(deliveryFee)
        : "FREE";

    els.grandTotal.textContent =
      money(
        summary.subtotal +
        deliveryFee
      );

    if (unavailable) {
      els.minimumStatus.textContent =
        "Remove unavailable products.";

      els.warning.textContent =
        "One or more products are unavailable.";

      els.warning.classList.remove(
        "ready"
      );

    } else if (
      summary.equivalentKg >=
      summary.maximumKg
    ) {
      els.minimumStatus.textContent =
        "Maximum harvest reached.";

      els.warning.textContent =
        `Your harvest is ready. The maximum order is ${summary.maximumKg.toFixed(0)} kg equivalent.`;

      els.warning.classList.add(
        "ready"
      );

    } else if (
      summary.hasExemptProduct
    ) {
      els.minimumStatus.textContent =
        "Your Combo Box qualifies as a complete harvest.";

      els.warning.textContent =
        `Complete harvest selected. You may add more products up to ${summary.maximumKg.toFixed(0)} kg equivalent.`;

      els.warning.classList.add(
        "ready"
      );

    } else if (ready) {
      els.minimumStatus.textContent =
        "Your harvest is ready.";

      els.warning.textContent =
        `Minimum reached. You may continue adding products up to ${summary.maximumKg.toFixed(0)} kg equivalent.`;

      els.warning.classList.add(
        "ready"
      );

    } else {
      els.minimumStatus.textContent =
        `Add another ${summary.remainingMinimumKg.toFixed(2)} kg eq.`;

      els.warning.textContent =
        `Add ${summary.remainingMinimumKg.toFixed(2)} kg equivalent to reach the ${summary.minimumKg.toFixed(2)} kg minimum.`;

      els.warning.classList.remove(
        "ready"
      );
    }

    els.confirmBtn.classList.toggle(
      "disabled",
      !ready
    );

    els.confirmBtn.setAttribute(
      "aria-disabled",
      ready
        ? "false"
        : "true"
    );

    saveDraft();
  }

  function normalizeExempt(value) {
    return (
      value === true ||
      String(value)
        .trim()
        .toLowerCase() ===
        "true"
    );
  }

  function hydrateCartFromProducts(
    cart,
    products
  ) {
    const map =
      new Map(
        products.map(
          product => [
            product.handleId,
            product
          ]
        )
      );

    return cart.map(
      item => {
        const product =
          map.get(
            item.productId
          );

        if (!product) {
          return item;
        }

        const maxQuantity =
          Number(
            product.maxQuantity ||
            product.stockUnits ||
            99
          );

        return {
          ...item,
          productName:
            product.name,
          imageUrl:
            product.imageUrl,
          unitLabel:
            product.unitLabel,
          unitValue:
            Number(
              product.unitValue
            ),
          unitType:
            product.unitType,
          unitPrice:
            Number(
              product.price
            ),
          minimumOrderExempt:
            normalizeExempt(
              product.minimumOrderExempt
            ),
          minQuantity:
            Number(
              product.minQuantity ||
              1
            ),
          maxQuantity,
          quantity:
            Math.min(
              Number(
                item.quantity ||
                0
              ),
              maxQuantity
            )
        };
      }
    );
  }

  async function init() {
    restoreDraft();

    if (
      !readCart().length
    ) {
      els.loading.hidden =
        true;

      els.empty.hidden =
        false;

      return;
    }

    try {
      const controller =
        new AbortController();

      const timeout =
        setTimeout(
          () =>
            controller.abort(),
          12000
        );

      const response =
        await fetch(
          `${API}?action=getProducts`,
          {
            cache: "no-store",
            signal:
              controller.signal
          }
        );

      clearTimeout(timeout);

      const data =
        await response.json();

      minimumKg =
        Number(
          data.settings
            ?.minimumOrderKg ||
          MIN_DEFAULT
        );

      maximumKg =
        Number(
          data.settings
            ?.maximumOrderKg ||
          window.MFBCart
            ?.maximumOrderEquivalentKg ||
          MAX_DEFAULT
        );

      deliveryFee =
        Number(
          data.settings
            ?.deliveryFee ||
          0
        );

      const products =
        data.products || [];

      productMap =
        new Map(
          products.map(
            product => [
              product.handleId,
              product
            ]
          )
        );

      const refreshed =
        hydrateCartFromProducts(
          readCart(),
          products
        );

      writeCart(
        refreshed
      );

    } catch (error) {
      console.error(
        "Cart product refresh failed:",
        error
      );
    }

    els.loading.hidden =
      true;

    render();
  }

  els.clearBtn.onclick =
    () =>
      els.clearDialog.showModal();

  els.keepBtn.onclick =
    () =>
      els.clearDialog.close();

  els.clearAllBtn.onclick =
    () => {
      writeCart([]);

      els.clearDialog.close();
      render();
    };

  els.notes.oninput =
    () => {
      els.notesCount.textContent =
        `${els.notes.value.length} / 500`;

      saveDraft();
    };

  document
    .querySelectorAll(
      ".return-grid input"
    )
    .forEach(
      input =>
        input.onchange =
          saveDraft
    );

  els.confirmBtn.onclick =
    event => {
      const cart =
        readCart();

      const summary =
        cartSummary(cart);

      const unavailable =
        cart.some(
          item =>
            !productMap.has(
              item.productId
            )
        );

      if (
        !cart.length ||
        !summary.qualified ||
        summary.equivalentKg >
          summary.maximumKg ||
        unavailable
      ) {
        event.preventDefault();
        return;
      }

      saveDraft();
    };

  window.addEventListener(
    "mfb:cart-changed",
    render
  );

  init();
})();
