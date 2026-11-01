'use strict';
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const fmt=(value,n=1)=>Number.isFinite(value)?value.toFixed(n):'—';
const money=value=>Number.isFinite(value)?new Intl.NumberFormat('en',{style:'currency',currency:'EUR',notation:'compact',maximumFractionDigits:1}).format(value):'—';
const number=value=>new Intl.NumberFormat('en').format(value);
const STORAGE='globalscout:standalone:v1:shortlist';
const PAGE_SIZE=10;
const LIVE_API=['127.0.0.1','localhost'].includes(location.hostname);
let savedNotes={},detailTab='overview';
let snapshot,players=[],metrics=[],history=[],filtered=[],selected=null,page=0,tab='discover',noteController=null,toastTimer;
let saved=[];
try{const ids=JSON.parse(localStorage.getItem(STORAGE)||'[]');if(Array.isArray(ids))saved=ids.filter(x=>typeof x==='string');}catch{}

function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,2600);}
function chooseTab(next){tab=next;page=0;document.querySelectorAll('[data-tab]').forEach(button=>{const active=button.dataset.tab===tab;button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});$('methods-view').hidden=tab!=='methods';$('discovery-view').hidden=tab==='methods';$('candidates-title').textContent=tab==='shortlist'?'Your shortlist':'Recruitment candidates';if(tab!=='methods')render();}
function filters(){return{league:$('league').value,role:$('role').value,age:$('age').value,evidence:$('eligibility').value,search:$('search').value.trim().toLowerCase(),alerts:$('alerts-only').checked,sort:$('sort').value};}
function computeRows(){const f=filters();return players.filter(p=>(tab!=='shortlist'||saved.includes(p.player_id))&&(f.league==='all'||p.league===f.league)&&(f.role==='all'||p.role===f.role)&&(f.age==='all'||p.age_band===f.age)&&(f.evidence==='all'||(f.evidence==='eligible'?p.eligible:!p.eligible))&&(!f.search||`${p.name} ${p.player_id}`.toLowerCase().includes(f.search))&&(!f.alerts||p.alert_count>0)).sort((a,b)=>(b[f.sort]??-Infinity)-(a[f.sort]??-Infinity)||a.player_id.localeCompare(b.player_id));}
function render(){
  filtered=computeRows();page=Math.min(page,Math.max(0,Math.ceil(filtered.length/PAGE_SIZE)-1));
  $('saved-count').textContent=saved.length;
  $('overview').innerHTML=[[filtered.length,'Players in view'],[filtered.filter(p=>p.eligible).length,'Eligible for screening'],[filtered.filter(p=>p.alert_count>0).length,'With rule alerts'],[filtered.filter(p=>saved.includes(p.player_id)).length,'Shortlisted in view']].map(([v,label])=>`<div><strong>${number(v)}</strong><span>${label}</span></div>`).join('');
  $('export').disabled=!filtered.length;
  const start=page*PAGE_SIZE;
  const rows=filtered.slice(start,start+PAGE_SIZE);
  if(!filtered.some(p=>p.player_id===selected))selected=rows[0]?.player_id??null;
  // On page navigation, bring the selected dossier into the same visible page.
  if(rows.length&&!rows.some(p=>p.player_id===selected))selected=rows[0].player_id;
  $('player-rows').innerHTML=rows.map(p=>`<tr class="candidate-row${p.player_id===selected?' selected':''}" data-player="${esc(p.player_id)}" aria-selected="${p.player_id===selected}"><td><button class="player-button" data-player="${esc(p.player_id)}" aria-label="Inspect ${esc(p.name)}">${esc(p.name)}</button><span class="role-label">${esc(p.role)}${saved.includes(p.player_id)?' · Saved':''}</span></td><td class="league-label">${esc(p.league.replace('Demo League ','Demo '))}</td><td class="number">${p.age}</td><td class="number"><span class="score-cell">${fmt(p.performance)}<span class="score-meter"><i style="width:${p.performance}%"></i></span></span></td><td class="number"><span class="score-cell">${fmt(p.priority)}<span class="score-meter priority-meter"><i style="width:${p.priority??0}%"></i></span></span></td><td class="number">${money(p.value_eur)}</td></tr>`).join('');
  $('empty').hidden=!!rows.length;
  if(!rows.length)$('empty').innerHTML=tab==='shortlist'?'<strong>No shortlisted players match this view</strong><p>Add a player from Discover, or clear your filters.</p>':'<strong>No matching players</strong><p>Try another filter or clear your search.</p>';
  $('row-count').textContent=filtered.length?`${start+1}–${Math.min(start+PAGE_SIZE,filtered.length)} of ${number(filtered.length)} players`:'0 players';
  $('page-count').textContent=`${filtered.length?page+1:0} / ${Math.ceil(filtered.length/PAGE_SIZE)}`;
  $('previous').disabled=page===0;$('next').disabled=start+PAGE_SIZE>=filtered.length;
  renderDossier();renderComparison();
}
function selectPlayer(id){if(!filtered.some(p=>p.player_id===id))return;selected=id;render();}
function toggleSaved(id){saved=saved.includes(id)?saved.filter(x=>x!==id):[...saved,id];try{localStorage.setItem(STORAGE,JSON.stringify(saved));}catch{toast('Browser storage is unavailable; shortlist lasts for this session.');}render();}

