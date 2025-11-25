// api/arcep.js
// Zorg ervoor dat je 'node-fetch' hebt geïnstalleerd als dev dependency
import fetch from 'node-fetch';

// De Vercel handler function
export default async (req, res) => {
  // Standaard headers instellen
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');

  const { address } = req.query;

  if (!address) {
    return res.status(400).json({ ok: false, error: 'Missing address query parameter.' });
  }

  let coordinates;

  // STAP 1: ADRES NAAR COÖRDINATEN (BAN API)
  try {
    const banUrl = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(address)}&limit=1`;
    const banRes = await fetch(banUrl);
    
    if (!banRes.ok) {
        // Externe API gaf een foutstatus terug
        return res.status(502).json({ 
            ok: false, 
            error: `BAN lookup failed with status: ${banRes.status}.` 
        });
    }

    const banData = await banRes.json();

    if (!banData.features || banData.features.length === 0) {
      return res.status(200).json({ ok: false, error: 'Address not found by BAN API.' });
    }

    coordinates = banData.features[0].geometry.coordinates;
  } catch (e) {
    // Dit vangt de "Unexpected token <" als de BAN API faalt
    return res.status(500).json({ 
      ok: false, 
      error: `Error tijdens adres lookup. Externe API gaf geen JSON. Fout: ${e.message}` 
    });
  }

  // STAP 2: COÖRDINATEN NAAR ARCEP DATA (OpenDataSoft)
  const [lon, lat] = coordinates;
  // Let op: 'geom' gebruikt (lat, lon) in de query. We zoeken binnen 1000m.
  const arcepUrl = `https://couverture-mobile-arcep.opendatasoft.com/api/explore/v2.1/catalog/datasets/couverture_mobile_4g_3g_2g_communes_et_adresses/records?where=within_distance(geopoint%2C%20geom%28${lat}%2C%20${lon}%29%2C%20'1000m')&limit=1`;
  
  try {
    const arcepRes = await fetch(arcepUrl);
    
    if (!arcepRes.ok) {
        // Externe API gaf een foutstatus terug
        return res.status(502).json({ 
            ok: false, 
            error: `ARCEP data fetch failed with status: ${arcepRes.status}.` 
        });
    }

    // Dit is de plek waar het misging: de .json() call
    const arcepData = await arcepRes.json(); 

    if (!arcepData.results || arcepData.results.length === 0) {
        return res.status(200).json({ ok: false, error: 'No ARCEP data found nearby.' });
    }

    const record = arcepData.results[0];

    // STAP 3: RESULTAAT FORMEREN
    return res.status(200).json({
      ok: true,
      address,
      latitude: lat,
      longitude: lon,
      // Veldnamen aannemen uit OpenDataSoft API
      fibre: record.fibre_eligibilite === 'Oui', 
      dsl: record.dsl_eligibilite === 'Oui',     
      mobile: {
        orange: record.couverture_4g_orange,
        sfr: record.couverture_4g_sfr,
        bouygues: record.couverture_4g_bouygues_telecom,
        free: record.couverture_4g_free_mobile,
      }
    });

  } catch (e) {
    // Dit vangt de "Unexpected token <" die je eerder zag
    return res.status(500).json({ 
      ok: false, 
      error: `Interne ARCEP fetch fout: ${e.message}. Heeft de externe API HTML teruggestuurd?` 
    });
  }
};
