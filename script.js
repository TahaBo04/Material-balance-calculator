// --- helpers ---
const $ = (q) => document.querySelector(q);
const byId = (id) => document.getElementById(id);

function parseList(str){ return str.split(",").map(s=>s.trim()).filter(Boolean); }
function sum(arr){ return arr.reduce((a,b)=>a+b,0); }
function near1(x){ return Math.abs(x-1) < 1e-6; }
function clamp01(x){ return Math.max(0, Math.min(1, x)); }

function buildFracBox(containerId, comps, prefix){
  const box = byId(containerId); if(!box) return; box.innerHTML = "";
  comps.forEach(c=>{
    const row = document.createElement("div");
    row.className="row";
    row.innerHTML = `<label style="min-width:70px">${prefix}${c}</label>
                     <input type="number" step="any" id="${containerId}_${c}" placeholder="fraction de ${c}">`;
    box.appendChild(row);
  });
}
function buildValueBox(containerId, comps, prefix){
  const box = byId(containerId); if(!box) return; box.innerHTML = "";
  comps.forEach(c=>{
    const row = document.createElement("div");
    row.className="row";
    row.innerHTML = `<label style="min-width:70px">${prefix}${c}</label>
                     <input type="number" step="any" id="${containerId}_${c}" placeholder="N_in de ${c} (mol/h)">`;
    box.appendChild(row);
  });
}
function readVector(containerId, comps){
  return comps.map(c => parseFloat(byId(`${containerId}_${c}`)?.value || "0"));
}
function formatStream(F, x, comps, title){
  const lines = comps.map((c,i)=>`<tr><td>${c}</td><td>${(x[i]||0).toFixed(6)}</td><td>${(F*(x[i]||0)).toFixed(6)}</td></tr>`).join("");
  return `<h3>${title}</h3>
          <p><b>Débit total F = ${F.toFixed(6)}</b></p>
          <table><thead><tr><th>Comp.</th><th>Fraction</th><th>Débit partiel</th></tr></thead>
          <tbody>${lines}</tbody></table>`;
}
function normalize(fracs){ const s = sum(fracs); return s>0 ? fracs.map(v=>v/s) : fracs.slice(); }

// Rank via RREF (rows x cols)
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

// Small linear solver (least-squares if A not square): solves A x = b
function solveLinear(A, b){
  const m = A.length, n = A[0].length;
  let M = A.map(r=>r.slice()), rhs = b.slice();

  if (m !== n){
    const AT = Array.from({length:n},(_,j)=> Array.from({length:m},(_,i)=> A[i][j]));
    const ATA = Array.from({length:n},()=>Array(n).fill(0));
    const ATb = Array(n).fill(0);
    for(let i=0;i<n;i++){
      for(let j=0;j<n;j++) for(let k=0;k<m;k++) ATA[i][j]+=AT[i][k]*A[k][j];
      for(let k=0;k<m;k++) ATb[i]+=AT[i][k]*b[k];
    }
    M = ATA; rhs = ATb;
  }

  const N = M.length, P = M[0].length + 1;
  const Aug = M.map((row,i)=> row.concat([rhs[i]]));

  let r = 0;
  for(let c=0; c<P-1 && r<N; c++){
    let sel=r; for(let i=r;i<N;i++) if(Math.abs(Aug[i][c])>Math.abs(Aug[sel][c])) sel=i;
    if (Math.abs(Aug[sel][c]) < 1e-12) continue;
    [Aug[r],Aug[sel]] = [Aug[sel],Aug[r]];
    const piv = Aug[r][c];
    for(let j=c;j<P;j++) Aug[r][j] /= piv;
    for(let i=0;i<N;i++){
      if(i===r) continue;
      const f = Aug[i][c];
      if (Math.abs(f)>1e-12) for(let j=c;j<P;j++) Aug[i][j] -= f*Aug[r][j];
    }
    r++;
  }
  return Aug.slice(0, Math.min(N, P-1)).map(row => row[P-1]);
}

// ----- UI switching -----
const unitSel = byId("unit");
const panels = {
  "mixer": byId("panel-mixer"),
  "splitter": byId("panel-splitter"),
  "binary-sep": byId("panel-binary-sep"),
  "rxn-simple": byId("panel-rxn-simple"),
  "rxn-multi": byId("panel-rxn-multi")
};
if (unitSel){
  unitSel.addEventListener("change", ()=>{
    Object.values(panels).forEach(p=>p && (p.hidden=true));
    if (panels[unitSel.value]) panels[unitSel.value].hidden=false;
  });
}

