// ------------------------------------------------------------
// 1. LOAD PROVIDERS
// ------------------------------------------------------------
let providersData = null;
async function loadProviders() {
  try {
    const res = await fetch("providers_fr.json");
    if (res.ok) providersData = await res.json();
  } catch (e) { console.error("Fout laden providers:", e); }
}
loadProviders();

// ------------------------------------------------------------
// 2. BAN AUTOCOMPLETE (Frontend)
// ------------------------------------------------------------
async function fetchAddresses() {
  const input = document.getElementById("addressInput");
  const box = document.getElementById("addressSuggestions");
  const query = input.value.trim();
  if (query.length < 3) return;

  box.style.display = "block";
  box.innerHTML = "<div class='suggestion-item'>Zoeken...</div>";

  try {
    const res = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=5`);
    const data = await res.json();
    renderSuggestions(data.features);
  } catch (e) { box.innerHTML = "<div class='suggestion-item'>API Fout</div>"; }
}

function renderSuggestions(features) {
  const box = document.getElementById("addressSuggestions");
  box.innerHTML = "";
  if (!features || features.length === 0) {
    box.innerHTML = "<div class='suggestion-item'>Geen adres gevonden.</div>";
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

async function selectAddress(feature) {
  document.getElementById("addressSuggestions").style.display = "none";
  const label = feature.properties.label;
  const coords = feature.geometry.coordinates;
  
  // UI vullen met frontend data
  document.getElementById("addressInput").value = label;
  document.getElementById("normalizedAddress").textContent = label;
  document.getElementById("gpsCoords").textContent = `${coords[1]}, ${coords[0]}`;
  document.getElementById("results").style.display = "block";
  
  // Backend aanroepen
  await fetchArcepData(label);
}

// ------------------------------------------------------------
// 3. BACKEND FETCH (De kritieke stap)
// ------------------------------------------------------------
async function fetchArcepData(address) {
  const out = document.getElementById("arcepBlock");
  out.innerHTML = "Bezig met controleren...";

  try {
    // We roepen de backend aan
    const response = await fetch(`/api/arcep?address=${encodeURIComponent(address)}`);
    
    // Eerst kijken we of het antwoord HTML is (Fout) of JSON (Goed)
    const contentType = response.headers.get("content-type");
    
    if (contentType && contentType.includes("text/html")) {
        throw new Error("Routing Fout: De server gaf de homepage terug in plaats van de API. Controleer vercel.json.");
    }

    const data = await response.json();

    if (!data.ok) {
      out.innerHTML = `<p style="color:red">API Melding: ${data.error} <small>${data.details || ''}</small></p>`;
      renderResults(null);
      return;
    }

    out.innerHTML = `
      <p style="color:#006400"><strong>✔ Resultaten opgehaald (INSEE: ${data.insee})</strong></p>
      <p>Glasvezel: ${data.fibre ? "Ja" : "Nee"}</p>
      <p>DSL: ${data.dsl ? "Ja" : "Nee"}</p>
    `;
    renderResults(data);

  } catch (e) {
    console.error(e);
    out.innerHTML = `<p style="color:red; font-weight:bold">Systeem Fout: ${e.message}</p>`;
    renderResults(null);
  }
}

// ------------------------------------------------------------
// 4. RENDER RESULTATEN
// ------------------------------------------------------------
function renderResults(arcep) {
  const container = document.getElementById("techCards");
  const internet = providersData?.internet || {};
  
  const listLinks = (arr) => arr ? arr.map(p => `<a href="${p.url}" target="_blank" style="display:block">${p.name}</a>`).join("") : "";

  const fibreStatus = arcep ? (arcep.fibre ? "✔ Beschikbaar" : "✘ Niet beschikbaar") : "Onbekend";
  
  let mobileStatus = "Onbekend";
  if (arcep && arcep.mobile) {
      const m = arcep.mobile;
      mobileStatus = `O: ${m.orange||'-'} | S: ${m.sfr||'-'} | B: ${m.bouygues||'-'} | F: ${m.free||'-'}`;
  }

  container.innerHTML = `
    <div class="tech-card"><h3>Glasvezel</h3><p>${fibreStatus}</p>${listLinks(internet.fibre)}</div>
    <div class="tech-card"><h3>4G/5G</h3><p>${mobileStatus}</p>${listLinks(internet["4g5g"])}</div>
    <div class="tech-card"><h3>Starlink</h3><div class="links-list">${listLinks(internet.leo)}</div></div>
  `;
  
  const tv = providersData?.tv?.nl || [];
  document.getElementById("tvList").innerHTML = tv.map(t => `<li>${t.name} (<a href="${t.url}" target="_blank">link</a>)</li>`).join("");
  const vpn = providersData?.vpn || [];
  document.getElementById("vpnList").innerHTML = vpn.map(v => `<li>${v.name} (<a href="${v.url}" target="_blank">site</a>)</li>`).join("");
}
