// ------------------------------------------------------------
// 1. LOAD PROVIDERS
// ------------------------------------------------------------
let providersData = null;
async function loadProviders() {
  try {
    const res = await fetch("providers_fr.json");
    if (res.ok) providersData = await res.json();
  } catch (e) { console.error(e); }
}
loadProviders();

// ------------------------------------------------------------
// 2. BAN LOGIC
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
  
  document.getElementById("addressInput").value = label;
  document.getElementById("normalizedAddress").textContent = label;
  
  // UI Reset
  document.getElementById("results").style.display = "block";
  document.getElementById("streetScan").innerHTML = "<p>Bezig met scannen van de straat...</p>";
  document.getElementById("techCards").innerHTML = ""; 

  await fetchStreetScan(label);
}

// ------------------------------------------------------------
// 3. STREET SCANNER FETCH
// ------------------------------------------------------------
async function fetchStreetScan(address) {
  try {
    // Relatief pad naar de nieuwe scanner API
    const res = await fetch(`/api/arcep?address=${encodeURIComponent(address)}`);
    
    // Vang HTML errors
    const contentType = res.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
       throw new Error("Server Error (HTML)");
    }

    const data = await res.json();

    if (!data.ok) {
      document.getElementById("streetScan").innerHTML = `<p style="color:red">${data.error}</p>`;
      return;
    }

    renderStreetList(data);
    renderGeneralCards(data); // Toon ook de kaarten (Starlink etc)

  } catch (e) {
    document.getElementById("streetScan").innerHTML = `<p style="color:red">Fout: ${e.message}</p>`;
  }
}

// ------------------------------------------------------------
// 4. RENDER STREET LIST
// ------------------------------------------------------------
function renderStreetList(data) {
  const container = document.getElementById("streetScan");
  
  if (data.neighbors.length === 0) {
      container.innerHTML = "<p>Geen aansluitingen gevonden in de directe omgeving (500m).</p>";
      return;
  }

  let html = `
    <div style="background:#f9f9f9; padding:15px; border-radius:8px; border:1px solid #ddd;">
      <h3 style="color:#800000; margin-top:0;">Gevonden aansluitingen in de buurt</h3>
      <p style="font-size:0.9em; color:#666;">Wij scannen 500m rondom uw locatie. Zoek uw huisnummer:</p>
      <div style="max-height:300px; overflow-y:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:14px;">
          <tr style="text-align:left; border-bottom:2px solid #ccc;">
            <th style="padding:5px;">Nr.</th>
            <th style="padding:5px;">Straat</th>
            <th style="padding:5px;">Glasvezel?</th>
          </tr>
  `;

  data.neighbors.forEach(n => {
      const status = n.hasFibre 
        ? '<span style="color:green; font-weight:bold;">Ja ✔</span>' 
        : '<span style="color:orange;">Nog niet (wel DSL)</span>';
      
      // Maak de rij dikgedrukt als het waarschijnlijk de user is (gokje) maar dat is lastig.
      // Gewoon lijst tonen.
      html += `
        <tr style="border-bottom:1px solid #eee;">
            <td style="padding:8px;"><strong>${n.number}</strong></td>
            <td style="padding:8px;">${n.street}</td>
            <td style="padding:8px;">${status}</td>
        </tr>
      `;
  });

  html += `</table></div></div>`;
  container.innerHTML = html;
}

function renderGeneralCards(data) {
    // Simpele weergave van de algemene opties onder de lijst
    const container = document.getElementById("techCards");
    const internet = providersData?.internet || {};
    const listLinks = (arr) => arr ? arr.map(p => `<a href="${p.url}" target="_blank" style="display:block">${p.name}</a>`).join("") : "";

    // Bepaal algemene status op basis van of er *iets* van fibre is gevonden in de straat
    const fibreInStreet = data.neighbors.some(n => n.hasFibre);
    const fibreText = fibreInStreet ? "Beschikbaar in uw straat" : "Niet gevonden in de buurt";

    container.innerHTML = `
    <div class="tech-card"><h3>Glasvezel</h3><p>${fibreText}</p>${listLinks(internet.fibre)}</div>
    <div class="tech-card"><h3>4G/5G</h3><p>Check dekking</p>${listLinks(internet["4g5g"])}</div>
    <div class="tech-card"><h3>Starlink</h3><div class="links-list">${listLinks(internet.leo)}</div></div>
  `;
  
  // TV & VPN vullen
  const tv = providersData?.tv?.nl || [];
  document.getElementById("tvList").innerHTML = tv.map(t => `<li>${t.name} (<a href="${t.url}" target="_blank">link</a>)</li>`).join("");
  const vpn = providersData?.vpn || [];
  document.getElementById("vpnList").innerHTML = vpn.map(v => `<li>${v.name} (<a href="${v.url}" target="_blank">site</a>)</li>`).join("");
}
