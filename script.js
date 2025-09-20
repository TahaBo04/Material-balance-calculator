/*****************  Helpers & utils  *****************/
const byId = (id)=> document.getElementById(id);
const $ = (q)=> document.querySelector(q);

function parseList(str){ return (str||"").split(",").map(s=>s.trim()).filter(Boolean); }
function sum(arr){ return arr.reduce((a,b)=>a+(+b||0),0); }
function clamp01(x){ const v = +x; return isFinite(v)? Math.max(0, Math.min(1, v)) : 0; }
function near1(x){ return Math.abs(x-1) < 1e-6; }
function normalize(fracs){ const s = sum(fracs); return s>0 ? fracs.map(v=>(+v||0)/s) : fracs.map(()=>0); }

/************ Build small UI fragments (dynamic) ************/
function buildFracBox(containerId, comps, prefix){
  const box = byId(containerId); box.innerHTML = "";
  comps.forEach(c=>{
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <label style="min-width:70px">${prefix}${c}</label>
      <input type="number" step="any" id="${containerId}_${c}" placeholder="fraction de ${c}">
    `;
    box.appendChild(row);
  });
}
function buildValueBox(containerId, comps, prefix, placeholder="N_in (mol/h)"){
  const box = byId(containerId); box.innerHTML = "";
  comps.forEach(c=>{
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <label style="min-width:70px">${prefix}${c}</label>
      <input type="number" step="any" id="${containerId}_${c}" placeholder="${placeholder} de ${c}">
    `;
    box.appendChild(row);
  });
}
function readVector(containerId, comps){
  return comps.map(c => parseFloat(byId(`${containerId}_${c}`)?.value || "0"));
}
function formatStream(F, x, comps, title){
  const lines = comps.map((c,i)=>`<tr><td>${c}</td><td>${(x[i]||0).toFixed(6)}</td><td>${(F*(x[i]||0)).toFixed(6)}</td></tr>`).join("");
  return `<h3>${title}</h3>
          <p><b>Débit total F = ${(+F||0).toFixed(6)}</b></p>
          <table><thead><tr><th>Comp.</th><th>Fraction</th><th>Débit partiel</th></tr></thead>
          <tbody>${lines}</tbody></table>`;
}

/***************** Panel switching *****************/
(function initPanels(){
  const unitSel = byId("unit");
  if (!unitSel) return;
  const panels = {
    "mixer": byId("panel-mixer"),
    "splitter": byId("panel-splitter"),
    "binary-sep": byId("panel-binary-sep"),
    "rxn-simple": byId("panel-rxn-simple"),
    "rxn-multi": byId("panel-rxn-multi"),
    "flowsheet": byId("panel-flowsheet"),
  };
  unitSel.addEventListener("change", ()=>{
    Object.values(panels).forEach(p=>p && (p.hidden=true));
    const p = panels[unitSel.value]; if (p) p.hidden=false;
  });
})();

/***************** Components “Apply” *****************/
function applyComponents(){
  const comps = parseList(byId("components").value);

  // Mixer n→1: initially build for n=2
  byId("mixFeedsBox").innerHTML = ""; // will be built by button
  byId("mixCount").value = Math.max(2, parseInt(byId("mixCount").value||"2",10));

  // Splitter 1→n
  buildFracBox("xsBox", comps, "w_");
  byId("splitPhiBox").innerHTML = "";
  byId("splitCount").value = Math.max(2, parseInt(byId("splitCount").value||"2",10));

  // Binary sep — nothing extra here

  // Simple reaction
  buildValueBox("NinBox", comps, "N_in_");
  const nuBox = byId("nuBox"); nuBox.innerHTML="";
  comps.forEach(c=>{
    const row = document.createElement("div");
    row.className="row";
    row.innerHTML = `<label style="min-width:70px">ν_${c}</label>
                     <input type="number" step="any" id="nu_${c}" placeholder="négatif réactifs, positif produits">`;
    nuBox.appendChild(row);
  });
  // dropdowns
  const keySel = byId("keyComp"); keySel.innerHTML="";
  const specSel= byId("specComp"); specSel.innerHTML="";
  comps.forEach(c=>{
    const o1=document.createElement("option");o1.value=c;o1.textContent=c;keySel.appendChild(o1);
    const o2=document.createElement("option");o2.value=c;o2.textContent=c;specSel.appendChild(o2);
  });
  byId("atomicsBox").innerHTML="";

  // Multi-reaction
  buildValueBox("NinMultiBox", comps, "N_in_");
  byId("nuMultiBox").innerHTML = "<small>Choisis R et clique «Construire la matrice ν».</small>";
  byId("xiBox").innerHTML = "";
  byId("autoXiBox").innerHTML = "";
}
byId("applyComponents")?.addEventListener("click", applyComponents);
applyComponents();

