// BAN → INSEE → ARCEP fibre/dsl/mobile realtime

export default async function handler(req, res) {
  try {
    const address = req.query.address;
    if (!address) {
      return res.status(400).json({ ok: false, error: "Missing ?address=" });
    }

    // 1) BAN LOOKUP
    const banRes = await fetch(
      "https://api-adresse.data.gouv.fr/search/?q=" +
        encodeURIComponent(address) +
        "&limit=1"
    );
    const ban = await banRes.json();

    if (!ban.features || ban.features.length === 0) {
      return res.status(200).json({ ok: false, error: "BAN_NOT_FOUND" });
    }

    const f = ban.features[0];
    const insee = f.properties.citycode;
    const postcode = f.properties.postcode;
    const lon = f.geometry.coordinates[0];
    const lat = f.geometry.coordinates[1];

    // 2) ARCEP FIXED (fibre/dsl)
    const fibreUrl =
      `https://data.arcep.fr/api/explore/v2.1/catalog/datasets/maconnexioninternet/records` +
      `?where=code_insee=%27${insee}%27&limit=200`;

    const fibreRes = await fetch(fibreUrl);
    const fibreData = await fibreRes.json();

    let fibre = false;
    let fibreOperators = [];
    let dsl = false;

    if (fibreData?.results?.length) {
      fibreData.results.forEach((row) => {
        if (row.techno === "FttH" && row.elig === true) {
          fibre = true;
          if (row.operateur) fibreOperators.push(row.operateur);
        }

        if (
          (row.techno === "ADSL" || row.techno === "VDSL2") &&
          row.elig === true
        ) {
          dsl = true;
        }
      });
    }

    fibreOperators = [...new Set(fibreOperators)];

    // 3) ARCEP MOBILE
    const mobileUrl =
      `https://data.arcep.fr/api/explore/v2.1/catalog/datasets/monreseaumobile/records` +
      `?where=code_insee=%27${insee}%27&limit=200`;

    const mobileRes = await fetch(mobileUrl);
    const mobileData = await mobileRes.json();

    let mobile = { orange: null, sfr: null, bouygues: null, free: null };

    if (mobileData?.results?.length) {
      mobileData.results.forEach((row) => {
        const op = (row.operateur || "").toLowerCase();
        const cov = row.couverture_4g || row.couverture;

        if (mobile[op] !== undefined) {
          mobile[op] = cov || null;
        }
      });
    }

    // RESPONSE
    return res.status(200).json({
      ok: true,
      address: f.properties.label,
      lat,
      lon,
      insee,
      postcode,
      fibre,
      fibre_operators: fibreOperators,
      dsl,
      mobile
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
