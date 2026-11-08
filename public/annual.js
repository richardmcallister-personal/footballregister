// footballclub.wiki shared code for the Annual pages: theme, data, live ESPN layer, club entry, map helpers.
(function(){
const FCW={};
const root=document.documentElement;
const esc=s=>String(s??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
const fmt=n=>n==null||n===''?'—':Number(n).toLocaleString('en-GB');
FCW.esc=esc;FCW.fmt=fmt;
FCW.ORDER=['eng.1','eng.2','esp.1','ita.1','ger.1','fra.1','por.1','tur.1','sco.1','den.1','swe.1','irl.1','usa.1'];
FCW.RELEG={'eng.1':3,'eng.2':3,'tur.1':3,'esp.1':3,'ita.1':3,'ger.1':2,'fra.1':2,'sco.1':1,'irl.1':1,'swe.1':1,'den.1':1,'por.1':2,'usa.1':0};
FCW.slug=k=>k.replace('.','-');           // eng.1 -> eng-1 (safe in a URL hash)
FCW.unslug=s=>s.replace('-','.');

// ---------- theme: saved choice wins, otherwise the device setting ----------
const darkMQ=matchMedia('(prefers-color-scheme: dark)');
FCW.isDark=()=>root.dataset.theme?root.dataset.theme==='dark':darkMQ.matches;
function paintThemeUI(){
  const dark=FCW.isDark();
  document.querySelectorAll('meta[name="theme-color"]').forEach(m=>m.setAttribute('content',dark?'#131512':'#F8F6F1'));
  const b=document.getElementById('theme');if(b){b.textContent=dark?'Light mode':'Dark mode';b.setAttribute('aria-pressed',String(dark))}
}
FCW.initTheme=function(onChange){
  let saved=null;try{saved=localStorage.getItem('ecr-theme')}catch(e){}
  if(saved==='light'||saved==='dark')root.dataset.theme=saved;
  paintThemeUI();
  const b=document.getElementById('theme');
  if(b)b.onclick=()=>{const t=FCW.isDark()?'light':'dark';root.dataset.theme=t;try{localStorage.setItem('ecr-theme',t)}catch(e){}paintThemeUI();onChange&&onChange()};
  darkMQ.addEventListener('change',()=>{if(!root.dataset.theme){paintThemeUI();onChange&&onChange()}});
};
FCW.css=n=>getComputedStyle(root).getPropertyValue(n).trim();

// ---------- data ----------
FCW.load=async function(extra=[]){
  const get=f=>fetch('/data/'+f+'.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error(f);return r.json()});
  const [clubs,snap,...rest]=await Promise.all([get('clubs'),get('snapshot'),...extra.map(f=>get(f).catch(()=>null))]);
  const D={L:clubs.leagues,clubs:clubs.clubs,snap};
  extra.forEach((f,i)=>D[f]=rest[i]);
  D.byId=Object.fromEntries(D.clubs.map(c=>[c.espn_id,c]));
  D.live={standings:{...snap.standings},teams:{...snap.teams},mode:'snapshot',at:snap.generated};
  return D;
};
FCW.crest=c=>'/img/crests/'+c.espn_id+'.png';
FCW.rankOf=(D,c)=>(D.live.standings[c.league]||[]).find(r=>r.id===c.espn_id)||null;
FCW.teamLive=(D,c)=>D.live.teams[c.espn_id]||{competitions:[],next:null};
FCW.shortComp=n=>String(n||'').replace('English League Championship','Championship').replace('Turkish Super Lig','Süper Lig').replace('Turkish Cup','Türkiye Kupası').replace('Turkish ','').replace('Danish ','').replace('Portuguese ','').replace('CONCACAF ','').replace('Scottish ','').replace('Swedish ','').replace('League of Ireland ','LOI ').replace('English ','').replace('Spanish ','').replace('Italian ','').replace('German ','').replace('French ','').replace('LALIGA','La Liga').replace('UEFA ','').replace('German Cup','DFB-Pokal');
FCW.fmtDate=iso=>{const d=new Date(iso);return isNaN(d)?'':d.toLocaleString('en-GB',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})};
FCW.ord=n=>n+(n%10===1&&n%100!==11?'st':n%10===2&&n%100!==12?'nd':n%10===3&&n%100!==13?'rd':'th');
const R=Math.PI/180;
FCW.dist=(a,b)=>{const dp=(b.lat-a.lat)*R,dl=(b.lon-a.lon)*R;const h=Math.sin(dp/2)**2+Math.cos(a.lat*R)*Math.cos(b.lat*R)*Math.sin(dl/2)**2;return 12742*Math.asin(Math.sqrt(h))};
FCW.km=k=>k<10?k.toFixed(1):String(Math.round(k));
FCW.nearest=(D,c,n=4)=>D.clubs.filter(d=>d!==c&&d.lat!=null&&(d.league==='usa.1')===(c.league==='usa.1')).map(d=>[FCW.dist(c,d),d]).sort((a,b)=>a[0]-b[0]).slice(0,n);

// ---------- live layer (ESPN public feed); the snapshot stands when it can't be reached ----------
const BASE='https://site.api.espn.com/apis';
async function j(u){const ac=new AbortController();const t=setTimeout(()=>ac.abort(),9000);try{const r=await fetch(u,{cache:'no-store',signal:ac.signal});if(!r.ok)throw new Error(r.status);return r.json()}finally{clearTimeout(t)}}
FCW.refreshStandings=async function(D,leagues){
  const settled=await Promise.allSettled((leagues||FCW.ORDER).filter(lg=>!D.L[lg].static).map(async lg=>{
    const d=await j(`${BASE}/v2/sports/soccer/${lg}/standings`);
    const rows=[];(d.children||[]).forEach(ch=>ch.standings.entries.forEach(e=>{const st={};e.stats.forEach(s=>st[s.name]=s.displayValue);
      rows.push({id:e.team.id,name:e.team.displayName,rank:+st.rank,pts:st.points,p:st.gamesPlayed,w:st.wins,d:st.ties,l:st.losses,gd:st.pointDifferential,conf:(d.children.length>1?ch.name.replace(/ Conference$/,''):null)})}));
    return [lg,rows];
  }));
  const res=settled.filter(x=>x.status==='fulfilled').map(x=>x.value);
  if(!res.length)throw new Error('ESPN unreachable');
  res.forEach(([lg,rows])=>{if(rows.length)D.live.standings[lg]=rows});
  D.live.at=new Date().toISOString();D.live.mode='live';
};
FCW.refreshTeam=async function(D,id){
  const s=await j(`${BASE}/site/v2/sports/soccer/all/teams/${id}/schedule?fixture=true`);
  const comps=[];let next=null;
  (s.events||[]).forEach(ev=>{const lg=ev.league&&ev.league.name;if(lg&&!comps.includes(lg))comps.push(lg);const c=ev.competitions[0];
    if(!next&&c.status.type.state==='pre'){const h=c.competitors.find(x=>x.homeAway==='home'),a=c.competitors.find(x=>x.homeAway==='away');next={date:ev.date,home:h.team.displayName,away:a.team.displayName,home_id:h.team.id,away_id:a.team.id,comp:lg,venue:c.venue&&c.venue.fullName}}});
  D.live.teams[id]={competitions:comps,next};
};
FCW.refreshRoster=async function(D,c){
  if(D.L[c.league].static)return null;
  try{const d=await j(`${BASE}/site/v2/sports/soccer/${c.league}/teams/${c.espn_id}/roster`);
    const P={Goalkeeper:'GK',Defender:'DF',Midfielder:'MF',Forward:'FW',Attacker:'FW'};
    const pl=(d.athletes||[]).map(a=>({no:/^\d+$/.test(a.jersey||'')?+a.jersey:null,name:a.displayName,pos:P[(a.position||{}).name]||'—',nat:a.citizenship,age:a.age}));
    return pl.length?pl:null}catch(e){return null}
};
FCW.feedLine=function(D){
  const el=document.getElementById('feed');if(!el)return;
  const when=new Date(D.live.at).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
  el.innerHTML=`<i class="${D.live.mode==='live'?'live':''}"></i>${D.live.mode==='live'?'Live from ESPN':'Daily snapshot'} · ${esc(when)}`;
};

// ---------- club entry ----------
FCW.honours=function(D,c){
  const p=[];
  if(c.league==='usa.1'){
    if(c.league_titles)p.push('MLS Cup '+c.league_titles);if(c.supporters_shield)p.push('Supporters’ Shield '+c.supporters_shield);
    if(c.cup_wins)p.push(esc(c.cup_name)+' '+c.cup_wins);if(c.ucl)p.push('CONCACAF Champions Cup '+c.ucl);
  }else{
    const lab=D.L[c.league].titles_label||'League';
    if(c.league_titles)p.push(lab+' '+c.league_titles);if(c.cup_wins)p.push(esc(c.cup_name)+' '+c.cup_wins);
    if(c.ucl)p.push('European Cup '+c.ucl);if(c.uel)p.push('Europa League '+c.uel);if(c.uecl)p.push('Conference League '+c.uecl);
  }
  return p.length?p.join(' · '):'No major honours yet';
};
const row=(t,v)=>v?`<div><dt>${t}</dt><dd>${v}</dd></div>`:'';
FCW.factsHTML=function(D,c){
  const r=FCW.rankOf(D,c);
  return `<dl class="facts">
    ${r?row('Position',`${FCW.ord(r.rank)}${r.conf?' in the '+esc(r.conf)+' Conference':''} · ${esc(r.pts)} pts from ${esc(r.p)}`):''}
    ${row('Ground',esc(c.stadium)+(c.capacity?', '+fmt(c.capacity):''))}
    ${row('Manager',esc(c.manager))}${row('Captain',esc(c.captain))}
    ${row('Record scorer',c.record_scorer?esc(c.record_scorer)+(c.record_scorer_goals?', '+c.record_scorer_goals:''):'')}
    ${row('Most appearances',c.record_apps?esc(c.record_apps)+(c.record_apps_count?', '+c.record_apps_count:''):'')}</dl>`;
};
FCW.nextHTML=function(D,c){
  const n=FCW.teamLive(D,c).next;
  if(!n)return `<div class="next"><b>No fixture scheduled</b></div>`;
  return `<div class="next"><b>${esc(n.home)} v ${esc(n.away)}</b><span>${esc(FCW.fmtDate(n.date))}${n.venue?' · '+esc(n.venue):''}${n.comp?' · '+esc(FCW.shortComp(n.comp)):''}</span></div>`;
};
FCW.photoHTML=c=>c.has_photo?`<figure class="photo"><img src="/img/grounds/${c.espn_id}.jpg" alt="${esc(c.stadium)}" loading="lazy"><figcaption>${esc(c.stadium)}${c.stadium_credit?` · <a href="${esc(c.stadium_credit)}" target="_blank" rel="noopener">photo · Wikimedia</a>`:''}</figcaption></figure>`:'';
FCW.headHTML=(D,c,tag='h2')=>`<div class="head"><img src="${FCW.crest(c)}" alt=""><div><${tag}>${esc(c.name)}</${tag}><div class="sub">${esc(D.L[c.league].name)} · Est. ${c.founded??'—'} · ${esc(c.city)}</div></div></div>`;
FCW.nearHTML=(D,c,asLinks)=>`<ul class="near">${FCW.nearest(D,c).map(([km,d])=>asLinks
  ?`<li><a href="/club/#c${d.espn_id}"><img src="${FCW.crest(d)}" alt=""><span>${esc(d.stadium)} · ${esc(d.name)}</span><b>${FCW.km(km)} km</b></a></li>`
  :`<li><button type="button" data-id="${d.espn_id}"><img src="${FCW.crest(d)}" alt=""><span>${esc(d.stadium)} · ${esc(d.name)}</span><b>${FCW.km(km)} km</b></button></li>`).join('')}</ul>`;

// ---------- search: clubs, grounds, cities, managers ----------
FCW.attachSearch=function(D,input,list,href=c=>'/club/#c'+c.espn_id,onPick){
  input.addEventListener('input',()=>{const t=input.value.trim().toLowerCase();if(!t){list.hidden=true;return}
    const hits=D.clubs.filter(c=>[c.name,c.stadium,c.city,c.manager,c.captain].some(x=>String(x||'').toLowerCase().includes(t))).slice(0,8);
    list.innerHTML=hits.length?hits.map(c=>`<li><a href="${href(c)}" data-id="${c.espn_id}"><img src="${FCW.crest(c)}" alt="">${esc(c.name)}<small>${esc(c.stadium)}</small></a></li>`).join(''):'<li class="none">No club, ground or city matches that.</li>';
    list.hidden=false;
    if(onPick)list.querySelectorAll('a').forEach(a=>a.onclick=e=>{e.preventDefault();list.hidden=true;input.value='';onPick(D.byId[a.dataset.id])});});
  input.addEventListener('keydown',e=>{if(e.key==='Escape'){list.hidden=true;input.value=''}});
  document.addEventListener('click',e=>{if(!e.target.closest('.search'))list.hidden=true});
};

// ---------- map: OpenFreeMap tiles recoloured to the Annual, crests as markers ----------
FCW.mapStyle=()=>FCW.isDark()?'https://tiles.openfreemap.org/styles/dark':'https://tiles.openfreemap.org/styles/positron';
FCW.restyle=function(map){
  const css=FCW.css,set=(id,p,v)=>{try{map.setPaintProperty(id,p,v)}catch(e){}};
  for(const l of map.getStyle().layers){const id=l.id;
    if(l.type==='background')set(id,'background-color',css('--m-bg'));
    else if(l.type==='fill'){
      if(/water|ocean|lake|river/.test(id))set(id,'fill-color',css('--m-water'));
      else if(/park|wood|forest|grass|landcover|green/.test(id))set(id,'fill-color',css('--m-park'));
      else if(/building/.test(id))set(id,'fill-color',css('--m-building'));
      else if(/landuse|residential|urban|industrial|commercial/.test(id))set(id,'fill-color',css('--m-urban'));}
    else if(l.type==='line'){
      if(/water|river|stream|canal|waterway/.test(id))set(id,'line-color',css('--m-water'));
      else if(/boundary|admin/.test(id))set(id,'line-color',css('--m-border'));
      else if(/rail|transit/.test(id))set(id,'line-color',css('--m-rail'));
      else if(/casing|case/.test(id))set(id,'line-color',css('--m-road-case'));
      else if(/motorway|trunk/.test(id))set(id,'line-color',css('--m-motorway'));
      else if(/road|highway|street|path|minor|primary|secondary|tertiary|service|bridge|tunnel/.test(id))set(id,'line-color',css('--m-road'));}
    else if(l.type==='symbol'&&l.layout&&l.layout['text-field']){
      const minor=/poi|road|street|highway|water/.test(id);
      set(id,'text-color',css(minor?'--m-label2':'--m-label'));set(id,'text-halo-color',css('--m-halo'));set(id,'text-halo-width',1.4);}
  }
};
const crestImgs={};
FCW.loadCrests=clubs=>Promise.all(clubs.map(c=>crestImgs[c.espn_id]?0:new Promise(res=>{const im=new Image();im.onload=()=>{crestImgs[c.espn_id]=im;res()};im.onerror=res;im.src=FCW.crest(c)})));
// opts: {clubs, scale, labelsFrom, onClick}
FCW.addClubLayers=function(map,opts){
  if(map.getSource('clubs'))return;
  const css=FCW.css,s=opts.scale||1;
  for(const id in crestImgs){if(!map.hasImage('crest-'+id))map.addImage('crest-'+id,crestImgs[id],{pixelRatio:2})}
  map.addSource('clubs',{type:'geojson',promoteId:'id',data:{type:'FeatureCollection',features:opts.clubs.filter(c=>c.lat!=null).map(c=>({type:'Feature',geometry:{type:'Point',coordinates:[c.lon,c.lat]},
    properties:{id:c.espn_id,name:c.name,stadium:c.stadium,league:c.league,cap:c.capacity||0,icon:'crest-'+c.espn_id}}))}});
  map.addLayer({id:'club-halo',type:'circle',source:'clubs',paint:{
    'circle-color':css('--land'),
    'circle-radius':['interpolate',['linear'],['zoom'],2,7.5*s,5,11.5*s,9,17.5*s,14,24*s],
    'circle-stroke-color':['case',['boolean',['feature-state','sel'],false],css('--ring'),css('--border')],
    'circle-stroke-width':['case',['boolean',['feature-state','sel'],false],3,1]}});
  map.addLayer({id:'club-crest',type:'symbol',source:'clubs',layout:{
    'icon-image':['get','icon'],'icon-size':['interpolate',['linear'],['zoom'],2,.26*s,5,.4*s,9,.62*s,14,.85*s],
    'icon-allow-overlap':true,'icon-ignore-placement':true,'symbol-sort-key':['get','cap'],
    'text-field':['step',['zoom'],'',opts.labelsFrom||9,['get','stadium']],'text-font':['Noto Sans Bold'],'text-size':12,
    'text-anchor':'left','text-offset':[1.6,0],'text-optional':true},
    paint:{'text-color':css('--ink'),'text-halo-color':css('--land'),'text-halo-width':1.6}});
  if(opts.onClick){for(const id of ['club-crest','club-halo']){
    map.on('click',id,e=>{const f=e.features&&e.features[0];if(f)opts.onClick(f.properties.id)});
    map.on('mouseenter',id,()=>map.getCanvas().style.cursor='pointer');map.on('mouseleave',id,()=>map.getCanvas().style.cursor='')}}
};
FCW.dimLeague=function(map,league){
  if(!map.getLayer('club-crest'))return;
  const on=['any',['==',league,'all'],['==',['get','league'],league]];
  map.setPaintProperty('club-crest','icon-opacity',['case',on,1,.16]);
  map.setPaintProperty('club-crest','text-opacity',['case',on,1,0]);
  map.setPaintProperty('club-halo','circle-opacity',['case',on,1,.16]);
  map.setPaintProperty('club-halo','circle-stroke-opacity',['case',on,1,.16]);
};
FCW.makeMap=function(el,opts){
  const map=new maplibregl.Map({container:el,style:FCW.mapStyle(),center:opts.center||[8,50],zoom:opts.zoom||3.6,minZoom:2,maxZoom:18,
    attributionControl:{compact:true},dragRotate:false,pitchWithRotate:false,touchPitch:false,cooperativeGestures:!!opts.cooperative});
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
  if(opts.scaleBar!==false)map.addControl(new maplibregl.ScaleControl({unit:'metric'}),'bottom-left');
  let sel=null;
  const ready=()=>{FCW.restyle(map);FCW.addClubLayers(map,opts);if(opts.onReady)opts.onReady();if(sel)map.setFeatureState({source:'clubs',id:sel},{sel:true})};
  map.on('style.load',ready);if(map.style&&map.style._loaded)ready();map.once('idle',ready);
  map.select=id=>{if(!map.getSource('clubs')){sel=id;return}if(sel)map.setFeatureState({source:'clubs',id:sel},{sel:false});sel=id;if(id)map.setFeatureState({source:'clubs',id},{sel:true})};
  map.once('load',()=>{const a=map.getContainer().querySelector('.maplibregl-ctrl-attrib');if(a)a.classList.remove('maplibregl-compact-show')});
  map.retheme=()=>map.setStyle(FCW.mapStyle());
  return map;
};

FCW.registerSW=()=>{if('serviceWorker' in navigator&&location.protocol!=='file:')addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}))};
window.FCW=FCW;
})();
