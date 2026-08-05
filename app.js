(() => {
  "use strict";

  const year = document.getElementById("year");
  const heroImage = document.querySelector(".harvest-image-card > img");
  const fallback = document.querySelector(".image-fallback");

  if (year) {
    year.textContent = new Date().getFullYear();
  }

  if (heroImage && fallback) {
    heroImage.addEventListener("load", () => {
      fallback.hidden = true;
    });

    heroImage.addEventListener("error", () => {
      heroImage.hidden = true;
      fallback.hidden = false;
    });

    if (heroImage.complete && heroImage.naturalWidth > 0) {
      fallback.hidden = true;
    }
  }
})();
