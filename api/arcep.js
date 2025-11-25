// api/arcep.js
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const { address } = req.query;

  if (!address) {
    return res.status(400).json({ ok: false, error: "Geen adres." });
  }

  try {
    // STAP 1: BAN Lookup
    const banRes = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(address)}&limit=1`);
    const banData = await banRes.json();

    if (!banData.features?.length) {
      return res.status(200).json({ ok: false, error: "Adres niet gevonden in BAN." });
    }

    const f = banData.features[0];
    const props = f.properties;
    const label = props.label;
    const [lon, lat] = f.geometry.coordinates;
    
    // Cruciaal: We halen postcode en straatnaam op
    const postcode = props.postcode; 
    const city = props.city;
    const street = props.street || props.name; // 'Rue de Sehen'
    
    // STAP 2: ARCEP ZOEKSTRATEGIE
    const baseUrl = "https://data.arcep.fr/api/explore/v2.1/catalog/datasets";
    
    // STRATEGIE A: Zoeken op Straatnaam binnen Postcode (Beste voor platteland met foute INSEE)
    // We gebruiken 'q' voor tekstzoeken (slimme match) en filteren op postcode.
    let fixedUrl = "";
    if (street && postcode) {
        const qStreet = encodeURIComponent(street);
        const qPostcode = encodeURIComponent(`code_postal="${postcode}"`);
        fixedUrl = `${baseUrl}/maconnexioninternet/records?where=${qPostcode}&q=${qStreet}&limit=100`;
    } else {
        // Fallback: GPS Radius 1000m als geen straatnaam bekend is
        const geo = encodeURIComponent(`within_distance(geopoint, geom'POINT(${lon} ${lat})', 1000m)`);
        fixedUrl = `${baseUrl}/maconnexioninternet/records?where=${geo}&limit=100`;
    }

    // STRATEGIE B: Mobiel altijd via GPS (500m)
    const geoMobile = encodeURIComponent(`within_distance(geopoint, geom'POINT(${lon} ${lat})', 500m)`);
    const mobileUrl = `${baseUrl}/monreseaumobile/records?where=${geoMobile}&limit=50`;

    // Ophalen
    const [fixedRes, mobileRes] = await Promise.all([fetch(fixedUrl), fetch(mobileUrl)]);
    
    let fixedData = { results: [] };
    let mobileData = { results: [] };

    if (fixedRes.ok) fixedData = await fixedRes.json();
    if (mobileRes.ok) mobileData = await mobileRes.json();

    // STAP 3: Resultaten Verwerken
    const streetMap = new Map();

    if (fixedData.results) {
      fixedData.results.forEach(r => {
        const num = r.numero || r.numero_voie;
        if (!num) return;

        const voie = r.nom_voie || street;
        const techno = (r.techno || '').toLowerCase();
        const key = `${num}`; // Groeperen op huisnummer

        if (!streetMap.has(key)) {
          streetMap.set(key, {
            number: num,
            street: voie,
            hasFibre: false,
            hasDsl: false
          });
        }

        const entry = streetMap.get(key);

        // Check Fibre (Soepele check: als er FttH staat is het goed)
        if (techno.includes('ftth')) {
             // Soms is elig true, soms 1, soms '1'. We checken ruim.
             if (r.elig == true || r.elig == 1 || r.elig == '1' || r.etat_immeuble === 'DEPLOYE') {
                 entry.hasFibre = true;
             }
        }
        if (techno.includes('adsl') || techno.includes('vdsl')) {
             entry.hasDsl = true;
        }
      });
    }

    // Sorteren
    const neighbors = Array.from(streetMap.values()).sort((a, b) => {
        return parseInt(a.number) - parseInt(b.number);
    });

    // Mobiel verwerken
    let mobile = { orange: null, sfr: null, bouygues: null, free: null };
    if (mobileData.results) {
       mobileData.results.forEach(r => {
           const op = (r.nom_operateur || r.operateur || '').toLowerCase();
           // Check op 'best' coverage
           if (r.couverture_5g == 1) { if(op) mobile[op] = "5G/4G"; }
           else if (r.couverture_4g == 1) { if(op && mobile[op] !== "5G/4G") mobile[op] = "4G"; }
       });
       // Fallback loop
       mobileData.results.forEach(r => {
           const op = (r.nom_operateur || r.operateur || '').toLowerCase();
           if(op && !mobile[op]) mobile[op] = "Beschikbaar";
       });
    }

    return res.status(200).json({
      ok: true,
      address_found: label,
      search_method: street && postcode ? "postcode_street_match" : "gps_fallback",
      total_found: neighbors.length,
      neighbors: neighbors,
      mobile: mobile
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: "Server fout", details: error.message });
  }
}