function trendChart(rows){
  if(!rows.length)return'<p class="small-note">No appearance history available.</p>';
  const width=440,height=185,left=30,right=12,top=12,bottom=30,plotW=width-left-right,plotH=height-top-bottom;
  const maxY=Math.max(5,Math.ceil(Math.max(...rows.map(r=>r.rolling5))/5)*5);
  const minX=Math.min(...rows.map(r=>r.appearance)),maxX=Math.max(...rows.map(r=>r.appearance));
  const x=v=>left+(v-minX)/Math.max(1,maxX-minX)*plotW,y=v=>top+plotH-v/maxY*plotH;
  const points=rows.map(r=>`${x(r.appearance)},${y(r.rolling5)}`).join(' ');
  const area=`${left},${top+plotH} ${points} ${x(maxX)},${top+plotH}`;
  const grid=[0,.25,.5,.75,1].map(t=>`<line x1="${left}" x2="${width-right}" y1="${y(t*maxY)}" y2="${y(t*maxY)}" stroke="#e9efea"/><text x="${left-8}" y="${y(t*maxY)+3}" text-anchor="end" class="chart-label">${fmt(t*maxY,0)}</text>`).join('');
  const ticks=[1,5,10,15,20].filter(v=>v>=minX&&v<=maxX).map(v=>`<text x="${x(v)}" y="${height-10}" text-anchor="middle" class="chart-label">${v}</text>`).join('');
  const dots=rows.map(r=>{const note=`Appearance ${r.appearance}: ${fmt(r.rolling5,2)} progressive passes /90, pooled over ${r.rolling_appearances} appearance${r.rolling_appearances===1?'':'s'}.`;return`<circle class="chart-point" cx="${x(r.appearance)}" cy="${y(r.rolling5)}" r="2.7"/><circle class="chart-hit" tabindex="0" role="img" aria-label="${esc(note)}" data-chart-note="${esc(note)}" cx="${x(r.appearance)}" cy="${y(r.rolling5)}" r="8"><title>${esc(note)}</title></circle>`;}).join('');
  return`<svg class="form-chart" viewBox="0 0 ${width} ${height}" role="group" aria-label="Progressive passes per 90: rolling five player appearances">${grid}<polygon points="${area}" fill="#12694d" opacity=".045"/><polyline points="${points}" fill="none" stroke="#12694d" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${dots}${ticks}</svg><div id="chart-tooltip" class="chart-tooltip" aria-live="polite">Five-appearance rate · hover or focus a point for evidence</div>`;
}

