// api/arcep.js
// Nieuwe ARCEP-backend: BAN → INSEE → OpenDataSoft datasets (fibre, DSL, mobiel)

export default async function handler(req, res) {
  try {
    const address = req.query.address;
    if (!address) {
      return res.status(400).json({ error: "Missing ?address=" });
    }

    //
    // 1) BAN → coordinaten + INSEE-code
    //
    const banUrl =
      "https://api-adresse.data.gouv.fr/search/?q=" +
      encodeURIComponent(address) +
      "&limit=1";

    const banRes = await fetch(banUrl);
    const banData = await banRes.json();

    if (!banData.features || banData.features.length === 0) {
      return res.status(200).json({
        ok: false,
        reason: "Adres niet gevonden in BAN",
      });
    }

    const f = banData.features[0];
    const lon = f.geometry.coordinates[0];
    const lat = f.geometry.coordinates[1];
    const insee = f.properties.citycode; // INSEE-code
    const postcode = f.properties.postcode;

    //
    // 2) OpenDataSoft ARCEP: vaste verbindingen (fibre, ADSL, VDSL)
    //
    const fibreUrl =
      "https://data.arcep.fr/api/explore/v2.1/catalog/datasets/maconnexioninternet/records" +
      `?where=code_insee='${insee}'&limit=200`;

    const fibreRes = await fetch(fibreUrl);
    const fibreData = await fibreRes.json();

    let fibre = false;
    let fibreOperators = [];
    let dsl = false;

    if (fibreData?.results?.length > 0) {
      fibreData.results.forEach((row) => {
        // Fibre beschikbaar?
        if (row.techno === "FttH" && row.elig === true) {
          fibre = true;
          if (row.operateur) fibreOperators.push(row.operateur);
        }

        // DSL?
        if ((row.techno === "ADSL" || row.techno === "VDSL2") && row.elig) {
          dsl = true;
        }
      });
    }

    fibreOperators = [...new Set(fibreOperators)];

    //
    // 3) OpenDataSoft ARCEP: mobiele dekking
    //
    const mobileUrl =
      "https://data.arcep.fr/api/explore/v2.1/catalog/datasets/monreseaumobile/records" +
      `?where=code_insee='${insee}'&limit=200`;

    const mobileRes = await fetch(mobileUrl);
    const mobileData = await mobileRes.json();

    let mobile = {
      orange: null,
      sfr: null,
      bouygues: null,
      free: null,
    };

    if (mobileData?.results?.length > 0) {
      mobileData.results.forEach((row) => {
        const op = (row.operateur || "").toLowerCase();
        const cov = row.couverture_4g || row.couverture || null;

        if (mobile[op] !== undefined) {
          mobile[op] = cov;
        }
      });
    }

    //
    // 4) Antwoord aan front-end
    //
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
      mobile,
      raw: {
        ban: f,
        fixed: fibreData,
        mobile: mobileData,
      },
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: e.message,
    });
  }
}
