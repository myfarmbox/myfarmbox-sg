(() => {
  "use strict";

  // 24 August 2026, 12:00 a.m. Singapore time (UTC+8)
  const launchTime = Date.UTC(2026, 7, 23, 16, 0, 0);

  const elements = {
    days: document.getElementById("days"),
    hours: document.getElementById("hours"),
    minutes: document.getElementById("minutes"),
    seconds: document.getElementById("seconds"),
    countdown: document.querySelector(".countdown"),
    launchMessage: document.getElementById("launch-message"),
    primaryCta: document.getElementById("primary-cta"),
    year: document.getElementById("year")
  };

  const pad = value => String(value).padStart(2, "0");

  function showLiveState() {
    if (elements.countdown) {
      elements.countdown.hidden = true;
    }

    if (elements.launchMessage) {
      elements.launchMessage.hidden = false;
    }

    if (elements.primaryCta) {
      elements.primaryCta.innerHTML = "Explore MyFarmBox <span>→</span>";
      elements.primaryCta.href = "https://myfarmbox.github.io/singapore/";
    }
  }

  function updateCountdown() {
    const remaining = launchTime - Date.now();

    if (remaining <= 0) {
      showLiveState();
      return false;
    }

    const totalSeconds = Math.floor(remaining / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    elements.days.textContent = pad(days);
    elements.hours.textContent = pad(hours);
    elements.minutes.textContent = pad(minutes);
    elements.seconds.textContent = pad(seconds);

    return true;
  }

  if (elements.year) {
    elements.year.textContent = new Date().getFullYear();
  }

  const shouldContinue = updateCountdown();

  if (shouldContinue) {
    const timer = window.setInterval(() => {
      if (!updateCountdown()) {
        window.clearInterval(timer);
      }
    }, 1000);
  }
})();