function renderDossier(){
  noteController?.abort();
  const p=players.find(p=>p.player_id===selected);
  if(!p){$('dossier').innerHTML='<div class="card empty">Select a populated view to inspect a player.</div>';return;}
  const own=metrics.filter(r=>r.player_id===p.player_id),ownHistory=history.filter(r=>r.player_id===p.player_id).sort((a,b)=>a.appearance-b.appearance);
  const signals=p.alert_count?p.alerts.split(' • ').map(s=>`<p class="signal"><span aria-hidden="true">↗</span>${esc(s)}</p>`).join(''):'<p class="signal">No screening rules triggered.</p>';
  $('dossier').innerHTML=`<section class="card profile-card" aria-label="Player dossier"><div class="player-heading"><div class="player-avatar jersey-avatar" aria-hidden="true"><svg viewBox="0 0 80 88"><path d="M24 7 10 13 1 35 16 42 22 31 22 82 58 82 58 31 64 42 79 35 70 13 56 7 49 15 31 15Z" fill="#105b43" stroke="#073c2b" stroke-width="2"/><path d="M29 7Q40 20 51 7" fill="none" stroke="#b2cdbd" stroke-width="2"/><text x="40" y="54" text-anchor="middle" fill="white" font-size="25" font-family="Arial" font-weight="600">${Number(p.player_id.slice(1))}</text></svg></div><div><h2>${esc(p.name)}</h2><p>${esc(p.role)} · Age ${p.age}</p><p>${esc(p.league)} · ${number(p.minutes)} minutes</p></div></div><div class="player-actions"><span class="tag${p.eligible?'':' warning'}">${p.eligible?'Eligible for screening':'Low minutes · unranked'}</span><button class="primary-button" id="toggle-save">${saved.includes(p.player_id)?'Remove from shortlist':'＋ Add to shortlist'}</button></div><div class="score-grid">${[['Performance',p.performance],['Priority',p.priority]].map(([label,value])=>`<div><span>${label}</span><strong>${fmt(value)}<small>/100</small></strong></div>`).join('')}</div><p class="small-note">Priority: 55% performance + 20% affordability + 15% illustrative fit + 10% contract opportunity. A screening score, not a probability.</p><dl class="facts">${[['Fictional value',money(p.value_eur)],['Annual wage',money(p.annual_wage_eur)],['Contract remaining',`${p.contract_months} months`],['Contract opportunity',`${fmt(p.contract_opportunity)}/100`],['Illustrative club fit',`${fmt(p.club_fit_proxy)}/100`],['Eligible cohort size',p.cohort_n]].map(([label,value])=>`<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl><div class="signals"><h3>Rule-based signals</h3>${signals}</div><p class="small-note">Shorter contracts increase opportunity. Fit uses a fictional 75th-percentile target, not an actual club profile.</p></section>
  <section class="card" aria-labelledby="profile-heading"><h2 id="profile-heading" class="card-title">Local peer profile</h2><p class="small-note">Stabilized metric percentiles · ${p.cohort_n} eligible players in the same league, role, age band and season.</p><div class="metric-profile" role="list" aria-label="Local cohort percentiles">${own.map(m=>`<div class="metric-row" role="listitem" title="${esc(m.label)}: ${fmt(m.percentile)}th local percentile; observed ${fmt(m.raw,2)}${esc(m.unit)}; stabilized ${fmt(m.stabilized,2)}${esc(m.unit)}"><span class="metric-label">${esc(m.label)}</span><div class="bar-track" aria-hidden="true"><div class="bar-fill" style="width:${Math.max(0,Math.min(100,m.percentile))}%"></div></div><strong>${fmt(m.percentile)}</strong></div>`).join('')}</div><p class="small-note">Higher output can reflect style rather than quality. Cross-league difficulty adjustment is off.</p><details style="margin-top:17px"><summary>Observed and stabilized values</summary><div class="table-scroll"><table class="metric-table"><caption class="sr-only">Observed and stabilized metric evidence</caption><thead><tr><th>Metric</th><th class="number">Observed</th><th class="number">Stabilized</th></tr></thead><tbody>${own.map(m=>`<tr><td>${esc(m.label)}</td><td class="number">${fmt(m.raw,2)}${esc(m.unit)}</td><td class="number">${fmt(m.stabilized,2)}${esc(m.unit)}</td></tr>`).join('')}</tbody></table></div></details></section>
  <section class="card" aria-labelledby="form-heading"><h2 id="form-heading" class="card-title">Progressive passes /90</h2><p class="small-note">Rolling five appearances · descriptive form</p>${trendChart(ownHistory)}<div class="window-grid">${[['Last 5',p.last5_passes],['Previous 5',p.previous5_passes],['Last 10',p.last10_passes],['Season',p.season_passes]].map(([label,value])=>`<div><span>${label}</span><strong>${fmt(value,2)}<small>/90</small></strong></div>`).join('')}</div><p class="small-note">Counts are pooled over minutes. The first four plotted points use the available shorter window. Appearance numbers are not calendar dates.</p></section>
  <section class="card scout-card" aria-labelledby="scout-title"><div class="card-heading"><h2 id="scout-title">Scouting note</h2><span class="note-brand">SARVAM 105B</span></div><div id="note-content"><p class="note-text">Loading saved note…</p></div><p class="small-note">AI interpretation; verify against the metric evidence. Generating makes one API request. Saved notes are reused, and scores remain unchanged.</p></section>`;
  arrangeDossier();
  $('toggle-save').onclick=()=>toggleSaved(p.player_id);
  noteController=new AbortController();const pid=p.player_id;
  (LIVE_API?fetch(`api/scout/${encodeURIComponent(pid)}`,{signal:noteController.signal}):Promise.resolve({ok:true,json:()=>Promise.resolve({note:savedNotes[pid]||''})})).then(r=>{if(!r.ok)throw new Error();return r.json();}).then(data=>{if(selected===pid)renderNote(p,data.note);}).catch(error=>{if(error.name!=='AbortError'&&selected===pid)renderNote(p,'','Could not load saved notes. The local server may be unavailable.');});
}

function renderNote(p,note,error=''){
  const host=$('note-content');if(!host)return;
  if(!LIVE_API&&!note){host.innerHTML=`<span class="tag">Calculated evidence summary</span><p class="note-text">${esc(calculatedSummary(p))}</p><p class="small-note">New Sarvam notes can be generated in the local app. This hosted demo shows saved AI notes when available.</p>`;return;}
  host.innerHTML=note?`<span class="tag">Saved interpretation</span><p class="note-text">${esc(note)}</p>`:`<p class="note-text">${p.eligible?'Turn the calculated evidence into a short scouting note.':'This player has fewer than 450 minutes and is excluded from ranked screening.'}</p><button class="primary-button" id="generate-note" ${p.eligible?'':'disabled'}>Generate scouting note</button>`;
  if(error){const paragraph=document.createElement('p');paragraph.className='note-error';paragraph.setAttribute('role','alert');paragraph.textContent=error;host.append(paragraph);}
  if($('generate-note'))$('generate-note').onclick=async()=>{
    const button=$('generate-note'),pid=p.player_id;button.disabled=true;button.textContent='Generating note…';
    try{const response=await fetch('api/scout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({player_id:pid})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not generate a note.');if(selected===pid)renderNote(p,result.note);}
    catch(error){if(selected===pid)renderNote(p,'',error.message||'Could not generate a note.');}
  };
}

function renderComparison(){const show=tab==='shortlist'&&filtered.length>=2;$('compare').hidden=!show;if(!show)return;const chosen=filtered.slice(0,3);$('compare').innerHTML=`<div class="card-heading"><div><h2>Side-by-side evidence</h2><p>First ${chosen.length} players in this shortlist view · local cohort percentiles</p></div></div><div class="table-scroll"><table><thead><tr><th>Metric</th>${chosen.map(p=>`<th class="number">${esc(p.player_id)}</th>`).join('')}</tr></thead><tbody>${['progressive_passes','progressive_carries','line_breaks','pressing_recoveries','padj_duels_won','takeon_rate','pressure_retention','duel_efficiency'].map(key=>{const points=chosen.map(p=>metrics.find(m=>m.player_id===p.player_id&&m.metric===key));return`<tr><td>${esc(points[0]?.label)}</td>${points.map(m=>`<td class="number">${fmt(m?.percentile)}</td>`).join('')}</tr>`;}).join('')}</tbody></table></div><p class="small-note">These percentiles compare each player with their own local cohort. They do not establish equal ability across leagues or roles.</p>`;}

function exportView(){const fields=['player_id','name','role','league','age','minutes','eligible','performance','affordability','club_fit_proxy','contract_opportunity','priority','value_eur','annual_wage_eur','contract_months','alerts','synthetic'];const quote=v=>`"${String(v??'').replaceAll('"','""')}"`;const csv=[fields.join(','),...filtered.map(p=>fields.map(k=>quote(p[k])).join(','))].join('\r\n');download(csv,'globalscout-synthetic-selection.csv','text/csv;charset=utf-8');toast(`Exported ${filtered.length} players in this view`);}
function download(content,filename,type){const url=URL.createObjectURL(new Blob([content],{type}));const link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function showSources(){
  const f=filters(),p=players.find(p=>p.player_id===selected);
  $('source-content').innerHTML=`<p class="small-note">Snapshot: DEMO-01. All data is synthetic. No real match dates or live ingestion.</p><div class="source-group"><h3>Current view</h3><p>${filtered.length} players; league: ${esc(f.league)}; role: ${esc(f.role)}; age: ${esc(f.age)}; evidence: ${esc(f.evidence)}; alerts only: ${f.alerts?'yes':'no'}; search: ${esc(f.search||'none')}.</p>${p?`<p>Selected player: ${esc(p.name)}. Cohort: ${esc(p.cohort)}. ${p.cohort_n} eligible players; ${p.minutes} minutes.</p>`:''}<button id="source-export" class="quiet-button">Download current player rows</button></div>${Object.values(snapshot.queries).map(q=>`<div class="source-group"><h3>${esc(q.source.label)}</h3><p>${number(q.rows.length)} source rows. Files: ${esc(q.source.files.join(', '))}.</p><ol>${q.source.evidenceFlow.map(step=>`<li><strong>${esc(step.title)}:</strong> ${esc(step.detail)}</li>`).join('')}</ol></div>`).join('')}<div class="source-group"><h3>Method references</h3><p>Our weights, smoothing and alert thresholds are prototype choices. StatsBomb explains per-90 normalization and possession context; Sarvam documents the chat integration.</p><p><a href="https://blogarchive.statsbomb.com/articles/soccer/understanding-statsbomb-radars/" target="_blank" rel="noopener noreferrer">StatsBomb metric context ↗</a><br><a href="https://docs.sarvam.ai/api/token-factory/chat-completions" target="_blank" rel="noopener noreferrer">Sarvam Chat Completions ↗</a></p></div>`;
  $('source-export').onclick=exportView;$('sources-dialog').showModal();
}


function calculatedSummary(p){return `SYNTHETIC DEMO. ${p.name}, age ${p.age}, ${p.role}. Performance score ${fmt(p.performance)}/100; recruitment priority ${fmt(p.priority)}/100. ${number(p.minutes)} observed minutes in ${p.league}, compared with ${p.cohort_n} eligible local-cohort players. Progressive passes: ${fmt(p.season_passes,2)}/90 across the season and ${fmt(p.last5_passes,2)}/90 over the last five appearances. Affordability score ${fmt(p.affordability)}/100; higher means relatively cheaper. ${p.alert_count} provisional rule alerts. All data is fictional. League transferability, real club fit and future prices are unknown.`;}
function arrangeDossier(){
 const dossier=$('dossier'),sections=[...dossier.querySelectorAll(':scope>section')];if(sections.length!==4)return;
 const [profile,metric,form,scout]=sections;
 const overview=document.createElement('div');overview.className='detail-pane';overview.dataset.pane='overview';
 for(const node of [...profile.children])if(node.matches('.facts,.signals,.small-note'))overview.append(node);
 const tabbar=document.createElement('nav');tabbar.className='profile-tabs';tabbar.setAttribute('aria-label','Player detail');
 tabbar.innerHTML=[['overview','Overview'],['metrics','Key metrics'],['form','Form'],['note','Scouting note']].map(([id,label])=>`<button data-detail-tab="${id}" class="${detailTab===id?'active':''}">${label}</button>`).join('');
 profile.append(tabbar,overview);
 for(const [node,id] of [[metric,'metrics'],[form,'form'],[scout,'note']]){node.dataset.pane=id;node.classList.add('detail-pane');node.classList.remove('card');profile.append(node);}
 const preview=document.createElement('div');preview.className='dossier-preview';preview.innerHTML='<span class="note-brand">✦ Evidence-led scouting</span><p>Review the metric profile and form trajectory, then open the scouting note for a concise interpretation.</p>';
 overview.append(preview);
 function activate(id){detailTab=id;profile.querySelectorAll('[data-pane]').forEach(p=>p.hidden=p.dataset.pane!==id);tabbar.querySelectorAll('button').forEach(b=>{b.classList.toggle('active',b.dataset.detailTab===id);b.setAttribute('aria-pressed',String(b.dataset.detailTab===id));});}
 tabbar.addEventListener('click',e=>{const b=e.target.closest('[data-detail-tab]');if(b)activate(b.dataset.detailTab);});activate(detailTab);
}

async function boot(){
  try{
    const response=await fetch('data.json');if(!response.ok)throw new Error('Could not load the synthetic dataset.');snapshot=await response.json();
    players=snapshot.queries.players.rows;metrics=snapshot.queries.metrics.rows;history=snapshot.queries.trajectory.rows;
    saved=saved.filter(id=>players.some(p=>p.player_id===id));
    for(const [id,field] of [['league','league'],['role','role']]){for(const value of [...new Set(players.map(p=>p[field]))].sort()){const option=document.createElement('option');option.value=value;option.textContent=value;$(id).append(option);}}
    $('formula-guide').textContent=snapshot.queries.methodology.rows[0].text;
    if(!LIVE_API){try{const notesResponse=await fetch('notes.json');if(notesResponse.ok)savedNotes=await notesResponse.json();}catch{}}
    selected='S023';render();
    for(const id of ['league','role','age','eligibility','sort','alerts-only'])$(id).addEventListener('change',()=>{page=0;render();});
    $('search').addEventListener('input',()=>{page=0;render();});
    $('filters').addEventListener('submit',event=>event.preventDefault());
    $('reset').onclick=()=>{$('league').value='all';$('role').value='all';$('age').value='all';$('eligibility').value='eligible';$('sort').value='priority';$('alerts-only').checked=false;$('search').value='';page=0;render();};
    $('previous').onclick=()=>{page--;render();};$('next').onclick=()=>{page++;render();};
    $('player-rows').addEventListener('click',event=>{const row=event.target.closest('[data-player]');if(row)selectPlayer(row.dataset.player);});
    document.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>chooseTab(button.dataset.tab));
    $('export').onclick=exportView;$('sources-button').onclick=showSources;$('close-sources').onclick=()=>$('sources-dialog').close();
    $('dossier').addEventListener('mouseover',event=>{const target=event.target.closest('[data-chart-note]');if(target&&$('chart-tooltip'))$('chart-tooltip').textContent=target.dataset.chartNote;});
    $('dossier').addEventListener('focusin',event=>{const target=event.target.closest('[data-chart-note]');if(target&&$('chart-tooltip'))$('chart-tooltip').textContent=target.dataset.chartNote;});
  }catch(error){$('app-error').hidden=false;$('app-error').textContent=error.message;$('discovery-view').hidden=true;}
}
boot();