/***************** Mixer n → 1 *****************/
byId("buildMixerFeeds")?.addEventListener("click", ()=>{
  const comps = parseList(byId("components").value);
  const n = Math.max(2, parseInt(byId("mixCount").value || "2", 10));
  const box = byId("mixFeedsBox");
  let html = "";
  for(let i=1;i<=n;i++){
    html += `<div class="card subtle"><h3>Feed ${i}</h3>
      <label>Débit F${i}</label><input id="F${i}" type="number" step="any" placeholder="kg/h ou mol/h">
      <div id="x${i}Box"></div></div>`;
  }
  box.innerHTML = html;
  for(let i=1;i<=n;i++) buildFracBox(`x${i}Box`, comps, `w${i}_`);
});

byId("solveMixer")?.addEventListener("click", ()=>{
  const comps = parseList(byId("components").value);
  const n = Math.max(2, parseInt(byId("mixCount").value || "2", 10));
  let F = 0;
  const numer = Array(comps.length).fill(0);
  let warn = "";

  for(let i=1;i<=n;i++){
    const Fi = parseFloat(byId(`F${i}`)?.value || "0");
    let xi = readVector(`x${i}Box`, comps);
    const s = sum(xi);
    if (!near1(s)) warn += `<p>⚠️ Feed ${i}: fractions normalisées (somme=${s.toFixed(6)}).</p>`;
    xi = normalize(xi);
    F += Fi;
    comps.forEach((_,j)=> numer[j] += Fi*(xi[j]||0));
  }
  const x = F>0 ? numer.map(v=>v/F) : numer.map(()=>0);
  byId("mixResult").innerHTML = warn + formatStream(F, x, comps, "Produit (mélange)");
});

/***************** Splitter 1 → n *****************/
byId("buildSplitterOuts")?.addEventListener("click", ()=>{
  const n = Math.max(2, parseInt(byId("splitCount").value || "2", 10));
  const box = byId("splitPhiBox");
  let html = "<div class='row' style='flex-wrap:wrap;gap:8px'>";
  for(let i=1;i<=n;i++){
    html += `<div><label>φ_${i}</label><input id="phi_${i}" type="number" step="any" placeholder="0–1"></div>`;
  }
  html += "</div>";
  box.innerHTML = html;
});

byId("solveSplitter")?.addEventListener("click", ()=>{
  const comps = parseList(byId("components").value);
  const F = parseFloat(byId("Fs").value || "0");
  let x = readVector("xsBox", comps); x = normalize(x);
  const n = Math.max(2, parseInt(byId("splitCount").value || "2", 10));
  let phi = [];
  for(let i=1;i<=n;i++) phi.push(parseFloat(byId(`phi_${i}`)?.value || "0"));
  const sphi = sum(phi);
  let msg = "";
  if (!near1(sphi)){ msg = `<p>⚠️ φ normalisées (somme=${sphi.toFixed(6)}).</p>`; phi = normalize(phi); }
  let html = msg;
  for(let i=1;i<=n;i++){
    const Fi = phi[i-1]*F;
    html += formatStream(Fi, x, comps, `Courant ${i}`);
  }
  byId("splitResult").innerHTML = html;
});

