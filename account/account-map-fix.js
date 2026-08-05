(() => {
  "use strict";

  const DEFAULT_CENTER = [1.3521, 103.8198];

  let map = null;
  let marker = null;
  let buildTimer = null;
  let geocodeController = null;

  const $ = id => document.getElementById(id);

  const els = {
    dialog: $("address-dialog"),
    map: $("address-map"),
    editButton: $("edit-address-button"),
    latLong: $("edit-lat-long"),
    address: $("edit-address-line"),
    postal: $("edit-postal-code"),
    label: $("edit-place-name"),
    mapStatus: $("map-status"),
    coordinates: $("map-coordinates"),
    findAddress: $("find-written-address"),
    currentLocation: $("use-current-location"),
    close: $("close-address-dialog"),
    cancel: $("cancel-address"),
    save: $("save-address")
  };

  if (
    typeof L === "undefined" ||
    !els.dialog ||
    !els.map ||
    !els.editButton
  ) {
    return;
  }

  function parseLatLong(value) {
    const parts = String(value || "")
      .split(",")
      .map(part => Number(part.trim()));

    if (
      parts.length !== 2 ||
      !Number.isFinite(parts[0]) ||
      !Number.isFinite(parts[1])
    ) {
      return null;
    }

    return parts;
  }

  function formatLatLong(lat, lng) {
    return `${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`;
  }

  function pinIcon() {
    return L.divIcon({
      className: "mfb-map-pin-wrap",
      html: '<div class="mfb-map-pin" aria-hidden="true"></div>',
      iconSize: [34, 42],
      iconAnchor: [17, 40]
    });
  }

  function setStatus(message, type = "") {
    if (els.mapStatus) {
      els.mapStatus.textContent = message;
      els.mapStatus.className = type;
    }
  }

  function writeCoordinates(lat, lng) {
    const value = formatLatLong(lat, lng);

    if (els.latLong) els.latLong.value = value;
    if (els.coordinates) els.coordinates.textContent = value;
  }

  function destroyMap() {
    window.clearTimeout(buildTimer);

    if (map) {
      map.off();
      map.remove();
      map = null;
    }

    marker = null;

    if (els.map) {
      els.map.innerHTML = "";
      els.map.removeAttribute("style");
      els.map.className = "";
    }
  }

  function positionMarker(lat, lng, message, lookupAddress = false) {
    if (!map) return;

    const point = [Number(lat), Number(lng)];

    if (!marker) {
      marker = L.marker(point, {
        draggable: true,
        autoPan: true,
        icon: pinIcon()
      }).addTo(map);

      marker.on("dragend", event => {
        const position = event.target.getLatLng();

        writeCoordinates(position.lat, position.lng);
        setStatus("Delivery pin updated.", "ready");
        reverseLookup(position.lat, position.lng);
      });
    } else {
      marker.setLatLng(point);
    }

    writeCoordinates(point[0], point[1]);
    setStatus(message || "Delivery pin selected.", "ready");

    map.setView(point, 18, { animate: false });
    map.invalidateSize({ animate: false });

    if (lookupAddress) {
      reverseLookup(point[0], point[1]);
    }
  }

  function buildMap() {
    destroyMap();

    const tryBuild = attempts => {
      const rect = els.map.getBoundingClientRect();

      if (
        !els.dialog.open ||
        rect.width < 250 ||
        rect.height < 250
      ) {
        if (attempts < 30) {
          buildTimer = window.setTimeout(
            () => tryBuild(attempts + 1),
            80
          );
        }
        return;
      }

      const saved = parseLatLong(els.latLong?.value);
      const center = saved || DEFAULT_CENTER;

      map = L.map(els.map, {
        zoomControl: true,
        attributionControl: true,
        dragging: true,
        scrollWheelZoom: true,
        doubleClickZoom: true,
        touchZoom: true,
        tap: true
      });

      L.tileLayer(
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          maxZoom: 19,
          tileSize: 256,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }
      ).addTo(map);

      map.setView(center, saved ? 18 : 11, {
        animate: false
      });

      map.on("click", event => {
        positionMarker(
          event.latlng.lat,
          event.latlng.lng,
          "Delivery pin moved.",
          true
        );
      });

      if (saved) {
        positionMarker(
          saved[0],
          saved[1],
          "Saved delivery pin loaded."
        );
      } else {
        setStatus(
          "Tap the map, find the written address, or use your current location."
        );
      }

      [0, 100, 300, 650].forEach(delay => {
        window.setTimeout(() => {
          if (!map) return;

          map.invalidateSize({
            animate: false,
            pan: false
          });

          map.setView(
            marker ? marker.getLatLng() : center,
            marker ? 18 : 11,
            { animate: false }
          );
        }, delay);
      });
    };

    tryBuild(0);
  }

  async function reverseLookup(lat, lng) {
    if (geocodeController) {
      geocodeController.abort();
    }

    geocodeController = new AbortController();
    setStatus("Finding the address for this pin…");

    try {
      const url = new URL(
        "https://nominatim.openstreetmap.org/reverse"
      );

      url.search = new URLSearchParams({
        format: "jsonv2",
        lat: String(lat),
        lon: String(lng),
        zoom: "18",
        addressdetails: "1",
        "accept-language": "en"
      }).toString();

      const response = await fetch(url, {
        signal: geocodeController.signal,
        headers: { Accept: "application/json" }
      });

      if (!response.ok) {
        throw new Error("Reverse lookup failed.");
      }

      const result = await response.json();
      const details = result.address || {};

      if (result.display_name && els.address) {
        els.address.value = result.display_name;
      }

      if (details.postcode && els.postal) {
        els.postal.value = String(details.postcode)
          .replace(/\D/g, "")
          .slice(0, 6);
      }

      if (
        els.label &&
        !els.label.value.trim()
      ) {
        els.label.value =
          details.suburb ||
          details.neighbourhood ||
          details.city_district ||
          details.city ||
          "Home";
      }

      writeCoordinates(lat, lng);
      setStatus("Pin and address updated.", "ready");
    } catch (error) {
      if (error.name === "AbortError") return;

      writeCoordinates(lat, lng);
      setStatus(
        "Pin saved. Please verify the written address.",
        "ready"
      );
    }
  }

  async function findWrittenAddress() {
    const query = [
      els.address?.value.trim(),
      els.postal?.value.trim(),
      "Singapore"
    ].filter(Boolean).join(", ");

    if (!query || query === "Singapore") {
      setStatus("Enter an address or postal code first.", "error");
      return;
    }

    els.findAddress.disabled = true;
    els.findAddress.textContent = "Finding…";
    setStatus("Finding this address on the map…");

    try {
      const url = new URL(
        "https://nominatim.openstreetmap.org/search"
      );

      url.search = new URLSearchParams({
        format: "jsonv2",
        q: query,
        limit: "1",
        countrycodes: "sg",
        addressdetails: "1",
        "accept-language": "en"
      }).toString();

      const response = await fetch(url, {
        headers: { Accept: "application/json" }
      });

      if (!response.ok) {
        throw new Error("Address lookup failed.");
      }

      const results = await response.json();
      const result = results[0];

      if (!result) {
        throw new Error("Address not found.");
      }

      positionMarker(
        Number(result.lat),
        Number(result.lon),
        "Address found. Drag the pin to the exact entrance."
      );

      if (result.display_name && els.address) {
        els.address.value = result.display_name;
      }

      const postcode = result.address?.postcode;

      if (postcode && els.postal) {
        els.postal.value = String(postcode)
          .replace(/\D/g, "")
          .slice(0, 6);
      }
    } catch {
      setStatus(
        "We could not find that address. Try the postal code or tap the map.",
        "error"
      );
    } finally {
      els.findAddress.disabled = false;
      els.findAddress.textContent = "Find This Address";
    }
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setStatus(
        "Current location is not supported on this device.",
        "error"
      );
      return;
    }

    els.currentLocation.disabled = true;
    els.currentLocation.textContent = "Finding…";
    setStatus("Requesting your current location…");

    navigator.geolocation.getCurrentPosition(
      position => {
        positionMarker(
          position.coords.latitude,
          position.coords.longitude,
          "Current location selected.",
          true
        );

        els.currentLocation.disabled = false;
        els.currentLocation.textContent =
          "Use Current Location";
      },
      () => {
        setStatus(
          "We could not access your current location.",
          "error"
        );

        els.currentLocation.disabled = false;
        els.currentLocation.textContent =
          "Use Current Location";
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 30000
      }
    );
  }

  /*
  Run after the existing account.js click handler. It opens and populates
  the dialog first; this controller then creates a fresh visible map.
  */
  els.editButton.addEventListener("click", () => {
    window.setTimeout(buildMap, 180);
  });

  if (els.findAddress) {
    els.findAddress.onclick = findWrittenAddress;
  }

  if (els.currentLocation) {
    els.currentLocation.onclick = useCurrentLocation;
  }

  [els.close, els.cancel].forEach(button => {
    if (!button) return;

    button.addEventListener("click", () => {
      destroyMap();
    });
  });

  if (els.save) {
    els.save.addEventListener("click", () => {
      window.setTimeout(destroyMap, 250);
    });
  }

  els.dialog.addEventListener("close", destroyMap);
})();
