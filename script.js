let providersData = null;

// PROVIDERS LADEN
(async () => {
  try {
    const res = await fetch("providers_fr.json");
    if (res.ok) providersData = await res.json();
  } catch (e) {
    console.error("providers.json fout:", e);
  }
})();

// BAN SUGGESTIES
async function fetchAddresses() {
  const input = document.getElementById("addressInput");
  const box = document.getElementById("addressSuggestions");
  const q = input.value.trim();
  if (q.length < 3) return;

  box.style.display = "block";
  box.innerHTML = "<div class='suggestion-item'>Zoeken...</div>";

  try {
    const url =
      "https://api-adresse.data.gouv.fr/search/?q=" +
      encodeURIComponent(q) +
      "&limit=5";

    const res = await fetch(url);
    const data = await res.json();
    renderSuggestions(data.features);
  } catch (e) {
    box.innerHTML = "<div class='suggestion-item'>API fout</div>";
  }
}

function renderSuggestions(features) {
  const box = document.getElementById("addressSuggestions");
  box.innerHTML = "";

  if (!features || features.length === 0) {
    box.innerHTML = "<div class='suggestion-item'>Geen adres gevonden</div>";
    return;
  }

  features.forEach((f) => {
    const div = document.createElement("div");
    div.className = "suggestion-item";
    div.innerHTML = `<strong>${f.properties.label}</strong>`;
    div.onclick = () => selectAddress(f);
    box.appendChild(div);
  });
}

// ADRES GEKOZEN
async function selectAddress(feature) {
  const box = document.getElementById("addressSuggestions");
  box.style.display = "none";

  const label = feature.properties.label;
  const [lon, lat] = feature.geometry.coordinates;

  document.getElementById("addressInput").value = label;
  document.getElementById("normalizedAddress").textContent = label;
  document.getElementById("gpsCoords").textContent = `${lat}, ${lon}`;

  document.getElementById("results").style.display = "block";

  await fetchArcepData(label);
}

// ARCEP BACKEND
async function fetchArcepData(address) {
  const out = document.getElementById("arcepBlock");
  out.innerHTML = "Controleren…";

  try {
    const url =
      "https://internetverbinding.vercel.app/api/arcep?address=" +
      encodeURIComponent(address);

    const res = await fetch(url);
    const data = await res.json();

    if (!data.ok) {
      out.innerHTML = "<p>Geen ARCEP-data. Wij tonen algemene opties.</p>";
      renderResults(null);
      return;
    }

    out.innerHTML = `
      <p><strong>ARCEP-resultaten</strong></p>
      <p>Glasvezel: ${data.fibre ? "Ja" : "Nee"}</p>
      <p>DSL: ${data.dsl ? "Ja" : "Nee"}</p>
    `;

    renderResults(data);
  } catch (e) {
    out.innerHTML = "<p>Fout — algemene opties getoond.</p>";
    renderResults(null);
  }
}

// RENDER RESULTATEN
function renderResults(arcep) {
  const c = document.getElementById("techCards");
  const net = providersData?.internet || {};

  const list = (arr) =>
    arr
      ?.map(
        (p) =>
          `<a href="${p.url}" target="_blank" style="display:block;">${p.name}</a>`
      )
      .join("") || "";

  const fibreStatus = arcep
    ? arcep.fibre
      ? "✔ Glasvezel beschikbaar"
      : "✘ Geen glasvezel"
    : "Onbekend";

  const mobileStatus = arcep
    ? `
      Orange: ${arcep.mobile.orange || "?"}<br>
      SFR: ${arcep.mobile.sfr || "?"}<br>
      Bouygues: ${arcep.mobile.bouygues || "?"}<br>
      Free: ${arcep.mobile.free || "?"}
      `
    : "Onbekend";

  c.innerHTML = `
    <div class="tech-card">
      <span class="pill">Fibre</span>
      <h3>Glasvezel</h3>
      <p>${fibreStatus}</p>
      ${list(net.fibre)}
    </div>

    <div class="tech-card">
      <span class="pill">4G/5G</span>
      <h3>4G/5G Box</h3>
      <p>${mobileStatus}</p>
      ${list(net["4g5g"])}
    </div>

    <div class="tech-card">
      <span class="pill">Starlink</span>
      <h3>Satelliet (LEO)</h3>
      ${list(net.leo)}
    </div>
  `;

  document.getElementById("tvList").innerHTML =
    (providersData?.tv?.nl || [])
      .map((t) => `<li>${t.name} (<a href="${t.url}">link</a>)</li>`)
      .join("");

  document.getElementById("vpnList").innerHTML =
    (providersData?.vpn || [])
      .map((v) => `<li>${v.name} – ${v.type} (<a href="${v.url}">site</a>)</li>`)
      .join("");
}
