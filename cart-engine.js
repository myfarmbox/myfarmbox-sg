(() => {
  "use strict";

  const STORAGE_KEY = "mfb_sg_cart_v1";
  const DEFAULT_MINIMUM_KG = 5;

  function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function read() {
    try {
      const cart = JSON.parse(
        localStorage.getItem(STORAGE_KEY) || "[]"
      );

      return Array.isArray(cart) ? cart : [];
    } catch {
      return [];
    }
  }

  function write(cart) {
    const cleanCart = Array.isArray(cart) ? cart : [];

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(cleanCart)
    );

    window.dispatchEvent(
      new CustomEvent("mfb:cart-changed", {
        detail: {
          cart: cleanCart,
          summary: summarize(cleanCart)
        }
      })
    );

    if (
      typeof window.updateSharedCartCount === "function"
    ) {
      window.updateSharedCartCount();
    }

    return cleanCart;
  }

  function clear() {
    return write([]);
  }

  function unitWeightKg(item) {
    const direct = number(
      item.weightKg ||
      item.unitWeightKg
    );

    if (direct > 0) {
      return direct;
    }

    let value = number(item.unitValue);
    let unit = String(
      item.unitType || ""
    ).trim().toLowerCase();

    if ((!value || !unit) && item.unitLabel) {
      const match = String(item.unitLabel)
        .trim()
        .toLowerCase()
        .match(
          /([0-9]*\.?[0-9]+)\s*(kg|g|kilogram|kilograms|gram|grams)\b/
        );

      if (match) {
        value = number(match[1]);
        unit = match[2];
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

  function itemQuantity(item) {
    return Math.max(0, number(item.quantity));
  }

  function itemUnitPrice(item) {
    return number(
      item.unitPrice ??
      item.price ??
      item.productPrice
    );
  }

  function itemTotal(item) {
    return itemUnitPrice(item) * itemQuantity(item);
  }

  function isMinimumExempt(item) {
    return (
      item.minimumOrderExempt === true &&
      itemQuantity(item) > 0
    );
  }

  function summarize(
    cart = read(),
    options = {}
  ) {
    const minimumKg = Math.max(
      0,
      number(
        options.minimumKg,
        DEFAULT_MINIMUM_KG
      )
    );

    const quantity = cart.reduce(
      (sum, item) =>
        sum + itemQuantity(item),
      0
    );

    const weightKg = cart.reduce(
      (sum, item) =>
        sum +
        unitWeightKg(item) *
        itemQuantity(item),
      0
    );

    const subtotal = cart.reduce(
      (sum, item) =>
        sum + itemTotal(item),
      0
    );

    const hasExemptProduct =
      cart.some(isMinimumExempt);

    const minimumReached =
      weightKg >= minimumKg;

    const qualified =
      minimumReached ||
      hasExemptProduct;

    const remainingKg = Math.max(
      0,
      minimumKg - weightKg
    );

    const progressPercent =
      hasExemptProduct
        ? 100
        : minimumKg > 0
          ? Math.min(
              100,
              (weightKg / minimumKg) * 100
            )
          : 100;

    return {
      itemLines: cart.length,
      quantity,
      weightKg,
      subtotal,
      minimumKg,
      remainingKg,
      progressPercent,
      minimumReached,
      hasExemptProduct,
      qualified
    };
  }

  function hydrateFromProducts(
    cart,
    products
  ) {
    const productMap = new Map(
      (products || []).map(product => [
        product.handleId,
        product
      ])
    );

    let changed = false;

    const hydrated = (cart || []).map(item => {
      const product =
        productMap.get(item.productId);

      if (!product) {
        return item;
      }

      const next = {
        ...item,
        productName: product.name,
        tanglish: product.tanglish,
        collection: product.collection,
        imageUrl: product.imageUrl,
        unitLabel: product.unitLabel,
        unitValue: number(product.unitValue),
        unitType: product.unitType,
        unitPrice: number(product.price),
        minimumOrderExempt:
          Boolean(product.minimumOrderExempt),
        minQuantity:
          number(product.minQuantity, 1),
        maxQuantity:
          number(
            product.maxQuantity ||
            product.stockUnits,
            99
          ),
        incrementBy:
          number(product.incrementBy, 1)
      };

      if (
        JSON.stringify(next) !==
        JSON.stringify(item)
      ) {
        changed = true;
      }

      return next;
    });

    if (changed) {
      write(hydrated);
    }

    return hydrated;
  }

  window.MFBCart = Object.freeze({
    STORAGE_KEY,
    DEFAULT_MINIMUM_KG,
    read,
    write,
    clear,
    unitWeightKg,
    itemQuantity,
    itemUnitPrice,
    itemTotal,
    isMinimumExempt,
    summarize,
    hydrateFromProducts
  });
})();
