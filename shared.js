(() => {
  "use strict";

  const CONTACT = {
    phoneDisplay: "+65 8958 2110",
    phoneHref: "+6589582110",
    email: "health@myfarmbox.sg",
    whatsapp: "https://wa.me/6589582110?text=Hi%20MyFarmBox%20Singapore%2C%20I%27d%20like%20to%20know%20more%20about%20your%20harvest.",
    instagram: "https://www.instagram.com/myfarmbox_sg/",
    youtube: "https://www.youtube.com/"
  };

  const NAV_ITEMS = [
    { label: "Home", href: "/" },
    { label: "Founding Harvest", href: "/join/" },
    { label: "Products", href: "/products/" },
    { label: "Account", href: "/account/" }
  ];

  function isActivePath(href) {
    const path = window.location.pathname || "/";
    if (href === "/") return path === "/";
    return path.startsWith(href);
  }

  function navLinks() {
    return NAV_ITEMS.map(item => `
      <a href="${item.href}" class="${isActivePath(item.href) ? "active" : ""}">
        ${item.label}
      </a>
    `).join("");
  }

  function openCallDialog() {
    let dialog = document.getElementById("mfb-call-dialog");

    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.id = "mfb-call-dialog";
      dialog.className = "mfb-call-dialog";

      dialog.innerHTML = `
        <div class="call-dialog-card">
          <button class="call-dialog-close" type="button" data-close-call-dialog aria-label="Close">×</button>

          <p class="eyebrow">Talk to MyFarmBox Singapore</p>
          <h2>We’re happy to talk.</h2>

          <p>Our team is normally available during the hours below.</p>

          <div class="call-dialog-hours">
            <small>Usual call hours</small>
            <strong>10:00 a.m. – 5:00 p.m.</strong>
          </div>

          <p>If something is extremely urgent, please feel free to call us anytime.</p>

          <div class="call-dialog-actions">
            <button class="secondary" type="button" data-close-call-dialog>Not now</button>
            <a class="primary" href="tel:${CONTACT.phoneHref}">
              Call ${CONTACT.phoneDisplay}
            </a>
          </div>
        </div>
      `;

      document.body.appendChild(dialog);

      dialog.querySelectorAll("[data-close-call-dialog]").forEach(button => {
        button.addEventListener("click", () => dialog.close());
      });

      dialog.addEventListener("click", event => {
        if (event.target === dialog) dialog.close();
      });
    }

    dialog.showModal();
  }

  function renderHeader() {
    const mount = document.getElementById("site-header");
    if (!mount) return;

    mount.innerHTML = `
      <header class="site-header">
        <a class="site-logo" href="/" aria-label="MyFarmBox Singapore home">
          <img src="/assets/myfarmbox-logo.webp" alt="MyFarmBox Singapore">
        </a>

        <nav class="site-nav desktop-nav" aria-label="Primary navigation">
          ${navLinks()}
        </nav>

        <div class="header-actions">
          <a class="header-cart" href="/cart/" aria-label="Open cart">
            <span aria-hidden="true">🧺</span>
            <span class="header-cart-text">Cart</span>
            <strong id="shared-cart-count">0</strong>
          </a>

          <button class="header-cta desktop-cta" type="button" data-talk-to-us>
            Talk to us
          </button>

          <button
            class="mobile-menu-button"
            type="button"
            aria-label="Open menu"
            aria-expanded="false"
            aria-controls="mobile-navigation"
          >
            <span></span><span></span><span></span>
          </button>
        </div>

        <nav id="mobile-navigation" class="mobile-navigation" aria-label="Mobile navigation" hidden>
          ${navLinks()}

          <a href="/cart/">
            <span>Cart</span>
            <strong id="mobile-cart-count">0</strong>
          </a>

          <button class="mobile-join" type="button" data-talk-to-us>
            Talk to us
          </button>
        </nav>
      </header>
    `;

    const menuButton = mount.querySelector(".mobile-menu-button");
    const mobileNav = mount.querySelector("#mobile-navigation");

    if (menuButton && mobileNav) {
      menuButton.addEventListener("click", () => {
        const open = menuButton.getAttribute("aria-expanded") === "true";

        menuButton.setAttribute("aria-expanded", String(!open));
        menuButton.classList.toggle("open", !open);
        mobileNav.hidden = open;

        requestAnimationFrame(() => {
          mobileNav.classList.toggle("open", !open);
        });

        document.body.classList.toggle("mobile-menu-open", !open);
      });
    }

    mount.querySelectorAll("[data-talk-to-us]").forEach(button => {
      button.addEventListener("click", openCallDialog);
    });

    updateSharedCartCount();
  }

  function instagramIcon() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.75 2h8.5A5.76 5.76 0 0 1 22 7.75v8.5A5.76 5.76 0 0 1 16.25 22h-8.5A5.76 5.76 0 0 1 2 16.25v-8.5A5.76 5.76 0 0 1 7.75 2Zm0 2A3.76 3.76 0 0 0 4 7.75v8.5A3.76 3.76 0 0 0 7.75 20h8.5A3.76 3.76 0 0 0 20 16.25v-8.5A3.76 3.76 0 0 0 16.25 4h-8.5Zm8.75 1.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/></svg>`;
  }

  function youtubeIcon() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.6 15.6V8.4L15.8 12l-6.2 3.6Z"/></svg>`;
  }

  function whatsappIcon() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.52 3.48A11.8 11.8 0 0 0 12.1 0C5.56 0 .24 5.32.24 11.86c0 2.09.55 4.13 1.59 5.93L.14 24l6.36-1.67a11.84 11.84 0 0 0 5.59 1.42h.01c6.54 0 11.86-5.32 11.86-11.86a11.8 11.8 0 0 0-3.44-8.41Zm-8.42 18.27h-.01a9.84 9.84 0 0 1-5.02-1.37l-.36-.21-3.77.99 1.01-3.68-.24-.38a9.84 9.84 0 1 1 8.39 4.65Z"/></svg>`;
  }

  function renderFooter() {
    const mount = document.getElementById("site-footer");
    if (!mount) return;

    mount.innerHTML = `
      <footer class="site-footer">
        <div class="footer-brand">
          <img src="/assets/myfarmbox-logo.webp" alt="MyFarmBox Singapore">
          <p class="footer-brand-line">Natural. Harvest. Delivered.</p>
        </div>

        <div class="footer-philosophy">
          <p>We Harvest For Families,<br>Not For Shelves.</p>
        </div>

        <div class="footer-links">
          <h4>Explore</h4>
          <a href="/products/">Harvest</a>
          <a href="/join/">Plan My Harvest</a>
          <a href="/account/">My Account</a>
        </div>

        <div class="footer-social">
          <h4>Follow us</h4>
          <div class="social-links">
            <a class="social-link" href="${CONTACT.instagram}" target="_blank" rel="noopener" aria-label="Instagram">
              ${instagramIcon()}
            </a>
            <a class="social-link" href="${CONTACT.youtube}" target="_blank" rel="noopener" aria-label="YouTube">
              ${youtubeIcon()}
            </a>
          </div>
        </div>

        <div class="footer-contact">
          <h4>Need help planning your harvest?</h4>
          <a href="tel:${CONTACT.phoneHref}">☎ ${CONTACT.phoneDisplay}</a>
          <a href="${CONTACT.whatsapp}" target="_blank" rel="noopener">💬 WhatsApp Us</a>
          <a href="mailto:${CONTACT.email}">✉ ${CONTACT.email}</a>
        </div>

        <div class="footer-bottom">
          © <span id="shared-year"></span> MyFarmBox Singapore.
        </div>
      </footer>

      <a
        class="floating-whatsapp"
        href="${CONTACT.whatsapp}"
        target="_blank"
        rel="noopener"
        aria-label="Chat with MyFarmBox Singapore on WhatsApp"
      >
        ${whatsappIcon()}
        <strong>WhatsApp</strong>
      </a>
    `;

    const year = document.getElementById("shared-year");
    if (year) year.textContent = String(new Date().getFullYear());
  }

  function readCartCount() {
    try {
      if (window.MFBCart && typeof window.MFBCart.read === "function") {
        const cart = window.MFBCart.read();
        if (typeof window.MFBCart.totalItems === "function") {
          return window.MFBCart.totalItems(cart);
        }
      }

      const cart = JSON.parse(localStorage.getItem("mfb_sg_cart_v1") || "[]");
      return Array.isArray(cart)
        ? cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
        : 0;
    } catch {
      return 0;
    }
  }

  function updateSharedCartCount() {
    const count = String(readCartCount());

    ["shared-cart-count", "mobile-cart-count", "cart-count"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = count;
    });
  }

  window.updateSharedCartCount = updateSharedCartCount;

  function init() {
    renderHeader();
    renderFooter();
    updateSharedCartCount();
  }

  document.addEventListener("DOMContentLoaded", init, { once: true });
  window.addEventListener("mfb:cart-changed", updateSharedCartCount);
  window.addEventListener("storage", event => {
    if (event.key === "mfb_sg_cart_v1") updateSharedCartCount();
  });
})();
