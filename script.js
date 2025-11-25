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
  document.getElementById("streetScan").innerHTML = "<p>Bezig met scannen van de straat...</p>";
  document.getElementById("techCards").innerHTML = ""; 

  await fetchStreetScan(label);
}

async function fetchStreetScan(address) {
  try {
    const res = await fetch(`/api/arcep?address=${encodeURIComponent(address)}`);
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.includes("text/html")) throw new Error("Server Error (HTML)");
    
    const data = await res.json();

    if (!data.ok) {
      document.getElementById("streetScan").innerHTML = `<p style="color:red">${data.error}</p>`;
      return;
    }

    renderStreetList(data);
    renderGeneralCards(data);

  } catch (e) {
    document.getElementById("streetScan").innerHTML = `<p style="color:red">Fout: ${e.message}</p>`;
  }
}

function renderStreetList(data) {
  const container = document.getElementById("streetScan");
  const list = data.neighbors || [];

  if (list.length === 0) {
      // Als we niets vinden, geven we een eerlijke melding ipv leeg scherm
      container.innerHTML = `
        <div style="background:#fff3cd; padding:15px; border-radius:8px; color:#856404; border:1px solid #ffeeba;">
          <strong>Geen exacte nummers gevonden.</strong><br>
          We konden in de database van ARCEP geen specifieke huisnummers vinden voor deze straat in deze postcode. 
          Dit gebeurt soms in landelijke gebieden. Controleer de algemene beschikbaarheid hieronder.
        </div>`;
      return;
  }

  let html = `
    <div style="background:#f9f9f9; padding:15px; border-radius:8px; border:1px solid #ddd;">
      <h3 style="color:#800000; margin-top:0;">Resultaten in uw straat</h3>
      <div style="max-height:250px; overflow-y:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:14px;">
          <tr style="text-align:left; border-bottom:2px solid #ccc;">
            <th style="padding:5px;">Nr.</th>
            <th style="padding:5px;">Glasvezel</th>
            <th style="padding:5px;">DSL</th>
          </tr>
  `;

  list.forEach(n => {
      const fCheck = n.hasFibre ? '<span style="color:green; font-weight:bold">✔ Ja</span>' : '<span style="color:#ccc">-</span>';
      const dCheck = n.hasDsl ? '<span style="color:green;">✔ Ja</span>' : '<span style="color:#ccc">-</span>';
      
      html += `
        <tr style="border-bottom:1px solid #eee;">
            <td style="padding:8px;"><strong>${n.number}</strong></td>
            <td style="padding:8px;">${fCheck}</td>
            <td style="padding:8px;">${dCheck}</td>
        </tr>`;
  });

  html += `</table></div></div>`;
  container.innerHTML = html;
}

function renderGeneralCards(data) {
    const container = document.getElementById("techCards");
    const internet = providersData?.internet || {};
    const listLinks = (arr) => arr ? arr.map(p => `<a href="${p.url}" target="_blank" style="display:block">${p.name}</a>`).join("") : "";

    // Als er ook maar 1 buurman fibre heeft, is het beschikbaar
    const hasFibre = data.neighbors && data.neighbors.some(n => n.hasFibre);
    const fibreText = hasFibre ? "<strong>Beschikbaar in uw straat!</strong>" : "Niet direct gevonden";
    const fibreColor = hasFibre ? "green" : "black";

    // Mobiel formatteren
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
  
  // TV & VPN vullen
  const tv = providersData?.tv?.nl || [];
  document.getElementById("tvList").innerHTML = tv.map(t => `<li>${t.name} (<a href="${t.url}" target="_blank">link</a>)</li>`).join("");
  const vpn = providersData?.vpn || [];
  document.getElementById("vpnList").innerHTML = vpn.map(v => `<li>${v.name} (<a href="${v.url}" target="_blank">site</a>)</li>`).join("");
}
