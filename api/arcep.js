// api/arcep.js
// Strategie: Full-text search (zoals Google) op Postcode + Straatnaam
// Dit werkt altijd, ook als GPS of INSEE-codes niet matchen.

export default async function handler(req, res) {
  // 1. Headers & Config
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const { address } = req.query;
  if (!address) return res.status(400).json({ ok: false, error: "Geen adres." });

  try {
    // ---------------------------------------------------------
    // STAP 1: BAN Lookup (Om de straatnaam en postcode zuiver te krijgen)
    // ---------------------------------------------------------
    const banRes = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(address)}&limit=1`);
    const banData = await banRes.json();

    if (!banData.features?.length) {
      return res.status(200).json({ ok: false, error: "Adres niet gevonden in BAN." });
    }

    const f = banData.features[0];
    const props = f.properties;
    
    // We halen de schone data uit BAN
    const label = props.label;
    const postcode = props.postcode;
    const city = props.city;
    const street = props.street || props.name; // Belangrijk: de straatnaam
    const housenumber = props.housenumber;
    const [lon, lat] = f.geometry.coordinates;

    // ---------------------------------------------------------
    // STAP 2: ARCEP Zoekopdracht (Full Text Search)
    // ---------------------------------------------------------
    const baseUrl = "https://data.arcep.fr/api/explore/v2.1/catalog/datasets";
    
    // De magische 'q' parameter zoekt in alle tekstvelden. 
    // We zoeken op "Postcode + Straatnaam". Dit is heel tolerant.
    // Bijv: "62170 Rue de Sehen" of "75002 Rue de la Paix"
    const searchQuery = `${postcode} ${street}`;
    
    // We halen 100 resultaten op zodat we zeker de hele straat hebben
    const encodedQ = encodeURIComponent(searchQuery);
    
    // URL's bouwen met de 'q' parameter
    const fixedUrl = `${baseUrl}/maconnexioninternet/records?q=${encodedQ}&limit=100`;
    const mobileUrl = `${baseUrl}/monreseaumobile/records?q=${encodedQ}&limit=50`;

    // Parallel ophalen
    const [fixedRes, mobileRes] = await Promise.all([
        fetch(fixedUrl),
        fetch(mobileUrl)
    ]);

    let fixedData = { results: [] };
    let mobileData = { results: [] };

    if (fixedRes.ok) fixedData = await fixedRes.json();
    if (mobileRes.ok) mobileData = await mobileRes.json();

    // Als tekstzoeken faalt (0 resultaten), proberen we als laatste redmiddel 
    // toch een GPS radius (1000m), voor het geval de straatnaam in ARCEP heel anders geschreven is.
    if ((!fixedData.results || fixedData.results.length === 0) && lon && lat) {
        const geoQuery = encodeURIComponent(`within_distance(geopoint, geom'POINT(${lon} ${lat})', 1000m)`);
        const geoUrl = `${baseUrl}/maconnexioninternet/records?where=${geoQuery}&limit=100`;
        const geoRes = await fetch(geoUrl);
        if (geoRes.ok) {
            const geoData = await geoRes.json();
            if (geoData.results && geoData.results.length > 0) {
                fixedData = geoData; // Overschrijf met GPS resultaten
            }
        }
    }

    // ---------------------------------------------------------
    // STAP 3: Verwerking naar Huisnummerlijst
    // ---------------------------------------------------------
    const streetMap = new Map();

    if (fixedData.results) {
      fixedData.results.forEach(r => {
        // Nummer ophalen
        const num = r.numero || r.numero_voie;
        if (!num) return;

        const voie = r.nom_voie || street;
        const techno = (r.techno || '').toLowerCase();
        
        // Key is nummer. Als er meerdere entries zijn voor nummer 22 (verschillende technieken),
        // voegen we die samen.
        const key = `${num}`;

        if (!streetMap.has(key)) {
          streetMap.set(key, {
            number: num,
            street: voie,
            hasFibre: false,
            hasDsl: false
          });
        }

        const entry = streetMap.get(key);

        // Fibre check: We zoeken naar 'ftth' in de technologie kolom.
        // We zijn soepel: als het er staat, tellen we het als 'aanwezig in de straat'.
        if (techno.includes('ftth')) {
            entry.hasFibre = true;
        }
        if (techno.includes('adsl') || techno.includes('vdsl')) {
            entry.hasDsl = true;
        }
      });
    }

    // Sorteer de lijst numeriek (1, 2, 10 ipv 1, 10, 2)
    const neighbors = Array.from(streetMap.values()).sort((a, b) => {
        const nA = parseInt(a.number.replace(/\D/g, '')) || 0;
        const nB = parseInt(b.number.replace(/\D/g, '')) || 0;
        return nA - nB;
    });

    // ---------------------------------------------------------
    // STAP 4: Mobiel & Response
    // ---------------------------------------------------------
    let mobile = { orange: null, sfr: null, bouygues: null, free: null };
    if (mobileData.results) {
        mobileData.results.forEach(r => {
            const op = (r.nom_operateur || r.operateur || '').toLowerCase();
            if (!op) return;
            
            // Check dekking (sommige datasets gebruiken 1/0, andere tekst)
            const has4G = r.couverture_4g == 1 || r.couverture_4g === true;
            const has5G = r.couverture_5g == 1 || r.couverture_5g === true;

            let status = null;
            if (has5G) status = "5G/4G";
            else if (has4G) status = "4G";

            if (status) {
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
      search_query: searchQuery, // Handig om te zien waarop gezocht is
      total_found: neighbors.length,
      neighbors: neighbors,
      mobile: mobile
    });

  } catch (error) {
    console.error("Backend Error:", error);
    return res.status(500).json({ ok: false, error: "Server fout", details: error.message });
  }
}
