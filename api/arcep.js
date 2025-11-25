// api/arcep.js
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const { address } = req.query;

  if (!address) {
    return res.status(400).json({ ok: false, error: "Geen adres." });
  }

  try {
    // 1. BAN Lookup
    const banRes = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(address)}&limit=1`);
    const banData = await banRes.json();

    if (!banData.features?.length) {
      return res.status(200).json({ ok: false, error: "Adres niet gevonden in BAN." });
    }

    const f = banData.features[0];
    const label = f.properties.label;
    const [lon, lat] = f.geometry.coordinates;

    // 2. ARCEP SCAN (Radius 1000m)
    const baseUrl = "https://data.arcep.fr/api/explore/v2.1/catalog/datasets";
    const geoQuery = `within_distance(geopoint, geom'POINT(${lon} ${lat})', 1000m)`;
    
    // Haal 100 resultaten op
    const fixedUrl = `${baseUrl}/maconnexioninternet/records?where=${encodeURIComponent(geoQuery)}&limit=100`;
    const mobileUrl = `${baseUrl}/monreseaumobile/records?where=${encodeURIComponent(geoQuery)}&limit=100`;

    const [fixedRes, mobileRes] = await Promise.all([fetch(fixedUrl), fetch(mobileUrl)]);

    let fixedData = { results: [] };
    let mobileData = { results: [] };

    if (fixedRes.ok) fixedData = await fixedRes.json();
    if (mobileRes.ok) mobileData = await mobileRes.json();

    // 3. DATA VERWERKEN: Welke operators zijn er?
    const fibreOperators = new Set();
    let hasDsl = false;

    if (fixedData.results) {
      fixedData.results.forEach(r => {
        const tech = (r.techno || '').toLowerCase();
        const op = r.nom_operateur || r.operateur; 

        if (tech.includes('ftth') && op) {
            fibreOperators.add(op);
        }
        if (tech.includes('adsl') || tech.includes('vdsl')) {
            hasDsl = true;
        }
      });
    }

    // Mobiele data
    let mobile = { orange: null, sfr: null, bouygues: null, free: null };
    if (mobileData.results) {
       mobileData.results.forEach(r => {
           const op = (r.nom_operateur || r.operateur || '').toLowerCase();
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

    const fibreList = Array.from(fibreOperators).sort();

    return res.status(200).json({
      ok: true,
      address_found: label,
      gps: { lat, lon },
      fibre_operators: fibreList, 
      dsl_available: hasDsl,
      mobile: mobile
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: "Server fout", details: error.message });
  }
}