/***************** Binary separator *****************/
byId("solveBinSep")?.addEventListener("click", ()=>{
  const F  = parseFloat(byId("Ffeed").value || "0");
  const zA = clamp01(parseFloat(byId("zA").value || "0"));
  const RA = clamp01(parseFloat(byId("RA").value || "0"));

  const D_in  = parseFloat(byId("D").value);
  const xD_in = clamp01(parseFloat(byId("xD").value));
  const B_in  = parseFloat(byId("B").value);
  const xB_in = clamp01(parseFloat(byId("xB").value));

  if (!(F>0) || isNaN(zA) || isNaN(RA)){
    byId("binSepResult").innerHTML = "<p>Donne F, z<sub>A</sub> et R<sub>A</sub> valides.</p>"; return;
  }

  const DxD = RA * F * zA;
  const given = [!isNaN(D_in), !isNaN(xD_in), !isNaN(B_in), !isNaN(xB_in)].filter(Boolean).length;
  if (given===0){ byId("binSepResult").innerHTML = "<p>Donne UNE des quatre valeurs : D, xD_A, B ou xB_A.</p>"; return; }

  let D, xD, B, xB;
  if (!isNaN(xB_in)){
    xB = clamp01(xB_in);
    const Ax_in_bottoms = F*zA - DxD;
    if (Math.abs(xB)<1e-12){ byId("binSepResult").innerHTML="<p>xB_A = 0 → indéterminé.</p>"; return;}
    B = Ax_in_bottoms / xB; D = F - B; xD = D>0 ? DxD/D : 0;
  } else if (!isNaN(B_in)){
    B = B_in; D = F - B; if (!(D>0)){ byId("binSepResult").innerHTML="<p>D≤0 : B trop grand.</p>"; return; }
    xD = DxD / D; const Ax_in_bottoms = F*zA - DxD; xB = B>0 ? Ax_in_bottoms/B : 0;
  } else if (!isNaN(D_in)){
    D = D_in; B = F - D; if (!(B>=0)){ byId("binSepResult").innerHTML="<p>B<0 : D trop grand.</p>"; return; }
    xD = D>0 ? DxD/D : 0; const Ax_in_bottoms = F*zA - DxD; xB = B>0 ? Ax_in_bottoms/B : 0;
  } else if (!isNaN(xD_in)){
    xD = clamp01(xD_in); if (Math.abs(xD)<1e-12){ byId("binSepResult").innerHTML="<p>xD_A = 0 → indéterminé.</p>"; return; }
    D = DxD/xD; B = F - D; const Ax_in_bottoms = F*zA - DxD; xB = B>0 ? Ax_in_bottoms/B : 0;
  }

  const ok = (D>=0 && B>=0 && Math.abs(D+B-F)<1e-8 && xD>=-1e-12 && xD<=1+1e-12 && xB>=-1e-12 && xB<=1+1e-12);
  if (!ok){ byId("binSepResult").innerHTML = "<p>Spécifications incompatibles.</p>"; return; }

  const xDB = 1 - clamp01(xD);
  const xA_B = clamp01(xB);
  const xB_B = 1 - xA_B;

  const out = `
    <p><b>Résultats:</b></p>
    <p>D = ${D.toFixed(6)} ; B = ${B.toFixed(6)} ; xD_A = ${clamp01(xD).toFixed(6)} ; xB_A = ${xA_B.toFixed(6)}</p>
    <table><thead><tr><th>Courant</th><th>Débit</th><th>x_A</th><th>x_B</th></tr></thead>
    <tbody>
      <tr><td>Feed</td><td>${F.toFixed(6)}</td><td>${zA.toFixed(6)}</td><td>${(1-zA).toFixed(6)}</td></tr>
      <tr><td>Distillat D</td><td>${D.toFixed(6)}</td><td>${clamp01(xD).toFixed(6)}</td><td>${xDB.toFixed(6)}</td></tr>
      <tr><td>Résidu B</td><td>${B.toFixed(6)}</td><td>${xA_B.toFixed(6)}</td><td>${xB_B.toFixed(6)}</td></tr>
    </tbody></table>
  `;
  byId("binSepResult").innerHTML = out;
});

