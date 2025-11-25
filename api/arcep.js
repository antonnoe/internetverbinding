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
    const props = f.properties;
    const label = props.label;
    const [lon, lat] = f.geometry.coordinates;
    const postcode = props.postcode;
    const street = props.street || props.name;

    const baseUrl = "https://data.arcep.fr/api/explore/v2.1/catalog/datasets";

    // 2. Zoekstrategie: Eerst Straat, dan GPS Fallback
    let fixedData = { results: [] };
    let searchMethod = "init";

    // POGING A: Straatnaam + Postcode (Precies)
    if (street && postcode) {
        const qStreet = encodeURIComponent(street);
        const qPostcode = encodeURIComponent(`code_postal="${postcode}"`);
        // Zoek ruim (500 hits) om de straat te vinden
        const url = `${baseUrl}/maconnexioninternet/records?where=${qPostcode}&q=${qStreet}&limit=100`;
        
        const res = await fetch(url);
        if (res.ok) fixedData = await res.json();
    }

    // POGING B: GPS Fallback (Als A faalt of leeg is)
    if (!fixedData.results || fixedData.results.length === 0) {
        searchMethod = "gps_fallback_1000m";
        // Ruime radius (1000m) voor platteland
        const geo = `within_distance(geopoint, geom'POINT(${lon} ${lat})', 1000m)`;
        const url = `${baseUrl}/maconnexioninternet/records?where=${encodeURIComponent(geo)}&limit=100`;
        
        const res = await fetch(url);
        if (res.ok) fixedData = await res.json();
    } else {
        searchMethod = "street_match";
    }

    // 3. Mobiel (Altijd GPS, ruime straal)
    let mobileData = { results: [] };
    const geoMobile = `within_distance(geopoint, geom'POINT(${lon} ${lat})', 1000m)`;
    const mobileUrl = `${baseUrl}/monreseaumobile/records?where=${encodeURIComponent(geoMobile)}&limit=50`;
    const mobileRes = await fetch(mobileUrl);
    if (mobileRes.ok) mobileData = await mobileRes.json();

    // 4. Verwerking
    const streetMap = new Map();

    if (fixedData.results) {
      fixedData.results.forEach(r => {
        // Bij GPS fallback pakken we alles, bij straatmatch filteren we niet extra
        const num = r.numero || r.numero_voie || "?"; 
        const voie = r.nom_voie || street || "Omgeving";
        const techno = (r.techno || '').toLowerCase();
        
        // Unieke key: nummer + straat (zodat we bij GPS fallback niet alles op 1 hoop gooien)
        const key = `${num}_${voie}`;

        if (!streetMap.has(key)) {
          streetMap.set(key, {
            number: num,
            street: voie,
            hasFibre: false,
            hasDsl: false
          });
        }

        const entry = streetMap.get(key);

        if (techno.includes('ftth')) entry.hasFibre = true; // Ruime check
        if (techno.includes('adsl') || techno.includes('vdsl')) entry.hasDsl = true;
      });
    }

    // Sorteren (Numeriek waar mogelijk)
    const neighbors = Array.from(streetMap.values()).sort((a, b) => {
        const nA = parseInt(a.number) || 0;
        const nB = parseInt(b.number) || 0;
        return nA - nB;
    });

    // Mobiel verwerken
    let mobile = { orange: null, sfr: null, bouygues: null, free: null };
    if (mobileData.results) {
       mobileData.results.forEach(r => {
           const op = (r.nom_operateur || r.operateur || '').toLowerCase();
           // Check dekking
           const is4G = r.couverture_4g == 1 || r.couverture_4g === true;
           const is5G = r.couverture_5g == 1 || r.couverture_5g === true;
           
           let status = null;
           if (is5G) status = "5G/4G";
           else if (is4G) status = "4G";

           if (op && status) {
               // Upgrade status als we beter vinden
               if (!mobile[op] || mobile[op] === "Beschikbaar" || (status === "5G/4G" && mobile[op] === "4G")) {
                   mobile[op] = status;
               }
           }
       });
       // Fallback loop voor als coverage kolommen leeg zijn
       mobileData.results.forEach(r => {
            const op = (r.nom_operateur || r.operateur || '').toLowerCase();
            if(op && !mobile[op]) mobile[op] = "Beschikbaar";
       });
    }

    return res.status(200).json({
      ok: true,
      address_found: label,
      search_method: searchMethod, // Zie je in de JSON output voor debug
      total_found: neighbors.length,
      neighbors: neighbors,
      mobile: mobile
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: "Server fout", details: error.message });
  }
}