// ---------- n→1 MIXER / 1→n SPLITTER BUILDERS ----------
function buildMixerFeedsUI(n, comps){
  const box = byId("mixFeedsBox");
  if (!box) return;
  let html = "";
  for(let i=1;i<=n;i++){
    html += `
      <div class="card" style="padding:12px;margin-bottom:10px">
        <h3>Feed ${i}</h3>
        <label>Débit F${i}</label>
        <input id="F_mix_${i}" type="number" step="any" placeholder="F${i}">
        <div id="x_mix_${i}"></div>
      </div>`;
  }
  box.innerHTML = html;
  for(let i=1;i<=n;i++) buildFracBox(`x_mix_${i}`, comps, `w${i}_`);
}

function buildSplitterOutsUI(n){
  const box = byId("splitPhiBox");
  if (!box) return;
  let html = `<div class="row" style="gap:10px;flex-wrap:wrap">`;
  for(let i=1;i<=n;i++){
    html += `<div><label>φ_${i}</label><input id="phi_${i}" type="number" step="any" placeholder="0–1"></div>`;
  }
  html += `</div>`;
  box.innerHTML = html;
}

// ----- Build inputs when components change -----
function applyComponents(){
  const comps = parseList(byId("components").value || "");

  // Multi-reaction
  buildValueBox("NinMultiBox", comps, "N_in_");
  if (byId("nuMultiBox")) byId("nuMultiBox").innerHTML = "<small>Choisis R et clique «Construire la matrice ν».</small>";
  if (byId("xiBox")) byId("xiBox").innerHTML = "";
  if (byId("autoXiBox")) byId("autoXiBox").innerHTML = "";
  if (byId("autoXi")) byId("autoXi").checked = false;

  // Mixer (dynamic if UI present, else legacy 2→1)
  if (byId("mixFeedsBox")){
    const mixN = Math.max(2, parseInt(byId("mixCount")?.value || "2", 10));
    buildMixerFeedsUI(mixN, comps);
  } else {
    buildFracBox("x1Box", comps, "w1_");
    buildFracBox("x2Box", comps, "w2_");
  }

  // Splitter (dynamic if UI present, else legacy 1→2)
  buildFracBox("xsBox", comps, "w_");
  if (byId("splitPhiBox")){
    const splitN = Math.max(2, parseInt(byId("splitCount")?.value || "2", 10));
    buildSplitterOutsUI(splitN);
  }

  // Simple reaction
  buildValueBox("NinBox", comps, "N_in_");
  const nuBox = byId("nuBox"); if (nuBox){ nuBox.innerHTML="";
    comps.forEach(c=>{
      const row=document.createElement("div"); row.className="row";
      row.innerHTML = `<label style="min-width:70px">ν_${c}</label>
                       <input type="number" step="any" id="nu_${c}" placeholder="négatif réactifs, positif produits">`;
      nuBox.appendChild(row);
    });
  }
  const selKey = byId("keyComp"); if (selKey) selKey.innerHTML="";
  const selSpec= byId("specComp"); if (selSpec) selSpec.innerHTML="";
  comps.forEach(c=>{
    if (selKey){ const o=document.createElement("option"); o.value=c; o.textContent=c; selKey.appendChild(o); }
    if (selSpec){ const o2=document.createElement("option"); o2.value=c; o2.textContent=c; selSpec.appendChild(o2); }
  });
  if (byId("atomicsBox")) byId("atomicsBox").innerHTML="";
}
byId("applyComponents")?.addEventListener("click", applyComponents);
applyComponents();

// ----- Build ν-matrix + ξ inputs -----
byId("buildNu")?.addEventListener("click", ()=>{
  const comps = parseList(byId("components").value || "");
  const R = Math.max(1, parseInt(byId("Rcount").value || "1", 10));

  const nuDiv = byId("nuMultiBox"); if (!nuDiv) return;
  let html = `<table><thead><tr><th>ν (k\\j)</th>${comps.map(c=>`<th>${c}</th>`).join("")}</tr></thead><tbody>`;
  for(let k=0;k<R;k++){
    html += `<tr><td>r${k+1}</td>${comps.map(c=>`<td><input type="number" step="any" id="nu_${k}_${c}" placeholder="ν_${k+1},${c}"></td>`).join("")}</tr>`;
  }
  html += `</tbody></table>`;
  nuDiv.innerHTML = html;

  const xiDiv = byId("xiBox"); if (!xiDiv) return;
  let xiHtml = `<div class="row" style="flex-wrap:wrap;gap:8px">`;
  for(let k=0;k<R;k++) xiHtml += `<div><label>ξ_${k+1}</label><input type="number" step="any" id="xi_${k}" placeholder="extent ${k+1}"></div>`;
  xiHtml += `</div>`;
  xiDiv.innerHTML = xiHtml;
});