/***************** Simple reaction *****************/
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
  return { elems, alpha: comps.map(s=> elems.map(e=> parseFloat(byId(`alpha_${s}_${e}`)?.value || "0"))) };
}
function atomTotals(N, A){
  const {elems, alpha} = A;
  return elems.map((_,e)=> sum(alpha.map((row,j)=> row[e]*(N[j]||0))));
}

byId("solveRxn")?.addEventListener("click", ()=>{
  const comps = parseList(byId("components").value);
  const Nin = readVector("NinBox", comps);
  const nu  = comps.map(c => parseFloat(byId(`nu_${c}`).value || "0"));
  let xi = byId("xi").value ? parseFloat(byId("xi").value) : null;

  if (xi==null && byId("convKey").value){
    const key = byId("keyComp").value;
    const Xc  = clamp01(parseFloat(byId("convKey").value || "0"));
    const k   = comps.indexOf(key);
    const nuK = nu[k];
    if (nuK >= 0){ byId("rxnResult").innerHTML = "<p>Choisis un réactif clé (ν&lt;0) pour la conversion.</p>"; return; }
    xi = Xc * Nin[k] / Math.abs(nuK);
  }
  if (xi==null && byId("specNout").value){
    const cSpec = byId("specComp").value;
    const j = comps.indexOf(cSpec);
    const NoutSpec = parseFloat(byId("specNout").value || "0");
    const denom = nu[j];
    if (Math.abs(denom)<1e-12){ byId("rxnResult").innerHTML="<p>ν du composant spécifié est 0 → impossible de déduire ξ.</p>"; return; }
    xi = (NoutSpec - Nin[j]) / denom;
  }
  if (xi==null){ byId("rxnResult").innerHTML = "<p>Donne ξ, ou une conversion, ou un N_out pour un composant.</p>"; return; }

  const Nout = comps.map((_,i)=> Nin[i] + nu[i]*xi);
  if (Nout.some(v=>v< -1e-9)){ byId("rxnResult").innerHTML = "<p>⚠️ Débits négatifs — ξ trop grand.</p>"; return; }

  let html = `<p><b>ξ = ${xi.toFixed(6)}</b></p>
              <table><thead><tr><th>Comp.</th><th>N_in</th><th>ν</th><th>N_out</th></tr></thead><tbody>`;
  comps.forEach((c,i)=>{ html += `<tr><td>${c}</td><td>${(Nin[i]||0).toFixed(6)}</td><td>${(nu[i]||0).toFixed(6)}</td><td>${(Nout[i]||0).toFixed(6)}</td></tr>`; });
  html += "</tbody></table>";

  if (byId("atomCheck")?.checked){
    buildAtomicBox(comps);
    const atoms = readAtomMatrix(comps);
    const aIn = atomTotals(Nin, atoms);
    const aOut= atomTotals(Nout, atoms);
    const ok = aIn.every((v,i)=>Math.abs(v-aOut[i])<1e-6);
    html += `<p class="${ok?'ok':'bad'}">Bilan atomique ${ok?'OK ✅':'NON CONSERVÉ ❌'}</p>`;
  }
  byId("rxnResult").innerHTML = html;
});

