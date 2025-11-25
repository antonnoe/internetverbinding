export default async function handler(req, res) {
  // Headers voor browser toegang (CORS)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  // 1. Input validatie
  const { address } = req.query;
  if (!address) {
    return res.status(400).json({ ok: false, error: "Geen adres opgegeven." });
  }

  try {
    // 2. BAN Lookup (Adres naar locatie)
    const banUrl = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(address)}&limit=1`;
    const banRes = await fetch(banUrl);
    
    if (!banRes.ok) {
        throw new Error(`BAN API reageert niet (Status: ${banRes.status})`);
    }
    
    const banData = await banRes.json();
    if (!banData.features || banData.features.length === 0) {
      return res.status(200).json({ ok: false, error: "Adres onbekend in BAN." });
    }

    const f = banData.features[0];
    const insee = f.properties.citycode;
    const label = f.properties.label;
    const coords = f.geometry.coordinates;
    const [lon, lat] = coords;

    // 3. ARCEP Data Ophalen (Sequentieel om timeouts te voorkomen)
    // URL opbouw met string template is veiliger hier
    const baseUrl = "https://data.arcep.fr/api/explore/v2.1/catalog/datasets";
    // Let op: enkele quotes rondom de insee code zijn verplicht voor deze API
    const whereClause = encodeURIComponent(`code_insee='${insee}'`);
    
    const fixedUrl = `${baseUrl}/maconnexioninternet/records?where=${whereClause}&limit=20`;
    const mobileUrl = `${baseUrl}/monreseaumobile/records?where=${whereClause}&limit=20`;

    // Haal Vast Internet op
    const fixedRes = await fetch(fixedUrl);
    let fixedData = { results: [] };
    if (fixedRes.ok) {
        fixedData = await fixedRes.json();
    } else {
        console.error("ARCEP Fixed Error:", fixedRes.status);
    }

    // Haal Mobiel Internet op
    const mobileRes = await fetch(mobileUrl);
    let mobileData = { results: [] };
    if (mobileRes.ok) {
        mobileData = await mobileRes.json();
    } else {
        console.error("ARCEP Mobile Error:", mobileRes.status);
    }

    // 4. Data Verwerken
    let hasFibre = false;
    let hasDsl = false;
    let mobile = { orange: null, sfr: null, bouygues: null, free: null };

    // Analyseer vast
    if (fixedData.results) {
        hasFibre = fixedData.results.some(r => r.techno === 'FttH' && (r.elig === true || r.elig === '1'));
        hasDsl = fixedData.results.some(r => (r.techno === 'ADSL' || r.techno === 'VDSL2'));
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

    // 5. Succesvol antwoord
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
    // VANGT ALLE CRASHES AF
    console.error("CRASH in backend:", error);
    return res.status(200).json({ 
      ok: false, 
      error: "Technische fout", 
      details: error.message 
    });
  }
}
