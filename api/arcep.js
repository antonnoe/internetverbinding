// api/arcep.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const { address } = req.query;

  if (!address) {
    return res.status(400).json({ ok: false, error: "Geen adres opgegeven." });
  }

  try {
    // 1. BAN: Adres -> INSEE
    // We gebruiken encodeURIComponent voor veiligheid
    const banUrl = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(address)}&limit=1`;
    const banRes = await fetch(banUrl);
    
    if (!banRes.ok) throw new Error(`BAN API Fout: ${banRes.status}`);
    
    const banData = await banRes.json();
    if (!banData.features || banData.features.length === 0) {
      return res.status(200).json({ ok: false, error: "Adres onbekend in BAN." });
    }

    const feature = banData.features[0];
    const insee = feature.properties.citycode;
    const label = feature.properties.label;
    const [lon, lat] = feature.geometry.coordinates;

    // 2. ARCEP: Data ophalen
    // BELANGRIJK: De query parameter MOET encoded zijn voor Node.js fetch
    const whereQuery = encodeURIComponent(`code_insee="${insee}"`);
    
    const fixedUrl = `https://data.arcep.fr/api/explore/v2.1/catalog/datasets/maconnexioninternet/records?where=${whereQuery}&limit=50`;
    const mobileUrl = `https://data.arcep.fr/api/explore/v2.1/catalog/datasets/monreseaumobile/records?where=${whereQuery}&limit=50`;

    // We voeren de requests parallel uit voor snelheid
    const [fixedRes, mobileRes] = await Promise.all([
        fetch(fixedUrl),
        fetch(mobileUrl)
    ]);

    // Check op netwerkfouten
    if (!fixedRes.ok) throw new Error(`ARCEP Fixed API Fout: ${fixedRes.status}`);
    if (!mobileRes.ok) throw new Error(`ARCEP Mobile API Fout: ${mobileRes.status}`);

    const fixedData = await fixedRes.json();
    const mobileData = await mobileRes.json();

    // 3. Verwerking
    let hasFibre = false;
    let hasDsl = false;
    let mobile = { orange: null, sfr: null, bouygues: null, free: null };

    // Analyseer vast internet
    if (fixedData.results) {
        const fibreRec = fixedData.results.find(r => r.techno === 'FttH' && (r.elig === true || r.elig === '1'));
        if (fibreRec) hasFibre = true;

        const dslRec = fixedData.results.find(r => (r.techno === 'ADSL' || r.techno === 'VDSL2'));
        if (dslRec) hasDsl = true;
    }

    // Analyseer mobiel
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
      insee: insee,
      fibre: hasFibre,
      dsl: hasDsl,
      mobile: mobile
    });

  } catch (error) {
    console.error("Backend Error:", error);
    // We sturen de details mee zodat je ze in de browser ziet
    return res.status(500).json({ 
      ok: false, 
      error: "Server fout bij verwerken data.",
      details: error.message 
    });
  }
}
