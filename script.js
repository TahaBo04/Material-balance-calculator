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

  // Mixer n→1
  byId("mixFeedsBox").innerHTML = "";
  byId("mixCount").value = Math.max(2, parseInt(byId("mixCount").value||"2",10));

  // Splitter 1→n
  buildFracBox("xsBox", comps, "w_");
  byId("splitPhiBox").innerHTML = "";
  byId("splitCount").value = Math.max(2, parseInt(byId("splitCount").value||"2",10));

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

  buildAutoXiUI();
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

  const auto = byId("autoXi")?.checked;
  let xi = Array.from({length:R}, (_,k)=> byId(`xi_${k}`)?.value ? parseFloat(byId(`xi_${k}`).value) : NaN);

  if (auto && xi.some(v=>isNaN(v))){
    const spec = readAutoSpecs(R, comps);
    if (spec.length===R){
      const A = Array.from({length:R},()=>Array(R).fill(0));
      const b = Array(R).fill(0);
      let rIdx=0;
      for(const s of spec){
        if (s.type==="nout"){
          const j = s.j;
          for(let k=0;k<R;k++) A[rIdx][k] = NU[k][j];
          b[rIdx] = s.value - Nin[j];
          rIdx++;
        } else if (s.type==="conv"){
          const k = s.k;
          if (typeof s.nuKey!=="number" || s.nuKey>=0){ continue; }
          A[rIdx][k] = 1; b[rIdx] = s.value * s.NinKey / Math.abs(s.nuKey);
          rIdx++;
        }
      }
      const sol = solveLinear(A,b);
      if (sol.ok) xi = sol.x;
    }
  }

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

    byId("solveXiAuto").onclick = ()=> byId("solveRxnMulti").click();
  });

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
      const j = comps.indexOf(comp);
      const nuKey = parseFloat(byId(`nu_${ridx}_${comp}`)?.value || "0");
      const NinKey= parseFloat(byId(`NinMultiBox_${comp}`)?.value || "0");
      specs.push({type, k: ridx, value: clamp01(val), nuKey, NinKey});
    }
  }
  return specs;
}
function solveLinear(A,b){
  const n=A.length; if(!n) return {ok:false};
  const M = A.map((row,i)=> row.concat([b[i]]));
  const EPS=1e-12;
  let r=0;
  for(let c=0;c<n;c++){
    let piv=r;
    for(let i=r;i<n;i++) if(Math.abs(M[i][c])>Math.abs(M[piv][c])) piv=i;
    if (Math.abs(M[piv][c])<EPS) continue;
    if (piv!==r){ const t=M[piv]; M[piv]=M[r]; M[r]=t; }
    const pv = M[r][c]; for(let j=c;j<=n;j++) M[r][j]/=pv;
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

/* ===================== FLOWSHEET (blocks + curved links + solver) ===================== */
(() => {
  const flowsheetBox = byId("flowsheet");
  const wires = byId("fsWires");
  const toolboxItems = document.querySelectorAll("#toolbox .draggable");
  const btnConnect = byId("fsConnect");
  const btnRun     = byId("fsRun");
  const fsMsg      = byId("fsMsg");
  const fsResult   = byId("fsResult");

  if (!flowsheetBox || !wires) return;

  window.flowsheetUnits = window.flowsheetUnits || [];
  window.flowsheetLinks = window.flowsheetLinks || []; // {from,to,pathEl}

  /* ---- create blocks (desktop DnD + mobile tap) ---- */
  toolboxItems.forEach(item=>{
    item.addEventListener("dragstart", e=> e.dataTransfer.setData("unit-type", item.dataset.type));
  });
  flowsheetBox.addEventListener("dragover", e=> e.preventDefault());
  flowsheetBox.addEventListener("drop", e=>{
    e.preventDefault();
    const type = e.dataTransfer.getData("unit-type");
    if (type) placeUnitAt(type, e.offsetX, e.offsetY);
  });

  let pendingType = null;
  toolboxItems.forEach(item=>{
    const arm = ()=>{
      pendingType = item.dataset.type || null;
      toolboxItems.forEach(el=>el.classList.remove("active"));
      if (pendingType) item.classList.add("active");
    };
    item.addEventListener("click", arm);
    item.addEventListener("touchstart", arm, {passive:true});
  });
  const placeFrom = (clientX, clientY)=>{
    if (!pendingType) return;
    const r = flowsheetBox.getBoundingClientRect();
    placeUnitAt(pendingType, clientX - r.left, clientY - r.top);
    pendingType = null;
    toolboxItems.forEach(el=>el.classList.remove("active"));
  };
  flowsheetBox.addEventListener("click", e => placeFrom(e.clientX, e.clientY));
  flowsheetBox.addEventListener("touchend", e => {
    const t=e.changedTouches?.[0]; if (t) placeFrom(t.clientX,t.clientY);
  }, {passive:true});

  function placeUnitAt(type, x, y){
    const id = "u" + (flowsheetUnits.length + 1);
    const block = document.createElement("div");
    block.className = "unit-block"; block.dataset.uid = id;
    Object.assign(block.style, {position:"absolute", left:x+"px", top:y+"px", padding:"6px 10px", cursor:"grab"});
    block.innerHTML = `<b>${type}</b><br><small>${id}</small>`;
    block.addEventListener("click", ()=>{
      if (block._dragJustEnded) { block._dragJustEnded=false; return; }
      openPropPanel(id);
    });
    makeMoveable(block);
    flowsheetBox.appendChild(block);

    flowsheetUnits.push({ id, type, x, y, inputs:[], outputs:[], params:{} });
    redrawLinks();
  }

  function makeMoveable(el){
    let sx=0, sy=0, ox=0, oy=0, drag=false;
    const down = (e)=>{
      if (e.button!==undefined && e.button!==0) return;
      drag=true; el.style.cursor="grabbing";
      const r = el.getBoundingClientRect(), rc = flowsheetBox.getBoundingClientRect();
      ox = r.left-rc.left; oy = r.top-rc.top;
      sx = (e.touches?.[0]?.clientX ?? e.clientX);
      sy = (e.touches?.[0]?.clientY ?? e.clientY);
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
      window.addEventListener("touchmove", move, {passive:false});
      window.addEventListener("touchend", up);
      e.preventDefault?.();
    };
    const move = (e)=>{
      if (!drag) return;
      const x = (e.touches?.[0]?.clientX ?? e.clientX);
      const y = (e.touches?.[0]?.clientY ?? e.clientY);
      const rc = flowsheetBox.getBoundingClientRect();
      const nx = Math.max(0, Math.min(rc.width-el.offsetWidth,  ox + x - sx));
      const ny = Math.max(0, Math.min(rc.height - el.offsetHeight, oy + y - sy));
      el.style.left = nx + "px";
      el.style.top  = ny + "px";
      redrawLinks();
      e.preventDefault?.();
    };
    const up = ()=>{
      if (!drag) return;
      drag = false;
      el.style.cursor = "grab";
      el._dragJustEnded = true; setTimeout(()=>el._dragJustEnded=false, 50);

      const u = flowsheetUnits.find(x=>x.id===el.dataset.uid);
      if (u){
        u.x = parseFloat(el.style.left) || 0;
        u.y = parseFloat(el.style.top)  || 0;
      }
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up);
      redrawLinks();
    };
    el.addEventListener("mousedown", down);
    el.addEventListener("touchstart", down, {passive:false});
  }

  /* ---------- connect mode (source → target) ---------- */
  let connectMode = false, pendingSrc = null;
  btnConnect?.addEventListener("click", ()=>{
    connectMode = !connectMode;
    pendingSrc = null;
    btnConnect.classList.toggle("primary", connectMode);
    fsMsg.textContent = connectMode ? "Clique une source puis une cible…" : "";
  });

  flowsheetBox.addEventListener("click", (e)=>{
    if (!connectMode) return;
    const blk = e.target.closest(".unit-block"); if (!blk) return;
    const id = blk.dataset.uid;
    if (!pendingSrc){ pendingSrc = id; fsMsg.textContent = `Source: ${id} → choisis la cible…`; return; }
    if (pendingSrc === id){ pendingSrc = null; fsMsg.textContent = ""; return; }
    addLink(pendingSrc, id);
    pendingSrc = null;
    fsMsg.textContent = "Lien créé.";
  });

  /* ---------- wires: smooth quadratic Bézier ---------- */
  function addLink(from, to){
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill","none");
    path.setAttribute("stroke","#67e8f9");
    path.setAttribute("stroke-width","2.2");
    wires.appendChild(path);
    flowsheetLinks.push({from, to, pathEl: path});
    redrawLinks();
  }

  function centerOfBlock(id){
    const blk = [...flowsheetBox.querySelectorAll(".unit-block")].find(b=>b.dataset.uid===id);
    if (!blk) return {x:0,y:0};
    const r = blk.getBoundingClientRect();
    const rc = flowsheetBox.getBoundingClientRect();
    return { x: r.left - rc.left + r.width/2, y: r.top - rc.top + r.height/2 };
  }

  function redrawLinks(){
    const rc = flowsheetBox.getBoundingClientRect();
    wires.setAttribute("viewBox", `0 0 ${rc.width} ${rc.height}`);
    wires.setAttribute("width",  rc.width);
    wires.setAttribute("height", rc.height);

    flowsheetLinks.forEach(l=>{
      const a = centerOfBlock(l.from);
      const b = centerOfBlock(l.to);
      // control point offset (perp to AB) for a gentle curve
      const mx = (a.x + b.x)/2, my = (a.y + b.y)/2;
      const ox = 0.25*(b.y - a.y);
      const oy = -0.25*(b.x - a.x);
      const cx = mx + ox, cy = my + oy;
      l.pathEl.setAttribute("d", `M ${a.x},${a.y} Q ${cx},${cy} ${b.x},${b.y}`);
    });
  }
  new ResizeObserver(redrawLinks).observe(flowsheetBox);

  /* ---------- RUN: execute flowsheet ---------- */
  btnRun?.addEventListener("click", ()=>{
    const report = runFlowsheet();
    if (fsResult) fsResult.innerHTML = report.html || "";
    if (fsMsg)    fsMsg.textContent  = report.error ? ("❌ " + report.error) : "✅ Calcul terminé.";
  });

  function runFlowsheet(){
    const units = flowsheetUnits.map(u=>({...u}));
    const links = flowsheetLinks.slice();
    const comps = parseList(byId("components")?.value || "");
    const S = comps.length;

    // adjacency
    const inAdj = new Map(), outAdj = new Map();
    units.forEach(u=>{ inAdj.set(u.id, []); outAdj.set(u.id, []); });
    links.forEach(l=>{
      if (outAdj.has(l.from)) outAdj.get(l.from).push(l.to);
      if (inAdj.has(l.to))    inAdj.get(l.to).push(l.from);
    });

    // Kahn topological order
    const indeg = new Map(units.map(u=>[u.id, inAdj.get(u.id).length]));
    const q = units.filter(u=> indeg.get(u.id)===0).map(u=>u.id);
    const order = [];
    while(q.length){
      const v = q.shift(); order.push(v);
      (outAdj.get(v)||[]).forEach(w=>{
        indeg.set(w, indeg.get(w)-1);
        if (indeg.get(w)===0) q.push(w);
      });
    }
    if (order.length !== units.length){
      return {error:"Cycle détecté (le graphe doit être acyclique).", html:""};
    }

    // results map: id -> array of outlet streams
    const results = new Map();

    const inboundStreams = (uid)=>{
      const srcs = inAdj.get(uid)||[];
      return srcs.map(sid => (results.get(sid)||[])[0]).filter(Boolean);
    };

    // clear old badges
    flowsheetBox.querySelectorAll(".unit-badge").forEach(b=>b.remove());

    // execute units
    for (const uid of order){
      const u = units.find(x=>x.id===uid);
      let outs = [];

      if (u.type === "feed"){
        const F = +u.params?.F || 0;
        let x = (u.params?.x || Array(S).fill(0)).slice(0,S);
        x = normalize(x);
        outs = [{F, x, comps}];

      } else if (u.type === "mixer"){
        const ins = inboundStreams(uid);
        if (!ins.length){ outs=[{F:0, x:Array(S).fill(0), comps}]; }
        else{
          const F = sum(ins.map(s=>s.F));
          const numer = Array(S).fill(0);
          ins.forEach(s => comps.forEach((_,j)=> numer[j] += s.F*(s.x[j]||0)));
          const x = F>0 ? numer.map(v=>v/F) : numer.map(()=>0);
          outs = [{F, x, comps}];
        }

      } else if (u.type === "splitter"){
        const ins = inboundStreams(uid);
        const feed = ins[0] || {F:0, x:Array(S).fill(0), comps};
        const n = Math.max(2, parseInt(u.params?.nOut || 2, 10));
        let phi = (u.params?.phi || Array(n).fill(0)).slice(0,n);
        phi = normalize(phi);
        outs = phi.map(p => ({F: p*feed.F, x: feed.x.slice(), comps}));

      } else if (u.type === "binary-sep"){
        // assume comps[0] is A
        const ins = inboundStreams(uid);
        const f = ins[0] || {F:0, x:[1,0], comps};
        const F = f.F||0, zA = f.x[0]||0;
        const RA = clamp01(+u.params?.RA || 0);
        const DxD = RA * F * zA;

        let D, xD, B, xB;
        if (!isNaN(+u.params?.xB)){      xB = clamp01(+u.params.xB); B = (F*zA - DxD) / (xB || 1e-12); D = F - B; xD = D>0 ? DxD/D : 0; }
        else if (!isNaN(+u.params?.B)){  B = +u.params.B; D = F - B; xD = D>0 ? DxD/D : 0; xB = B>0 ? (F*zA - DxD)/B : 0; }
        else if (!isNaN(+u.params?.D)){  D = +u.params.D; B = F - D; xD = D>0 ? DxD/D : 0; xB = B>0 ? (F*zA - DxD)/B : 0; }
        else if (!isNaN(+u.params?.xD)){ xD = clamp01(+u.params.xD); D = (xD>0? DxD/xD : 0); B = F - D; xB = B>0 ? (F*zA - DxD)/B : 0; }
        else { D=0; B=F; xD=0; xB = (F>0? (F*zA - DxD)/B : 0); }

        const xDvec = [clamp01(xD), 1-clamp01(xD)];
        const xBvec = [clamp01(xB), 1-clamp01(xB)];
        outs = [
          {F:D, x:xDvec, comps}, // distillate
          {F:B, x:xBvec, comps}, // bottoms
        ];

      } else if (u.type === "rxn-simple"){
        const ins = inboundStreams(uid);
        const f = ins[0] || {F:0, x:Array(S).fill(0), comps};
        const Nin = f.x.map(xi => (f.F||0)*xi);
        const nu = (u.params?.nu || Array(S).fill(0)).slice(0,S);
        let xi = +u.params?.xi; if (isNaN(xi)) xi = 0;
        const Nout = comps.map((_,j)=> (Nin[j]||0) + (nu[j]||0)*xi);
        const Fout = sum(Nout);
        const xout = Fout>0 ? Nout.map(v=>v/Fout) : Array(S).fill(0);
        outs = [{F:Fout, x:xout, comps}];

      } else if (u.type === "rxn-multi"){
        const ins = inboundStreams(uid);
        const f = ins[0] || {F:0, x:Array(S).fill(0), comps};
        const Nin = f.x.map(xi => (f.F||0)*xi);
        const R = Math.max(1, parseInt(u.params?.R || "1", 10));
        const NU = u.params?.NU || Array.from({length:R}, ()=> Array(S).fill(0));
        const xi = (u.params?.xi || Array(R).fill(0)).slice(0,R);
        const add = comps.map((_,j)=> sum( xi.map((xk,k)=> (NU[k]?.[j]||0)*xk ) ));
        const Nout = comps.map((_,j)=> (Nin[j]||0) + add[j]);
        const Fout = sum(Nout);
        const xout = Fout>0 ? Nout.map(v=>v/Fout) : Array(S).fill(0);
        outs = [{F:Fout, x:xout, comps}];

      } else if (u.type === "sink"){
        outs = []; // terminal
      }

      results.set(uid, outs);

      // badge on block
      const blk = [...flowsheetBox.querySelectorAll(".unit-block")].find(b=>b.dataset.uid===uid);
      if (blk){
        blk.querySelector(".unit-badge")?.remove();
        const badge = document.createElement("div");
        badge.className = "unit-badge";
        const out0 = outs[0];
        badge.textContent = out0 ? `F=${(out0.F||0).toFixed(2)}` : "—";
        Object.assign(badge.style, {
          position:"absolute", right:"6px", bottom:"6px",
          fontSize:"11px", background:"#f1f5f9", color:"#0f172a",
          border:"1px solid #94a3b8", borderRadius:"6px", padding:"2px 6px"
        });
        blk.appendChild(badge);
      }
    }

    // sinks summary
    let html = `<h3>Résultats (Sinks)</h3>
      <table><thead><tr><th>Sink</th><th>F</th><th>Composition</th></tr></thead><tbody>`;
    units.filter(u=>u.type==="sink").forEach(u=>{
      const ins = inAdj.get(u.id)||[];
      const src = ins[0];
      const s = src ? (results.get(src)||[])[0] : null;
      const compTxt = s ? s.x.map((v,i)=> `${comps[i]}:${v.toFixed(3)}`).join(", ") : "";
      html += `<tr><td>${u.id}</td><td>${s? s.F.toFixed(3):"0.000"}</td><td>${compTxt}</td></tr>`;
    });
    html += `</tbody></table>`;

    return {html};
  }
})();
/* ====================== BLOCK-BY-BLOCK INPUT/OUTPUT POPUPS ====================== */
/* This module decorates every .unit-block with two small buttons:
   - Left (⚙️): open Inputs popup for that block only
   - Right (🧮): compute that block only & show Outputs popup
   It uses window.flowsheetUnits to read/store per-block parameters.
*/
(() => {
  /* ---------- Helpers (self-contained) ---------- */
  const byId = (id)=> document.getElementById(id);
  const $ = (q)=> document.querySelector(q);
  const $$ = (q)=> Array.from(document.querySelectorAll(q));
  const sum = (arr)=> arr.reduce((a,b)=>a+(+b||0),0);
  const clamp01 = (x)=> {
    const v = +x; return isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
  };
  const parseList = (str)=> (str||"").split(",").map(s=>s.trim()).filter(Boolean);
  const parseCSVfloats = (str)=> (str||'').split(',').map(s=>parseFloat(s.trim())).filter(v=>!isNaN(v));
  const padTo = (arr, len, fill=0)=> { const a = (arr||[]).slice(0,len); while(a.length<len) a.push(fill); return a; };
  const normalizeToLen = (arr, len)=> { const a = padTo(arr,len,0); const s=sum(a); return s>0? a.map(v=>v/s) : a; };
  const getComps = ()=> parseList(byId("components")?.value || "");
  const getUnit = (uid)=> (window.flowsheetUnits||[]).find(u=>u.id===uid);

  function ensurePanel(id, titleText){
    let panel = byId(id);
    if (!panel){
      panel = document.createElement('div');
      panel.id = id;
      panel.className = 'panel';
      panel.innerHTML = `
        <div class="panel-header">
          <span class="panel-title">${titleText||''}</span>
          <button class="panel-close" title="Fermer">✕</button>
        </div>
        <div class="panel-body"></div>
      `;
      document.body.appendChild(panel);
      panel.querySelector('.panel-close').onclick = ()=> panel.hidden = true;
    }
    panel.querySelector('.panel-title').textContent = titleText || '';
    return panel;
  }
  function setBlockTitle(el, u){
    let t = el.querySelector(".title");
    if (!t){
      t = document.createElement("div");
      t.className = "title";
      t.style.fontSize = "12px";
      t.style.opacity = "0.9";
      el.insertAdjacentElement("afterbegin", t);
    }
    t.innerHTML = `<b>${u.type}</b><br><small>${u.id}${u.name? " — "+u.name:""}</small>`;
  }
  function ensureBadge(el){
    let badge = el.querySelector(".unit-badge");
    if (!badge){
      badge = document.createElement("div");
      badge.className = "unit-badge";
      el.appendChild(badge);
    }
    return badge;
  }
  function renderBlockIO(uid, stream, comps){
    const blk = document.querySelector(`.unit-block[data-uid="${uid}"]`);
    if (!blk) return;
    let panel = blk.querySelector(".io");
    if (!panel){
      panel = document.createElement("div");
      panel.className = "io";
      Object.assign(panel.style, {
        marginTop:"4px", fontSize:"11px", background:"rgba(15,23,42,.35)",
        padding:"4px 6px", border:"1px solid rgba(148,163,184,.35)", borderRadius:"6px"
      });
      blk.appendChild(panel);
    }
    if (!stream){
      panel.innerHTML = `<em>Aucun calcul</em>`;
      return;
    }
    const compLine = (stream.x||[]).map((v,i)=> `${(comps[i]||"C"+(i+1))}:${(v||0).toFixed(3)}`).join(" · ");
    panel.innerHTML = `F=${(stream.F||0).toFixed(3)}<br>${compLine}`;
    const badge = ensureBadge(blk);
    badge.textContent = `F=${(stream.F||0).toFixed(2)}`;
  }

  /* ---------- Inputs popup (per block) ---------- */
  function openInputPanelFor(uid){
    const u = getUnit(uid); if (!u) return;
    const comps = getComps(); const S = comps.length;
    u.params = u.params || {};

    const panel = ensurePanel('blockInputPanel', `Entrées — ${u.type} (${u.id})`);
    const body  = panel.querySelector('.panel-body');

    // Generic stream fields for blocks that accept a single incoming stream
    const streamFields = `
      <div class="row"><label>F_in</label><input id="bi_Fin" type="number" step="any" value="${u.params.F_in??''}" placeholder="débit total"></div>
      <div class="row"><label>x_in (CSV)</label><input id="bi_xin" type="text" value="${u.params.x_in? u.params.x_in.join(','):''}" placeholder="ex: ${S?('0.'.padEnd(2,'0')):''}...,${S?('0.'.padEnd(2,'0')):''}"></div>
      <small>Astuce: colle ici le F et x du bloc amont que tu veux utiliser.</small>
    `;

    let html = `<div class="row"><label>Nom</label><input id="bi_name" value="${u.name||''}" placeholder="optionnel"></div>`;

    if (u.type === "feed"){
      html += `
        <div class="row"><label>F</label><input id="bi_F" type="number" step="any" value="${u.params.F??''}"></div>
        <div class="row"><label>x (CSV)</label><input id="bi_x" type="text" value="${u.params.x? u.params.x.join(','):''}" placeholder="ex: 0.4,0.6"></div>
        <small>Somme des fractions normalisée automatiquement.</small>
      `;
    }
    else if (u.type === "mixer"){
      const n = u.params.n || 2;
      html += `<div class="row"><label>Nombre de feeds n</label><input id="bi_nmix" type="number" min="2" step="1" value="${n}"></div>
               <div id="bi_mixerFeeds"></div>
               <small>Tu peux coller F et x de plusieurs blocs amont ici.</small>`;
    }
    else if (u.type === "splitter"){
      html += streamFields + `
        <div class="row"><label>φ (CSV)</label><input id="bi_phi" type="text" value="${u.params.phi? u.params.phi.join(','):''}" placeholder="ex: 0.3,0.7"></div>
        <small>Somme normalisée.</small>
      `;
    }
    else if (u.type === "binary-sep"){
      html += streamFields + `
        <div class="row"><label>Récupération R<sub>A</sub></label><input id="bi_RA" type="number" step="any" value="${u.params.RA??''}" placeholder="0–1"></div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <input id="bi_D"  type="number" step="any" placeholder="D (optionnel)" value="${u.params.D??''}">
          <input id="bi_xD" type="number" step="any" placeholder="xD_A (0–1)" value="${u.params.xD??''}">
          <input id="bi_B"  type="number" step="any" placeholder="B (optionnel)" value="${u.params.B??''}">
          <input id="bi_xB" type="number" step="any" placeholder="xB_A (0–1)" value="${u.params.xB??''}">
        </div>
        <small>Donne au plus UNE des 4 specs (D, xD_A, B, xB_A).</small>
      `;
    }
    else if (u.type === "rxn-simple"){
      html += `
        <div class="row"><label>N_in (CSV)</label><input id="bi_Nin" type="text" value="${u.params.Nin? u.params.Nin.join(','):''}" placeholder="ex: 2,1,0"></div>
        <small>Ou utilise F_in & x_in ci-dessous pour déduire N_in = F_in * x_in</small>
        ${streamFields}
        <div class="row"><label>ν (CSV)</label><input id="bi_nu" type="text" value="${u.params.nu? u.params.nu.join(','):''}" placeholder="ex: -1,1,0"></div>
        <div class="row"><label>ξ</label><input id="bi_xi" type="number" step="any" value="${u.params.xi??''}"></div>
      `;
    }
    else {
      html += `<small>Aucun paramètre spécifique pour ce type (ou à venir).</small>`;
    }

    html += `<div class="row" style="justify-content:flex-end"><button class="primary" id="bi_save">Enregistrer</button></div>`;
    body.innerHTML = html;

    // Build mixer feeds UI if needed
    if (u.type === "mixer"){
      const holder = byId("bi_mixerFeeds");
      const nInput = byId("bi_nmix");
      const renderFeeds = ()=>{
        const n = Math.max(2, parseInt(nInput.value||"2",10));
        u.params.mix = u.params.mix || Array.from({length:n}, ()=>({F:0,x:Array(S).fill(0)}));
        if (u.params.mix.length !== n) u.params.mix = Array.from({length:n}, ( _,i)=> u.params.mix[i] || {F:0,x:Array(S).fill(0)});
        let inner = "";
        for(let i=0;i<n;i++){
          inner += `
            <div class="row"><label>F_${i+1}</label><input id="bi_mF_${i}" type="number" step="any" value="${u.params.mix[i].F??''}"></div>
            <div class="row"><label>x_${i+1} (CSV)</label><input id="bi_mx_${i}" type="text" value="${u.params.mix[i].x? u.params.mix[i].x.join(','):''}" placeholder="ex: 0.5,0.5"></div>
            <hr style="border:0;border-top:1px solid #23314a;width:100%;opacity:.6;margin:6px 0">
          `;
        }
        holder.innerHTML = inner;
      };
      nInput.onchange = renderFeeds;
      renderFeeds();
    }

    panel.hidden = false;

    byId("bi_save").onclick = ()=>{
      u.name = byId("bi_name").value.trim();
      if (u.type === "feed"){
        u.params.F = parseFloat(byId("bi_F").value)||0;
        u.params.x = normalizeToLen(parseCSVfloats(byId("bi_x").value), S);
      }
      else if (u.type === "mixer"){
        u.params.n = Math.max(2, parseInt(byId("bi_nmix").value||"2",10));
        u.params.mix = u.params.mix || [];
        for(let i=0;i<u.params.n;i++){
          const F = parseFloat(byId(`bi_mF_${i}`).value)||0;
          let x = normalizeToLen(parseCSVfloats(byId(`bi_mx_${i}`).value), S);
          u.params.mix[i] = {F, x};
        }
      }
      else if (u.type === "splitter"){
        u.params.F_in = parseFloat(byId("bi_Fin").value)||0;
        u.params.x_in = normalizeToLen(parseCSVfloats(byId("bi_xin").value), S);
        let phi = parseCSVfloats(byId("bi_phi").value);
        const sphi = sum(phi); if (sphi>0) phi = phi.map(v=>v/sphi);
        u.params.phi = phi.length? phi : [1,0];
      }
      else if (u.type === "binary-sep"){
        u.params.F_in = parseFloat(byId("bi_Fin").value)||0;
        u.params.x_in = normalizeToLen(parseCSVfloats(byId("bi_xin").value), S);
        u.params.RA  = clamp01(parseFloat(byId("bi_RA").value)||0);
        ["D","xD","B","xB"].forEach(k=>{
          const v = byId("bi_"+k).value;
          u.params[k] = (v==="" ? undefined : parseFloat(v));
        });
      }
      else if (u.type === "rxn-simple"){
        let NinCSV = parseCSVfloats(byId("bi_Nin").value);
        if (NinCSV.length){ u.params.Nin = padTo(NinCSV, S); }
        u.params.F_in = parseFloat(byId("bi_Fin").value)||0;
        u.params.x_in = normalizeToLen(parseCSVfloats(byId("bi_xin").value), S);
        if (!u.params.Nin || !u.params.Nin.length){
          u.params.Nin = u.params.x_in.map(v=> v * u.params.F_in);
        }
        u.params.nu = padTo(parseCSVfloats(byId("bi_nu").value), S);
        u.params.xi = parseFloat(byId("bi_xi").value)||0;
      }

      // refresh block title
      const blk = document.querySelector(`.unit-block[data-uid="${u.id}"]`);
      if (blk) setBlockTitle(blk, u);

      panel.hidden = true;
    };
  }

  /* ---------- Compute only this block & show Outputs ---------- */
  function computeSingleBlock(u, comps){
    const S = comps.length;

    if (u.type === "feed"){
      const F = +u.params?.F || 0;
      let x = normalizeToLen(u.params?.x||[], S);
      return [{F, x, comps}];
    }
    if (u.type === "mixer"){
      const mix = u.params?.mix || [];
      const F = sum(mix.map(m=>m.F||0));
      const numer = Array(S).fill(0);
      mix.forEach(m=> comps.forEach((_,j)=> numer[j] += (m.F||0)*((m.x||[])[j]||0)));
      const x = F>0 ? numer.map(v=>v/F) : Array(S).fill(0);
      return [{F, x, comps}];
    }
    if (u.type === "splitter"){
      const F = +u.params?.F_in || 0;
      const x = normalizeToLen(u.params?.x_in||[], S);
      let phi = (u.params?.phi||[]).slice();
      const sphi = sum(phi); if (sphi>0) phi = phi.map(v=>v/sphi);
      return phi.map(p => ({F: p*F, x: x.slice(), comps}));
    }
    if (u.type === "binary-sep"){
      const F  = +u.params?.F_in || 0;
      const x  = normalizeToLen(u.params?.x_in||[], S);
      const zA = x[0]||0, RA = clamp01(+u.params?.RA||0);
      const DxD = RA * F * zA;
      let D, xD, B, xB;
      const D_in  = u.params?.D, B_in = u.params?.B, xD_in = u.params?.xD, xB_in = u.params?.xB;

      if (xB_in!==undefined){ xB=clamp01(+xB_in); const Ax_in_B = F*zA - DxD; B = Ax_in_B / (xB||1e-12); D = F - B; xD = D>0? DxD/D : 0; }
      else if (B_in!==undefined){ B=+B_in; D=F-B; xD=D>0? DxD/D : 0; xB=B>0? (F*zA - DxD)/B : 0; }
      else if (D_in!==undefined){ D=+D_in; B=F-D; xD=D>0? DxD/D : 0; xB=B>0? (F*zA - DxD)/B : 0; }
      else if (xD_in!==undefined){ xD=clamp01(+xD_in); D=(xD>0? DxD/xD : 0); B=F-D; xB=B>0? (F*zA - DxD)/B : 0; }
      else { D=0; B=F; xD=0; xB = B>0? (F*zA - DxD)/B : 0; }

      const xDvec = [clamp01(xD), 1-clamp01(xD)];
      const xBvec = [clamp01(xB), 1-clamp01(xB)];
      return [{F:D, x:xDvec, comps}, {F:B, x:xBvec, comps}];
    }
    if (u.type === "rxn-simple"){
      const Nin = padTo(u.params?.Nin||[], S).map(v=>+v||0);
      const nu  = padTo(u.params?.nu||[], S);
      const xi  = +u.params?.xi || 0;
      const Nout = comps.map((_,j)=> (Nin[j]||0) + (nu[j]||0)*xi);
      const Fout = sum(Nout);
      const xout = Fout>0 ? Nout.map(v=>v/Fout) : Array(S).fill(0);
      return [{F:Fout, x:xout, comps}];
    }
    return [];
  }

  function openOutputPanelFor(uid){
    const u = getUnit(uid); if (!u) return;
    const comps = getComps();
    const outs = computeSingleBlock(u, comps);

    const panel = ensurePanel('blockOutputPanel', `Sorties — ${u.type} (${u.id})`);
    const body  = panel.querySelector('.panel-body');

    if (!outs.length){ body.innerHTML = "<p>Aucune sortie calculée (vérifie les entrées).</p>"; panel.hidden=false; return; }

    // render in block too (first outlet)
    if (outs[0]) renderBlockIO(uid, outs[0], comps);

    let html = "";
    outs.forEach((s,idx)=>{
      const compLine = (s.x||[]).map((v,i)=> `${(comps[i]||('C'+(i+1)))}:${(v||0).toFixed(4)}`).join(" · ");
      html += `
        <div class="result">
          <b>Courant ${idx+1}</b><br>
          F = ${s.F.toFixed(6)}<br>
          ${compLine}
        </div>
      `;
    });
    html += `<small>Copie/colle F et x dans le bloc suivant (bouton Entrées à gauche).</small>`;
    body.innerHTML = html;
    panel.hidden = false;
  }

  /* ---------- Decorate blocks with left/right buttons (no changes to your flowsheet code) ---------- */
  function decorateBlock(blk){
    if (!blk || blk._decorated) return;
    const uid = blk.dataset.uid;
    // left button (Inputs)
    const left = document.createElement("button");
    left.className = "blk-btn blk-left";
    left.title = "Entrées";
    left.textContent = "⚙️";
    left.addEventListener("click", (ev)=>{ ev.stopPropagation(); openInputPanelFor(uid); });
    // right button (Outputs)
    const right = document.createElement("button");
    right.className = "blk-btn blk-right";
    right.title = "Calculer & Sorties";
    right.textContent = "🧮";
    right.addEventListener("click", (ev)=>{ ev.stopPropagation(); openOutputPanelFor(uid); });

    // title placeholder + io area if missing
    setBlockTitle(blk, getUnit(uid) || {id:uid, type:blk.textContent.trim(), name:""});
    let io = blk.querySelector(".io");
    if (!io){
      io = document.createElement("div");
      io.className = "io";
      Object.assign(io.style, {marginTop:"4px", fontSize:"11px", opacity:".9"});
      blk.appendChild(io);
    }

    blk.appendChild(left);
    blk.appendChild(right);
    blk._decorated = true;
  }

  // Decorate existing blocks
  $$("#flowsheet .unit-block").forEach(decorateBlock);

  // Observe new blocks being added to #flowsheet
  const fs = byId("flowsheet");
  if (fs){
    const mo = new MutationObserver((mutList)=>{
      for (const m of mutList){
        m.addedNodes.forEach(node=>{
          if (node.nodeType===1){
            if (node.classList?.contains("unit-block")) decorateBlock(node);
            // In case a container is added with blocks inside
            node.querySelectorAll?.(".unit-block")?.forEach(decorateBlock);
          }
        });
      }
    });
    mo.observe(fs, {childList:true, subtree:true});
  }

  // Expose for debugging
  window._fs_blockIO = { openInputPanelFor, openOutputPanelFor, computeSingleBlock };
})();
