// --- helpers ---
const $ = (q) => document.querySelector(q);
const byId = (id) => document.getElementById(id);

function parseList(str) {
  return str.split(",").map(s => s.trim()).filter(Boolean);
}
function sum(arr){return arr.reduce((a,b)=>a+b,0)}
function near1(x){ return Math.abs(x-1) < 1e-6 }

// Build composition input rows for a list of components
function buildFracBox(containerId, comps, prefix){
  const box = byId(containerId); box.innerHTML = "";
  comps.forEach(c=>{
    const row = document.createElement("div");
    row.className="row";
    row.innerHTML = `<label style="min-width:70px">${prefix}${c}</label>
                     <input type="number" step="any" id="${containerId}_${c}" placeholder="fraction de ${c}">`;
    box.appendChild(row);
  });
}

function buildValueBox(containerId, comps, prefix){
  const box = byId(containerId); box.innerHTML = "";
  comps.forEach(c=>{
    const row = document.createElement("div");
    row.className="row";
    row.innerHTML = `<label style="min-width:70px">${prefix}${c}</label>
                     <input type="number" step="any" id="${containerId}_${c}" placeholder="N_in de ${c} (mol/h)">`;
    box.appendChild(row);
  });
}

function readVector(containerId, comps){
  return comps.map(c => parseFloat(byId(`${containerId}_${c}`).value || "0"));
}
function formatStream(F, x, comps, title){
  const lines = comps.map((c,i)=>`<tr><td>${c}</td><td>${(x[i]||0).toFixed(6)}</td><td>${(F*(x[i]||0)).toFixed(6)}</td></tr>`).join("");
  return `<h3>${title}</h3>
          <p><b>Débit total F = ${F.toFixed(6)}</b></p>
          <table><thead><tr><th>Comp.</th><th>Fraction</th><th>Débit partiel</th></tr></thead>
          <tbody>${lines}</tbody></table>`;
}
function normalize(fracs){
  const s = sum(fracs);
  return s>0 ? fracs.map(v=>v/s) : fracs.slice();
}
function clamp01(x){return Math.max(0, Math.min(1, x));}

// UI: unit switching
const unitSel = byId("unit");
const panels = {
  "mixer": byId("panel-mixer"),
  "splitter": byId("panel-splitter"),
  "binary-sep": byId("panel-binary-sep"),
  "rxn-simple": byId("panel-rxn-simple")
};
unitSel.addEventListener("change", ()=>{
  Object.values(panels).forEach(p=>p.hidden=true);
  panels[unitSel.value].hidden=false;
});

// Components apply
function applyComponents(){
  const comps = parseList(byId("components").value);
  // mixer fracs
  buildFracBox("x1Box", comps, "w1_");
  buildFracBox("x2Box", comps, "w2_");
  // splitter feed fracs
  buildFracBox("xsBox", comps, "w_");
  // reaction: Nin and nu and key dropdown
  buildValueBox("NinBox", comps, "N_in_");
  const nuBox = byId("nuBox"); nuBox.innerHTML="";
  comps.forEach(c=>{
    const row = document.createElement("div"); row.className="row";
    row.innerHTML = `<label style="min-width:70px">ν_${c}</label>
                     <input type="number" step="any" id="nu_${c}" placeholder="négatif réactifs, positif produits">`;
    nuBox.appendChild(row);
  });
  // key comp dropdown
  const sel = byId("keyComp"); sel.innerHTML="";
  comps.forEach(c=>{
    const opt=document.createElement("option"); opt.value=c; opt.textContent=c; sel.appendChild(opt);
  });
  // atomics box (empty inputs until user toggles)
  byId("atomicsBox").innerHTML="";
}
byId("applyComponents").addEventListener("click", applyComponents);
applyComponents();

