(() => {
  "use strict";

  const CART_KEY = "mfb_sg_cart_v1";

  const resetButton =
    document.getElementById("reset-cart-button");

  const cartCount =
    document.getElementById("cart-count");

  if (!resetButton) return;

  function readCart() {
    try {
      const parsed = JSON.parse(
        localStorage.getItem(CART_KEY) || "[]"
      );

      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function updateVisibility() {
    resetButton.hidden = readCart().length === 0;
  }

  function resetCart() {
    const cart = readCart();

    if (!cart.length) {
      updateVisibility();
      return;
    }

    const confirmed = window.confirm(
      "Remove every product from your harvest and start again?"
    );

    if (!confirmed) return;

    localStorage.removeItem(CART_KEY);

    if (
      typeof window.updateSharedCartCount === "function"
    ) {
      window.updateSharedCartCount();
    }

    window.location.reload();
  }

  resetButton.addEventListener("click", resetCart);

  if (cartCount) {
    const observer =
      new MutationObserver(updateVisibility);

    observer.observe(cartCount, {
      childList: true,
      characterData: true,
      subtree: true
    });
  }

  window.addEventListener("storage", event => {
    if (event.key === CART_KEY) {
      updateVisibility();
    }
  });

  updateVisibility();
})();
