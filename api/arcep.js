export default async function handler(req, res) {
  // Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const { address } = req.query;

  if (!address) {
    return res.status(400).json({ ok: false, error: "Geen adres." });
  }

  try {
    // ---------------------------------------------------------
    // 1. BAN: Haal GPS op
    // ---------------------------------------------------------
    const banRes = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(address)}&limit=1`);
    const banData = await banRes.json();

    if (!banData.features?.length) {
      return res.status(200).json({ ok: false, error: "Adres niet gevonden in BAN." });
    }

    const f = banData.features[0];
    const [lon, lat] = f.geometry.coordinates;
    const label = f.properties.label;

    // ---------------------------------------------------------
    // 2. ARCEP: Haal alles op binnen 200 meter (GPS ONLY)
    // ---------------------------------------------------------
    // We negeren straatnamen en postcodes. We kijken puur geografisch.
    const baseUrl = "https://data.arcep.fr/api/explore/v2.1/catalog/datasets";
    
    // Radius query
    const geoQuery = `within_distance(geopoint, geom'POINT(${lon} ${lat})', 200m)`;
    const whereClause = encodeURIComponent(geoQuery);
    
    // URLs
    const fixedUrl = `${baseUrl}/maconnexioninternet/records?where=${whereClause}&limit=100`;
    const mobileUrl = `${baseUrl}/monreseaumobile/records?where=${whereClause}&limit=50`;

    // Fetch Parallel
    const [fixedRes, mobileRes] = await Promise.all([
        fetch(fixedUrl),
        fetch(mobileUrl)
    ]);

    let fixedData = { results: [] };
    let mobileData = { results: [] };

    if (fixedRes.ok) fixedData = await fixedRes.json();
    if (mobileRes.ok) mobileData = await mobileRes.json();

    // ---------------------------------------------------------
    // 3. Verwerking naar lijst
    // ---------------------------------------------------------
    const streetMap = new Map();

    if (fixedData.results) {
      fixedData.results.forEach(r => {
        const num = r.numero || r.numero_voie;
        const voie = r.nom_voie || "Nabije omgeving";
        const techno = (r.techno || '').toLowerCase();
        
        // Als er geen huisnummer is, slaan we hem over voor de lijst, 
        // maar we onthouden wel dat er glasvezel in de buurt is.
        if (!num) return;

        const key = `${num}_${voie}`;

        if (!streetMap.has(key)) {
          streetMap.set(key, {
            number: num,
            street: voie,
            hasFibre: false,
            hasDsl: false
          });
        }

        const entry = streetMap.get(key);

        if (techno.includes('ftth')) entry.hasFibre = true;
        if (techno.includes('adsl') || techno.includes('vdsl')) entry.hasDsl = true;
      });
    }

    // Sorteren
    const neighbors = Array.from(streetMap.values()).sort((a, b) => {
        return parseInt(a.number) - parseInt(b.number);
    });

    // ---------------------------------------------------------
    // 4. Mobiel & Response
    // ---------------------------------------------------------
    let mobile = { orange: null, sfr: null, bouygues: null, free: null };
    
    if (mobileData.results) {
       mobileData.results.forEach(r => {
           const op = (r.nom_operateur || r.operateur || '').toLowerCase();
           // Check 4G/5G
           const is4G = r.couverture_4g == 1 || r.couverture_4g === true;
           const is5G = r.couverture_5g == 1 || r.couverture_5g === true;
           
           let status = null;
           if (is5G) status = "5G/4G";
           else if (is4G) status = "4G";

           if (op && status) {
               if (!mobile[op] || mobile[op] === "Beschikbaar" || (status === "5G/4G" && mobile[op] === "4G")) {
                   mobile[op] = status;
               }
           }
       });
       // Fallback
       mobileData.results.forEach(r => {
            const op = (r.nom_operateur || r.operateur || '').toLowerCase();
            if(op && !mobile[op]) mobile[op] = "Beschikbaar";
       });
    }

    return res.status(200).json({
      ok: true,
      address_found: label,
      gps: { lat, lon },
      search_method: "gps_radius_200m",
      total_found: neighbors.length,
      neighbors: neighbors,
      mobile: mobile
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: "Server fout", details: error.message });
  }
}
