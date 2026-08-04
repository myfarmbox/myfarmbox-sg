(() => {
  "use strict";

  const HEADER_URL = "/components/header.html";
  const CART_STORAGE_KEY = "mfb_sg_cart_v1";

  function fallbackHeaderMarkup() {
    return `
      <header class="site-header" id="site-header-bar">
        <a class="site-logo" href="/" aria-label="MyFarmBox Singapore home">
          <img src="/assets/myfarmbox-logo.webp" alt="MyFarmBox">
        </a>

        <nav class="site-nav desktop-nav" aria-label="Main navigation">
          <a href="/">Home</a>
          <a href="/join/">Founding Harvest</a>
          <a href="/products/">Products</a>
          <a href="/account/">Account</a>
        </nav>

        <div class="header-actions">
          <a class="header-cart" href="/cart/" aria-label="Open your harvest cart">
            <span aria-hidden="true">🧺</span>
            <span class="header-cart-text">Cart</span>
            <strong data-shared-cart-count>0</strong>
          </a>

          <a class="header-cta desktop-cta" href="/join/">Join Now</a>

          <button
            id="mobile-menu-button"
            class="mobile-menu-button"
            type="button"
            aria-label="Open navigation menu"
            aria-controls="mobile-navigation"
            aria-expanded="false"
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>

        <nav
          id="mobile-navigation"
          class="mobile-navigation"
          aria-label="Mobile navigation"
          hidden
        >
          <a href="/">Home</a>
          <a href="/join/">Founding Harvest</a>
          <a href="/products/">Products</a>
          <a href="/cart/">
            Your Harvest
            <strong data-shared-cart-count>0</strong>
          </a>
          <a href="/account/">Account</a>
          <a class="mobile-join" href="/join/">Join Now</a>
        </nav>
      </header>
    `;
  }

  async function loadHeader() {
    const target = document.getElementById("site-header");

    if (!target) {
      return;
    }

    try {
      const response = await fetch(`${HEADER_URL}?v=2`, {
        method: "GET",
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error(`Header load failed: ${response.status}`);
      }

      const html = await response.text();

      if (!html.trim()) {
        throw new Error("Header response was empty.");
      }

      target.innerHTML = html;
    } catch (error) {
      console.error("Unable to load shared header:", error);
      target.innerHTML = fallbackHeaderMarkup();
    }

    initialiseHeader();
  }

  function initialiseHeader() {
    highlightCurrentPage();
    initialiseMobileMenu();
    updateSharedCartCount();
  }

  function highlightCurrentPage() {
    const currentPath = normalisePath(window.location.pathname);

    document
      .querySelectorAll(".site-nav a, .mobile-navigation a")
      .forEach(link => {
        const linkPath = normalisePath(new URL(link.href).pathname);

        const isHome = linkPath === "/" && currentPath === "/";
        const isSection =
          linkPath !== "/" && currentPath.startsWith(linkPath);

        if (isHome || isSection) {
          link.classList.add("active");
          link.setAttribute("aria-current", "page");
        }
      });
  }

  function initialiseMobileMenu() {
    const button = document.getElementById("mobile-menu-button");
    const menu = document.getElementById("mobile-navigation");

    if (!button || !menu) {
      return;
    }

    function closeMenu() {
      button.setAttribute("aria-expanded", "false");
      button.classList.remove("open");
      menu.classList.remove("open");
      menu.hidden = true;
      document.body.classList.remove("mobile-menu-open");
    }

    function openMenu() {
      button.setAttribute("aria-expanded", "true");
      button.classList.add("open");
      menu.hidden = false;

      requestAnimationFrame(() => {
        menu.classList.add("open");
      });

      document.body.classList.add("mobile-menu-open");
    }

    button.addEventListener("click", () => {
      const expanded = button.getAttribute("aria-expanded") === "true";

      if (expanded) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    menu.querySelectorAll("a").forEach(link => {
      link.addEventListener("click", closeMenu);
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        closeMenu();
      }
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 820) {
        closeMenu();
      }
    });
  }

  function readCart() {
    try {
      const cart = JSON.parse(
        localStorage.getItem(CART_STORAGE_KEY) || "[]"
      );

      return Array.isArray(cart) ? cart : [];
    } catch (error) {
      return [];
    }
  }

  function updateSharedCartCount() {
    const count = readCart().reduce(
      (total, item) => total + Number(item.quantity || 0),
      0
    );

    document
      .querySelectorAll("[data-shared-cart-count]")
      .forEach(node => {
        node.textContent = String(count);
      });
  }

  function normalisePath(path) {
    if (!path || path === "/") {
      return "/";
    }

    return path.endsWith("/") ? path : `${path}/`;
  }

  window.updateSharedCartCount = updateSharedCartCount;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadHeader);
  } else {
    loadHeader();
  }

  window.addEventListener("storage", event => {
    if (event.key === CART_STORAGE_KEY) {
      updateSharedCartCount();
    }
  });
})();
