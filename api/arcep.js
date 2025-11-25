export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const { address } = req.query;

  if (!address) {
    return res.status(400).json({ ok: false, error: "Geen adres opgegeven." });
  }

  try {
    // ---------------------------------------------------------
    // STAP 1: BAN Lookup (Adres -> Huisnummer & Straat)
    // ---------------------------------------------------------
    const banUrl = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(address)}&limit=1`;
    const banRes = await fetch(banUrl);
    const banData = await banRes.json();

    if (!banData.features || banData.features.length === 0) {
      return res.status(200).json({ ok: false, error: "Adres onbekend in BAN." });
    }

    const f = banData.features[0];
    const props = f.properties;
    
    const lat = f.geometry.coordinates[1];
    const lon = f.geometry.coordinates[0];
    const insee = props.citycode;
    const label = props.label;
    
    // We halen de specifieke straat en huisnummer op
    const street = props.street || props.name; // 'Rue de Sehen'
    const houseNum = props.housenumber;        // '22'

    // ---------------------------------------------------------
    // STAP 2: ARCEP Data Ophalen (Zoeken op Straatnaam)
    // ---------------------------------------------------------
    const baseUrl = "https://data.arcep.fr/api/explore/v2.1/catalog/datasets";
    
    // VAST INTERNET: We zoeken specifiek in de gemeente EN op straatnaam
    // Dit is veel nauwkeuriger dan GPS radius
    let fixedUrl = `${baseUrl}/maconnexioninternet/records?where=code_insee='${insee}'`;
    
    // Als we een straatnaam hebben, voegen we een tekstzoekopdracht toe
    if (street) {
        // We gebruiken 'search' parameter voor full-text search op de straat
        fixedUrl += `&search=${encodeURIComponent(street)}`;
    }
    fixedUrl += `&limit=100`; // Haal genoeg nummers op om de jouwe te vinden

    // MOBIEL: Dekking is gebiedsgebonden, dus gemeente-niveau + GPS radius is prima
    // We gebruiken hier een GPS radius van 500m om de masten in de buurt te vinden
    const geoQuery = encodeURIComponent(`within_distance(geopoint, geom'POINT(${lon} ${lat})', 500m)`);
    const mobileUrl = `${baseUrl}/monreseaumobile/records?where=${geoQuery}&limit=50`;

    const [fixedRes, mobileRes] = await Promise.all([
        fetch(fixedUrl),
        fetch(mobileUrl)
    ]);

    let fixedData = { results: [] };
    let mobileData = { results: [] };

    if (fixedRes.ok) fixedData = await fixedRes.json();
    if (mobileRes.ok) mobileData = await mobileRes.json();

    // ---------------------------------------------------------
    // STAP 3: Data Verwerken (Huisnummer Match)
    // ---------------------------------------------------------
    let hasFibre = false;
    let hasDsl = false;
    let matchType = "gemeente_fallback"; // Om te debuggen hoe goed de match was

    // --- VAST INTERNET ANALYSE ---
    if (fixedData.results && fixedData.results.length > 0) {
        let relevantRecords = fixedData.results;
        let exactMatchFound = false;

        // Als we een huisnummer hebben, proberen we EXACT dat nummer te vinden
        if (houseNum) {
            const exactMatches = fixedData.results.filter(r => {
                // ARCEP veld is vaak 'numero' of 'numero_voie'
                return r.numero == houseNum || r.numero_voie == houseNum;
            });

            if (exactMatches.length > 0) {
                relevantRecords = exactMatches;
                matchType = "exact_huisnummer";
                exactMatchFound = true;
            } else {
                matchType = "straat_gemiddelde";
            }
        }

        // Check Fibre in de relevante records (Exact huis of hele straat)
        const fibreRec = relevantRecords.find(r => {
            const tech = (r.techno || '').toLowerCase();
            // FttH aanwezig?
            return tech.includes('ftth') && (r.elig === true || r.elig === '1' || r.elig === 1);
        });
        
        if (fibreRec) hasFibre = true;

        // Check DSL
        const dslRec = relevantRecords.find(r => {
            const tech = (r.techno || '').toLowerCase();
            return tech.includes('adsl') || tech.includes('vdsl');
        });
        if (dslRec) hasDsl = true;
    }

    // --- MOBIEL INTERNET ANALYSE ---
    let mobile = { orange: null, sfr: null, bouygues: null, free: null };
    if (mobileData.results) {
        mobileData.results.forEach(r => {
            const op = (r.nom_operateur || r.operateur || '').toLowerCase();
            const heeft4G = r.couverture_4g === 1 || r.couverture_4g === '1' || r.couverture === 'Très bonne couverture' || r.couverture === 'Bonne couverture';
            const heeft5G = r.couverture_5g === 1 || r.couverture_5g === '1';

            let status = null;
            if (heeft5G) status = "5G/4G";
            else if (heeft4G) status = "4G";

            if (op && status) {
                if (!mobile[op] || mobile[op] === "Beschikbaar" || (status === "5G/4G" && mobile[op] === "4G")) {
                    mobile[op] = status;
                }
            }
        });
        // Fallback
        mobileData.results.forEach(r => {
             const op = (r.nom_operateur || r.operateur || '').toLowerCase();
             if (op && !mobile[op]) mobile[op] = "Beschikbaar"; 
        });
    }

    return res.status(200).json({
      ok: true,
      address_found: label,
      gps: { lat, lon },
      match_level: matchType, // Handig om te zien: "exact_huisnummer" of "straat"
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
