// api/arcep.js
export default async function handler(req, res) {
  // Headers
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

    if (!banData.features || banData.features.length === 0) {
      return res.status(200).json({ ok: false, error: "Adres onbekend." });
    }

    const f = banData.features[0];
    const insee = f.properties.citycode;
    const label = f.properties.label;
    const [lon, lat] = f.geometry.coordinates;

    // 2. ARCEP Data (Simpele URL constructie die altijd werkt)
    // Let op de enkele quotes rondom de insee code!
    const arcepBase = "https://data.arcep.fr/api/explore/v2.1/catalog/datasets";
    const query = encodeURIComponent(`code_insee='${insee}'`);
    
    const fixedUrl = `${arcepBase}/maconnexioninternet/records?where=${query}&limit=20`;
    const mobileUrl = `${arcepBase}/monreseaumobile/records?where=${query}&limit=20`;

    // Parallel ophalen
    const [fixedRes, mobileRes] = await Promise.all([
        fetch(fixedUrl),
        fetch(mobileUrl)
    ]);

    const fixedData = await fixedRes.json();
    const mobileData = await mobileRes.json();

    // 3. Verwerking
    let hasFibre = false;
    let hasDsl = false;
    let mobile = { orange: null, sfr: null, bouygues: null, free: null };

    if (fixedData.results) {
        hasFibre = fixedData.results.some(r => r.techno === 'FttH' && (r.elig === true || r.elig === '1'));
        hasDsl = fixedData.results.some(r => (r.techno === 'ADSL' || r.techno === 'VDSL2'));
    }

    if (mobileData.results) {
        mobileData.results.forEach(r => {
            const op = (r.operateur || '').toLowerCase();
            if (op && !mobile[op]) {
                mobile[op] = r.couverture_4g || r.couverture || "Beschikbaar";
            }
        });
    }

    return res.status(200).json({
      ok: true,
      address_found: label,
      gps: { lat, lon },
      fibre: hasFibre,
      dsl: hasDsl,
      mobile: mobile
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ 
      ok: false, 
      error: "Server Fout", 
      details: error.message 
    });
  }
}
