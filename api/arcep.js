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
    const insee = f.properties.citycode; // We bewaren deze alleen voor de log

    // ---------------------------------------------------------
    // STAP 2: ARCEP Data Ophalen (VIA GPS RADIUS)
    // ---------------------------------------------------------
    // We zoeken binnen 200 meter van het punt. Dit negeert foute gemeentecodes.
    const baseUrl = "https://data.arcep.fr/api/explore/v2.1/catalog/datasets";
    
    // Syntax: within_distance(geo_veld, geom'POINT(lon lat)', afstand)
    // We gebruiken 'geopoint' als standaard veldnaam voor ODS
    const geoQuery = `within_distance(geopoint, geom'POINT(${lon} ${lat})', 200m)`;
    const whereClause = encodeURIComponent(geoQuery);
    
    const fixedUrl = `${baseUrl}/maconnexioninternet/records?where=${whereClause}&limit=50`;
    const mobileUrl = `${baseUrl}/monreseaumobile/records?where=${whereClause}&limit=50`;

    const [fixedRes, mobileRes] = await Promise.all([
        fetch(fixedUrl),
        fetch(mobileUrl)
    ]);

    let fixedData = { results: [] };
    let mobileData = { results: [] };

    if (fixedRes.ok) fixedData = await fixedRes.json();
    else console.error("Fixed API Error", fixedRes.status);

    if (mobileRes.ok) mobileData = await mobileRes.json();
    else console.error("Mobile API Error", mobileRes.status);

    // ---------------------------------------------------------
    // STAP 3: Data Verwerken
    // ---------------------------------------------------------
    let hasFibre = false;
    let hasDsl = false;
    let mobile = { orange: null, sfr: null, bouygues: null, free: null };

    // VAST: Zoek de beste match in de buurt
    if (fixedData.results && fixedData.results.length > 0) {
        // 1. Is er Fibre?
        const fibreRec = fixedData.results.find(r => r.techno === 'FttH' && (r.elig === true || r.elig === '1'));
        if (fibreRec) hasFibre = true;

        // 2. Is er DSL?
        const dslRec = fixedData.results.find(r => (r.techno === 'ADSL' || r.techno === 'VDSL2'));
        if (dslRec) hasDsl = true;
    }

    // MOBIEL: Pak de beste dekking in de buurt
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
                // Upgrade status als we een betere vinden in de straal van 200m
                if (!mobile[op] || mobile[op] === "Beschikbaar" || (status === "5G/4G" && mobile[op] === "4G")) {
                    mobile[op] = status;
                }
            }
        });
        
        // Fallback voor als we wel operator zien maar geen specifieke 'couverture' velden
        mobileData.results.forEach(r => {
             const op = (r.nom_operateur || r.operateur || '').toLowerCase();
             if (op && !mobile[op]) mobile[op] = "Beschikbaar"; 
        });
    }

    return res.status(200).json({
      ok: true,
      address_found: label,
      gps: { lat, lon },
      insee: insee, // Ter info
      search_method: "gps_radius_200m",
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
