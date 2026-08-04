async function loadHeader() {
  const target = document.getElementById("site-header");

  if (!target) return;

  try {
    const response = await fetch("/components/header.html");

    if (!response.ok) {
      throw new Error(`Header load failed: ${response.status}`);
    }

    target.innerHTML = await response.text();
    highlightCurrentPage();
  } catch (error) {
    console.error(error);
  }
}

function highlightCurrentPage() {
  const currentPath = window.location.pathname;

  document.querySelectorAll(".site-nav a").forEach((link) => {
    const linkPath = new URL(link.href).pathname;

    if (
      currentPath === linkPath ||
      (linkPath !== "/" && currentPath.startsWith(linkPath))
    ) {
      link.classList.add("active");
    }
  });
}

document.addEventListener("DOMContentLoaded", loadHeader);