// ---- MIXER (2 -> 1): F = F1+F2 ; w_out = (F1*w1 + F2*w2)/F ----
byId("solveMixer").addEventListener("click", ()=>{
  const comps = parseList(byId("components").value);
  const F1 = parseFloat(byId("F1").value || "0");
  const F2 = parseFloat(byId("F2").value || "0");
  let x1 = readVector("x1Box", comps);
  let x2 = readVector("x2Box", comps);
  x1 = normalize(x1); x2 = normalize(x2);

  const F = F1 + F2;
  const numer = comps.map((_,i)=>F1*(x1[i]||0) + F2*(x2[i]||0));
  const x = F>0 ? numer.map(v=>v/F) : numer.map(()=>0);

  const out = formatStream(F, x, comps, "Produit (mélange)");
  byId("mixResult").innerHTML = out + checkFractions([x1,x2,x], ["Feed1","Feed2","Produit"]);
});

// ---- SPLITTER (1 -> 2): compositions identiques (cours) ----
function checkFractions(fracArrays, labels){
  let msg = "";
  fracArrays.forEach((arr,idx)=>{
    const s=sum(arr);
    if(!near1(s)) msg += `<p><b>⚠️ ${labels[idx]} :</b> les fractions ne somment pas à 1 (somme=${s.toFixed(6)}). Normalisées automatiquement.</p>`;
  });
  return msg;
}
byId("solveSplitter").addEventListener("click", ()=>{
  const comps = parseList(byId("components").value);
  const F = parseFloat(byId("Fs").value || "0");
  const phi = clamp01(parseFloat(byId("phi").value || "0"));
  let x = readVector("xsBox", comps); x = normalize(x);

  const F1 = phi*F, F2 = (1-phi)*F;
  const res = formatStream(F1, x, comps, "Courant 1") + formatStream(F2, x, comps, "Courant 2");
  byId("splitResult").innerHTML = `<p>Compositions identiques sur les branches (diviseur).</p>${res}`; // cours
});

// ---- BINARY SEPARATOR (global + A recovery) ----
byId("solveBinSep").addEventListener("click", ()=>{
  const F = parseFloat(byId("Ffeed").value || "0");
  const zA = clamp01(parseFloat(byId("zA").value || "0"));
  const RA = clamp01(parseFloat(byId("RA").value || "0"));
  const D  = byId("D").value ? parseFloat(byId("D").value) : null;
  const xD = byId("xD").value ? clamp01(parseFloat(byId("xD").value)) : null;

  if (D==null && xD==null){ byId("binSepResult").innerHTML = "<p>Donne soit D, soit xD_A.</p>"; return; }

  // Component A balance: F*zA = D*xD + B*xB; Recovery: D*xD = RA*F*zA
  const DxD = RA * F * zA;
  let Dcalc = D, xDcalc = xD;
  if (D==null) Dcalc = (zA>0 ? DxD / xD : 0);
  if (xD==null) xDcalc = (D>0 ? DxD / D : 0);
  const B = F - Dcalc;

  // Component B balance: F*(1-zA) = D*(1-xD) + B*(1-xB) -> solve xB
  const zB = 1 - zA;
  const xDB = 1 - xDcalc;
  const mB_in = F * zB;
  const mB_D  = Dcalc * xDB;
  const xB = B>0 ? (mB_in - mB_D) / B : 0;
  const xA_B = 1 - xB;

  const out = `
    <p><b>Résultats:</b></p>
    <p>D = ${Dcalc.toFixed(6)} ; B = ${B.toFixed(6)} ; xD_A = ${xDcalc.toFixed(6)} ; xB_A = ${xA_B.toFixed(6)}</p>
    <table><thead><tr><th>Courant</th><th>Débit</th><th>x_A</th><th>x_B</th></tr></thead>
    <tbody>
      <tr><td>Feed</td><td>${F.toFixed(6)}</td><td>${zA.toFixed(6)}</td><td>${(1-zA).toFixed(6)}</td></tr>
      <tr><td>Distillat D</td><td>${Dcalc.toFixed(6)}</td><td>${xDcalc.toFixed(6)}</td><td>${xDB.toFixed(6)}</td></tr>
      <tr><td>Résidu B</td><td>${B.toFixed(6)}</td><td>${xA_B.toFixed(6)}</td><td>${xB.toFixed(6)}</td></tr>
    </tbody></table>
  `;
  byId("binSepResult").innerHTML = out;
});

