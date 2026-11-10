// footballclub.wiki shared code for the Annual pages: theme, data, live ESPN layer, club entry, map helpers.
(function(){
const FCW={};
const root=document.documentElement;
const esc=s=>String(s??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
const fmt=n=>n==null||n===''?'—':Number(n).toLocaleString('en-GB');
FCW.esc=esc;FCW.fmt=fmt;
FCW.ORDER=['eng.1','eng.2','eng.3','esp.1','esp.2','ita.1','ita.2','ger.1','ger.2','fra.1','fra.2','ned.1','por.1','bel.1','tur.1','aut.1','gre.1','sco.1','sco.2','den.1','nor.1','swe.1','irl.1','usa.1','mex.1','bra.1','arg.1'];
FCW.RELEG={'eng.1':3,'eng.2':3,'tur.1':3,'esp.1':3,'ita.1':3,'ger.1':2,'fra.1':2,'sco.1':1,'irl.1':1,'swe.1':1,'den.1':1,'por.1':2,'usa.1':0,'ger.2':2,'ned.1':1,'bel.1':1,'mex.1':0,'bra.1':4,'arg.1':0,'aut.1':1,'gre.1':2,'nor.1':2,'sco.2':1,'eng.3':4,'esp.2':4,'ita.2':3,'fra.2':2};
FCW.region=(D,k)=>(D.L[k]&&D.L[k].region)||'eu';
FCW.confLabel=cf=>/^(Eastern|Western)$/.test(cf)?cf+' Conference':cf;
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
FCW.shortComp=n=>String(n||'').replace('Mexican Liga BBVA MX','Liga MX').replace('Brazilian Serie A','Brasileirão').replace('Argentine Liga Profesional de Fútbol','Liga Profesional').replace('German 2. Bundesliga','2. Bundesliga').replace('Austrian ','').replace('Greek ','').replace('Norwegian ','').replace('Dutch ','').replace('Belgian ','').replace('Mexican ','').replace('Brazilian ','').replace('Argentine ','').replace('CONMEBOL ','').replace('English League Championship','Championship').replace('Turkish Super Lig','Süper Lig').replace('Turkish Cup','Türkiye Kupası').replace('Turkish ','').replace('Danish ','').replace('Portuguese ','').replace('CONCACAF ','').replace('Scottish ','').replace('Swedish ','').replace('League of Ireland ','LOI ').replace('English ','').replace('Spanish ','').replace('Italian ','').replace('German ','').replace('French ','').replace('LALIGA','La Liga').replace('UEFA ','').replace('German Cup','DFB-Pokal');
FCW.fmtDate=iso=>{const d=new Date(iso);return isNaN(d)?'':d.toLocaleString('en-GB',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})};
FCW.ord=n=>n+(n%10===1&&n%100!==11?'st':n%10===2&&n%100!==12?'nd':n%10===3&&n%100!==13?'rd':'th');
const R=Math.PI/180;
FCW.dist=(a,b)=>{const dp=(b.lat-a.lat)*R,dl=(b.lon-a.lon)*R;const h=Math.sin(dp/2)**2+Math.cos(a.lat*R)*Math.cos(b.lat*R)*Math.sin(dl/2)**2;return 12742*Math.asin(Math.sqrt(h))};
FCW.km=k=>k<10?k.toFixed(1):String(Math.round(k));
FCW.nearest=(D,c,n=4)=>D.clubs.filter(d=>d!==c&&d.lat!=null&&FCW.region(D,d.league)===FCW.region(D,c.league)).map(d=>[FCW.dist(c,d),d]).sort((a,b)=>a[0]-b[0]).slice(0,n);

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
  }else if(D.L[c.league].cont_long){
    const CL=D.L[c.league].cont_long,lab=D.L[c.league].titles_label||'League';
    if(c.league_titles)p.push(lab+' '+c.league_titles);if(c.cup_wins)p.push(esc(c.cup_name)+' '+c.cup_wins);
    if(c.ucl)p.push(CL[0].replace(/^the /,'')+' '+c.ucl);if(c.uel)p.push(CL[1].replace(/^the /,'')+' '+c.uel);
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
    ${r?row('Position',`${FCW.ord(r.rank)}${r.conf?' in the '+esc(FCW.confLabel(r.conf)):''} · ${esc(r.pts)} pts from ${esc(r.p)}`):''}
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

// ---------- matchday programme: upcoming fixtures, a cover for the biggest, a grid for the rest ----------
FCW.fixtures=function(D,leagues){
  const now=Date.now(),seen=new Set(),out=[];
  for(const c of D.clubs){
    if(leagues&&!leagues.includes(c.league))continue;
    const n=FCW.teamLive(D,c).next;if(!n)continue;
    const t=new Date(n.date).getTime();if(!(t>now-2*3600e3))continue;
    const h=D.byId[n.home_id],a=D.byId[n.away_id];if(!h||!a)continue;
    const k=n.home_id+'-'+n.away_id+'-'+n.date;if(seen.has(k))continue;seen.add(k);
    out.push({...n,t,h,a});
  }
  return out.sort((x,y)=>x.t-y.t);
};
// the week ahead from the first fixture, and the one to put on the cover: the biggest ground with a photo
FCW.week=list=>list.length?list.filter(f=>f.t<list[0].t+7*864e5):[];
FCW.pickCover=list=>[...list].sort((x,y)=>(y.h.has_photo?1:0)-(x.h.has_photo?1:0)||(y.h.capacity||0)-(x.h.capacity||0))[0]||null;
FCW.longDate=iso=>{const d=new Date(iso);return isNaN(d)?'':d.toLocaleString('en-GB',{weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'})};
FCW.coverHTML=function(D,f){
  if(!f)return '';
  const h=f.h,a=f.a,comp=f.comp?FCW.shortComp(f.comp):D.L[h.league].name;
  return `<section class="cover${h.has_photo?'':' bare'}" aria-label="Featured match">
    ${h.has_photo?`<img class="ph" src="/img/grounds/${h.espn_id}.jpg" alt="">`:''}
    <div class="cv wrap">
      <a class="cc" href="/club/#c${h.espn_id}"><img src="${FCW.crest(h)}" alt="${esc(h.name)}"></a>
      <div class="ct"><h2><a href="/club/#c${h.espn_id}">${esc(h.name)}</a> v <a href="/club/#c${a.espn_id}">${esc(a.name)}</a></h2>
        <p>${esc(FCW.longDate(f.date))} · ${esc(f.venue||h.stadium)}${h.capacity?', '+fmt(h.capacity):''} · ${esc(comp)}</p></div>
      <a class="cc" href="/club/#c${a.espn_id}"><img src="${FCW.crest(a)}" alt="${esc(a.name)}"></a>
    </div>
    ${h.has_photo&&h.stadium_credit?`<a class="credit" href="${esc(h.stadium_credit)}" target="_blank" rel="noopener">${esc(h.stadium)} · Wikimedia</a>`:''}
  </section>`;
};
FCW.clubCoverHTML=function(D,c){
  return `<section class="cover club-cover${c.has_photo?'':' bare'}" aria-label="${esc(c.name)}">
    ${c.has_photo?`<img class="ph" src="/img/grounds/${c.espn_id}.jpg" alt="${esc(c.stadium)}">`:''}
    <div class="cv wrap"><span class="cc"><img src="${FCW.crest(c)}" alt=""></span>
      <div class="ct"><h1>${esc(c.name)}</h1><p>${esc(D.L[c.league].name)} · Est. ${c.founded??'—'} · ${esc(c.stadium)}, ${esc(c.city)}</p></div></div>
    ${c.has_photo&&c.stadium_credit?`<a class="credit" href="${esc(c.stadium_credit)}" target="_blank" rel="noopener">${esc(c.stadium)} · Wikimedia</a>`:''}
  </section>`;
};
FCW.fixturesHTML=function(D,list,title){
  if(!list.length)return '';
  const day=t=>new Date(t).toLocaleString('en-GB',{weekday:'short'}),tm=t=>new Date(t).toLocaleString('en-GB',{hour:'2-digit',minute:'2-digit'});
  return `<section class="fixtures wrap" aria-label="${esc(title)}"><h2 class="big">${esc(title)}</h2><ul>
    ${list.map(f=>`<li><a href="/club/#c${f.h.espn_id}"><img src="${FCW.crest(f.h)}" alt=""><span class="hn">${esc(f.h.name)}</span><time datetime="${esc(f.date)}"><b>${day(f.t)}</b>${tm(f.t)}</time><span class="an">${esc(f.a.name)}</span><img src="${FCW.crest(f.a)}" alt=""></a></li>`).join('')}
  </ul></section>`;
};

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
  const map=new maplibregl.Map({container:el,style:FCW.mapStyle(),center:opts.center||[8,50],zoom:opts.zoom||3.6,minZoom:opts.minZoom||2,maxZoom:18,
    attributionControl:{compact:true},dragRotate:false,pitchWithRotate:false,touchPitch:false,cooperativeGestures:!!opts.cooperative});
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
  if(opts.scaleBar!==false)map.addControl(new maplibregl.ScaleControl({unit:'metric'}),'bottom-left');
  let sel=null,selSrc=opts.source||'clubs';const add=opts.addLayers||FCW.addClubLayers;
  const ready=()=>{FCW.restyle(map);add(map,opts);if(opts.onReady)opts.onReady();if(sel&&map.getSource(selSrc))map.setFeatureState({source:selSrc,id:sel},{sel:true})};
  map.on('style.load',ready);if(map.style&&map.style._loaded)ready();map.once('idle',ready);
  // select(id[, source]): nation ids start with "n" and live in the nations source
  map.select=(id,source)=>{const src=source||(id&&/^n\d/.test(String(id))?'nations':(opts.source||'clubs'));
    if(sel&&map.getSource(selSrc))map.setFeatureState({source:selSrc,id:sel},{sel:false});sel=id;selSrc=src;
    if(id&&map.getSource(src))map.setFeatureState({source:src,id},{sel:true})};
  map.once('load',()=>{const a=map.getContainer().querySelector('.maplibregl-ctrl-attrib');if(a)a.classList.remove('maplibregl-compact-show')});
  map.retheme=()=>map.setStyle(FCW.mapStyle());
  return map;
};

// ---------- nations: every FIFA member, the ranking, the record, the squad ----------
FCW.CONFS=[['UEFA','Europe'],['CONMEBOL','South America'],['CONCACAF','North and Central America'],['CAF','Africa'],['AFC','Asia'],['OFC','Oceania']];
FCW.confName=k=>(FCW.CONFS.find(c=>c[0]===k)||[k,k])[1];
// extra: 'nation_squads' | 'h2h' | 'worldcup2026' | 'clubs' (clubs come with the crest paths the squads link to)
FCW.loadNations=async function(extra=[]){
  const get=f=>fetch('/data/'+f+'.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error(f);return r.json()});
  const [N,live,...rest]=await Promise.all([get('nations'),get('nations_live').catch(()=>null),...extra.map(f=>get(f).catch(()=>null))]);
  const D={nations:N.nations,rankingUpdated:N.ranking_updated};
  extra.forEach((f,i)=>D[f]=rest[i]);
  if(D.clubs){D.L=D.clubs.leagues;D.clubs=D.clubs.clubs;D.clubById=Object.fromEntries(D.clubs.map(c=>[c.espn_id,c]))}
  D.byId=Object.fromEntries(D.nations.map(n=>[n.id,n]));D.byEspn=Object.fromEntries(D.nations.map(n=>[n.espn_id,n]));D.byName=Object.fromEntries(D.nations.map(n=>[n.name,n]));
  D.live={teams:{...((live&&live.teams)||{})},mode:'snapshot',at:(live&&live.generated)||new Date().toISOString()};
  const rk=live&&live.ranking;
  if(rk&&rk.rows){D.rankingUpdated=rk.updated||D.rankingUpdated;for(const n of D.nations){const r=rk.rows[n.name];if(r){n.rank=r[0];n.rank_move=r[1];n.rank_pts=r[2]}}}
  D.nations.sort((a,b)=>(a.rank||999)-(b.rank||999)||a.name.localeCompare(b.name));
  return D;
};
FCW.flag=n=>'/img/flags/'+n.id+'.png';
// association crest: files are named by an ascii slug of the nation's name
FCW.nslug=n=>n.name.normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
FCW.ncrest=n=>'/img/national-crests/'+FCW.nslug(n)+'.png';
// flag then crest, the pair used wherever a nation is named
FCW.nmarks=(n,cls='')=>`<img class="flagimg${cls?' '+cls:''}" src="${FCW.flag(n)}" alt=""><img class="ncrest${cls?' '+cls:''}" src="${FCW.ncrest(n)}" alt="" loading="lazy">`;
FCW.nationLive=(D,n)=>D.live.teams[n.espn_id]||{competitions:[],next:null};
FCW.refreshNation=async function(D,n){
  const s=await j(`${BASE}/site/v2/sports/soccer/all/teams/${n.espn_id}/schedule?fixture=true`);
  const comps=[];let next=null;
  (s.events||[]).forEach(ev=>{const lg=ev.league&&ev.league.name;if(lg&&!comps.includes(lg))comps.push(lg);const c=ev.competitions[0];
    if(!next&&c.status.type.state==='pre'){const h=c.competitors.find(x=>x.homeAway==='home'),a=c.competitors.find(x=>x.homeAway==='away');next={date:ev.date,home:h.team.displayName,away:a.team.displayName,home_id:h.team.id,away_id:a.team.id,comp:lg,venue:c.venue&&c.venue.fullName}}});
  D.live.teams[n.espn_id]={competitions:comps,next};D.live.mode='live';D.live.at=new Date().toISOString();
};
FCW.move=m=>m==null?'':m>0?`<span class="mv up">▲${m}</span>`:m<0?`<span class="mv down">▼${-m}</span>`:'<span class="mv">—</span>';
FCW.nationHonours=function(n){
  const p=[];
  if(n.wc.titles)p.push('World Cup '+n.wc.titles);
  if(n.reg&&n.reg.titles)p.push(esc(n.reg.name)+' '+n.reg.titles);
  if(n.reg2&&n.reg2.titles)p.push(esc(n.reg2.name)+' '+n.reg2.titles);
  return p.length?p.join(' · '):'No World Cup or continental title yet';
};
FCW.nationFactsHTML=function(D,n){
  const rank=n.rank?`${FCW.ord(n.rank)} ${FCW.move(n.rank_move)}${n.rank_pts?' · '+n.rank_pts.toFixed(0)+' pts':''}`:'';
  const span=n.fifa_max&&n.fifa_min?`Highest ${FCW.ord(n.fifa_max)}, lowest ${FCW.ord(n.fifa_min)}`:'';
  const wc=n.wc.apps?`${n.wc.apps} ${n.wc.apps===1?'appearance':'appearances'}${n.wc.first?' since '+n.wc.first:''}${n.wc.best?' · '+esc(n.wc.best):''}`:'Never qualified';
  const reg=n.reg?(n.reg.apps?`${n.reg.apps} ${n.reg.apps===1?'appearance':'appearances'}${n.reg.first?' since '+n.reg.first:''}${n.reg.best?' · '+esc(n.reg.best):''}`:(n.reg.best?esc(n.reg.best):'')):'';
  return `<dl class="facts">
    ${row('FIFA ranking',rank)}${row('Ranking range',span)}
    ${row('Confederation',esc(n.conf)+(n.conf_long?' · '+esc(n.conf_long):''))}${row('Association',esc(n.assoc))}
    ${row('Head coach',esc(n.coach))}${row('Captain',esc(n.captain))}
    ${row('Most caps',n.most_caps?esc(n.most_caps)+(n.most_caps_n?', '+n.most_caps_n:''):'')}
    ${row('Top scorer',n.top_scorer?esc(n.top_scorer)+(n.top_scorer_n?', '+n.top_scorer_n:''):'')}
    ${row('Home ground',FCW.groundLine(n))}
    ${row('World Cup',wc)}${n.reg?row(esc(n.reg.name),reg):''}${n.reg2&&n.reg2.best?row(esc(n.reg2.name),esc(n.reg2.best)):''}</dl>`;
};
FCW.nationNextHTML=function(D,n){
  const x=FCW.nationLive(D,n).next;
  if(!x)return `<div class="next"><b>No fixture scheduled</b></div>`;
  const nm=(id,name)=>{const t=D.byEspn[id];return t?`<a href="/nation/#${t.id}">${esc(t.name)}</a>`:esc(name)};
  return `<div class="next"><b>${nm(x.home_id,x.home)} v ${nm(x.away_id,x.away)}</b><span>${esc(FCW.fmtDate(x.date))}${x.venue?' · '+esc(x.venue):''}${x.comp?' · '+esc(FCW.shortComp(x.comp)):''}</span></div>`;
};
FCW.nationHeadHTML=(D,n,tag='h2')=>`<div class="head nat">${FCW.nmarks(n)}<div><${tag}>${esc(n.name)}</${tag}><div class="sub">${esc(FCW.confName(n.conf))}${n.rank?' · FIFA ranking '+FCW.ord(n.rank):''}${n.nickname?' · '+esc(n.nickname):''}</div></div></div>`;
FCW.groundLine=n=>n.venues&&n.venues.length?'Various grounds, most often in '+n.venues.map(esc).join(', '):(n.stadium?esc(n.stadium)+(n.capacity?', '+fmt(n.capacity):''):'');
FCW.nationCoverHTML=function(D,n){
  const bits=[esc(n.conf)+(n.conf_long?' · '+esc(n.conf_long):''),n.rank?'FIFA ranking '+FCW.ord(n.rank):'',n.has_photo?FCW.groundLine(n):''].filter(Boolean);
  return `<section class="cover nation-cover${n.has_photo?'':' bare'}" aria-label="${esc(n.name)}">
    ${n.has_photo?`<img class="ph" src="/img/grounds/${n.id}.jpg" alt="${esc(n.stadium)}">`:''}
    <div class="cv wrap"><span class="cc flag"><img src="${FCW.flag(n)}" alt=""><img class="ncrest" src="${FCW.ncrest(n)}" alt=""></span>
      <div class="ct"><h1>${esc(n.name)}</h1><p>${bits.join(' · ')}</p></div></div>
    ${n.has_photo&&n.stadium_credit?`<a class="credit" href="${esc(n.stadium_credit)}" target="_blank" rel="noopener">${esc(n.stadium)} · Wikimedia</a>`:''}
  </section>`;
};
FCW.nationPhotoHTML=n=>n.has_photo?`<figure class="photo"><img src="/img/grounds/${n.id}.jpg" alt="${esc(n.stadium)}" loading="lazy"><figcaption>${esc(n.stadium)}${n.stadium_credit?` · <a href="${esc(n.stadium_credit)}" target="_blank" rel="noopener">photo · Wikimedia</a>`:''}</figcaption></figure>`:'';
FCW.showNations=function(map,on){
  for(const id of ['nation-crest','nation-ring']){if(map.getLayer(id))map.setLayoutProperty(id,'visibility',on?'visible':'none')}
  for(const id of ['club-crest','club-halo']){if(map.getLayer(id))map.setLayoutProperty(id,'visibility',on?'none':'visible')}
};
// upcoming internationals where both sides are in the register
FCW.nationFixtures=function(D,list){
  const now=Date.now(),seen=new Set(),out=[];
  for(const n of (list||D.nations)){
    const x=FCW.nationLive(D,n).next;if(!x)continue;
    const t=new Date(x.date).getTime();if(!(t>now-2*3600e3))continue;
    const h=D.byEspn[x.home_id],a=D.byEspn[x.away_id];if(!h||!a)continue;
    const k=x.home_id+'-'+x.away_id+'-'+x.date;if(seen.has(k))continue;seen.add(k);
    out.push({...x,t,h,a});
  }
  return out.sort((x,y)=>x.t-y.t);
};
FCW.nationFixturesHTML=function(D,list,title){
  if(!list.length)return '';
  const day=t=>new Date(t).toLocaleString('en-GB',{weekday:'short',day:'numeric',month:'short'}),tm=t=>new Date(t).toLocaleString('en-GB',{hour:'2-digit',minute:'2-digit'});
  return `<section class="fixtures nat wrap" aria-label="${esc(title)}"><h2 class="big">${esc(title)}</h2><ul>
    ${list.map(f=>`<li><a href="/nation/#${f.h.id}"><span class="mk">${FCW.nmarks(f.h)}</span><span class="hn">${esc(f.h.name)}</span><time datetime="${esc(f.date)}" title="${esc(FCW.shortComp(f.comp||''))}"><b>${day(f.t)}</b>${tm(f.t)}</time><span class="an">${esc(f.a.name)}</span><span class="mk rev">${FCW.nmarks(f.a)}</span></a></li>`).join('')}
  </ul></section>`;
};
FCW.attachNationSearch=function(D,input,list,onPick){
  input.addEventListener('input',()=>{const t=input.value.trim().toLowerCase();if(!t){list.hidden=true;return}
    const hits=D.nations.filter(n=>[n.name,n.code,n.nickname,n.coach,n.captain,n.stadium].some(x=>String(x||'').toLowerCase().includes(t))).slice(0,8);
    list.innerHTML=hits.length?hits.map(n=>`<li><a href="/nation/#${n.id}" data-id="${n.id}"><img src="${FCW.flag(n)}" alt="">${esc(n.name)}<small>${n.rank?FCW.ord(n.rank):''} · ${esc(n.conf)}</small></a></li>`).join(''):'<li class="none">No nation matches that.</li>';
    list.hidden=false;
    if(onPick)list.querySelectorAll('a').forEach(a=>a.onclick=e=>{e.preventDefault();list.hidden=true;input.value='';onPick(D.byId[a.dataset.id])});});
  input.addEventListener('keydown',e=>{if(e.key==='Escape'){list.hidden=true;input.value=''}});
  document.addEventListener('click',e=>{if(!e.target.closest('.search'))list.hidden=true});
};
// association crests as map markers, as clubs use their crests
const ncrestImgs={};
FCW.loadNationCrests=nations=>Promise.all(nations.map(n=>ncrestImgs[n.id]?0:new Promise(res=>{const im=new Image();
  im.onload=()=>{ncrestImgs[n.id]=im;res()};im.onerror=res;im.src=FCW.ncrest(n)})));
FCW.addNationLayers=function(map,opts){
  if(map.getSource('nations'))return;
  const css=FCW.css,s=opts.scale||1;
  for(const id in ncrestImgs){if(!map.hasImage('ncrest-'+id))map.addImage('ncrest-'+id,ncrestImgs[id],{pixelRatio:2})}
  map.addSource('nations',{type:'geojson',promoteId:'id',data:{type:'FeatureCollection',features:opts.nations.filter(n=>n.lat!=null).map(n=>({type:'Feature',geometry:{type:'Point',coordinates:[n.lon,n.lat]},
    properties:{id:n.id,name:n.name,conf:n.conf,rank:n.rank||300,icon:'ncrest-'+n.id}}))}});
  map.addLayer({id:'nation-ring',type:'circle',source:'nations',paint:{
    'circle-color':css('--land'),
    'circle-radius':['interpolate',['linear'],['zoom'],1,11*s,4,15*s,8,21*s],
    'circle-stroke-color':['case',['boolean',['feature-state','sel'],false],css('--ring'),css('--border')],
    'circle-stroke-width':['case',['boolean',['feature-state','sel'],false],3,1]}});
  map.addLayer({id:'nation-crest',type:'symbol',source:'nations',layout:{
    'icon-image':['get','icon'],'icon-size':['interpolate',['linear'],['zoom'],1,.3*s,4,.42*s,8,.6*s],
    'icon-allow-overlap':true,'icon-ignore-placement':true,'symbol-sort-key':['get','rank'],
    'text-field':['step',['zoom'],'',opts.labelsFrom||4,['get','name']],'text-font':['Noto Sans Bold'],'text-size':12,
    'text-anchor':'top','text-offset':[0,1.1],'text-optional':true},
    paint:{'text-color':css('--ink'),'text-halo-color':css('--land'),'text-halo-width':1.6}});
  if(opts.onClick){for(const id of ['nation-crest','nation-ring']){
    map.on('click',id,e=>{const f=e.features&&e.features[0];if(f)opts.onClick(f.properties.id)});
    map.on('mouseenter',id,()=>map.getCanvas().style.cursor='pointer');map.on('mouseleave',id,()=>map.getCanvas().style.cursor='')}}
};
FCW.dimConf=function(map,conf){
  if(!map.getLayer('nation-crest'))return;
  const on=['any',['==',conf,'all'],['==',['get','conf'],conf]];
  map.setPaintProperty('nation-crest','icon-opacity',['case',on,1,.14]);
  map.setPaintProperty('nation-crest','text-opacity',['case',on,1,0]);
};
FCW.makeNationMap=(el,opts)=>FCW.makeMap(el,{...opts,source:'nations',addLayers:FCW.addNationLayers,minZoom:1,zoom:opts.zoom||1.4,center:opts.center||[10,20]});

// ---------- site footer: the sections, the leagues, the nations, and the other .wiki sites ----------
FCW.SITES=[['https://manutd.wiki/','Manchester United','manutd.wiki','manutd'],
  ['https://irelandfootball.wiki/','Ireland Football','irelandfootball.wiki','irelandfootball'],
  ['https://irelandrugby.wiki/','Ireland Rugby','irelandrugby.wiki','irelandrugby'],
  ['https://limerickhurling.wiki/','Limerick Hurling','limerickhurling.wiki','limerickhurling']];
FCW.siteFooter=function(){
  const f=document.querySelector('footer.colophon');if(!f||f.querySelector('.sitefoot'))return;
  const col=(h,links)=>`<div class="fcol"><h2>${esc(h)}</h2><ul>${links.map(l=>`<li><a href="${l[0]}">${esc(l[1])}</a></li>`).join('')}</ul></div>`;
  const d=document.createElement('div');d.className='sitefoot';
  d.innerHTML=`<div class="wrap sf">
    <div class="fbrand"><a class="fname" href="/"><img src="/apple-touch-icon.png" alt="" width="40" height="40">footballclub<i>.wiki</i></a>
      <p>A football annual: 494 clubs across twenty-seven leagues in Europe and the Americas, every ground on the map, and all 211 FIFA nations.</p></div>
    <div class="fcols">
      ${col('Sections',[['/','Leagues and tables'],['/nations/','Nations'],['/worldcup/','World Cup 2026'],['/grounds/','Grounds map']])}
      ${col('Leagues',[['/#eng-1','Premier League'],['/#esp-1','La Liga'],['/#ita-1','Serie A'],['/#ger-1','Bundesliga'],['/#fra-1','Ligue 1']])}
      ${col('Confederations',[['/nations/#UEFA','UEFA'],['/nations/#CONMEBOL','CONMEBOL'],['/nations/#CONCACAF','CONCACAF'],['/nations/#CAF','CAF'],['/nations/#AFC','AFC']])}
    </div>
    <div class="fsis"><h2>Other sites</h2><ul>${FCW.SITES.map(x=>`<li><a href="${x[0]}" target="_blank" rel="noopener">
      <img src="/img/sites/${x[3]}.png" alt="" width="40" height="40" loading="lazy" decoding="async">
      <span><b>${esc(x[1])}</b><small>${esc(x[2])}</small></span></a></li>`).join('')}</ul></div>
  </div>`;
  f.insertBefore(d,f.firstChild);
};
FCW.registerSW=()=>{if('serviceWorker' in navigator&&location.protocol!=='file:')addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}))};
window.FCW=FCW;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',FCW.siteFooter);else FCW.siteFooter();
})();