/***************** Multi-reaction *****************/
// Build ν & ξ inputs
byId("buildNu")?.addEventListener("click", ()=>{
  const comps = parseList(byId("components").value);
  const R = Math.max(1, parseInt(byId("Rcount").value || "1", 10));

  const nuDiv = byId("nuMultiBox");
  let html = `<table><thead><tr><th>ν (k\\j)</th>${comps.map(c=>`<th>${c}</th>`).join("")}</tr></thead><tbody>`;
  for(let k=0;k<R;k++){
    html += `<tr><td>r${k+1}</td>${comps.map(c=>
      `<td><input type="number" step="any" id="nu_${k}_${c}" placeholder="ν_${k+1},${c}"></td>`
    ).join("")}</tr>`;
  }
  html += `</tbody></table>`;
  nuDiv.innerHTML = html;

  const xiDiv = byId("xiBox");
  let xiHtml = `<div class="row" style="flex-wrap:wrap;gap:8px">`;
  for(let k=0;k<R;k++){
    xiHtml += `<div><label>ξ_${k+1}</label><input type="number" step="any" id="xi_${k}" placeholder="extent ${k+1}"></div>`;
  }
  xiHtml += `</div>`;
  xiDiv.innerHTML = xiHtml;

  // (re)build auto-ξ UI when checkbox toggles
  buildAutoXiUI(); // first build if checkbox already on
});

function matrixRank(A){
  const m=A.length; if(m===0) return {rank:0,pivots:[]};
  const n=A[0].length;
  const M=A.map(r=>r.slice());
  let rank=0,row=0,col=0,pivots=[];
  const EPS=1e-12;
  while(row<m && col<n){
    let sel=row;
    for(let i=row;i<m;i++) if(Math.abs(M[i][col])>Math.abs(M[sel][col])) sel=i;
    if(Math.abs(M[sel][col])<EPS){ col++; continue; }
    if(sel!==row){ const t=M[sel]; M[sel]=M[row]; M[row]=t; }
    const piv=M[row][col];
    for(let j=col;j<n;j++) M[row][j]/=piv;
    for(let i=0;i<m;i++){
      if(i===row) continue;
      const f=M[i][col];
      if(Math.abs(f)>EPS) for(let j=col;j<n;j++) M[i][j]-=f*M[row][j];
    }
    pivots.push({row,col}); rank++; row++; col++;
  }
  return {rank,pivots};
}

