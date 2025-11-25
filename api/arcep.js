export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const { address } = req.query;

  if (!address) {
    return res.status(400).json({ ok: false, error: "Geen adres." });
  }

  try {
    // 1. BAN
    const banRes = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(address)}&limit=1`);
    const banData = await banRes.json();

    if (!banData.features?.length) {
      return res.status(200).json({ ok: false, error: "Adres niet gevonden." });
    }

    const f = banData.features[0];
    const [lon, lat] = f.geometry.coordinates;
    const label = f.properties.label;

    // 2. ARCEP SCAN (500m radius)
    const baseUrl = "https://data.arcep.fr/api/explore/v2.1/catalog/datasets";
    const geoQuery = `within_distance(geopoint, geom'POINT(${lon} ${lat})', 500m)`;
    const url = `${baseUrl}/maconnexioninternet/records?where=${encodeURIComponent(geoQuery)}&limit=100`;
    
    const arcepRes = await fetch(url);
    const arcepData = await arcepRes.json();

    // 3. VERWERKING NAAR LIJST
    const streetMap = new Map();

    if (arcepData.results) {
      arcepData.results.forEach(r => {
        const num = r.numero || r.numero_voie;
        const voie = r.nom_voie || "Onbekende straat";
        const techno = (r.techno || '').toLowerCase();
        
        if (!num) return;

        const key = `${num} ${voie}`;

        if (!streetMap.has(key)) {
          streetMap.set(key, {
            number: num,
            street: voie,
            hasFibre: false,
            hasDsl: false
          });
        }

        const entry = streetMap.get(key);

        if (techno.includes('ftth') && (r.elig === true || r.elig === '1' || r.elig === 1)) {
          entry.hasFibre = true;
        }
        if (techno.includes('adsl') || techno.includes('vdsl')) {
          entry.hasDsl = true;
        }
      });
    }

    const neighbors = Array.from(streetMap.values()).sort((a, b) => {
        return parseInt(a.number) - parseInt(b.number);
    });

    // STUUR DE LIJST TERUG
    return res.status(200).json({
      ok: true,
      address_found: label,
      gps: { lat, lon },
      total_found: neighbors.length,
      neighbors: neighbors // <--- DIT MOET ER ZIJN
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: "Server fout", details: error.message });
  }
}
