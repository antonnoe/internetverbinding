// api/arcep.js
// Vercel Function – Backend voor ARCEP + BAN integratie

export default async function handler(req, res) {
  try {
    const address = req.query.address;
    if (!address) {
      return res.status(400).json({ error: "Missing ?address=" });
    }

    // 1) Adres → BAN API → coördinaten
    const banUrl =
      "https://api-adresse.data.gouv.fr/search/?q=" +
      encodeURIComponent(address);

    const banRes = await fetch(banUrl);
    const banData = await banRes.json();

    if (!banData.features || banData.features.length === 0) {
      return res.status(200).json({
        ok: false,
        reason: "BAN: adres niet gevonden",
        fibre: null,
        dsl: null,
        mobile: null,
        raw: {}
      });
    }

    const feature = banData.features[0];
    const lon = feature.geometry.coordinates[0];
    const lat = feature.geometry.coordinates[1];

    // 2) lat/lon → ARCEP vaste netwerken (fibre, DSL)
    const fixedUrl =
      "https://maconnexioninternet.arcep.fr/api/eligibility/" +
      lat +
      "/" +
      lon;

    const fixedRes = await fetch(fixedUrl);
    let fixedData = null;

    if (fixedRes.ok) {
      fixedData = await fixedRes.json();
    }

    // Parsing bewijs (vast internet)
    let fibre = false;
    let fibreOperators = [];
    let dsl = false;

    if (fixedData && fixedData.eligibility) {
      fixedData.eligibility.forEach((tech) => {
        if (tech.technology === "FttH" && tech.eligibility === "1") {
          fibre = true;
          if (tech.operator) fibreOperators.push(tech.operator);
        }
        if (tech.technology === "ADSL" && tech.eligibility === "1") {
          dsl = true;
        }
      });
    }

    // 3) lat/lon → ARCEP mobiele dekking
    const mobileUrl =
      "https://monreseaumobile.arcep.fr/api/device/coverage?lat=" +
      lat +
      "&lon=" +
      lon;

    const mobileRes = await fetch(mobileUrl);
    let mobileData = null;

    if (mobileRes.ok) {
      mobileData = await mobileRes.json();
    }

    // Parsing mobiele dekking
    let mobile = {
      orange: null,
      sfr: null,
      bouygues: null,
      free: null
    };

    if (mobileData && mobileData.coverages) {
      mobileData.coverages.forEach((c) => {
        if (c.operator && c.type === "4G") {
          const op = c.operator.toLowerCase();
          if (mobile[op] !== undefined) {
            mobile[op] = c.coverage_level || "unknown";
          }
        }
      });
    }

    // Uniek maken fiber operators
    fibreOperators = [...new Set(fibreOperators)];

    // 4) Final output naar front-end
    return res.status(200).json({
      ok: true,
      lat,
      lon,
      fibre,
      fibre_operators: fibreOperators,
      dsl,
      mobile,
      raw: {
        ban: feature,
        fixed: fixedData,
        mobile: mobileData
      }
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message,
      ok: false
    });
  }
}
