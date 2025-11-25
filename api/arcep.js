// api/arcep.js
// Integratie van BAN + ARCEP ODS v2.1 (Copilot Logic)

// HULPFUNCTIE: De robuuste query van Copilot
async function queryArcepGeo(dataset, lat, lon, radiusMeters = 500, limit = 100) {
  // Veilige where-clause opbouw
  const whereClause = `within_distance(geopoint, geom'POINT(${lon} ${lat})', ${Math.round(radiusMeters)}m)`;

  // URL bouwen met v2.1 endpoint
  const url = new URL(`https://data.arcep.fr/api/v2.1/datasets/${encodeURIComponent(dataset)}/records`);
  const params = new URLSearchParams();
  params.set('where', whereClause);
  params.set('limit', String(limit));
  url.search = params.toString();

  // Fetch met timeout en error handling
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 15000); // 15 sec timeout

  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });

    // Lees eerst als tekst om HTML errors te vangen
    const text = await res.text();
    const trimmed = text.trim();

    if (!res.ok) {
      throw new Error(`ARCEP API Fout (${res.status}): ${trimmed.slice(0, 200)}`);
    }

    // De beroemde check: is het HTML?
    if (trimmed.startsWith('<')) {
      throw new Error(`Verwachtte JSON, kreeg HTML (Server Fout bij ARCEP).`);
    }

    // Parse JSON
    return JSON.parse(trimmed);

  } finally {
    clearTimeout(id);
  }
}

// DE MAIN HANDLER (Vercel)
export default async function handler(req, res) {
  // Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const { address } = req.query;

  if (!address) {
    return res.status(400).json({ ok: false, error: "Geen adres opgegeven." });
  }

  try {
    // ---------------------------------------------------------
    // STAP 1: BAN Lookup (Adres naar GPS)
    // ---------------------------------------------------------
    const banRes = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(address)}&limit=1`);
    const banData = await banRes.json();

    if (!banData.features || banData.features.length === 0) {
      return res.status(200).json({ ok: false, error: "Adres onbekend in BAN." });
    }

    const f = banData.features[0];
    const label = f.properties.label;
    const [lon, lat] = f.geometry.coordinates;

    // ---------------------------------------------------------
    // STAP 2: ARCEP Queries (Via de hulpfunctie)
    // ---------------------------------------------------------
    // We vragen Fibre/DSL en Mobiel parallel op
    const [fixedData, mobileData] = await Promise.all([
        queryArcepGeo('maconnexioninternet', lat, lon, 500, 100).catch(err => ({ results: [], error: err.message })),
        queryArcepGeo('monreseaumobile', lat, lon, 500, 100).catch(err => ({ results: [], error: err.message }))
    ]);

    // ---------------------------------------------------------
    // STAP 3: Data Verwerken naar 'Neighbors' Lijst
    // ---------------------------------------------------------
    const streetMap = new Map();

    // Verwerk Vaste Lijnen
    if (fixedData.results) {
      fixedData.results.forEach(r => {
        const num = r.numero || r.numero_voie;
        const voie = r.nom_voie || "Onbekende straat";
        const techno = (r.techno || '').toLowerCase();
        
        if (!num) return; // Skip records zonder huisnummer

        const key = `${num} ${voie}`; // Unieke sleutel

        if (!streetMap.has(key)) {
          streetMap.set(key, {
            number: num,
            street: voie,
            hasFibre: false,
            hasDsl: false
          });
        }

        const entry = streetMap.get(key);

        // Check Fibre (FttH)
        // We zijn soepel: als er FttH staat, tellen we het mee
        if (techno.includes('ftth')) {
            // Check eventueel op status als dat veld betrouwbaar is, anders puur techniek
            // r.etat_immeuble == 'DEPLOYE' is vaak een goede indicator in v2.1
            entry.hasFibre = true;
        }
        
        // Check DSL
        if (techno.includes('adsl') || techno.includes('vdsl')) {
          entry.hasDsl = true;
        }
      });
    }

    // Sorteer de lijst: Huisnummer 2 komt voor 10
    const neighbors = Array.from(streetMap.values()).sort((a, b) => {
        return parseInt(a.number) - parseInt(b.number);
    });

    // ---------------------------------------------------------
    // STAP 4: Mobiele Data Verwerken (Algemene status)
    // ---------------------------------------------------------
    let mobile = { orange: null, sfr: null, bouygues: null, free: null };
    
    if (mobileData.results) {
        mobileData.results.forEach(r => {
            const op = (r.nom_operateur || r.operateur || '').toLowerCase();
            // In v2.1 zijn coverage velden vaak boolean of integers (0/1)
            const is4G = r.couverture_4g === 1 || r.couverture_4g === true;
            const is5G = r.couverture_5g === 1 || r.couverture_5g === true;

            let status = null;
            if (is5G) status = "5G/4G";
            else if (is4G) status = "4G";

            if (op && status) {
                if (!mobile[op] || mobile[op] === "Beschikbaar" || (status === "5G/4G" && mobile[op] === "4G")) {
                    mobile[op] = status;
                }
            }
        });
        
        // Fallback als specifieke kolommen leeg zijn
        mobileData.results.forEach(r => {
             const op = (r.nom_operateur || r.operateur || '').toLowerCase();
             if (op && !mobile[op]) mobile[op] = "Beschikbaar"; 
        });
    }

    // ---------------------------------------------------------
    // STAP 5: Response naar Frontend
    // ---------------------------------------------------------
    return res.status(200).json({
      ok: true,
      address_found: label,
      gps: { lat, lon },
      total_found: neighbors.length,
      neighbors: neighbors,
      mobile: mobile,
      debug: { 
          fixed_count: fixedData.total_count || 0,
          mobile_count: mobileData.total_count || 0
      }
    });

  } catch (error) {
    console.error("Critical Backend Error:", error);
    return res.status(500).json({ 
      ok: false, 
      error: "Technische fout in de scanner.", 
      details: error.message 
    });
  }
}