byId("solveRxnMulti")?.addEventListener("click", ()=>{
  const comps = parseList(byId("components").value);
  const S = comps.length;
  const Nin = readVector("NinMultiBox", comps);
  const R = Math.max(1, parseInt(byId("Rcount").value || "1", 10));
  const NU = Array.from({length:R}, (_,k)=> comps.map(c => parseFloat(byId(`nu_${k}_${c}`)?.value || "0")));
  const {rank, pivots} = matrixRank(NU);
  const independent = (rank===R);

  let msg = `<p><b>Rang(ν) = ${rank}</b> sur ${R} réactions. ${independent? "Indépendantes ✅" : "Dépendantes ❌"}</p>`;
  if(!independent){
    msg += `<p>Choisis un sous-ensemble de ${rank} réactions linéairement indépendantes (pivots ~ lignes ${pivots.map(p=>p.row+1).join(", ")}).</p>`;
    byId("rxnMultiResult").innerHTML = msg; return;
  }

  // try auto-ξ if requested and no ξ provided
  const auto = byId("autoXi")?.checked;
  let xi = Array.from({length:R}, (_,k)=> byId(`xi_${k}`)?.value ? parseFloat(byId(`xi_${k}`).value) : NaN);

  if (auto && xi.some(v=>isNaN(v))){
    const spec = readAutoSpecs(R, comps);
    if (spec.length===R){
      // Solve A xi = b (R equations)
      // Build equations: each spec row gives linear combo of xi
      // Types: "nout" => Nout_j = Nin_j + Σ_k ν_kj ξ_k
      //        "conv" => Xc = ξ * |ν_k,reactif| / Nin_reactif  -> ξ_k = Xc*Nin/|ν|
      // We'll convert each spec to a row in A and b
      const A = Array.from({length:R},()=>Array(R).fill(0));
      const b = Array(R).fill(0);
      let rIdx=0;
      for(const s of spec){
        if (s.type==="nout"){
          const j = s.j;
          // Nin_j + sum_k nu[k][j]*xi_k = s.value  -> sum_k nu[k][j]*xi_k = s.value - Nin_j
          for(let k=0;k<R;k++) A[rIdx][k] = NU[k][j];
          b[rIdx] = s.value - Nin[j];
          rIdx++;
        } else if (s.type==="conv"){
          const k = s.k; // reaction index for which conversion given on its key reactant
          if (typeof s.nuKey!=="number" || s.nuKey>=0){ continue; }
          // ξ_k = Xc * Nin_key / |ν_key|
          A[rIdx][k] = 1; b[rIdx] = s.value * s.NinKey / Math.abs(s.nuKey);
          rIdx++;
        }
      }
      // Solve A xi = b by Gauss elimination
      const sol = solveLinear(A,b);
      if (sol.ok) xi = sol.x;
    }
  }

  // If still NaN, treat missing as 0
  xi = xi.map(v=> isNaN(v)?0:v);

  const Nout = comps.map((_,j)=>{
    let add = 0; for(let k=0;k<R;k++) add += NU[k][j]*xi[k];
    return Nin[j] + add;
  });

  if (Nout.some(v=>v< -1e-9)){
    byId("rxnMultiResult").innerHTML = msg + `<p>⚠️ Débits négatifs → extents trop grands vs réactifs (vérifie ν et ξ).</p>`;
    return;
  }

  const Ntot = sum(Nout);
  const xout = (Ntot>0) ? Nout.map(v=>v/Ntot) : Nout.map(()=>0);

  let html = msg + `<table><thead><tr><th>Comp.</th><th>N_in</th><th>N_out</th><th>x_out</th></tr></thead><tbody>`;
  comps.forEach((c,i)=>{
    html += `<tr><td>${c}</td><td>${(Nin[i]||0).toFixed(6)}</td><td>${(Nout[i]||0).toFixed(6)}</td><td>${(xout[i]||0).toFixed(6)}</td></tr>`;
  });
  html += `</tbody></table><p><b>N<sub>tot,out</sub> = ${Ntot.toFixed(6)}</b></p>`;
  byId("rxnMultiResult").innerHTML = html;
});

