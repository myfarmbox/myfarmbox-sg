(() => {
  "use strict";

  async function loadHeader() {
    const target = document.getElementById("site-header");
    if (!target) return;

    try {
      const response = await fetch("/components/header.html", { cache: "no-cache" });
      if (!response.ok) throw new Error(`Header load failed: ${response.status}`);

      target.innerHTML = await response.text();
      highlightCurrentPage();
    } catch (error) {
      console.error("Unable to load shared header:", error);
    }
  }

  function highlightCurrentPage() {
    const currentPath = window.location.pathname;

    document.querySelectorAll(".site-nav a").forEach((link) => {
      const linkPath = new URL(link.href).pathname;
      const isHome = linkPath === "/" && currentPath === "/";
      const isSection = linkPath !== "/" && currentPath.startsWith(linkPath);

      if (isHome || isSection) {
        link.classList.add("active");
        link.setAttribute("aria-current", "page");
      }
    });
  }

  document.addEventListener("DOMContentLoaded", loadHeader);
})();
