// api/arcep.js
// Backend: BAN -> INSEE -> ARCEP (Fixed + Mobile)
// Versie: Single Quote Fix + URL Object

export default async function handler(req, res) {
  // Headers voor browser toegang
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const { address } = req.query;

  if (!address) {
    return res.status(400).json({ ok: false, error: "Geen adres opgegeven." });
  }

  try {
    // ---------------------------------------------------------
    // STAP 1: BAN Lookup (Adres naar INSEE)
    // ---------------------------------------------------------
    const banUrl = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(address)}&limit=1`;
    const banRes = await fetch(banUrl);
    
    if (!banRes.ok) throw new Error(`BAN API Fout: ${banRes.status}`);
    
    const banData = await banRes.json();
    if (!banData.features || banData.features.length === 0) {
      return res.status(200).json({ ok: false, error: "Adres onbekend in BAN." });
    }

    const f = banData.features[0];
    const insee = f.properties.citycode;
    const label = f.properties.label;
    const [lon, lat] = f.geometry.coordinates;

    // ---------------------------------------------------------
    // STAP 2: ARCEP Data Ophalen
    // ---------------------------------------------------------
    // We gebruiken de URL class om fouten met leestekens te voorkomen
    const baseUrl = "https://data.arcep.fr/api/explore/v2.1/catalog/datasets";
    
    // Functie om URL te bouwen met de JUISTE (enkele) quotes
    const createArcepUrl = (dataset) => {
        const url = new URL(`${baseUrl}/${dataset}/records`);
        // LET OP: ARCEP vereist enkele quotes rondom de waarde!
        // code_insee='12345'
        url.searchParams.append("where", `code_insee='${insee}'`);
        url.searchParams.append("limit", "50");
        return url.toString();
    };

    const fixedUrl = createArcepUrl("maconnexioninternet");
    const mobileUrl = createArcepUrl("monreseaumobile");

    // Parallel ophalen
    const [fixedRes, mobileRes] = await Promise.all([
        fetch(fixedUrl),
        fetch(mobileUrl)
    ]);

    // We checken niet direct op !ok, maar lezen de JSON. 
    // Soms geeft OpenDataSoft een error in JSON formaat terug.
    const fixedData = await fixedRes.json();
    const mobileData = await mobileRes.json();

    // Check of de requests daadwerkelijk data bevatten of een foutcode
    if (fixedData.error_code || mobileData.error_code) {
        console.error("ARCEP API Fout:", fixedData, mobileData);
        // We gooien geen error, maar gaan door (graceful degradation)
    }

    // ---------------------------------------------------------
    // STAP 3: Data Verwerken
    // ---------------------------------------------------------
    let hasFibre = false;
    let hasDsl = false;
    let mobile = { orange: null, sfr: null, bouygues: null, free: null };

    // Vast internet (Fibre/DSL)
    if (fixedData.results) {
        const fibreRec = fixedData.results.find(r => r.techno === 'FttH' && (r.elig === true || r.elig === '1'));
        if (fibreRec) hasFibre = true;

        const dslRec = fixedData.results.find(r => (r.techno === 'ADSL' || r.techno === 'VDSL2'));
        if (dslRec) hasDsl = true;
    }

    // Mobiel internet
    if (mobileData.results) {
        mobileData.results.forEach(r => {
            const op = (r.operateur || '').toLowerCase();
            // Pak dekking als we die nog niet hebben
            if (op && !mobile[op]) {
                mobile[op] = r.couverture_4g || r.couverture || "Beschikbaar";
            }
        });
    }

    // ---------------------------------------------------------
    // STAP 4: Response
    // ---------------------------------------------------------
    return res.status(200).json({
      ok: true,
      address_found: label,
      gps: { lat, lon },
      insee: insee,
      fibre: hasFibre,
      dsl: hasDsl,
      mobile: mobile,
      // Debug info voor als het toch nog misgaat (kun je later weghalen)
      debug_urls: { fixed: fixedUrl, mobile: mobileUrl }
    });

  } catch (error) {
    console.error("Backend Crash:", error);
    return res.status(500).json({ 
      ok: false, 
      error: "Technische fout in backend.", 
      details: error.message 
    });
  }
}