// ================== MIXER (n -> 1) ==================
byId("buildMixerFeeds")?.addEventListener("click", ()=>{
  const comps = parseList(byId("components").value || "");
  const n = Math.max(2, parseInt(byId("mixCount").value || "2", 10));
  buildMixerFeedsUI(n, comps);
});

byId("solveMixer")?.addEventListener("click", ()=>{
  const comps = parseList(byId("components").value || "");

  // Dynamic n→1 path if mixFeedsBox exists
  const hasDynamic = !!byId("mixFeedsBox");
  if (hasDynamic){
    const n = Math.max(2, parseInt(byId("mixCount").value || "2", 10));
    let Fsum = 0;
    const numer = Array(comps.length).fill(0);
    let warnings = "";

    for(let i=1;i<=n;i++){
      const Fi = parseFloat(byId(`F_mix_${i}`)?.value || "0");
      let xi = readVector(`x_mix_${i}`, comps);
      const s = sum(xi);
      if (!near1(s)) warnings += `<p>⚠️ Feed ${i}: fractions somment à ${s.toFixed(6)} → normalisées.</p>`;
      xi = normalize(xi);

      Fsum += Fi;
      for(let j=0;j<comps.length;j++) numer[j] += Fi*(xi[j]||0);
    }

    const x = Fsum>0 ? numer.map(v=>v/Fsum) : numer.map(()=>0);
    const out = formatStream(Fsum, x, comps, "Produit (mélange)");
    byId("mixResult").innerHTML = warnings + out;
    return;
  }

  // Legacy 2→1 fallback
  const F1 = parseFloat(byId("F1")?.value || "0");
  const F2 = parseFloat(byId("F2")?.value || "0");
  let x1 = readVector("x1Box", comps);
  let x2 = readVector("x2Box", comps);
  const s1 = sum(x1), s2 = sum(x2);
  let warn = "";
  if(!near1(s1)) warn += `<p>⚠️ Feed1: fractions somment à ${s1.toFixed(6)} → normalisées.</p>`;
  if(!near1(s2)) warn += `<p>⚠️ Feed2: fractions somment à ${s2.toFixed(6)} → normalisées.</p>`;
  x1 = normalize(x1); x2 = normalize(x2);

  const F = F1 + F2;
  const numer = comps.map((_,i)=>F1*(x1[i]||0) + F2*(x2[i]||0));
  const x = F>0 ? numer.map(v=>v/F) : numer.map(()=>0);

  byId("mixResult").innerHTML = warn + formatStream(F, x, comps, "Produit (mélange)");
});

// ================== SPLITTER (1 -> n) ==================
byId("buildSplitterOuts")?.addEventListener("click", ()=>{
  const n = Math.max(2, parseInt(byId("splitCount").value || "2", 10));
  buildSplitterOutsUI(n);
});

function checkFractions(fracArrays, labels){
  let msg=""; fracArrays.forEach((arr,idx)=>{ const s=sum(arr); if(!near1(s)) msg+=`<p><b>⚠️ ${labels[idx]} :</b> somme=${s.toFixed(6)}. Normalisées automatiquement.</p>`; });
  return msg;
}

byId("solveSplitter")?.addEventListener("click", ()=>{
  const comps = parseList(byId("components").value || "");
  const F = parseFloat(byId("Fs")?.value || "0");
  let x = readVector("xsBox", comps); 
  const s = sum(x);
  let warn = "";
  if (!near1(s)) { warn = `<p>⚠️ Feed: fractions somment à ${s.toFixed(6)} → normalisées.</p>`; }
  x = normalize(x);

  // Dynamic 1→n path if splitPhiBox exists
  if (byId("splitPhiBox")){
    const n = Math.max(2, parseInt(byId("splitCount")?.value || "2", 10));
    let phis = [];
    for(let i=1;i<=n;i++) phis.push(parseFloat(byId(`phi_${i}`)?.value || "0"));
    const sphi = sum(phis);
    if (sphi <= 0) { byId("splitResult").innerHTML = "<p>Donne au moins une φ_i &gt; 0.</p>"; return; }
    phis = phis.map(v=> v/sphi);  // normalize φ to Σφ=1

    let html = warn + `<p>Σφ = ${sphi.toFixed(6)} → normalisé à 1.</p>`;
    for(let i=1;i<=n;i++){
      const Fi = phis[i-1]*F;
      html += formatStream(Fi, x, comps, `Courant ${i}`);
    }
    byId("splitResult").innerHTML = html;
    return;
  }

  // Legacy 1→2 fallback
  const phi = clamp01(parseFloat(byId("phi")?.value || "0"));
  const F1 = phi*F, F2 = (1-phi)*F;
  const res = formatStream(F1, x, comps, "Courant 1") + formatStream(F2, x, comps, "Courant 2");
  byId("splitResult").innerHTML = `<p>Compositions identiques sur les branches (diviseur).</p>${warn}${res}`;
});

