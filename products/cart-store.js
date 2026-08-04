(() => {
  "use strict";

  const config = window.MFB_PRODUCTS_CONFIG;

  function read() {
    try {
      const parsed = JSON.parse(
        localStorage.getItem(config.CART_STORAGE_KEY) || "[]"
      );
      return Array.isArray(parsed) ? parsed : [];
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

    if (typeof window.updateSharedCartCount === "function") {
      window.updateSharedCartCount();
    }
  }

  function unitWeightKg(item) {
    const value = Number(item.unitValue || 0);
    const unit = String(item.unitType || "").trim().toLowerCase();

    if (unit === "kg") return value;
    if (unit === "g") return value / 1000;

    return 0;
  }

  function totalWeightKg(cart = read()) {
    return cart.reduce(
      (sum, item) =>
        sum + unitWeightKg(item) * Number(item.quantity || 0),
      0
    );
  }

  function totalValue(cart = read()) {
    return cart.reduce(
      (sum, item) =>
        sum +
        Number(item.unitPrice || 0) *
        Number(item.quantity || 0),
      0
    );
  }

  function totalItems(cart = read()) {
    return cart.reduce(
      (sum, item) => sum + Number(item.quantity || 0),
      0
    );
  }

  function find(productId, cart = read()) {
    return cart.find(item => item.productId === productId) || null;
  }

  function quantity(productId, cart = read()) {
    return Number(find(productId, cart)?.quantity || 0);
  }

  function setProduct(product, quantityValue) {
    const cart = read();
    const index = cart.findIndex(
      item => item.productId === product.handleId
    );

    const max = Math.min(
      Number(product.maxQuantity || product.stockUnits || 99),
      Number(product.stockUnits || 99)
    );

    const quantity = Math.max(
      0,
      Math.min(max, Number(quantityValue || 0))
    );

    if (quantity <= 0) {
      if (index >= 0) {
        cart.splice(index, 1);
      }

      write(cart);
      return cart;
    }

    const item = {
      productId: product.handleId,
      productName: product.name,
      tanglish: product.tanglish,
      collection: product.collection,
      imageUrl: product.imageUrl || "",
      unitLabel: product.unitLabel,
      unitValue: Number(product.unitValue),
      unitType: product.unitType,
      unitPrice: Number(product.price),
      quantity,
      minQuantity: Number(product.minQuantity || 1),
      maxQuantity: max,
      incrementBy: Number(product.incrementBy || 1)
    };

    if (index >= 0) {
      cart[index] = item;
    } else {
      cart.push(item);
    }

    write(cart);
    return cart;
  }

  window.MFBCart = Object.freeze({
    read,
    write,
    find,
    quantity,
    setProduct,
    totalWeightKg,
    totalValue,
    totalItems
  });
})();
