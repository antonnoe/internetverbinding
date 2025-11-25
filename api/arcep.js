// api/arcep.js
// Gebruikt standaard Node.js fetch (geen imports nodig in Node 18+)

export default async function handler(req, res) {
  // Zet headers voor veiligheid en toegang
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const { address } = req.query;

  if (!address) {
    return res.status(400).json({ ok: false, error: "Geen adres opgegeven." });
  }

  try {
    // STAP 1: Adres naar Coördinaten & INSEE (via BAN API)
    const banUrl = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(address)}&limit=1`;
    const banRes = await fetch(banUrl);
    const banData = await banRes.json();

    if (!banData.features || banData.features.length === 0) {
      return res.status(200).json({ ok: false, error: "Adres onbekend in BAN." });
    }

    const feature = banData.features[0];
    const insee = feature.properties.citycode;
    const label = feature.properties.label;
    const [lon, lat] = feature.geometry.coordinates;

    // STAP 2: Haal Fibre/DSL data op (via ARCEP OpenData)
    // We zoeken op INSEE code om zeker te zijn van data in de gemeente
    const fixedUrl = `https://data.arcep.fr/api/explore/v2.1/catalog/datasets/maconnexioninternet/records?where=code_insee="${insee}"&limit=50`;
    const fixedRes = await fetch(fixedUrl);
    const fixedData = await fixedRes.json();

    // STAP 3: Haal Mobiele data op
    const mobileUrl = `https://data.arcep.fr/api/explore/v2.1/catalog/datasets/monreseaumobile/records?where=code_insee="${insee}"&limit=50`;
    const mobileRes = await fetch(mobileUrl);
    const mobileData = await mobileRes.json();

    // STAP 4: Analyseer de resultaten
    let hasFibre = false;
    let hasDsl = false;
    let mobile = { orange: null, sfr: null, bouygues: null, free: null };

    // Check vast internet (Fibre/DSL)
    if (fixedData.results && fixedData.results.length > 0) {
      // Zoek of er IN DEZE GEMEENTE fibre beschikbaar is
      const fibreRecord = fixedData.results.find(r => r.techno === 'FttH' && (r.elig === true || r.elig === '1'));
      if (fibreRecord) hasFibre = true;

      const dslRecord = fixedData.results.find(r => (r.techno === 'ADSL' || r.techno === 'VDSL2'));
      if (dslRecord) hasDsl = true;
    }

    // Check mobiel
    if (mobileData.results && mobileData.results.length > 0) {
      mobileData.results.forEach(r => {
        const op = (r.operateur || '').toLowerCase();
        // Pak de beste dekking die we vinden in deze batch
        if (op && !mobile[op]) {
           mobile[op] = r.couverture_4g || r.couverture || "Beschikbaar";
        }
      });
    }

    // STAP 5: Stuur antwoord
    return res.status(200).json({
      ok: true,
      address_found: label,
      gps: { lat, lon },
      fibre: hasFibre,
      dsl: hasDsl,
      mobile: mobile
    });

  } catch (error) {
    console.error("API Fout:", error);
    return res.status(500).json({ 
      ok: false, 
      error: "Server fout bij ophalen data.",
      details: error.message 
    });
  }
}
