<script>
let answers = { use:null, tv:null, vpn:null, location:null };
let providers = {};

// Load French provider dataset
fetch("providers_fr.json")
  .then(res => res.json())
  .then(data => providers = data);

// Navigation
function next(n){
  document.getElementById("screen"+n).classList.remove("active");
  document.getElementById("screen"+(n+1)).classList.add("active");

  if(n===1){
    answers.location = document.getElementById("q_location").value.trim();
  }
  if(n===4){
    buildResult();
  }
}

// Store internet usage
function selectUse(type){
  answers.use = type;
}

// Decision: Internet options
function decideInternet(){
  if(answers.use === "heavy"){
    return providers.internet.leo;                  // Starlink
  }
  if(answers.use === "stream"){
    return providers.internet["4g5g"].concat(
           providers.internet.leo
           );
  }
  return providers.internet.geo.concat(
         providers.internet["4g5g"]
         );
}

// Decision: TV
function decideTV(){
  return answers.tv === "ja" ? providers.tv.nl : [];
}

// Decision: VPN
function decideVPN(){
  return answers.vpn === "ja" ? providers.vpn : [];
}

// Proof-of-claim block
function proofBlocks(){
  return `
  <h3>Onderbouwing (onafhankelijke tests)</h3>
  <ul>
    <li>Glasvezel: meest stabiele technologie (Consumentenbond, Que Choisir).</li>
    <li>Starlink: laagste vertraging volgens EU/UK onderzoeken.</li>
    <li>GEO-satelliet: vooral geschikt voor basisgebruik (Que Choisir).</li>
    <li>4G/5G: prestaties afhankelijk van lokale zendmast (Consumentenbond).</li>
    <li>VPN: Surfshark/NordVPN internationaal best beoordeeld.</li>
  </ul>`;
}

// Render helper
function list(arr){
  if(!arr || arr.length === 0) return "Niet nodig";
  return arr.map(x => `• ${x.name || x}`).join("<br>");
}

// Final rendering
function buildResult(){
  let internet = decideInternet();
  let tv = decideTV();
  let vpn = decideVPN();
  let proof = proofBlocks();

  document.getElementById("result").innerHTML = `
    <h3>Internetadvies</h3>
    ${list(internet)}<br><br>

    <h3>TV Advies</h3>
    ${list(tv)}<br><br>

    <h3>VPN Advies</h3>
    ${list(vpn)}<br><br>

    ${proof}

    <h3>Stappenplan</h3>
    <pre>
1. Kies een aanbieder uit uw lijst.
2. Bestel via de officiële website.
3. Installeer modem of schotel.
4. Test internetbankieren / TV.
5. Klaar!
    </pre>
  `;
}
</script>
