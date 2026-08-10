/*
MyFarmBox Singapore Cart Engine v49

Unified order rules:
- Minimum: 5 kg equivalent
- Maximum: 20 kg equivalent
- kg + g + ml + litre count together
- 1000 ml = 1 kg equivalent for order-limit purposes
- Minimum-order-exempt products bypass the 5 kg minimum
- The 20 kg maximum still applies
*/

(() => {
  "use strict";

  const STORAGE_KEY = "mfb_sg_cart_v1";
  const DEFAULT_MINIMUM_KG = 5;
  const DEFAULT_MAXIMUM_KG = 20;

  function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed)
      ? parsed
      : fallback;
  }

  function normaliseBoolean(value) {
    return (
      value === true ||
      String(value)
        .trim()
        .toLowerCase() === "true"
    );
  }

  function read() {
    try {
      const cart = JSON.parse(
        localStorage.getItem(
          STORAGE_KEY
        ) || "[]"
      );

      return Array.isArray(cart)
        ? cart
        : [];
    } catch {
      return [];
    }
  }

  function write(cart) {
    const cleanCart =
      Array.isArray(cart)
        ? cart
        : [];

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(cleanCart)
    );

    window.dispatchEvent(
      new CustomEvent(
        "mfb:cart-changed",
        {
          detail: {
            cart: cleanCart,
            summary:
              summarize(cleanCart)
          }
        }
      )
    );

    if (
      typeof window.updateSharedCartCount ===
      "function"
    ) {
      window.updateSharedCartCount();
    }

    return cleanCart;
  }

  function clear() {
    return write([]);
  }

  /*
   * Order-equivalent calculation.
   *
   * kg     -> kg
   * g      -> kg
   * ml     -> kg equivalent
   * l/ltr  -> kg equivalent
   *
   * For order limits:
   * 1000 ml = 1 kg equivalent.
   */
  function unitEquivalentKg(item) {
    const direct =
      number(
        item.equivalentKg ||
        item.weightKg ||
        item.unitWeightKg
      );

    if (direct > 0) {
      return direct;
    }

    let value =
      number(item.unitValue);

    let unit =
      String(
        item.unitType || ""
      )
        .trim()
        .toLowerCase();

    if (
      (!value || !unit) &&
      item.unitLabel
    ) {
      const match =
        String(item.unitLabel)
          .trim()
          .toLowerCase()
          .match(
            /([0-9]*\.?[0-9]+)\s*(kg|g|ml|l|ltr|litre|liter|kilogram|kilograms|gram|grams|millilitre|milliliter|millilitres|milliliters|litres|liters)\b/
          );

      if (match) {
        value =
          number(match[1]);

        unit =
          match[2];
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

    if (
      unit === "ml" ||
      unit === "millilitre" ||
      unit === "milliliter" ||
      unit === "millilitres" ||
      unit === "milliliters"
    ) {
      return value / 1000;
    }

    if (
      unit === "l" ||
      unit === "ltr" ||
      unit === "litre" ||
      unit === "liter" ||
      unit === "litres" ||
      unit === "liters"
    ) {
      return value;
    }

    return 0;
  }

  /*
   * Backward-compatible name.
   * Existing pages may still call unitWeightKg().
   */
  function unitWeightKg(item) {
    return unitEquivalentKg(item);
  }

  function itemQuantity(item) {
    return Math.max(
      0,
      number(item.quantity)
    );
  }

  function itemUnitPrice(item) {
    return number(
      item.unitPrice ??
      item.price ??
      item.productPrice
    );
  }

  function itemTotal(item) {
    return (
      itemUnitPrice(item) *
      itemQuantity(item)
    );
  }

  function isMinimumExempt(item) {
    return (
      normaliseBoolean(
        item.minimumOrderExempt
      ) &&
      itemQuantity(item) > 0
    );
  }

  function totalEquivalentKg(
    cart = read()
  ) {
    return cart.reduce(
      (sum, item) =>
        sum +
        unitEquivalentKg(item) *
          itemQuantity(item),
      0
    );
  }

  /*
   * Backward-compatible name.
   * Existing code that calls totalWeightKg()
   * now receives the order-equivalent total.
   */
  function totalWeightKg(
    cart = read()
  ) {
    return totalEquivalentKg(cart);
  }

  function totalValue(
    cart = read()
  ) {
    return cart.reduce(
      (sum, item) =>
        sum + itemTotal(item),
      0
    );
  }

  function totalItems(
    cart = read()
  ) {
    return cart.reduce(
      (sum, item) =>
        sum + itemQuantity(item),
      0
    );
  }

  function find(
    productId,
    cart = read()
  ) {
    return (
      cart.find(
        item =>
          item.productId ===
          productId
      ) || null
    );
  }

  function quantity(
    productId,
    cart = read()
  ) {
    return itemQuantity(
      find(productId, cart) || {}
    );
  }

  function summarize(
    cart = read(),
    options = {}
  ) {
    const minimumKg =
      Math.max(
        0,
        number(
          options.minimumKg,
          DEFAULT_MINIMUM_KG
        )
      );

    const maximumKg =
      Math.max(
        minimumKg,
        number(
          options.maximumKg,
          DEFAULT_MAXIMUM_KG
        )
      );

    const quantityValue =
      totalItems(cart);

    const equivalentKg =
      totalEquivalentKg(cart);

    const subtotal =
      totalValue(cart);

    const hasExemptProduct =
      cart.some(
        isMinimumExempt
      );

    const minimumReached =
      equivalentKg >=
      minimumKg;

    const maximumReached =
      equivalentKg >=
      maximumKg;

    const withinMaximum =
      equivalentKg <=
      maximumKg;

    const qualified =
      (
        minimumReached ||
        hasExemptProduct
      ) &&
      withinMaximum;

    const remainingKg =
      Math.max(
        0,
        minimumKg -
        equivalentKg
      );

    const remainingMaximumKg =
      Math.max(
        0,
        maximumKg -
        equivalentKg
      );

    const minimumProgress =
      hasExemptProduct
        ? 100
        : minimumKg > 0
          ? Math.min(
              100,
              (
                equivalentKg /
                minimumKg
              ) * 100
            )
          : 100;

    const progressPercent =
      (
        minimumReached ||
        hasExemptProduct
      )
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
      itemLines:
        cart.length,

      quantity:
        quantityValue,

      /*
       * Keep weightKg for compatibility.
       * It now means kg equivalent.
       */
      weightKg:
        equivalentKg,

      equivalentKg,

      subtotal,

      minimumKg,
      maximumKg,

      remainingKg,
      remainingMinimumKg:
        remainingKg,

      remainingMaximumKg,

      minimumProgress,
      progressPercent,

      minimumReached,
      maximumReached,
      withinMaximum,

      hasExemptProduct,
      qualified
    };
  }

  function createCartItem(
    product,
    quantityValue
  ) {
    const maxQuantity =
      Math.min(
        number(
          product.maxQuantity ||
          product.stockUnits,
          99
        ),
        number(
          product.stockUnits ||
          product.maxQuantity,
          99
        )
      );

    return {
      productId:
        product.handleId,

      productName:
        product.name,

      tanglish:
        product.tanglish,

      collection:
        product.collection,

      imageUrl:
        product.imageUrl || "",

      unitLabel:
        product.unitLabel,

      unitValue:
        number(
          product.unitValue
        ),

      unitType:
        product.unitType,

      unitPrice:
        number(
          product.price
        ),

      minimumOrderExempt:
        normaliseBoolean(
          product.minimumOrderExempt
        ),

      quantity:
        quantityValue,

      minQuantity:
        number(
          product.minQuantity,
          1
        ),

      maxQuantity,

      incrementBy:
        number(
          product.incrementBy,
          1
        )
    };
  }

  function projectedTotalEquivalentKg(
    product,
    quantityValue,
    cart = read()
  ) {
    const projected =
      [...cart];

    const index =
      projected.findIndex(
        item =>
          item.productId ===
          product.handleId
      );

    const maxQuantity =
      Math.min(
        number(
          product.maxQuantity ||
          product.stockUnits,
          99
        ),
        number(
          product.stockUnits ||
          product.maxQuantity,
          99
        )
      );

    const nextQuantity =
      Math.max(
        0,
        Math.min(
          maxQuantity,
          number(quantityValue)
        )
      );

    if (nextQuantity <= 0) {
      if (index >= 0) {
        projected.splice(
          index,
          1
        );
      }

      return totalEquivalentKg(
        projected
      );
    }

    const item =
      createCartItem(
        product,
        nextQuantity
      );

    if (index >= 0) {
      projected[index] =
        item;
    } else {
      projected.push(item);
    }

    return totalEquivalentKg(
      projected
    );
  }

  function canSetProduct(
    product,
    quantityValue,
    options = {}
  ) {
    const maximumKg =
      Math.max(
        DEFAULT_MINIMUM_KG,
        number(
          options.maximumKg,
          DEFAULT_MAXIMUM_KG
        )
      );

    return (
      projectedTotalEquivalentKg(
        product,
        quantityValue
      ) <= maximumKg
    );
  }

  function setProduct(
    product,
    quantityValue,
    options = {}
  ) {
    const cart =
      read();

    const index =
      cart.findIndex(
        item =>
          item.productId ===
          product.handleId
      );

    const maxQuantity =
      Math.min(
        number(
          product.maxQuantity ||
          product.stockUnits,
          99
        ),
        number(
          product.stockUnits ||
          product.maxQuantity,
          99
        )
      );

    const nextQuantity =
      Math.max(
        0,
        Math.min(
          maxQuantity,
          number(quantityValue)
        )
      );

    if (nextQuantity <= 0) {
      if (index >= 0) {
        cart.splice(
          index,
          1
        );
      }

      return write(cart);
    }

    if (
      !canSetProduct(
        product,
        nextQuantity,
        options
      )
    ) {
      return cart;
    }

    const item =
      createCartItem(
        product,
        nextQuantity
      );

    if (index >= 0) {
      cart[index] =
        item;
    } else {
      cart.push(item);
    }

    return write(cart);
  }

  function hydrateFromProducts(
    cart,
    products
  ) {
    const productMap =
      new Map(
        (products || []).map(
          product => [
            product.handleId,
            product
          ]
        )
      );

    let changed =
      false;

    const hydrated =
      (cart || []).map(
        item => {
          const product =
            productMap.get(
              item.productId
            );

          if (!product) {
            return item;
          }

          const maxQuantity =
            number(
              product.maxQuantity ||
              product.stockUnits,
              99
            );

          const next = {
            ...item,

            productName:
              product.name,

            tanglish:
              product.tanglish,

            collection:
              product.collection,

            imageUrl:
              product.imageUrl,

            unitLabel:
              product.unitLabel,

            unitValue:
              number(
                product.unitValue
              ),

            unitType:
              product.unitType,

            unitPrice:
              number(
                product.price
              ),

            minimumOrderExempt:
              normaliseBoolean(
                product.minimumOrderExempt
              ),

            minQuantity:
              number(
                product.minQuantity,
                1
              ),

            maxQuantity,

            incrementBy:
              number(
                product.incrementBy,
                1
              ),

            quantity:
              Math.min(
                itemQuantity(item),
                maxQuantity
              )
          };

          if (
            JSON.stringify(next) !==
            JSON.stringify(item)
          ) {
            changed = true;
          }

          return next;
        }
      );

    if (changed) {
      write(hydrated);
    }

    return hydrated;
  }

  window.MFBCart =
    Object.freeze({
      STORAGE_KEY,

      DEFAULT_MINIMUM_KG,
      DEFAULT_MAXIMUM_KG,

      minimumOrderEquivalentKg:
        DEFAULT_MINIMUM_KG,

      maximumOrderEquivalentKg:
        DEFAULT_MAXIMUM_KG,

      read,
      write,
      clear,

      unitEquivalentKg,
      unitWeightKg,

      itemQuantity,
      itemUnitPrice,
      itemTotal,

      isMinimumExempt,

      totalEquivalentKg,
      totalWeightKg,
      totalValue,
      totalItems,

      find,
      quantity,

      summarize,

      projectedTotalEquivalentKg,
      canSetProduct,
      setProduct,

      hydrateFromProducts
    });
})();
