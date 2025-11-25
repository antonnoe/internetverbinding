// script.js
// De Slimme Wegwijzer - Finale Instructies

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
  
  document.getElementById("results").style.display = "block";
  
  startGuideFlow(coords[1], coords[0]);
}

// --- DE GIDS FLOW ---
function startGuideFlow(lat, lon) {
    const output = document.getElementById("arcepOutput");
    const techCards = document.getElementById("techCards");
    
    techCards.innerHTML = "";
    
    // We linken naar de kaart op maximaal zoomniveau
    const officialUrl = `https://maconnexioninternet.arcep.fr/?lat=${lat}&lng=${lon}&zoom=20&mode=debit&techno=filaire`;

    output.innerHTML = `
        <div style="background:#f0f7ff; border:1px solid #cce5ff; padding:20px; border-radius:8px; text-align:center;">
            <h3 style="margin-top:0; color:#004085;">Stap 1: Controleer uw aansluiting</h3>
            <p style="margin-bottom:20px; color:#004085;">
                De database voor uw regio is complex. We openen de officiële kaart <strong>exact op uw dak</strong>.
                <br>Klik daar op het bolletje op uw huis om uw status te zien.
            </p>
            
            <a href="${officialUrl}" target="_blank" 
               style="display:inline-block; background:#0069d9; color:white; padding:14px 24px; text-decoration:none; border-radius:6px; font-weight:bold; font-size:18px; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
               📍 Open de Kaart
            </a>
            
            <div style="margin-top:30px; border-top:1px solid #cce5ff; padding-top:20px;">
                <p style="font-weight:bold;">Stap 2: Wat zag u op de kaart?</p>
                <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
                    <button onclick="showResult('fibre')" style="padding:12px 20px; border:1px solid #28a745; background:white; color:#28a745; border-radius:6px; cursor:pointer; font-weight:bold; font-size:15px;">
                        🟢 Groen puntje (Glasvezel)
                    </button>
                    <button onclick="showResult('dsl')" style="padding:12px 20px; border:1px solid #ffc107; background:white; color:#d39e00; border-radius:6px; cursor:pointer; font-weight:bold; font-size:15px;">
                        🟡 Geel (Koper/DSL)
                    </button>
                    <button onclick="showResult('none')" style="padding:12px 20px; border:1px solid #6c757d; background:white; color:#6c757d; border-radius:6px; cursor:pointer; font-weight:bold; font-size:15px;">
                        ⚪ Grijs / Geen puntje
                    </button>
                </div>
            </div>
        </div>
    `;
}

// --- RENDER RESULTATEN ---
function showResult(type) {
    const container = document.getElementById("techCards");
    const internet = providersData?.internet || {};
    const listLinks = (arr) => arr ? arr.map(p => `<a href="${p.url}" target="_blank" style="display:block; margin-bottom:4px;">${p.name}</a>`).join("") : "";

    let html = "";

    if (type === 'fibre') {
        html = `
            <div style="background:#d4edda; color:#155724; padding:15px; border-radius:8px; margin-bottom:20px; border:1px solid #c3e6cb;">
                <strong>✅ Gefeliciteerd!</strong> Er ligt Glasvezel tot in uw huis. <br>
                U kunt abonnementen afsluiten tot 1 Gbit/s of hoger.
            </div>
            <div class="tech-card">
                <span class="pill">Aanbevolen</span>
                <h3>Glasvezel Providers</h3>
                <p>Stabiel, snel en geschikt voor alles.</p>
                <div class="links-list">${listLinks(internet.fibre)}</div>
            </div>
        `;
    } else if (type === 'dsl') {
        html = `
            <div style="background:#fff3cd; color:#856404; padding:15px; border-radius:8px; margin-bottom:20px; border:1px solid #ffeeba;">
                <strong>⚠️ Let op:</strong> U heeft waarschijnlijk een koperlijn (ADSL/VDSL). <br>
                De snelheid hangt af van de afstand tot de centrale. Is het te traag? Overweeg Starlink.
            </div>
            <div class="tech-card" style="opacity:0.9;">
                <span class="pill">Optie A (Standaard)</span>
                <h3>ADSL/VDSL</h3>
                <p>Via de telefoonlijn.</p>
                <div class="links-list">${listLinks(internet.fibre)}</div>
            </div>
            <div class="tech-card">
                <span class="pill">Optie B (Sneller)</span>
                <h3>Starlink</h3>
                <p>Hoge snelheid via satelliet.</p>
                <div class="links-list">${listLinks(internet.leo)}</div>
            </div>
            <div class="tech-card">
                <span class="pill">Optie C</span>
                <h3>4G Box</h3>
                <p>Check bereik op uw telefoon.</p>
                <div class="links-list">${listLinks(internet["4g5g"])}</div>
            </div>
        `;
    } else {
        html = `
            <div style="background:#f8d7da; color:#721c24; padding:15px; border-radius:8px; margin-bottom:20px; border:1px solid #f5c6cb;">
                <strong>❌ Buitengebied:</strong> Er lijkt geen vaste lijn geregistreerd op uw exacte locatie. <br>
                Starlink is hier vaak de enige stabiele oplossing voor snel internet.
            </div>
            <div class="tech-card">
                <span class="pill" style="background:#006400;">Beste Keuze</span>
                <h3>Starlink (Satelliet)</h3>
                <p>Werkt overal in Frankrijk, hoge snelheid.</p>
                <div class="links-list">${listLinks(internet.leo)}</div>
            </div>
            <div class="tech-card">
                <span class="pill">Alternatief</span>
                <h3>4G/5G Box</h3>
                <p>Alleen als u goed mobiel bereik heeft.</p>
                <div class="links-list">${listLinks(internet["4g5g"])}</div>
            </div>
        `;
    }

    container.innerHTML = html;
    
    const tv = providersData?.tv?.nl || [];
    document.getElementById("tvList").innerHTML = tv.map(t => `<li>${t.name} (<a href="${t.url}" target="_blank">link</a>)</li>`).join("");
    const vpn = providersData?.vpn || [];
    document.getElementById("vpnList").innerHTML = vpn.map(v => `<li>${v.name} – ${v.type} (<a href="${v.url}" target="_blank">site</a>)</li>`).join("");
}
