// api/arcep.js
// Simpele BAN Proxy - Geen complexe ARCEP logica meer die kan falen.

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const { address } = req.query;

  if (!address) {
    return res.status(400).json({ ok: false, error: "Geen adres." });
  }

  try {
    // Alleen BAN bevragen voor coordinaten
    const banRes = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(address)}&limit=1`);
    const banData = await banRes.json();

    if (!banData.features?.length) {
      return res.status(200).json({ ok: false, error: "Adres niet gevonden." });
    }

    const f = banData.features[0];
    const label = f.properties.label;
    const [lon, lat] = f.geometry.coordinates;

    return res.status(200).json({
      ok: true,
      address_found: label,
      gps: { lat, lon }
    });

  } catch (error) {
    return res.status(500).json({ ok: false, error: "Server fout", details: error.message });
  }
}
