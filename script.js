// script.js
// De Slimme Wegwijzer logica

let providersData = null;
async function loadProviders() {
  try {
    const res = await fetch("providers_fr.json");
    if (res.ok) providersData = await res.json();
  } catch (e) { console.error(e); }
}
loadProviders();

// --- BAN LOGICA ---
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
  } catch (e) { box.innerHTML = "<div class='suggestion-item'>...</div>"; }
}

function renderSuggestions(features) {
  const box = document.getElementById("addressSuggestions");
  box.innerHTML = "";
  if (!features || features.length === 0) {
    box.style.display = 'none';
    return;
  }
  features.forEach((f) => {
    const div = document.createElement("div");
    div.className = "suggestion-item";
    div.innerHTML = `<strong>${f.properties.label}</strong>`;
    div.onclick = () => selectAddress(f);
    box.appendChild(div);
  });
  box.style.display = 'block';
}

async function selectAddress(feature) {
  document.getElementById("addressSuggestions").style.display = "none";
  const label = feature.properties.label;
  const coords = feature.geometry.coordinates; // [lon, lat]
  
  document.getElementById("addressInput").value = label;
  document.getElementById("normalizedAddress").textContent = label;
  
  // Toon resultaten blok
  document.getElementById("results").style.display = "block";
  
  // Start de Gids-flow
  startGuideFlow(coords[1], coords[0]);
}

// --- DE GIDS FLOW ---
function startGuideFlow(lat, lon) {
    const output = document.getElementById("arcepOutput");
    const techCards = document.getElementById("techCards");
    
    // Reset
    techCards.innerHTML = "";
    
    // Genereer de diepe link naar de officiële kaart
    // Zoom level 18 is straatniveau, techno=filaire toont glasvezel/koper
    const officialUrl = `https://maconnexioninternet.arcep.fr/?lat=${lat}&lng=${lon}&zoom=18&mode=debit&techno=filaire`;

    output.innerHTML = `
        <div style="background:#f8f9fa; border:1px solid #ddd; padding:20px; border-radius:8px; text-align:center;">
            <h3 style="margin-top:0; color:#800000;">Stap 1: Check de officiële kaart</h3>
            <p>De publieke database loopt soms achter. Kijk daarom direct op de officiële kaart van de toezichthouder.</p>
            
            <a href="${officialUrl}" target="_blank" 
               style="display:inline-block; background:#800000; color:white; padding:12px 20px; text-decoration:none; border-radius:6px; font-weight:bold; font-size:16px; margin-bottom:15px;">
               📍 Open Kaart op mijn adres
            </a>
            
            <p style="font-weight:bold; margin-top:15px;">Wat ziet u op of bij uw huis?</p>
            <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
                <button onclick="showResult('fibre')" style="padding:10px 15px; border:1px solid #28a745; background:white; color:#28a745; border-radius:5px; cursor:pointer; font-weight:bold;">
                    🟢 Groen puntje (Fibre)
                </button>
                <button onclick="showResult('dsl')" style="padding:10px 15px; border:1px solid #ffc107; background:white; color:#b38600; border-radius:5px; cursor:pointer; font-weight:bold;">
                    🟡 Geel/Oranje (Koper/DSL)
                </button>
                <button onclick="showResult('none')" style="padding:10px 15px; border:1px solid #6c757d; background:white; color:#6c757d; border-radius:5px; cursor:pointer; font-weight:bold;">
                    ⚪ Niets / Grijs
                </button>
            </div>
        </div>
    `;
}

// --- RENDER RESULTATEN OP BASIS VAN KEUZE ---
function showResult(type) {
    const container = document.getElementById("techCards");
    const internet = providersData?.internet || {};
    const listLinks = (arr) => arr ? arr.map(p => `<a href="${p.url}" target="_blank" style="display:block; margin-bottom:4px;">${p.name}</a>`).join("") : "";

    let html = "";

    if (type === 'fibre') {
        html = `
            <div style="background:#d4edda; color:#155724; padding:15px; border-radius:8px; margin-bottom:20px;">
                <strong>Goed nieuws!</strong> Er ligt Glasvezel. U kunt tot 1 Gbit/s of meer halen.
            </div>
            <div class="tech-card">
                <span class="pill">Aanbevolen</span>
                <h3>Glasvezel Providers</h3>
                <p>De beste keuze voor TV en thuiswerken.</p>
                <div class="links-list">${listLinks(internet.fibre)}</div>
            </div>
        `;
    } else if (type === 'dsl') {
        html = `
            <div style="background:#fff3cd; color:#856404; padding:15px; border-radius:8px; margin-bottom:20px;">
                <strong>Let op:</strong> U heeft waarschijnlijk alleen ADSL/VDSL. De snelheid kan tegenvallen.
                Overweeg 4G of Starlink als de snelheid onder de 10 Mbit/s ligt.
            </div>
            <div class="tech-card" style="opacity:0.8;">
                <span class="pill">Optie A</span>
                <h3>ADSL/VDSL</h3>
                <p>Via de telefoonlijn.</p>
                <div class="links-list">${listLinks(internet.fibre)}</div> </div>
            <div class="tech-card">
                <span class="pill">Optie B (Sneller)</span>
                <h3>Starlink</h3>
                <p>Voor als de ADSL te traag is.</p>
                <div class="links-list">${listLinks(internet.leo)}</div>
            </div>
            <div class="tech-card">
                <span class="pill">Optie C</span>
                <h3>4G Box</h3>
                <p>Afhankelijk van bereik.</p>
                <div class="links-list">${listLinks(internet["4g5g"])}</div>
            </div>
        `;
    } else {
        html = `
            <div style="background:#f8d7da; color:#721c24; padding:15px; border-radius:8px; margin-bottom:20px;">
                <strong>Buitengebied:</strong> Er lijkt geen vaste lijn beschikbaar. Starlink is hier vaak de beste oplossing.
            </div>
            <div class="tech-card">
                <span class="pill" style="background:#006400;">Beste Keuze</span>
                <h3>Starlink (Satelliet)</h3>
                <p>Werkt overal, hoge snelheid, stabiel.</p>
                <div class="links-list">${listLinks(internet.leo)}</div>
            </div>
            <div class="tech-card">
                <span class="pill">Alternatief</span>
                <h3>4G/5G Box</h3>
                <p>Check eerst het bereik op uw telefoon.</p>
                <div class="links-list">${listLinks(internet["4g5g"])}</div>
            </div>
        `;
    }

    container.innerHTML = html;
    
    // Vul TV en VPN ook meteen in
    const tv = providersData?.tv?.nl || [];
    document.getElementById("tvList").innerHTML = tv.map(t => `<li>${t.name} (<a href="${t.url}" target="_blank">link</a>)</li>`).join("");
    const vpn = providersData?.vpn || [];
    document.getElementById("vpnList").innerHTML = vpn.map(v => `<li>${v.name} – ${v.type} (<a href="${v.url}" target="_blank">site</a>)</li>`).join("");
}
