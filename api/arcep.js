export default async function handler(req, res) {
  // 1. CORS & Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const { address } = req.query;

  if (!address) {
    return res.status(400).json({ ok: false, error: "Geen adres opgegeven." });
  }

  try {
    // 2. BAN LOOKUP (Adres -> GPS)
    const banUrl = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(address)}&limit=1`;
    const banRes = await fetch(banUrl);
    const banData = await banRes.json();

    if (!banData.features || banData.features.length === 0) {
      return res.status(200).json({ ok: false, error: "Adres onbekend in BAN." });
    }

    const f = banData.features[0];
    const label = f.properties.label;
    const [lon, lat] = f.geometry.coordinates;

    // 3. ARCEP LOOKUP (GPS RADIUS)
    // We zoeken alles binnen 500 meter. Dit lost het probleem op van:
    // - Verkeerde gemeentecodes (INSEE mismatch)
    // - Lange opritten (huis staat ver van de weg)
    // - Verschillende schrijfwijzen van straatnamen
    
    const baseUrl = "https://data.arcep.fr/api/explore/v2.1/catalog/datasets";
    
    // Radius query: 500 meter
    const geoQuery = `within_distance(geopoint, geom'POINT(${lon} ${lat})', 500m)`;
    const whereClause = encodeURIComponent(geoQuery);
    
    // We halen max 100 resultaten op in de buurt
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

    // 4. DATA ANALYSE (Is er *iets* in de buurt?)
    let hasFibre = false;
    let hasDsl = false;
    let mobile = { orange: null, sfr: null, bouygues: null, free: null };

    // VAST INTERNET
    if (fixedData.results && fixedData.results.length > 0) {
        // Check of er ERGENS in de straal van 500m glasvezel ligt
        const fibreExists = fixedData.results.some(r => {
            const tech = (r.techno || '').toLowerCase();
            // We checken alleen op techniek, niet op 'activeerbaar', want dat is administratie
            return tech.includes('ftth'); 
        });
        
        if (fibreExists) hasFibre = true;

        const dslExists = fixedData.results.some(r => {
            const tech = (r.techno || '').toLowerCase();
            return tech.includes('adsl') || tech.includes('vdsl');
        });
        
        if (dslExists) hasDsl = true;
    }

    // MOBIEL INTERNET
    if (mobileData.results && mobileData.results.length > 0) {
        mobileData.results.forEach(r => {
            // Normaliseer operator naam
            const rawOp = r.nom_operateur || r.operateur || '';
            const op = rawOp.toLowerCase();
            
            if (!op) return;

            // Bepaal beste signaal in de buurt
            const is4G = r.couverture_4g === 1 || r.couverture_4g === '1' || 
                         (typeof r.couverture === 'string' && r.couverture.includes('Bonne'));
            const is5G = r.couverture_5g === 1 || r.couverture_5g === '1';

            let status = null;
            if (is5G) status = "5G/4G";
            else if (is4G) status = "4G";

            // Update als we een betere status vinden dan we al hadden
            if (status) {
                if (!mobile[op] || mobile[op] === "Beschikbaar" || (status === "5G/4G" && mobile[op] === "4G")) {
                    mobile[op] = status;
                }
            }
        });
        
        // Fallback: als we de operator zien maar geen status konden bepalen
        mobileData.results.forEach(r => {
             const op = (r.nom_operateur || r.operateur || '').toLowerCase();
             if (op && !mobile[op]) mobile[op] = "Beschikbaar"; 
        });
    }

    // 5. RESPONSE
    return res.status(200).json({
      ok: true,
      address_found: label,
      gps: { lat, lon },
      search_method: "gps_radius_500m",
      fibre: hasFibre,
      dsl: hasDsl,
      mobile: mobile
    });

  } catch (error) {
    console.error("Backend Error:", error);
    // Stuur JSON terug bij crash
    return res.status(500).json({ 
      ok: false, 
      error: "Server Fout", 
      details: error.message 
    });
  }
}