// Auto-ξ UI and reading
function buildAutoXiUI(){
  const autoEl = byId("autoXi");
  const box = byId("autoXiBox");
  if (!autoEl || !box) return;

  autoEl.addEventListener("change", ()=>{
    box.innerHTML = "";
    if (!autoEl.checked) return;
    const comps = parseList(byId("components").value);
    const R = Math.max(1, parseInt(byId("Rcount").value || "1", 10));
    let html = `<p>Donne exactement <b>${R}</b> spécification(s).</p>`;
    for(let i=0;i<R;i++){
      html += `
        <div class="row" style="flex-wrap:wrap;gap:8px">
          <select id="specType_${i}">
            <option value="nout">N_out connu</option>
            <option value="conv">Conversion (pour une réaction)</option>
          </select>
          <select id="specComp_${i}">${comps.map(c=>`<option>${c}</option>`).join("")}</select>
          <input id="specVal_${i}" type="number" step="any" placeholder="valeur">
          <input id="specRidx_${i}" type="number" step="1" min="1" value="${i+1}" title="index réaction (pour conversion)">
        </div>
      `;
    }
    html += `<button class="primary mt" id="solveXiAuto">Résoudre ξ d'après mes specs</button>`;
    box.innerHTML = html;

    byId("solveXiAuto").onclick = ()=>{
      // trigger main solve (it will read specs)
      byId("solveRxnMulti").click();
    };
  });

  // if already checked when ν gets rebuilt
  if (autoEl.checked) autoEl.dispatchEvent(new Event("change"));
}
function readAutoSpecs(R, comps){
  const specs = [];
  for(let i=0;i<R;i++){
    const type = byId(`specType_${i}`)?.value;
    const comp = byId(`specComp_${i}`)?.value;
    const val  = parseFloat(byId(`specVal_${i}`)?.value || "NaN");
    const ridx = Math.max(1, parseInt(byId(`specRidx_${i}`)?.value || "1", 10)) - 1;
    if (!type || !comp || isNaN(val)) continue;
    if (type==="nout"){
      const j = comps.indexOf(comp);
      if (j>=0) specs.push({type, j, value: val});
    } else if (type==="conv"){
      // conversion for reaction ridx; need key reactant in that reaction (use comp as key species)
      const j = comps.indexOf(comp);
      const nuKey = parseFloat(byId(`nu_${ridx}_${comp}`)?.value || "0");
      const NinKey= parseFloat(byId(`NinMultiBox_${comp}`)?.value || "0");
      specs.push({type, k: ridx, value: clamp01(val), nuKey, NinKey});
    }
  }
  return specs;
}
function solveLinear(A,b){
  // simple Gauss-Jordan for square system
  const n=A.length; if(!n) return {ok:false};
  // build augmented matrix
  const M = A.map((row,i)=> row.concat([b[i]]));
  const EPS=1e-12;
  let r=0;
  for(let c=0;c<n;c++){
    // pivot
    let piv=r;
    for(let i=r;i<n;i++) if(Math.abs(M[i][c])>Math.abs(M[piv][c])) piv=i;
    if (Math.abs(M[piv][c])<EPS) continue;
    if (piv!==r){ const t=M[piv]; M[piv]=M[r]; M[r]=t; }
    // normalize
    const pv = M[r][c]; for(let j=c;j<=n;j++) M[r][j]/=pv;
    // eliminate
    for(let i=0;i<n;i++){
      if(i===r) continue;
      const f=M[i][c]; if(Math.abs(f)<EPS) continue;
      for(let j=c;j<=n;j++) M[i][j]-=f*M[r][j];
    }
    r++;
  }
  if (r<n) return {ok:false};
  const x = M.map(row=>row[n]);
  return {ok:true, x};
}

/***************** FLOWSHEET BUILDER (basic) *****************/
// global store for flowsheet units
window.flowsheetUnits = window.flowsheetUnits || [];

const flowsheetBox = byId("flowsheet");
const toolboxItems = document.querySelectorAll("#toolbox .draggable");

// drag sources
toolboxItems.forEach(it=>{
  it.addEventListener("dragstart", e=>{
    e.dataTransfer.setData("unit-type", it.dataset.type);
  });
});
flowsheetBox?.addEventListener("dragover", e=> e.preventDefault());
flowsheetBox?.addEventListener("drop", e=>{
  e.preventDefault();
  const type = e.dataTransfer.getData("unit-type");
  if(!type) return;
  const id = "u"+(flowsheetUnits.length+1);
  const block = document.createElement("div");
  block.className="unit-block";
  block.style.position="absolute";
  block.style.left = e.offsetX+"px";
  block.style.top  = e.offsetY+"px";
  block.style.border="1px solid #333";
  block.style.padding="6px 10px";
  block.style.background="#eee";
  block.style.cursor="pointer";
  block.dataset.uid=id;
  block.innerHTML = `<b>${type}</b><br><small>${id}</small>`;
  block.addEventListener("click", ()=> openPropPanel(id));
  flowsheetBox.appendChild(block);

  flowsheetUnits.push({id,type,x:e.offsetX,y:e.offsetY,inputs:[],outputs:[],params:{}});
  console.log("Flowsheet units:", flowsheetUnits);
});

/* ===== Mobile-friendly flowsheet fallback: tap-to-place ===== */

// helper to create a block at (x,y)
function placeUnitAt(type, x, y){
  if (!flowsheetBox) return;
  const id = "u"+(flowsheetUnits.length+1);

  const block = document.createElement("div");
  block.className = "unit-block";
  block.dataset.uid = id;
  Object.assign(block.style, {
    position: "absolute",
    left: x + "px",
    top:  y + "px",
    border: "1px solid #333",
    padding: "6px 10px",
    background: "#eee",
    cursor: "pointer"
  });
  block.innerHTML = `<b>${type}</b><br><small>${id}</small>`;
  block.addEventListener("click", ()=> openPropPanel(id));
  flowsheetBox.appendChild(block);

  flowsheetUnits.push({ id, type, x, y, inputs:[], outputs:[], params:{} });
  console.log("Flowsheet units:", flowsheetUnits);
}

