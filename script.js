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
    const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=5`;
    const res = await fetch(url);
    const data = await res.json();
    renderSuggestions(data.features);
  } catch (e) {
    suggestionsBox.innerHTML = "<div class='suggestion-item'>API Fout</div>";
  }
}

function renderSuggestions(features) {
  const suggestionsBox = document.getElementById("addressSuggestions");
  suggestionsBox.innerHTML = "";

  if (!features || features.length === 0) {
    suggestionsBox.innerHTML = "<div class='suggestion-item'>Geen adres gevonden.</div>";
    suggestionsBox.style.display = "block";
    return;
  }

  features.forEach((f) => {
    const div = document.createElement("div");
    div.className = "suggestion-item";
    div.innerHTML = `<strong>${f.properties.label}</strong>`;
    div.onclick = () => selectAddress(f);
    suggestionsBox.appendChild(div);
  });
  suggestionsBox.style.display = "block";
}

// ------------------------------------------------------------
// 3. SELECT ADDRESS
// ------------------------------------------------------------
async function selectAddress(feature) {
  document.getElementById("addressSuggestions").style.display = "none";
  const label = feature.properties.label;
  const coords = feature.geometry.coordinates;

  document.getElementById("addressInput").value = label;
  document.getElementById("normalizedAddress").textContent = label;
  document.getElementById("gpsCoords").textContent = `${coords[1]}, ${coords[0]}`;

  document.getElementById("results").style.display = "block";

  await fetchArcepData(label);
}

// ------------------------------------------------------------
// 4. BACKEND REQUEST
// ------------------------------------------------------------
async function fetchArcepData(address) {
  const out = document.getElementById("arcepBlock");
  out.innerHTML = "Bezig met controleren bij ARCEP...";

  try {
    // Relatief pad!
    const url = `/api/arcep?address=${encodeURIComponent(address)}`;
    const res = await fetch(url);
    
    // Vang HTML errors (zoals 404/500 van Vercel zelf) af
    const contentType = res.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
       throw new Error(`Server gaf geen JSON (Status: ${res.status})`);
    }

    const data = await res.json();

    if (!data.ok) {
      // Toon de foutmelding én de details als die er zijn
      const errorMsg = data.details ? `${data.error} (${data.details})` : data.error;
      out.innerHTML = `<p style="color:red">Fout: ${errorMsg}</p>`;
      renderResults(null);
      return;
    }

    // Succes!
    const fibreText = data.fibre ? "Ja" : "Nee";
    const dslText = data.dsl ? "Ja" : "Nee";
    
    out.innerHTML = `
      <p style="color:#006400; font-weight:bold;">✔ Gegevens opgehaald (INSEE: ${data.insee})</p>
      <p>Glasvezel (Gemeente): ${fibreText}</p>
      <p>DSL (Gemeente): ${dslText}</p>
    `;

    renderResults(data);

  } catch (e) {
    console.error(e);
    out.innerHTML = `<p style="color:red">Technische fout: ${e.message}</p>`;
    renderResults(null);
  }
}

// ------------------------------------------------------------
// 5. RENDER CARDS
// ------------------------------------------------------------
function renderResults(arcep) {
  const container = document.getElementById("techCards");
  const internet = providersData?.internet || {};
  
  const listLinks = (arr) => {
    if (!arr) return "";
    return arr.map(p => `<a href="${p.url}" target="_blank" style="display:block;">${p.name}</a>`).join("");
  };

  // Bepaal status tekst
  const fibreStatus = arcep 
    ? (arcep.fibre ? "✔ Glasvezel beschikbaar" : "✘ Geen glasvezel gevonden") 
    : "Onbekend";

  let mobileStatus = "Onbekend";
  if (arcep && arcep.mobile) {
      const m = arcep.mobile;
      mobileStatus = `
        Orange: ${m.orange || "?"}<br>
        SFR: ${m.sfr || "?"}<br>
        Bouygues: ${m.bouygues || "?"}<br>
        Free: ${m.free || "?"}
      `;
  }

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

  // TV & VPN vullen
  const tv = providersData?.tv?.nl || [];
  document.getElementById("tvList").innerHTML = tv.map(t => `<li>${t.name} (<a href="${t.url}" target="_blank">link</a>)</li>`).join("");
  
  const vpn = providersData?.vpn || [];
  document.getElementById("vpnList").innerHTML = vpn.map(v => `<li>${v.name} – ${v.type} (<a href="${v.url}" target="_blank">site</a>)</li>`).join("");
}
