const launchDate = new Date("2026-08-24T00:00:00+08:00").getTime();

const elements = {
  countdown: document.getElementById("countdown"),
  liveMessage: document.getElementById("liveMessage"),
  days: document.getElementById("days"),
  hours: document.getElementById("hours"),
  minutes: document.getElementById("minutes"),
  seconds: document.getElementById("seconds"),
  mainCta: document.getElementById("mainCta")
};

function twoDigits(value) {
  return String(value).padStart(2, "0");
}

function updateCountdown() {
  const now = Date.now();
  const distance = launchDate - now;

  if (distance <= 0) {
    elements.countdown.hidden = true;
    elements.liveMessage.hidden = false;
    elements.liveMessage.style.display = "flex";
    elements.mainCta.innerHTML = "Explore MyFarmBox <span>→</span>";
    clearInterval(timer);
    return;
  }

  const days = Math.floor(distance / (1000 * 60 * 60 * 24));
  const hours = Math.floor((distance / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((distance / (1000 * 60)) % 60);
  const seconds = Math.floor((distance / 1000) % 60);

  elements.days.textContent = twoDigits(days);
  elements.hours.textContent = twoDigits(hours);
  elements.minutes.textContent = twoDigits(minutes);
  elements.seconds.textContent = twoDigits(seconds);
}

document.getElementById("year").textContent = new Date().getFullYear();
updateCountdown();
const timer = setInterval(updateCountdown, 1000);
