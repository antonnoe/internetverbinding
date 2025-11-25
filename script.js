// script.js
// De Slimme Wegwijzer met Sticky 'Afstandsbediening'

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
  const coords = feature.geometry.coordinates; 
  
  document.getElementById("addressInput").value = label;
  
  // Reset UI
  document.getElementById("results").style.display = "block";
  document.getElementById("adviceSection").innerHTML = ""; 
  document.getElementById("stickyContainer").innerHTML = ""; // Reset balk
  
  startGuideFlow(coords[1], coords[0]);
}

// --- DE GIDS FLOW ---
function startGuideFlow(lat, lon) {
    const output = document.getElementById("arcepOutput");
    
    // Link naar kaart (max zoom 20)
    const officialUrl = `https://maconnexioninternet.arcep.fr/?lat=${lat}&lng=${lon}&zoom=20&mode=debit&techno=filaire`;

    // 1. Toon instructie in het scherm
    output.innerHTML = `
        <div style="background:#f0f7ff; border:1px solid #cce5ff; padding:20px; border-radius:8px; text-align:center;">
            <h3 style="margin-top:0; color:#004085;">Stap 1: Open de Kaart</h3>
            <p style="margin-bottom:20px; color:#555;">
                De knop hieronder opent de officiële kaart precies op uw dak.<br>
                Kijk welk bolletje er op uw huis staat.
            </p>
            
            <a href="${officialUrl}" target="_blank" 
               style="display:inline-block; background:#800000; color:white; padding:14px 24px; text-decoration:none; border-radius:6px; font-weight:bold; font-size:18px; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
               📍 Open Kaart op Arcep.fr
            </a>
            
            <p style="margin-top:15px; font-size:0.9em; color:#666;">
                (Gebruik de knoppen onderaan het scherm om aan te geven wat u ziet)
            </p>
        </div>
    `;

    // 2. Toon de Sticky 'Afstandsbediening' onderaan
    const sticky = document.getElementById("stickyContainer");
    sticky.innerHTML = `
        <div class="sticky-bottom-bar">
            <div style="width:100%; font-size:12px; color:#666; margin-bottom:5px;">Wat ziet u op de kaart?</div>
            <button class="sticky-btn" onclick="showResult('fibre')" style="border-color:#28a745; color:#28a745;">
                🟢 Groen (Glasvezel)
            </button>
            <button class="sticky-btn" onclick="showResult('dsl')" style="border-color:#d39e00; color:#d39e00;">
                🟡 Geel (Koper)
            </button>
            <button class="sticky-btn" onclick="showResult('none')" style="border-color:#6c757d; color:#6c757d;">
                ⚪ Grijs / Niets
            </button>
        </div>
    `;
}

// --- RENDER RESULTATEN ---
function showResult(type) {
    // 1. Verwijder de sticky bar (hij heeft zijn werk gedaan)
    document.getElementById("stickyContainer").innerHTML = "";

    // 2. Toon resultaten
    const container = document.getElementById("adviceSection");
    const internet = providersData?.internet || {};
    
    const listLinks = (arr) => arr ? arr.map(p => `<a href="${p.url}" target="_blank" style="display:block; margin-bottom:4px; color:#0056b3; text-decoration:none;">${p.name} &rarr;</a>`).join("") : "";
    const renderListItems = (arr) => arr ? arr.map(item => `<li><a href="${item.url}" target="_blank" style="color:#0056b3; text-decoration:none;">${item.name}</a></li>`).join("") : "";

    let internetHTML = "";
    
    // SCENARIO: GLASVEZEL
    if (type === 'fibre') {
        internetHTML = `
            <div style="background:#d4edda; color:#155724; padding:15px; border-radius:8px; margin-bottom:20px; border:1px solid #c3e6cb; margin-top:20px;">
                <strong>✅ Goed nieuws!</strong> Er ligt Glasvezel. U heeft maximale snelheid.
            </div>
            <h3>Aanbevolen Internet</h3>
            <div class="tech-card">
                <span class="pill">Fibre</span>
                <h4 style="margin-top:5px;">Glasvezel Providers</h4>
                <p style="font-size:0.9em;">Stabiel, snel en geschikt voor TV en thuiswerken.</p>
                <div class="links-list">${listLinks(internet.fibre)}</div>
            </div>
        `;
    } 
    // SCENARIO: KOPER (DSL)
    else if (type === 'dsl') {
        internetHTML = `
            <div style="background:#fff3cd; color:#856404; padding:15px; border-radius:8px; margin-bottom:20px; border:1px solid #ffeeba; margin-top:20px;">
                <strong>⚠️ Let op:</strong> U heeft waarschijnlijk een koperlijn (ADSL). Snelheid is beperkt.
            </div>
            <h3>Uw Opties</h3>
            <div class="tech-card">
                <span class="pill">Optie A</span>
                <h4 style="margin-top:5px;">ADSL/VDSL</h4>
                <div class="links-list">${listLinks(internet.fibre)}</div>
            </div>
            <div class="tech-card">
                <span class="pill">Optie B (Sneller)</span>
                <h4 style="margin-top:5px;">Starlink</h4>
                <div class="links-list">${listLinks(internet.leo)}</div>
            </div>
        `;
    } 
    // SCENARIO: NIETS (BUITENGEBIED)
    else {
        internetHTML = `
            <div style="background:#f8d7da; color:#721c24; padding:15px; border-radius:8px; margin-bottom:20px; border:1px solid #f5c6cb; margin-top:20px;">
                <strong>❌ Buitengebied:</strong> Er is geen vaste lijn gevonden.
            </div>
            <h3>Beste Oplossing</h3>
            <div class="tech-card">
                <span class="pill" style="background:#006400;">Aanbevolen</span>
                <h4 style="margin-top:5px;">Starlink (Satelliet)</h4>
                <p style="font-size:0.9em;">Werkt overal, hoge snelheid.</p>
                <div class="links-list">${listLinks(internet.leo)}</div>
            </div>
            <div class="tech-card">
                <span class="pill">Alternatief</span>
                <h4 style="margin-top:5px;">4G/5G Box</h4>
                <div class="links-list">${listLinks(internet["4g5g"])}</div>
            </div>
        `;
    }

    // TV & VPN
    const tvItems = renderListItems(providersData?.tv?.nl);
    const vpnItems = renderListItems(providersData?.vpn);

    let extrasHTML = "";
    if (tvItems) {
        extrasHTML += `
            <h3>Televisie (NL)</h3>
            <div class="tech-card">
                <ul>${tvItems}</ul>
            </div>
        `;
    }
    if (vpnItems) {
        extrasHTML += `
            <h3>Veiligheid & VPN</h3>
            <div class="tech-card">
                <p style="font-size:0.9em; color:#666; margin-top:0;">Handig voor Nederlandse TV en veilig bankieren.</p>
                <ul>${vpnItems}</ul>
            </div>
        `;
    }

    container.innerHTML = internetHTML + extrasHTML;
    
    // Scroll naar resultaat
    // We gebruiken een kleine timeout om zeker te zijn dat de sticky bar weg is en de layout herberekend is
    setTimeout(() => {
        container.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
}
