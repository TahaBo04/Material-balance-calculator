// --- helpers ---
const $ = (q) => document.querySelector(q);
const byId = (id) => document.getElementById(id);

function parseList(str){ return str.split(",").map(s=>s.trim()).filter(Boolean); }
function sum(arr){ return arr.reduce((a,b)=>a+b,0); }
function near1(x){ return Math.abs(x-1) < 1e-6; }
function clamp01(x){ return Math.max(0, Math.min(1, x)); }

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
  const s = sum(fracs); return s>0 ? fracs.map(v=>v/s) : fracs.slice();
}

// Rank via RREF
function matrixRank(A){
  const m = A.length; if (m===0) return {rank:0, pivots:[]};
  const n = A[0].length;
  const M = A.map(r=>r.slice());
  let rank=0, row=0, col=0; const pivots=[]; const EPS=1e-12;
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

// Small linear solver (normal equations if not square)
function solveLinear(A,b){
  const m=A.length, n=A[0].length;
  let M=A.map((row,i)=>row.concat([b[i]]));
  if(m!==n){
    const AT = Array.from({length:n},(_,j)=>Array.from({length:m},(_,i)=>A[i][j]));
    const ATA = Array.from({length:n},()=>Array(n).fill(0));
    const ATb = Array(n).fill(0);
    for(let i=0;i<n;i++){
      for(let j=0;j<n;j++) for(let k=0;k<m;k++) ATA[i][j]+=AT[i][k]*A[k][j];
      for(let k=0;k<m;k++) ATb[i]+=AT[i][k]*b[k];
    }
    M = ATA.map((row,i)=>row.concat([ATb[i]]));
  }
  const N=M.length, P=M[0].length;
  for(let col=0,row=0; col<P-1 && row<N; col++){
    let sel=row; for(let r=row;r<N;r++) if(Math.abs(M[r][col])>Math.abs(M[sel][col])) sel=r;
    if(Math.abs(M[sel][col])<1e-12) continue;
    [M[row],M[sel]]=[M[sel],M[row]];
    const piv=M[row][col]; for(let j=col;j<P;j++) M[row][j]/=piv;
    for(let r=0;r<N;r++){ if(r===row) continue;
      const f=M[r][col]; if(Math.abs(f)>1e-12) for(let j=col;j>P-1?j>=col:j>=col;j--) M[r][j]-=f*M[row][j];
      for(let j=col;j<P;j++) if(Math.abs(f)>1e-12) M[r][j]-=f*M[row][j];
    }
    row++;
  }
  return M.slice(0,Math.min(N,P-1)).map(r=>r[P-1]);
}

// UI switching
const unitSel = byId("unit");
const panels = {
  "mixer": byId("panel-mixer"),
  "splitter": byId("panel-splitter"),
  "binary-sep": byId("panel-binary-sep"),
  "rxn-simple": byId("panel-rxn-simple"),
  "rxn-multi": byId("panel-rxn-multi")
};
unitSel.addEventListener("change", ()=>{
  Object.values(panels).forEach(p=>p.hidden=true);
  panels[unitSel.value].hidden=false;
});

// Build inputs when components change
function applyComponents(){
  const comps = parseList(byId("components").value);

  // Multi-reaction
  buildValueBox("NinMultiBox", comps, "N_in_");
  byId("nuMultiBox").innerHTML = "<small>Choisis R et clique «Construire la matrice ν».</small>";
  byId("xiBox").innerHTML = "";
  byId("autoXiBox").innerHTML = ""; const auto = byId("autoXi"); if(auto) auto.checked=false;

  // Mixer + Splitter
  buildFracBox("x1Box", comps, "w1_");
  buildFracBox("x2Box", comps, "w2_");
  buildFracBox("xsBox", comps, "w_");

  // Simple reaction
  buildValueBox("NinBox", comps, "N_in_");
  const nuBox = byId("nuBox"); nuBox.innerHTML="";
  comps.forEach(c=>{
    const row=document.createElement("div"); row.className="row";
    row.innerHTML = `<label style="min-width:70px">ν_${c}</label>
                     <input type="number" step="any" id="nu_${c}" placeholder="négatif réactifs, positif produits">`;
    nuBox.appendChild(row);
  });
  // dropdowns
  const selKey = byId("keyComp"); if(selKey) selKey.innerHTML="";
  const selSpec = byId("specComp"); if(selSpec) selSpec.innerHTML="";
  comps.forEach(c=>{
    if(selKey){ const o=document.createElement("option"); o.value=c; o.textContent=c; selKey.appendChild(o); }
    if(selSpec){ const o2=document.createElement("option"); o2.value=c; o2.textContent=c; selSpec.appendChild(o2); }
  });
  byId("atomicsBox").innerHTML="";
}
byId("applyComponents").addEventListener("click", applyComponents);
applyComponents();

// Build ν-matrix + ξ inputs for multi-reaction
byId("buildNu").addEventListener("click", ()=>{
  const comps = parseList(byId("components").value);
  const R = Math.max(1, parseInt(byId("Rcount").value || "1", 10));

  // ν table
  const nuDiv = byId("nuMultiBox");
  let html = `<table><thead><tr><th>ν (k\\j)</th>${comps.map(c=>`<th>${c}</th>`).join("")}</tr></thead><tbody>`;
  for(let k=0;k<R;k++){
    html += `<tr><td>r${k+1}</td>${comps.map(c=>`<td><input type="number" step="any" id="nu_${k}_${c}" placeholder="ν_${k+1},${c}"></td>`).join("")}</tr>`;
  }
  html += `</tbody></table>`;
  nuDiv.innerHTML = html;

  // ξ inputs
  const xiDiv = byId("xiBox");
  let xiHtml = `<div class="row" style="flex-wrap:wrap;gap:8px">`;
  for(let k=0;k<R;k++) xiHtml += `<div><label>ξ_${k+1}</label><input type="number" step="any" id="xi_${k}" placeholder="extent ${k+1}"></div>`;
  xiHtml += `</div>`;
  xiDiv.innerHTML = xiHtml;
});

// Mixer
byId("solveMixer").addEventListener("click", ()=>{
  const comps = parseList(byId("components").value);
  const F1 = parseFloat(byId("F1").value || "0");
  const F2 = parseFloat(byId("F2").value || "0");
  let x1 = readVector("x1Box", comps); let x2 = readVector("x2Box", comps);
  x1 = normalize(x1); x2 = normalize(x2);
  const F = F1 + F2;
  const numer = comps.map((_,i)=>F1*(x1[i]||0) + F2*(x2[i]||0));
  const x = F>0 ? numer.map(v=>v/F) : numer.map(()=>0);
  const out = formatStream(F, x, comps, "Produit (mélange)");
  byId("mixResult").innerHTML = out + checkFractions([x1,x2,x], ["Feed1","Feed2","Produit"]);
});

// Splitter
function checkFractions(fracArrays, labels){
  let msg=""; fracArrays.forEach((arr,idx)=>{ const s=sum(arr); if(!near1(s)) msg+=`<p><b>⚠️ ${labels[idx]} :</b> somme=${s.toFixed(6)}. Normalisées automatiquement.</p>`; });
  return msg;
}
byId("solveSplitter").addEventListener("click", ()=>{
  const comps = parseList(byId("components").value);
  const F = parseFloat(byId("Fs").value || "0");
  const phi = clamp01(parseFloat(byId("phi").value || "0"));
  let x = readVector("xsBox", comps); x = normalize(x);
  const F1 = phi*F, F2 = (1-phi)*F;
  const res = formatStream(F1, x, comps, "Courant 1") + formatStream(F2, x, comps, "Courant 2");
  byId("splitResult").innerHTML = `<p>Compositions identiques sur les branches (diviseur).</p>${res}`;
});

// Binary separator
byId("solveBinSep").addEventListener("click", ()=>{
  const F = parseFloat(byId("Ffeed").value || "0");
  const zA = clamp01(parseFloat(byId("zA").value || "0"));
  const RA = clamp01(parseFloat(byId("RA").value || "0"));
  const D  = byId("D").value ? parseFloat(byId("D").value) : null;
  const xD = byId("xD").value ? clamp01(parseFloat(byId("xD").value)) : null;
  if (D==null && xD==null){ byId("binSepResult").innerHTML="<p>Donne soit D, soit xD_A.</p>"; return; }
  const DxD = RA * F * zA;
  let Dcalc = D, xDcalc = xD;
  if (D==null) Dcalc = (zA>0 ? DxD / xD : 0);
  if (xD==null) xDcalc = (D>0 ? DxD / D : 0);
  const B = F - Dcalc;
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
    </tbody></table>`;
  byId("binSepResult").innerHTML = out;
});

// Simple reaction with auto-ξ
byId("solveRxn").addEventListener("click", ()=>{
  const comps = parseList(byId("components").value);
  const Nin = readVector("NinBox", comps);
  const nu  = comps.map(c => parseFloat(byId(`nu_${c}`).value || "0"));

  let xi = byId("xi").value ? parseFloat(byId("xi").value) : null;
  if (xi==null){
    const key = byId("keyComp").value;
    const Xc  = byId("convKey").value ? clamp01(parseFloat(byId("convKey").value)) : null;
    const k   = comps.indexOf(key);
    if (Xc!=null && !Number.isNaN(Xc)){
      const nuK = nu[k];
      if (nuK >= 0){ byId("rxnResult").innerHTML = "<p>Choisis un réactif clé (ν&lt;0) pour la conversion.</p>"; return; }
      xi = Xc * Nin[k] / Math.abs(nuK);
    }
  }
  if (xi==null){
    const jname = byId("specComp").value;
    const j = comps.indexOf(jname);
    const Nout_j_given = byId("specNout").value ? parseFloat(byId("specNout").value) : null;
    if (j>=0 && Nout_j_given!=null && !Number.isNaN(Nout_j_given)){
      const nuj = nu[j];
      if (Math.abs(nuj) < 1e-12){ byId("rxnResult").innerHTML = "<p>Le composant choisi a ν=0 → ne permet pas de calculer ξ.</p>"; return; }
      xi = (Nout_j_given - Nin[j]) / nuj;
    }
  }
  if (xi==null){ byId("rxnResult").innerHTML = "<p>Donne ξ, ou une conversion, ou bien un N_out pour un composant.</p>"; return; }

  const Nout = comps.map((_,i)=> Nin[i] + nu[i]*xi);
  if (Nout.some(v=>v< -1e-9)){ byId("rxnResult").innerHTML = "<p>⚠️ Débits négatifs — ξ trop grand(e).</p>"; return; }

  let html = `<p><b>ξ = ${xi.toFixed(6)}</b></p>
              <table><thead><tr><th>Comp.</th><th>N_in</th><th>ν</th><th>N_out</th></tr></thead><tbody>`;
  comps.forEach((c,i)=> html += `<tr><td>${c}</td><td>${(Nin[i]||0).toFixed(6)}</td><td>${(nu[i]||0).toFixed(6)}</td><td>${(Nout[i]||0).toFixed(6)}</td></tr>`);
  html += "</tbody></table>";

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

// Multi-reaction: auto-ξ UI
byId("autoXi").addEventListener("change", ()=>{
  const box = byId("autoXiBox");
  box.innerHTML = "";
  if(!byId("autoXi").checked) return;

  const comps = parseList(byId("components").value);
  const R = Math.max(1, parseInt(byId("Rcount").value || "1", 10));

  let html = `<p>Donne exactement <b>${R}</b> spécifications (N_out d'espèces OU conversion X de réactifs).</p>`;
  for(let i=0;i<R;i++){
    html += `
      <div class="row" style="flex-wrap:wrap;gap:8px">
        <select id="specType_${i}">
          <option value="nout">N_out connu</option>
          <option value="conv">Conversion réactif X</option>
        </select>
        <select id="specComp_${i}">${comps.map(c=>`<option value="${c}">${c}</option>`).join("")}</select>
        <input id="specVal_${i}" type="number" step="any" placeholder="valeur">
      </div>`;
  }
  html += `<button class="primary mt" id="solveXiAuto">Résoudre ξ à partir des spécifications</button>`;
  box.innerHTML = html;

  byId("solveXiAuto").onclick = ()=>{
    const comps = parseList(byId("components").value);
    const Nin = readVector("NinMultiBox", comps);
    const R = Math.max(1, parseInt(byId("Rcount").value || "1", 10));
    const NU = Array.from({length:R}, (_,k)=> comps.map(c => parseFloat(byId(`nu_${k}_${c}`)?.value || "0")));

    const A=[]; const b=[];
    for(let i=0;i<R;i++){
      const type = byId(`specType_${i}`).value;
      const cj   = byId(`specComp_${i}`).value;
      const j    = comps.indexOf(cj);
      const val  = parseFloat(byId(`specVal_${i}`).value || "NaN");
      if(Number.isNaN(val)){ byId("rxnMultiResult").innerHTML = "<p>Remplis toutes les valeurs.</p>"; return; }

      if (type==="nout"){
        A.push(NU.map(row => row[j]));            // ν_kj
        b.push(val - Nin[j]);                     // Nout - Nin
      }else{
        A.push(NU.map(row => row[j]));
        b.push(- val * Nin[j]);                   // sum ν_kj ξ_k = - X Nin
      }
    }
    const xi = solveLinear(A,b);
    for(let k=0;k<R;k++){ const el=byId(`xi_${k}`); if(el) el.value = xi[k] ?? 0; }
    byId("rxnMultiResult").innerHTML = `<p>ξ résolus: ${xi.map(v=> (v??0).toFixed(6)).join(", ")}</p>`;
  };
});

// Multi-reaction solver
byId("solveRxnMulti").addEventListener("click", ()=>{
  const comps = parseList(byId("components").value);
  const Nin = readVector("NinMultiBox", comps);
  const R = Math.max(1, parseInt(byId("Rcount").value || "1", 10));
  const NU = Array.from({length:R}, (_,k)=> comps.map(c => parseFloat(byId(`nu_${k}_${c}`)?.value || "0")));

  const {rank,pivots} = matrixRank(NU);
  const independent = (rank === R);
  let msg = `<p><b>Rang(ν) = ${rank}</b> sur ${R} réactions. ${independent? "Indépendantes ✅" : "Dépendantes ❌"}</p>`;
  if (!independent){
    msg += `<p>Choisis un sous-ensemble de ${rank} réactions (pivots ~ lignes ${pivots.map(p=>p.row+1).join(", ")}).</p>`;
    byId("rxnMultiResult").innerHTML = msg; return;
  }

  const xi = Array.from({length:R}, (_,k)=> parseFloat(byId(`xi_${k}`)?.value || "0"));
  const Nout = comps.map((_,j)=>{
    let add=0; for(let k=0;k<R;k++) add += NU[k][j]*xi[k];
    return Nin[j] + add;
  });

  if (Nout.some(v=>v < -1e-9)){
    byId("rxnMultiResult").innerHTML = msg + `<p>⚠️ Débits négatifs → ξ trop grands.</p>`; return;
  }

  const Ntot = sum(Nout);
  const xout = Ntot>0 ? Nout.map(v=>v/Ntot) : Nout.map(()=>0);

  let html = msg + `<table><thead><tr><th>Comp.</th><th>N_in</th><th>N_out</th><th>x_out</th></tr></thead><tbody>`;
  comps.forEach((c,i)=>{
    html += `<tr><td>${c}</td><td>${(Nin[i]||0).toFixed(6)}</td><td>${(Nout[i]||0).toFixed(6)}</td><td>${(xout[i]||0).toFixed(6)}</td></tr>`;
  });
  html += `</tbody></table><p><b>N<sub>tot,out</sub> = ${Ntot.toFixed(6)}</b></p>`;
  byId("rxnMultiResult").innerHTML = html;
});

// ---- Atomic-balance helpers (optional) ----
function buildAtomicBox(comps){
  if (byId("atomicsBox").children.length) return;
  const box = byId("atomicsBox");
  box.innerHTML = `
    <h3>Éléments (optionnel)</h3>
    <div class="row">
      <input id="elements" type="text" placeholder="Ex: C,H,O">
      <button id="applyElements">Appliquer</button>
    </div>
    <div id="alphaTable"></div>`;
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
function atomTotals(N,A){
  const {elems,alpha}=A;
  return elems.map((_,e)=> sum(alpha.map((row,j)=> row[e]*(N[j]||0))));
}