// ---- SIMPLE REACTION: N_out = N_in + nu * xi  ----
byId("solveRxn").addEventListener("click", ()=>{
  const comps = parseList(byId("components").value);
  const Nin = readVector("NinBox", comps);
  const nu  = comps.map(c => parseFloat(byId(`nu_${c}`).value || "0"));
  let xi = byId("xi").value ? parseFloat(byId("xi").value) : null;

  if (xi==null){
    const key = byId("keyComp").value;
    const Xc  = clamp01(parseFloat(byId("convKey").value || "0"));
    const k   = comps.indexOf(key);
    const nuK = nu[k];
    if (nuK >= 0){ byId("rxnResult").innerHTML = "<p>Choisis un réactif clé (ν&lt;0) pour la conversion.</p>"; return; }
    xi = Xc * Nin[k] / Math.abs(nuK);
  }

  const Nout = comps.map((_,i)=> Nin[i] + nu[i]*xi);
  if (Nout.some(v=>v< -1e-9)){ byId("rxnResult").innerHTML = "<p>⚠️ Produits négatifs — conversion/ξ trop grand(e) par rapport aux réactifs.</p>"; return; }

  let html = `<p><b>ξ = ${xi.toFixed(6)}</b></p>
              <table><thead><tr><th>Comp.</th><th>N_in</th><th>ν</th><th>N_out</th></tr></thead><tbody>`;
  comps.forEach((c,i)=>{ html += `<tr><td>${c}</td><td>${(Nin[i]||0).toFixed(6)}</td><td>${(nu[i]||0).toFixed(6)}</td><td>${(Nout[i]||0).toFixed(6)}</td></tr>`; })
  html += "</tbody></table>";

  // optional atomic check UI
  if (byId("atomCheck").checked){
    buildAtomicBox(comps);
    const atoms = readAtomMatrix(comps);
    const aIn = atomTotals(Nin, atoms);
    const aOut= atomTotals(Nout, atoms);
    const ok = aIn.every((v,i)=>Math.abs(v-aOut[i])<1e-6);
    html += `<p class="${ok?'ok':'bad'}">Bilan atomique ${ok?'OK ✅':'NON CONSERVÉ ❌'}</p>`;
  }

  byId("rxnResult").innerHTML = html;
});

function buildAtomicBox(comps){
  if (byId("atomicsBox").children.length) return;
  const box = byId("atomicsBox");
  box.innerHTML = `
    <h3>Éléments (optionnel)</h3>
    <div class="row">
      <input id="elements" type="text" placeholder="Ex: C,H,O">
      <button id="applyElements">Appliquer</button>
    </div>
    <div id="alphaTable"></div>
  `;
  byId("applyElements").onclick = ()=>{
    const elems = parseList(byId("elements").value);
    const tbl = byId("alphaTable");
    let html = `<table><thead><tr><th>Espèce \\ Élément</th>${elems.map(e=>`<th>${e}</th>`).join("")}</tr></thead><tbody>`;
    const comps = parseList(byId("components").value);
    comps.forEach(s=>{
      html += `<tr><td>${s}</td>${elems.map(e=>`<td><input type="number" step="any" id="alpha_${s}_${e}" placeholder="α_${e},${s}"></td>`).join("")}</tr>`;
    });
    html += `</tbody></table>`;
    tbl.innerHTML = html;
  };
}

function readAtomMatrix(comps){
  const elems = parseList(byId("elements").value);
  return {
    elems,
    alpha: comps.map(s=> elems.map(e=> parseFloat(byId(`alpha_${s}_${e}`)?.value || "0")))
  };
}
function atomTotals(N, A){
  // returns per-element totals: sum_j alpha(e,j)*N_j
  const {elems, alpha} = A;
  return elems.map((_,e)=> sum(alpha.map((row,j)=> row[e]*(N[j]||0))));
}
