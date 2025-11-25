// script.js
let providersData = null;
async function loadProviders() {
  try {
    const res = await fetch("providers_fr.json");
    if (res.ok) providersData = await res.json();
  } catch (e) { console.error(e); }
}
loadProviders();

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
  document.getElementById("addressInput").value = label;
  document.getElementById("normalizedAddress").textContent = label;
  
  document.getElementById("results").style.display = "block";
  document.getElementById("arcepOutput").innerHTML = "<p>Bezig met scannen van netwerken...</p>";
  document.getElementById("techCards").innerHTML = ""; 

  await fetchArcepData(label);
}

async function fetchArcepData(address) {
  try {
    const res = await fetch(`/api/arcep?address=${encodeURIComponent(address)}`);
    const contentType = res.headers.get("content-type");
    
    if (contentType && contentType.includes("text/html")) throw new Error("Server Error (HTML)");
    
    const data = await res.json();

    if (!data.ok) {
      renderFallbackLink();
      return;
    }

    renderArcepResult(data);
    renderGeneralCards(data);

  } catch (e) {
    renderFallbackLink();
  }
}

function renderFallbackLink() {
    document.getElementById("arcepOutput").innerHTML = `
        <div style="background:#f0f0f0; padding:15px; border-radius:8px; border:1px solid #ccc;">
            <h3 style="margin-top:0; color:#800000;">Geen publieke data beschikbaar</h3>
            <p>De publieke database geeft geen uitsluitsel voor dit exacte adres. <br>
            Controleer uw adres op de officiële kaart van de toezichthouder:</p>
            <a href="https://maconnexioninternet.arcep.fr/" target="_blank" 
               style="display:inline-block; background:#800000; color:white; padding:10px 15px; text-decoration:none; border-radius:5px; font-weight:bold;">
               Open Officiële ARCEP Kaart &rarr;
            </a>
        </div>
    `;
}

function renderArcepResult(data) {
  const container = document.getElementById("arcepOutput");
  const operators = data.fibre_operators || [];

  let html = `<div style="margin-bottom:20px;">`;

  if (operators.length > 0) {
      html += `
        <div style="background:#e6fffa; border:1px solid #b2f5ea; padding:15px; border-radius:8px; margin-bottom:10px;">
            <h3 style="color:#047857; margin-top:0;">✔ Glasvezel gevonden in uw omgeving</h3>
            <p>Binnen 1000m zijn de volgende netwerken actief:</p>
            <p style="font-weight:bold; font-size:1.1em;">${operators.join(", ")}</p>
        </div>
      `;
  } else {
      html += `
        <div style="background:#fff5f5; border:1px solid #fed7d7; padding:15px; border-radius:8px; margin-bottom:10px;">
            <h3 style="color:#c53030; margin-top:0;">Geen Glasvezel in directe omgeving</h3>
            <p>In de publieke data (1000m straal) zien wij geen actieve glasvezel providers.</p>
        </div>
      `;
  }

  html += `
    <p style="font-size:0.9em; color:#666; margin-top:10px;">
        <em>Zeker weten voor uw exacte huisnummer?</em> <a href="https://maconnexioninternet.arcep.fr/" target="_blank" style="color:#800000;">Doe de officiële check op Arcep.fr</a>
    </p>
  </div>`;

  container.innerHTML = html;
}

function renderGeneralCards(data) {
    const container = document.getElementById("techCards");
    const internet = providersData?.internet || {};
    const listLinks = (arr) => arr ? arr.map(p => `<a href="${p.url}" target="_blank" style="display:block">${p.name}</a>`).join("") : "";

    const fibreFound = data.fibre_operators && data.fibre_operators.length > 0;
    const fibreText = fibreFound ? "<strong>Beschikbaar (zie lijst)</strong>" : "Niet gevonden";
    const fibreColor = fibreFound ? "green" : "black";

    const m = data.mobile || {};
    const mobText = `O: ${m.orange||'-'} | S: ${m.sfr||'-'} | B: ${m.bouygues||'-'} | F: ${m.free||'-'}`;

    container.innerHTML = `
    <div class="tech-card">
        <span class="pill">Fibre</span>
        <h3>Glasvezel</h3>
        <p style="color:${fibreColor}">${fibreText}</p>
        ${listLinks(internet.fibre)}
    </div>
    <div class="tech-card">
        <span class="pill">4G/5G</span>
        <h3>4G/5G Box</h3>
        <p>${mobText}</p>
        ${listLinks(internet["4g5g"])}
    </div>
    <div class="tech-card">
        <span class="pill">Starlink</span>
        <h3>Satelliet (LEO)</h3>
        <div class="links-list">${listLinks(internet.leo)}</div>
    </div>
  `;
  
  const tv = providersData?.tv?.nl || [];
  document.getElementById("tvList").innerHTML = tv.map(t => `<li>${t.name} (<a href="${t.url}" target="_blank">link</a>)</li>`).join("");
  const vpn = providersData?.vpn || [];
  document.getElementById("vpnList").innerHTML = vpn.map(v => `<li>${v.name} (<a href="${v.url}" target="_blank">site</a>)</li>`).join("");
}
