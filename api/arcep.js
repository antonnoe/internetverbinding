export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const { address } = req.query;

  if (!address) {
    return res.status(400).json({ ok: false, error: "Geen adres opgegeven." });
  }

  try {
    // ---------------------------------------------------------
    // STAP 1: BAN Lookup (Adres -> GPS)
    // ---------------------------------------------------------
    const banUrl = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(address)}&limit=1`;
    const banRes = await fetch(banUrl);
    const banData = await banRes.json();

    if (!banData.features || banData.features.length === 0) {
      return res.status(200).json({ ok: false, error: "Adres onbekend in BAN." });
    }

    const f = banData.features[0];
    const label = f.properties.label;
    const [lon, lat] = f.geometry.coordinates;
    const insee = f.properties.citycode; 

    // ---------------------------------------------------------
    // STAP 2: ARCEP Data Ophalen (GPS RADIUS 1000m)
    // ---------------------------------------------------------
    const baseUrl = "https://data.arcep.fr/api/explore/v2.1/catalog/datasets";
    
    // We vergroten de radius naar 1000m voor landelijke gebieden
    const geoQuery = `within_distance(geopoint, geom'POINT(${lon} ${lat})', 1000m)`;
    const whereClause = encodeURIComponent(geoQuery);
    
    const fixedUrl = `${baseUrl}/maconnexioninternet/records?where=${whereClause}&limit=100`;
    const mobileUrl = `${baseUrl}/monreseaumobile/records?where=${whereClause}&limit=100`;

    const [fixedRes, mobileRes] = await Promise.all([
        fetch(fixedUrl),
        fetch(mobileUrl)
    ]);

    let fixedData = { results: [] };
    let mobileData = { results: [] };

    if (fixedRes.ok) fixedData = await fixedRes.json();
    if (mobileRes.ok) mobileData = await mobileRes.json();

    // ---------------------------------------------------------
    // STAP 3: Data Verwerken (SOEPELE LOGICA)
    // ---------------------------------------------------------
    let hasFibre = false;
    let hasDsl = false;
    let mobile = { orange: null, sfr: null, bouygues: null, free: null };

    // VAST: We kijken puur naar de technologie. Als FttH in de lijst staat, is het er.
    if (fixedData.results && fixedData.results.length > 0) {
        // 1. Is er Fibre? (Check op 'ftth' in de techno kolom)
        const fibreRec = fixedData.results.find(r => {
            const tech = (r.techno || '').toLowerCase();
            return tech.includes('ftth');
        });
        if (fibreRec) hasFibre = true;

        // 2. Is er DSL?
        const dslRec = fixedData.results.find(r => {
            const tech = (r.techno || '').toLowerCase();
            return tech.includes('adsl') || tech.includes('vdsl');
        });
        if (dslRec) hasDsl = true;
    }

    // MOBIEL:
    if (mobileData.results && mobileData.results.length > 0) {
        mobileData.results.forEach(r => {
            const op = (r.nom_operateur || r.operateur || '').toLowerCase();
            
            // Check 4G/5G status
            const heeft4G = r.couverture_4g === 1 || r.couverture_4g === '1' || 
                            r.couverture === 'Très bonne couverture' || r.couverture === 'Bonne couverture';
            const heeft5G = r.couverture_5g === 1 || r.couverture_5g === '1';

            let status = null;
            if (heeft5G) status = "5G/4G";
            else if (heeft4G) status = "4G";

            if (op && status) {
                if (!mobile[op] || mobile[op] === "Beschikbaar" || (status === "5G/4G" && mobile[op] === "4G")) {
                    mobile[op] = status;
                }
            }
        });
        
        // Fallback
        mobileData.results.forEach(r => {
             const op = (r.nom_operateur || r.operateur || '').toLowerCase();
             if (op && !mobile[op]) mobile[op] = "Beschikbaar"; 
        });
    }

    return res.status(200).json({
      ok: true,
      address_found: label,
      gps: { lat, lon },
      insee: insee,
      radius: "1000m",
      fibre: hasFibre,
      dsl: hasDsl,
      mobile: mobile
    });

  } catch (error) {
    console.error("Backend Crash:", error);
    return res.status(500).json({ 
      ok: false, 
      error: "Server Fout", 
      details: error.message 
    });
  }
}
