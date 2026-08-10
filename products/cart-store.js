(() => {
  "use strict";

  const config = window.MFB_PRODUCTS_CONFIG;

  const MIN_ORDER_EQUIVALENT_KG = Number(
    config.DEFAULT_MINIMUM_ORDER_KG || 5
  );

  const MAX_ORDER_EQUIVALENT_KG = Number(
    config.MAX_ORDER_EQUIVALENT_KG || 20
  );

  function read() {
    try {
      const parsed = JSON.parse(
        localStorage.getItem(
          config.CART_STORAGE_KEY
        ) || "[]"
      );

      return Array.isArray(parsed)
        ? parsed
        : [];

    } catch {
      return [];
    }
  }

  function write(cart) {
    localStorage.setItem(
      config.CART_STORAGE_KEY,
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
  }

  /*
   * ORDER EQUIVALENT
   *
   * kg  → kg
   * g   → kg
   * ml  → litre equivalent
   * l   → kg equivalent
   *
   * For basket-limit purposes:
   * 1000 ml = 1 kg equivalent.
   *
   * This is an ordering rule only.
   * It is not claiming that every liquid
   * physically weighs exactly 1 kg/litre.
   */
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
    cart = read()
  ) {
    return cart.reduce(
      (sum, item) =>
        sum +
        unitEquivalentKg(item) *
          Number(item.quantity || 0),
      0
    );
  }

  /*
   * Keep this old function name because
   * products.js, cart.js and checkout.js
   * already use it.
   *
   * It now means "order equivalent kg".
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
        sum +
        Number(item.unitPrice || 0) *
          Number(item.quantity || 0),
      0
    );
  }

  function totalItems(
    cart = read()
  ) {
    return cart.reduce(
      (sum, item) =>
        sum +
        Number(item.quantity || 0),
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
          item.productId === productId
      ) || null
    );
  }

  function quantity(
    productId,
    cart = read()
  ) {
    return Number(
      find(productId, cart)?.quantity || 0
    );
  }

  function createCartItem(
    product,
    quantity
  ) {
    const max = Math.min(
      Number(
        product.maxQuantity ||
        product.stockUnits ||
        99
      ),
      Number(
        product.stockUnits || 99
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
        Number(product.unitValue),

      unitType:
        product.unitType,

      unitPrice:
        Number(product.price),

      minimumOrderExempt:
        String(
          product.minimumOrderExempt
        )
          .trim()
          .toLowerCase() === "true",

      quantity,

      minQuantity:
        Number(
          product.minQuantity || 1
        ),

      maxQuantity:
        max,

      incrementBy:
        Number(
          product.incrementBy || 1
        )
    };
  }

  function projectedTotalEquivalentKg(
    product,
    quantityValue
  ) {
    const cart = read();

    const index =
      cart.findIndex(
        item =>
          item.productId ===
          product.handleId
      );

    const max = Math.min(
      Number(
        product.maxQuantity ||
        product.stockUnits ||
        99
      ),
      Number(
        product.stockUnits || 99
      )
    );

    const quantity = Math.max(
      0,
      Math.min(
        max,
        Number(quantityValue || 0)
      )
    );

    const projectedCart =
      [...cart];

    if (quantity <= 0) {
      if (index >= 0) {
        projectedCart.splice(
          index,
          1
        );
      }
    } else {
      const item =
        createCartItem(
          product,
          quantity
        );

      if (index >= 0) {
        projectedCart[index] = item;
      } else {
        projectedCart.push(item);
      }
    }

    return totalEquivalentKg(
      projectedCart
    );
  }

  function canSetProduct(
    product,
    quantityValue
  ) {
    return (
      projectedTotalEquivalentKg(
        product,
        quantityValue
      ) <=
      MAX_ORDER_EQUIVALENT_KG
    );
  }

  function setProduct(
    product,
    quantityValue
  ) {
    const cart = read();

    const index =
      cart.findIndex(
        item =>
          item.productId ===
          product.handleId
      );

    const max = Math.min(
      Number(
        product.maxQuantity ||
        product.stockUnits ||
        99
      ),
      Number(
        product.stockUnits || 99
      )
    );

    const quantity = Math.max(
      0,
      Math.min(
        max,
        Number(quantityValue || 0)
      )
    );

    if (quantity <= 0) {
      if (index >= 0) {
        cart.splice(index, 1);
      }

      write(cart);
      return cart;
    }

    /*
     * Hard protection against orders
     * exceeding 20 kg equivalent.
     */
    if (
      !canSetProduct(
        product,
        quantity
      )
    ) {
      return cart;
    }

    const item =
      createCartItem(
        product,
        quantity
      );

    if (index >= 0) {
      cart[index] = item;
    } else {
      cart.push(item);
    }

    write(cart);

    return cart;
  }

  window.MFBCart =
    Object.freeze({
      read,
      write,
      find,
      quantity,
      setProduct,

      totalWeightKg,
      totalEquivalentKg,

      projectedTotalEquivalentKg,
      canSetProduct,

      totalValue,
      totalItems,

      minimumOrderEquivalentKg:
        MIN_ORDER_EQUIVALENT_KG,

      maximumOrderEquivalentKg:
        MAX_ORDER_EQUIVALENT_KG
    });
})();