// use same drop handler on desktop but call our helper
if (flowsheetBox){
  flowsheetBox.addEventListener("drop", (e)=>{
    e.preventDefault();
    const type = e.dataTransfer.getData("unit-type");
    if (!type) return;
    placeUnitAt(type, e.offsetX, e.offsetY);
  });
}

// ---- Mobile/touch fallback: tap toolbox, then tap canvas ----
let pendingType = null;

const toolboxItems = document.querySelectorAll("#toolbox .draggable");

// arm by click (desktop) or touchstart (mobile)
toolboxItems.forEach(item=>{
  // desktop click
  item.addEventListener("click", ()=>{
    pendingType = item.dataset.type || null;
    toolboxItems.forEach(el=>el.classList.remove("active"));
    if (pendingType) item.classList.add("active");
  });
  // mobile touch
  item.addEventListener("touchstart", ()=>{
    pendingType = item.dataset.type || null;
    toolboxItems.forEach(el=>el.classList.remove("active"));
    if (pendingType) item.classList.add("active");
  }, {passive:true});
});

// place on canvas click/touch
if (flowsheetBox){
  flowsheetBox.addEventListener("click", (e)=>{
    if (!pendingType) return;
    const r = flowsheetBox.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    placeUnitAt(pendingType, x, y);
    pendingType = null;
    toolboxItems.forEach(el=>el.classList.remove("active"));
  });

  flowsheetBox.addEventListener("touchend", (e)=>{
    if (!pendingType) return;
    const t = e.changedTouches[0];
    const r = flowsheetBox.getBoundingClientRect();
    const x = t.clientX - r.left;
    const y = t.clientY - r.top;
    placeUnitAt(pendingType, x, y);
    pendingType = null;
    toolboxItems.forEach(el=>el.classList.remove("active"));
  }, {passive:true});
}

/************* Draggable properties panel plumbing *************/
const propPanel   = byId("propPanel");
const propHeader  = byId("propPanelHeader");
const propTitle   = byId("propTitle");
const propContent = byId("propContent");
const propClose   = byId("propClose");

function makeDraggable(panelEl, handleEl){
  if (!panelEl || !handleEl) return;
  let sx=0, sy=0, ox=0, oy=0, drag=false;
  function down(e){
    drag = true;
    const r = panelEl.getBoundingClientRect();
    ox = r.left; oy = r.top;
    sx = (e.touches?.[0]?.clientX ?? e.clientX);
    sy = (e.touches?.[0]?.clientY ?? e.clientY);
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
    document.addEventListener("touchmove", move, {passive:false});
    document.addEventListener("touchend", up);
  }
  function move(e){
    if(!drag) return;
    const x = (e.touches?.[0]?.clientX ?? e.clientX);
    const y = (e.touches?.[0]?.clientY ?? e.clientY);
    panelEl.style.left = Math.max(0, ox + x - sx) + "px";
    panelEl.style.top  = Math.max(0, oy + y - sy) + "px";
    e.preventDefault?.();
  }
  function up(){
    drag=false;
    document.removeEventListener("mousemove", move);
    document.removeEventListener("mouseup", up);
    document.removeEventListener("touchmove", move);
    document.removeEventListener("touchend", up);
  }
  handleEl.addEventListener("mousedown", down);
  handleEl.addEventListener("touchstart", down, {passive:false});
}
if (propPanel && propHeader) makeDraggable(propPanel, propHeader);
propClose?.addEventListener("click", ()=> propPanel.hidden = true);

// getUnit + openPropPanel already defined at top and used here