// ================== BINARY SEPARATOR (unchanged) ==================
byId("solveBinSep")?.addEventListener("click", ()=>{
  const F  = parseFloat(byId("Ffeed").value || "0");
  const zA = clamp01(parseFloat(byId("zA").value || "0"));
  const RA = clamp01(parseFloat(byId("RA").value || "0"));
  const D_in  = parseFloat(byId("D").value);
  const xD_in = parseFloat(byId("xD").value);
  const B_in  = parseFloat(byId("B").value);
  const xB_in = parseFloat(byId("xB").value);

  if (!(F>0) || isNaN(zA) || isNaN(RA)){
    byId("binSepResult").innerHTML = "<p>Donne F, z<sub>A</sub> et R<sub>A</sub> valides.</p>"; return;
  }
  const DxD = RA * F * zA;

  const given = [!isNaN(D_in), !isNaN(xD_in), !isNaN(B_in), !isNaN(xB_in)].filter(Boolean).length;
  if (given === 0){ byId("binSepResult").innerHTML = "<p>Donne UNE des quatre valeurs : D, xD_A, B ou xB_A.</p>"; return; }

  let D, xD, B, xB;
  if (!isNaN(xB_in)){
    xB = clamp01(xB_in);
    const Ax_in_bottoms = F*zA - DxD;
    if (Math.abs(xB) < 1e-12){ byId("binSepResult").innerHTML = "<p>xB_A = 0 → indéterminé. Donne une autre spécification.</p>"; return; }
    B = Ax_in_bottoms / xB; D = F - B; xD = D>0 ? DxD / D : 0;
  } else if (!isNaN(B_in)){
    B = B_in; D = F - B; if (!(D>0)){ byId("binSepResult").innerHTML = "<p>D≤0 : B trop grand.</p>"; return; }
    xD = DxD / D; const Ax_in_bottoms = F*zA - DxD; xB = B>0 ? Ax_in_bottoms / B : 0;
  } else if (!isNaN(D_in)){
    D = D_in; B = F - D; if (!(B>=0)){ byId("binSepResult").innerHTML = "<p>B<0 : D trop grand.</p>"; return; }
    xD = D>0 ? DxD / D : 0; const Ax_in_bottoms = F*zA - DxD; xB = B>0 ? Ax_in_bottoms / B : 0;
  } else if (!isNaN(xD_in)){
    xD = clamp01(xD_in);
    if (Math.abs(xD) < 1e-12){ byId("binSepResult").innerHTML = "<p>xD_A = 0 → indéterminé. Donne une autre spécification.</p>"; return; }
    D = DxD / xD; B = F - D; const Ax_in_bottoms = F*zA - DxD; xB = B>0 ? Ax_in_bottoms / B : 0;
  }

  const okRanges = (D>=0 && B>=0 && Math.abs(D+B-F) < 1e-8 &&
                    xD>=-1e-12 && xD<=1+1e-12 && xB>=-1e-12 && xB<=1+1e-12);
  if (!okRanges){ byId("binSepResult").innerHTML = "<p>Spécifications incompatibles.</p>"; return; }

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

// ================== SIMPLE REACTION (auto-ξ) ==================
byId("solveRxn")?.addEventListener("click", ()=>{
  const comps = parseList(byId("components").value || "");
  const Nin = readVector("NinBox", comps);
  const nu  = comps.map(c => parseFloat(byId(`nu_${c}`).value || "0"));

  let xi = byId("xi")?.value ? parseFloat(byId("xi").value) : null;
  if (xi==null){
    const key = byId("keyComp")?.value;
    const Xc  = byId("convKey")?.value ? clamp01(parseFloat(byId("convKey").value)) : null;
    const k   = comps.indexOf(key);
    if (Xc!=null && !Number.isNaN(Xc)){
      const nuK = nu[k];
      if (nuK >= 0){ byId("rxnResult").innerHTML = "<p>Choisis un réactif clé (ν&lt;0).</p>"; return; }
      xi = Xc * Nin[k] / Math.abs(nuK);
    }
  }
  if (xi==null){
    const jname = byId("specComp")?.value;
    const j = comps.indexOf(jname);
    const Nout_j_given = byId("specNout")?.value ? parseFloat(byId("specNout").value) : null;
    if (j>=0 && Nout_j_given!=null && !Number.isNaN(Nout_j_given)){
      const nuj = nu[j];
      if (Math.abs(nuj) < 1e-12){ byId("rxnResult").innerHTML = "<p>ν=0 pour ce composant → ne permet pas de calculer ξ.</p>"; return; }
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

// ================== MULTI REACTION (auto-ξ UI + solver) ==================
const autoXiEl = byId("autoXi");
if (autoXiEl){
  autoXiEl.addEventListener("change", ()=>{
    const box = byId("autoXiBox"); if (!box) return;
    box.innerHTML = "";
    if(!autoXiEl.checked) return;

    const comps = parseList(byId("components").value || "");
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
          A.push(NU.map(row => row[j]));            // ν_kj
          b.push(- val * Nin[j]);                   // -X * Nin
        }
      }
      const xi = solveLinear(A,b);
      for(let k=0;k<R;k++){ const el=byId(`xi_${k}`); if(el) el.value = xi[k] ?? 0; }
      byId("rxnMultiResult").innerHTML = `<p>ξ résolus: ${xi.map(v=> (v??0).toFixed(6)).join(", ")}</p>`;
    };
  });
}

byId("solveRxnMulti")?.addEventListener("click", ()=>{
  const comps = parseList(byId("components").value || "");
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
  if (byId("atomicsBox")?.children.length) return;
  const box = byId("atomicsBox"); if (!box) return;
  box.innerHTML = `
    <h3>Éléments (optionnel)</h3>
    <div class="row">
      <input id="elements" type="text" placeholder="Ex: C,H,O">
      <button id="applyElements">Appliquer</button>
    </div>
    <div id="alphaTable"></div>`;
  byId("applyElements").onclick = ()=>{
    const elems = parseList(byId("elements").value || "");
    const tbl = byId("alphaTable");
    let html = `<table><thead><tr><th>Espèce \\ Élément</th>${elems.map(e=>`<th>${e}</th>`).join("")}</tr></thead><tbody>`;
    const comps = parseList(byId("components").value || "");
    comps.forEach(s=>{
      html += `<tr><td>${s}</td>${elems.map(e=>`<td><input type="number" step="any" id="alpha_${s}_${e}" placeholder="α_${e},${s}"></td>`).join("")}</tr>`;
    });
    html += `</tbody></table>`;
    tbl.innerHTML = html;
  };
}
function readAtomMatrix(comps){
  const elems = parseList(byId("elements").value || "");
  return { elems, alpha: comps.map(s=> elems.map(e=> parseFloat(byId(`alpha_${s}_${e}`)?.value || "0"))) };
}
function atomTotals(N,A){
  const {elems,alpha}=A;
  return elems.map((_,e)=> sum(alpha.map((row,j)=> row[e]*(N[j]||0))));
}

// --- FLOWSHEET BUILDER LOGIC ---
const flowsheetBox = byId("flowsheet");
const toolboxItems = document.querySelectorAll("#toolbox .draggable");
let flowsheetUnits = [];

toolboxItems.forEach(item=>{
  item.addEventListener("dragstart", e=>{
    e.dataTransfer.setData("unit-type", item.dataset.type);
  });
});

flowsheetBox?.addEventListener("dragover", e=>{
  e.preventDefault();
});

flowsheetBox?.addEventListener("drop", e=>{
  e.preventDefault();
  const type = e.dataTransfer.getData("unit-type");
  if (!type) return;

  const id = "u"+(flowsheetUnits.length+1);
  const block = document.createElement("div");
  block.className = "unit-block";
  block.style.position = "absolute";
  block.style.left = e.offsetX+"px";
  block.style.top = e.offsetY+"px";
  block.style.border = "1px solid #333";
  block.style.padding = "6px 10px";
  block.style.background = "#eee";
  block.innerHTML = `<b>${type}</b><br><small>${id}</small>`;
  flowsheetBox.appendChild(block);

  flowsheetUnits.push({id,type,x:e.offsetX,y:e.offsetY,inputs:[],outputs:[]});
  console.log("Flowsheet units:", flowsheetUnits);
});
