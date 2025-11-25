// api/arcep.js
// Robuuste CommonJS versie - Crasht niet op externe fouten

module.exports = async function handler(req, res) {
  // Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const { address } = req.query;

  if (!address) {
    return res.status(400).json({ ok: false, error: "Geen adres opgegeven." });
  }

  try {
    // ---------------------------------------------------------
    // STAP 1: BAN Lookup
    // ---------------------------------------------------------
    // We gebruiken de globale fetch (Node 18+)
    const banRes = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(address)}&limit=1`);
    const banData = await banRes.json();

    if (!banData.features || banData.features.length === 0) {
      return res.status(200).json({ ok: false, error: "Adres onbekend in BAN." });
    }

    const f = banData.features[0];
    const insee = f.properties.citycode;
    const label = f.properties.label;
    const [lon, lat] = f.geometry.coordinates;

    // ---------------------------------------------------------
    // STAP 2: ARCEP Data Ophalen (Veilig)
    // ---------------------------------------------------------
    const baseUrl = "https://data.arcep.fr/api/explore/v2.1/catalog/datasets";
    const whereClause = encodeURIComponent(`code_insee='${insee}'`);
    // We halen 50 records op voor een goede dekking
    const limit = 50; 
    
    const fixedUrl = `${baseUrl}/maconnexioninternet/records?where=${whereClause}&limit=${limit}`;
    const mobileUrl = `${baseUrl}/monreseaumobile/records?where=${whereClause}&limit=${limit}`;

    // Parallel ophalen met error handling per request
    const [fixedRes, mobileRes] = await Promise.all([
        fetch(fixedUrl),
        fetch(mobileUrl)
    ]);

    let fixedData = { results: [] };
    let mobileData = { results: [] };

    // Check Fixed response: Als het geen JSON is of een fout, negeren we het (niet crashen!)
    if (fixedRes.ok) {
        try { fixedData = await fixedRes.json(); } catch(e) { console.error("Fixed JSON parse error"); }
    }
    
    // Check Mobile response
    if (mobileRes.ok) {
        try { mobileData = await mobileRes.json(); } catch(e) { console.error("Mobile JSON parse error"); }
    }

    // ---------------------------------------------------------
    // STAP 3: Data Verwerken
    // ---------------------------------------------------------
    let hasFibre = false;
    let hasDsl = false;
    let mobile = { orange: null, sfr: null, bouygues: null, free: null };

    // VAST INTERNET LOGICA
    if (fixedData.results && Array.isArray(fixedData.results)) {
        // Zoek naar glasvezel (FttH) die actief is
        const fibreHits = fixedData.results.filter(r => {
            const tech = (r.techno || '').toLowerCase();
            // Check op variaties van 'waar'
            const active = r.elig === true || r.elig === '1' || r.elig === 1;
            return tech === 'ftth' && active;
        });
        if (fibreHits.length > 0) hasFibre = true;

        // Zoek naar DSL
        const dslHits = fixedData.results.filter(r => {
            const tech = (r.techno || '').toLowerCase();
            const active = r.elig === true || r.elig === '1' || r.elig === 1;
            return (tech.includes('adsl') || tech.includes('vdsl')) && active;
        });
        if (dslHits.length > 0) hasDsl = true;
    }

    // MOBIEL INTERNET LOGICA
    if (mobileData.results && Array.isArray(mobileData.results)) {
        mobileData.results.forEach(r => {
            const op = (r.nom_operateur || r.operateur || '').toLowerCase();
            if (!op) return;

            // Check 4G/5G status
            const heeft4G = r.couverture_4g === 1 || r.couverture_4g === '1' || 
                            r.couverture === 'Très bonne couverture' || r.couverture === 'Bonne couverture';
            const heeft5G = r.couverture_5g === 1 || r.couverture_5g === '1';

            let status = null;
            if (heeft5G) status = "5G/4G";
            else if (heeft4G) status = "4G";

            // Update alleen als we betere info vinden of nog niets hebben
            if (status && (!mobile[op] || mobile[op] === "4G")) {
                mobile[op] = status;
            }
        });
        
        // Fallback: als we wel een operator zien maar geen specifieke status, zet op 'Beschikbaar'
        mobileData.results.forEach(r => {
             const op = (r.nom_operateur || r.operateur || '').toLowerCase();
             if (op && !mobile[op]) mobile[op] = "Beschikbaar"; 
        });
    }

    // ---------------------------------------------------------
    // STAP 4: Response
    // ---------------------------------------------------------
    return res.status(200).json({
      ok: true,
      address_found: label,
      gps: { lat, lon },
      insee: insee,
      fibre: hasFibre,
      dsl: hasDsl,
      mobile: mobile
    });

  } catch (error) {
    // Vangt elke andere crash af en stuurt JSON terug
    console.error("Backend Crash:", error);
    return res.status(200).json({ 
      ok: false, 
      error: "Technische fout in backend (check logs).", 
      details: error.message 
    });
  }
}
