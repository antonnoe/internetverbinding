export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const { address } = req.query;

  if (!address) {
    return res.status(400).json({ ok: false, error: "Geen adres opgegeven." });
  }

  try {
    // 1. BAN Lookup
    const banUrl = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(address)}&limit=1`;
    const banRes = await fetch(banUrl);
    
    if (!banRes.ok) throw new Error(`BAN Fout: ${banRes.status}`);
    
    const banData = await banRes.json();
    if (!banData.features || banData.features.length === 0) {
      return res.status(200).json({ ok: false, error: "Adres onbekend in BAN." });
    }

    const f = banData.features[0];
    const insee = f.properties.citycode;
    const label = f.properties.label;
    const [lon, lat] = f.geometry.coordinates;

    // 2. ARCEP Data Ophalen (Slimmere query: 100 resultaten)
    const baseUrl = "https://data.arcep.fr/api/explore/v2.1/catalog/datasets";
    const whereClause = encodeURIComponent(`code_insee='${insee}'`);
    
    const limit = 100; 
    
    const fixedUrl = `${baseUrl}/maconnexioninternet/records?where=${whereClause}&limit=${limit}`;
    const mobileUrl = `${baseUrl}/monreseaumobile/records?where=${whereClause}&limit=${limit}`;

    const [fixedRes, mobileRes] = await Promise.all([
        fetch(fixedUrl),
        fetch(mobileUrl)
    ]);

    const fixedData = await fixedRes.json();
    const mobileData = await mobileRes.json();

    // 3. Verwerking (Robuuster: checkt op '1', 'true' en tekst)
    let hasFibre = false;
    let hasDsl = false;
    let mobile = { orange: null, sfr: null, bouygues: null, free: null };

    // --- VAST INTERNET ---
    if (fixedData.results) {
        const fibreHits = fixedData.results.filter(r => {
            const tech = (r.techno || '').toLowerCase();
            const active = r.elig === true || r.elig === '1' || r.elig === 1;
            return tech === 'ftth' && active;
        });
        
        if (fibreHits.length > 0) hasFibre = true;

        const dslHits = fixedData.results.filter(r => {
            const tech = (r.techno || '').toLowerCase();
            return (tech.includes('adsl') || tech.includes('vdsl')) && (r.elig === true || r.elig === '1' || r.elig === 1);
        });
        
        if (dslHits.length > 0) hasDsl = true;
    }

    // --- MOBIEL INTERNET ---
    if (mobileData.results) {
        mobileData.results.forEach(r => {
            const opNaam = r.nom_operateur || r.operateur || '';
            const op = opNaam.toLowerCase();
            
            const heeft4G = r.couverture_4g === 1 || r.couverture_4g === '1' || r.couverture === 'Très bonne couverture' || r.couverture === 'Bonne couverture';
            const heeft5G = r.couverture_5g === 1 || r.couverture_5g === '1';

            let status = null;
            if (heeft5G) status = "5G/4G";
            else if (heeft4G) status = "4G";

            if (op && status) {
                if (!mobile[op] || (status === "5G/4G" && mobile[op] === "4G")) {
                    mobile[op] = status;
                }
            }
        });
        
        // Fallback
        mobileData.results.forEach(r => {
             const opNaam = r.nom_operateur || r.operateur || '';
             const op = opNaam.toLowerCase();
             if (op && !mobile[op]) {
                 mobile[op] = "Beschikbaar"; 
             }
        });
    }

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
    console.error("Backend Error:", error);
    return res.status(500).json({ 
      ok: false, 
      error: "Server Fout", 
      details: error.message 
    });
  }
}
