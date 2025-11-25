export default async function handler(req, res) {
  // 1. CORS en Headers instellen (belangrijk voor browser toegang)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Behandel OPTIONS request (preflight check van browser)
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { address } = req.query;

  if (!address) {
    return res.status(400).json({ ok: false, error: "Geen adres opgegeven." });
  }

  try {
    // STAP A: Zoek coördinaten via BAN (Franse overheids API)
    // We gebruiken de globale 'fetch', geen import nodig!
    const banUrl = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(address)}&limit=1`;
    const banRes = await fetch(banUrl);
    const banData = await banRes.json();

    if (!banData.features || banData.features.length === 0) {
      return res.status(404).json({ ok: false, error: "Adres niet gevonden in BAN." });
    }

    const feature = banData.features[0];
    const [lon, lat] = feature.geometry.coordinates;
    const insee = feature.properties.citycode;

    // STAP B: Haal data op bij ARCEP (OpenDataSoft)
    // We zoeken op INSEE code, dat is het meest betrouwbaar
    
    // 1. Vaste verbinding (Fibre/DSL)
    const fixedUrl = `https://data.arcep.fr/api/explore/v2.1/catalog/datasets/maconnexioninternet/records?where=code_insee="${insee}"&limit=100`;
    const fixedRes = await fetch(fixedUrl);
    const fixedData = await fixedRes.json();

    // 2. Mobiele dekking
    const mobileUrl = `https://data.arcep.fr/api/explore/v2.1/catalog/datasets/monreseaumobile/records?where=code_insee="${insee}"&limit=100`;
    const mobileRes = await fetch(mobileUrl);
    const mobileData = await mobileRes.json();

    // STAP C: Data verwerken (simpele logica)
    let hasFibre = false;
    let hasDsl = false;
    let mobileCoverage = { orange: null, sfr: null, bouygues: null, free: null };

    // Check vast internet
    if (fixedData.results) {
        // Simpele check: is er ergens in deze gemeente fibre gemeld?
        // Voor exact adres zou je moeten filteren op hexacle_cle, maar dit is een goede eerste stap.
        const fibreRecord = fixedData.results.find(r => r.techno === 'FttH' && r.elig === true);
        if (fibreRecord) hasFibre = true;

        const dslRecord = fixedData.results.find(r => (r.techno === 'ADSL' || r.techno === 'VDSL2') && r.elig === true);
        if (dslRecord) hasDsl = true;
    }

    // Check mobiel (pak de eerste hit voor deze gemeente als indicatie)
    if (mobileData.results && mobileData.results.length > 0) {
        // We proberen een gemiddeld beeld te krijgen
        mobileData.results.forEach(record => {
            const op = (record.operateur || '').toLowerCase();
            // Sla dekking op als we die nog niet hebben voor deze operator
            if (op && !mobileCoverage[op] && (record.couverture_4g || record.couverture_5g)) {
                mobileCoverage[op] = record.couverture_4g || "Beschikbaar";
            }
        });
    }

    // STAP D: Antwoord sturen
    return res.status(200).json({
      ok: true,
      debug_info: { lat, lon, insee },
      address_found: feature.properties.label,
      fibre: hasFibre,
      dsl: hasDsl,
      mobile: mobileCoverage
    });

  } catch (error) {
    console.error("API Error:", error);
    // Stuur JSON terug, zelfs bij een error, zodat de frontend niet chooked op HTML
    return res.status(500).json({ 
        ok: false, 
        error: "Server fout bij ophalen data.", 
        details: error.message 
    });
  }
}
