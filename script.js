// ------------------------------------------------------------
// 1. LOAD PROVIDERS
// ------------------------------------------------------------
let providersData = null;

async function loadProviders() {
  try {
    const res = await fetch("providers_fr.json");
    if (res.ok) providersData = await res.json();
  } catch (e) {
    console.error("Fout laden providers:", e);
  }
}
loadProviders();

// ------------------------------------------------------------
// 2. BAN AUTOCOMPLETE
// ------------------------------------------------------------
async function fetchAddresses() {
  const input = document.getElementById("addressInput");
  const suggestionsBox = document.getElementById("addressSuggestions");
  const query = input.value.trim();

  if (query.length < 3) return;

  suggestionsBox.style.display = "none";
  suggestionsBox.innerHTML = "<div class='suggestion-item'>Zoeken...</div>";
  suggestionsBox.style.display = "block";

  try {
    const url =
      "https://api-adresse.data.gouv.fr/search/?q=" +
      encodeURIComponent(query) +
      "&limit=5";

    const res = await fetch(url);
    const data = await res.json();
    renderSuggestions(data.features);
  } catch (e) {
    suggestionsBox.innerHTML =
      "<div class='suggestion-item'>Geen verbinding met API.</div>";
  }
}

function renderSuggestions(features) {
  const suggestionsBox = document.getElementById("addressSuggestions");
  suggestionsBox.innerHTML = "";

  if (!features || features.length === 0) {
    suggestionsBox.innerHTML =
      "<div class='suggestion-item'>Geen adres gevonden.</div>";
    suggestionsBox.style.display = "block";
    return;
  }

  features.forEach((f) => {
    const div = document.createElement("div");
    div.className = "suggestion-item";
    const label = f.properties.label;

    div.innerHTML = `<strong>${label}</strong>`;
    div.onclick = () => selectAddress(f);
    suggestionsBox.appendChild(div);
  });

  suggestionsBox.style.display = "block";
}

// ------------------------------------------------------------
// 3. SELECT ADDRESS → ARCEP REQUEST
// ------------------------------------------------------------
async function selectAddress(feature) {
  document.getElementById("addressSuggestions").style.display = "none";
  const label = feature.properties.label;
  const coords = feature.geometry.coordinates;

  document.getElementById("addressInput").value = label;
  document.getElementById("normalizedAddress").textContent = label;
  document.getElementById("gpsCoords").textContent =
    coords[1] + ", " + coords[0];

  document.getElementById("results").style.display = "block";

  await fetchArcepData(label);
}

// ------------------------------------------------------------
// 4. ARCEP + BACKEND FUNCTION
// ------------------------------------------------------------
async function fetchArcepData(address) {
  const out = document.getElementById("arcepBlock");
  out.innerHTML = "Bezig met controleren…";

  try {
    const url = `/api/arcep?address=${encodeURIComponent(address)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.ok) {
      out.innerHTML =
        "<p>Geen ARCEP-gegevens beschikbaar. Algemene opties worden getoond.</p>";
      renderResults(null);
      return;
    }

    renderResults(data);
  } catch (e) {
    out.innerHTML =
      "<p>Fout bij ophalen ARCEP-data. Algemene opties worden getoond.</p>";
    renderResults(null);
  }
}

// ------------------------------------------------------------
// 5. UI RENDERING
// ------------------------------------------------------------
function renderResults(arcep) {
  const container = document.getElementById("techCards");
  const internet = providersData?.internet || {};

  const listLinks = (arr) => {
    if (!arr) return "";
    return arr
      .map(
        (p) =>
          `<a href="${p.url}" target="_blank" style="display:block;">${p.name}</a>`
      )
      .join("");
  };

  const fibreStatus = arcep
    ? arcep.fibre
      ? "✔ Glasvezel beschikbaar"
      : "✘ Geen glasvezel"
    : "Onbekend (geen ARCEP-data)";

  const mobileStatus = arcep
    ? `
      Orange: ${arcep.mobile.orange || "?"}<br>
      SFR: ${arcep.mobile.sfr || "?"}<br>
      Bouygues: ${arcep.mobile.bouygues || "?"}<br>
      Free: ${arcep.mobile.free || "?"}
    `
    : "Onbekend";

  container.innerHTML = `
    <div class="tech-card">
      <span class="pill">Fibre</span>
      <h3>Glasvezel</h3>
      <p>${fibreStatus}</p>
      <div class="links-list">${listLinks(internet.fibre)}</div>
    </div>

    <div class="tech-card">
      <span class="pill">4G/5G</span>
      <h3>4G/5G Box</h3>
      <p>${mobileStatus}</p>
      <div class="links-list">${listLinks(internet["4g5g"])}</div>
    </div>

    <div class="tech-card">
      <span class="pill">Starlink</span>
      <h3>Satelliet (LEO)</h3>
      <div class="links-list">${listLinks(internet.leo)}</div>
    </div>
  `;

  // TV
  const tv = providersData?.tv?.nl || [];
  document.getElementById("tvList").innerHTML = tv
    .map((t) => `<li>${t.name} (<a href="${t.url}" target="_blank">link</a>)</li>`)
    .join("");

  // VPN
  const vpn = providersData?.vpn || [];
  document.getElementById("vpnList").innerHTML = vpn
    .map(
      (v) =>
        `<li>${v.name} – ${v.type} (<a href="${v.url}" target="_blank">site</a>)</li>`
    )
    .join("");
}
