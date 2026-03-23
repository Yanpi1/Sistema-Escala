// =============================================
//  SISTEMA DE ESCALA - IGREJA SHEKINAH IAD
//  Versão com banco de dados real (SQLite + PHP)
// =============================================

const API = 'api.php';

const PERIODOS = [
  {id:'domingo-manha',l:'Domingo Manhã'},{id:'domingo-tarde',l:'Domingo Tarde'},
  {id:'domingo-noite',l:'Domingo Noite'},{id:'segunda-noite',l:'Segunda Noite'},
  {id:'terca-noite',l:'Terça Noite'},{id:'quarta-noite',l:'Quarta Noite'},
  {id:'quinta-noite',l:'Quinta Noite'},{id:'sabado-manha',l:'Sábado Manhã'},
  {id:'sabado-noite',l:'Sábado Noite'}
];

let voluntarios=[], escalas=[], ministerios=[];
let cu=null, editEId=null, editVId=null;

// ── UTILITÁRIOS ──────────────────────────────
function fd(d){ if(!d)return'—'; const[y,m,day]=d.split('-'); return`${day}/${m}/${y}`; }

async function api(rota, metodo='GET', dados=null, id=null){
  const opts={method:metodo,headers:{'Content-Type':'application/json'}};
  if(dados) opts.body=JSON.stringify(dados);
  // Separa rota de possível &id= que veio junto
  let url = `${API}?rota=${rota}`;
  if(id) url += `&id=${id}`;
  try{
    const r=await fetch(url,opts);
    return await r.json();
  }catch(e){ toast('Erro de conexão com o servidor','er'); console.error(e); return null; }
}

async function carregarTudo(){
  loading(true);
  const [v,e,m]=await Promise.all([api('voluntarios'),api('escalas'),api('ministerios')]);
  voluntarios=v||[]; escalas=e||[]; ministerios=m||[];
  loading(false);
}
function loading(a){ document.body.style.cursor=a?'wait':''; }

// ── MÁSCARA TELEFONE ─────────────────────────
function mascaraTel(input){
  let v=input.value.replace(/\D/g,'');
  if(v.length>11)v=v.slice(0,11);
  if(!v.length){input.value='';return;}
  if(v.length<=2)       input.value=`(${v}`;
  else if(v.length<=6)  input.value=`(${v.slice(0,2)}) ${v.slice(2)}`;
  else if(v.length<=10) input.value=`(${v.slice(0,2)}) ${v.slice(2,6)}-${v.slice(6)}`;
  else                  input.value=`(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`;
}

// ── TEMA ─────────────────────────────────────
let isLight=localStorage.getItem('shekinah_theme')==='light';
function applyTheme(){
  document.body.classList.toggle('light',isLight);
  const lb=isLight?'☀️ Tema':'🌙 Tema';
  const fb=document.querySelector('.btn-theme-float');
  const hb=document.getElementById('btn-theme-header');
  if(fb)fb.textContent=isLight?'☀️':'🌙';
  if(hb)hb.textContent=lb;
}
function toggleTheme(){ isLight=!isLight; localStorage.setItem('shekinah_theme',isLight?'light':'dark'); applyTheme(); }
applyTheme();

// ── MODO PC / MOBILE ─────────────────────────────
const NAV_ADMIN_M = [
  {id:'dashboard',  icon:'📊', label:'Dash'},
  {id:'escalas',    icon:'📋', label:'Escalas'},
  {id:'voluntarios',icon:'👥', label:'Voluntários'},
  {id:'conflitos',  icon:'⚠️', label:'Conflitos'},
  {id:'relatorio',  icon:'📈', label:'Relatório'},
];
const NAV_VOL_M = [
  {id:'mpainel',   icon:'🏠', label:'Início'},
  {id:'minhasesc', icon:'📅', label:'Escalas'},
  {id:'disponib',  icon:'🕐', label:'Dispon.'},
];

function buildMobileNav(){
  const nav = document.getElementById('mobile-nav');
  if(!nav || !cu) return;
  const items = cu.perfil==='admin' ? NAV_ADMIN_M : NAV_VOL_M;
  nav.innerHTML = items.map(n =>
    `<button class="mobile-nav-item" id="mnav-${n.id}" onclick="pg('${n.id}',null)">
      <span class="mni">${n.icon}</span>${n.label}
    </button>`
  ).join('');
}

function updateMobileNav(pageId){
  document.querySelectorAll('.mobile-nav-item').forEach(b => b.classList.remove('active'));
  const b = document.getElementById('mnav-'+pageId);
  if(b) b.classList.add('active');
}

function setMode(mode, save=true){
  if(save) localStorage.setItem('shekinah_mode', mode);
  document.body.classList.toggle('mobile-mode', mode==='mobile');
  document.getElementById('btn-pc')?.classList.toggle('active', mode==='pc');
  document.getElementById('btn-mobile')?.classList.toggle('active', mode==='mobile');
  if(mode==='mobile' && cu) buildMobileNav();
}

// Detecta modo pelo URL (?m=1 = mobile) ou localStorage ou userAgent
// Roda quando DOM estiver pronto
function detectDevice(){
  // Usa o modo já detectado no <head> (window.__initialMode)
  // evita flash de layout errado
  const mode = window.__initialMode || 'pc';
  const save = !localStorage.getItem('shekinah_mode');
  setMode(mode, save);
}
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', detectDevice);
} else {
  detectDevice();
}



// ── BUSCA GLOBAL ─────────────────────────────
function buscaGlobal(q){
  if(!q||q.length<2)return;
  const ql=q.toLowerCase();
  if(voluntarios.some(v=>v.nome.toLowerCase().includes(ql))){
    pg('voluntarios',document.querySelector('#nav-admin .nav-item:nth-child(3)'));
    document.getElementById('f-vnome').value=q; renderVols();
  }
}

// ── LOGIN ────────────────────────────────────
async function doLogin(){
  const perfil=document.getElementById('lp').value;
  const usuario=document.getElementById('lu').value.trim();
  const senha=document.getElementById('lpass').value;
  if(!perfil||!usuario||!senha){toast('Preencha todos os campos','er');return;}
  const res=await api('login','POST',{perfil,usuario,senha});
  if(!res)return;
  if(!res.ok){toast(res.erro||'Usuário ou senha incorretos','er');return;}
  cu={perfil:res.perfil,nome:res.nome,id:res.id};
  await carregarTudo();
  document.getElementById('screen-login').style.display='none';
  document.getElementById('screen-app').style.display='block';
  document.getElementById('huser').textContent=cu.nome;
  document.getElementById('nav-admin').style.display=cu.perfil==='admin'?'':'none';
  document.getElementById('nav-vol').style.display=cu.perfil==='voluntario'?'':'none';
  if(cu.perfil==='admin'){pg('dashboard',document.querySelector('#nav-admin .nav-item'));renderDash();}
  else{pg('mpainel',document.querySelector('#nav-vol .nav-item'));renderVPainel();}
  buildMobileNav();
  toast('Bem-vindo(a), '+cu.nome+' 🙏','ok');
}
function doLogout(){
  cu=null;voluntarios=[];escalas=[];ministerios=[];
  document.getElementById('screen-login').style.display='flex';
  document.getElementById('screen-app').style.display='none';
  document.getElementById('lu').value=''; document.getElementById('lpass').value='';
}

// ── NAVEGAÇÃO ────────────────────────────────
function pg(id,el){
  document.querySelectorAll('.pg').forEach(p=>p.classList.remove('on'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('page-'+id).classList.add('on');
  if(el)el.classList.add('active');
  updateMobileNav(id);
  const m={dashboard:renderDash,escalas:renderEscalas,voluntarios:renderVols,
    conflitos:renderConflitos,mpainel:renderVPainel,minhasesc:renderMinhas,
    disponib:renderDisp,relatorio:renderRelatorio,trocas:renderTrocas,
    'ministerios-cfg':renderMinisteriosCfg};
  if(m[id])m[id]();
}

// ── CONFLITOS ────────────────────────────────
function getConflicts(){
  const C=[];
  escalas.forEach(e=>{
    const v=voluntarios.find(x=>x.id===e.voluntario_id&&x.ativo!=0); if(!v)return;
    const d=new Date(e.data+'T12:00:00');
    const dns=['domingo','segunda','terca','quarta','quinta','sexta','sabado'];
    const dn=dns[d.getDay()];
    // "Dia inteiro" não gera conflito de disponibilidade
    const diaInteiro=e.horario.toLowerCase().includes('inteiro');
    if(!diaInteiro){
      const slot=e.horario.includes('Manhã')?dn+'-manha':e.horario.includes('Tarde')?dn+'-tarde':e.horario.includes('Noite')?dn+'-noite':'';
      const disp=v.disponibilidade||[];
      if(disp.length>0&&slot&&!disp.includes(slot))
        C.push({t:'disp',msg:`${v.nome} sem disponibilidade p/ ${slot.replace('-',' ')} — ${e.ministerio} (${fd(e.data)})`});
    }
    if((v.indisponibilidade||[]).find(i=>i.data===e.data))
      C.push({t:'data',msg:`${v.nome} marcou ${fd(e.data)} como indisponível — ${e.ministerio}`});
    escalas.filter(e2=>e2.id!==e.id&&e2.voluntario_id===e.voluntario_id&&e2.data===e.data&&e2.horario===e.horario).forEach(e2=>{
      const k=`d-${Math.min(e.id,e2.id)}-${Math.max(e.id,e2.id)}`;
      if(!C.find(c=>c.k===k))C.push({k,t:'dupla',msg:`${v.nome} escalado em dois ministérios: ${e.ministerio} e ${e2.ministerio} (${fd(e.data)})`});
    });
  });
  return C;
}

// ── DASHBOARD ────────────────────────────────
async function renderDash(){
  const dados=await api('dashboard'); if(!dados)return;
  const C=getConflicts();
  const nb=document.getElementById('nbadge');
  nb.textContent=C.length||'';
  nb.style.display=C.length?'':'none';
  // Badge de trocas pendentes
  const trocasList=await api('trocas');
  const pendentes=(trocasList||[]).filter(t=>t.status==='pendente').length;
  const tb2=document.getElementById('tbadge');
  if(tb2){tb2.textContent=pendentes||'';tb2.style.display=pendentes?'':'none';}
  document.getElementById('stats').innerHTML=`
    <div class="sc c-blue"><div class="n">${dados.total_voluntarios}</div><div class="l">Voluntários</div></div>
    <div class="sc c-blue"><div class="n">${dados.total_escalas}</div><div class="l">Escalas</div></div>
    <div class="sc c-green"><div class="n">${dados.proximas}</div><div class="l">Próximas</div></div>
    <div class="sc ${C.length>0?'c-red':'c-blue'}"><div class="n">${C.length}</div><div class="l">Conflitos</div></div>
    <div class="sc ${pendentes>0?'c-warn':'c-blue'}"><div class="n">${pendentes}</div><div class="l">Trocas Pend.</div></div>
    <div class="sc c-warn"><div class="n">${dados.total_ministerios}</div><div class="l">Ministérios</div></div>`;
  const tb=document.getElementById('dash-tbody');
  if(!dados.proximas_lista.length){tb.innerHTML='<tr><td colspan="5" class="empty">Nenhuma escala futura</td></tr>';return;}
  tb.innerHTML=dados.proximas_lista.map(e=>{
    const conf=C.some(c=>c.msg.includes(e.voluntario));
    return`<tr><td>${fd(e.data)}</td><td><span class="badge b-blue">${e.ministerio}</span></td><td>${e.voluntario}</td><td>${e.funcao||'—'}</td><td>${conf?'<span class="badge b-red">⚠ Conflito</span>':'<span class="badge b-green">✓ OK</span>'}</td></tr>`;
  }).join('');
}

// ── ESCALAS ──────────────────────────────────
async function renderEscalas(){
  const sel=document.getElementById('e-vol');
  sel.innerHTML='<option value="">Selecione voluntário...</option>'+voluntarios.map(v=>`<option value="${v.id}">${v.nome}</option>`).join('');
  const ms=document.getElementById('e-min');
  const cv=ms.value;
  ms.innerHTML='<option value="">Selecione...</option>'+ministerios.map(m=>`<option${m.nome===cv?' selected':''}>${m.nome}</option>`).join('');

  const nom=(document.getElementById('f-enome')?.value||'').toLowerCase();
  const min=document.getElementById('f-emin')?.value||'';
  const dat=document.getElementById('f-edata')?.value||'';
  const per=document.getElementById('f-eperiod')?.value||'';
  const today=new Date().toISOString().split('T')[0];
  const C=getConflicts();

  let list=escalas.filter(e=>{
    if(nom&&!e.voluntario_nome?.toLowerCase().includes(nom))return false;
    if(min&&e.ministerio!==min)return false;
    if(dat&&e.data!==dat)return false;
    if(per==='futuras'&&e.data<today)return false;
    if(per==='passadas'&&e.data>=today)return false;
    return true;
  }).sort((a,b)=>a.data.localeCompare(b.data));

  const tb=document.getElementById('esc-tbody');
  if(!list.length){tb.innerHTML='<tr><td colspan="6" class="empty">Nenhuma escala encontrada</td></tr>';return;}
  tb.innerHTML=list.map(e=>{
    const conf=C.some(c=>c.msg.includes(e.voluntario_nome||''));
    return`<tr><td>${fd(e.data)}</td><td>${e.horario}</td><td><span class="badge b-blue">${e.ministerio}</span></td><td>${e.voluntario_nome||'—'}${conf?' ⚠️':''}</td><td>${e.funcao||'—'}</td><td style="display:flex;gap:5px"><button class="btn-e" onclick="editEscala(${e.id})">✏ Editar</button><button class="btn-d" onclick="delEscala(${e.id})">🗑</button></td></tr>`;
  }).join('');
}

function checkConflict(){
  const vId=parseInt(document.getElementById('e-vol').value);
  const data=document.getElementById('e-data').value;
  const hor=document.getElementById('e-hor').value;
  const box=document.getElementById('cf-alert');
  if(!vId||!data){box.innerHTML='';return;}
  const v=voluntarios.find(x=>x.id===vId); if(!v){box.innerHTML='';return;}
  const msgs=[];
  if((v.indisponibilidade||[]).find(i=>i.data===data))msgs.push('⛔ Este voluntário marcou esta data como indisponível.');
  const d=new Date(data+'T12:00:00');
  const dns=['domingo','segunda','terca','quarta','quinta','sexta','sabado'];
  const dn=dns[d.getDay()];
  const slot=hor.includes('Manhã')?dn+'-manha':hor.includes('Tarde')?dn+'-tarde':hor.includes('Noite')?dn+'-noite':'';
  const disp=v.disponibilidade||[];
  if(disp.length>0&&slot&&!disp.includes(slot))msgs.push(`⚠️ ${v.nome} não tem disponibilidade para ${slot.replace('-',' ')}.`);
  const dupla=escalas.filter(e=>e.id!==editEId&&e.voluntario_id===vId&&e.data===data&&e.horario===hor);
  if(dupla.length)msgs.push('🔴 Voluntário já escalado em outro ministério neste horário.');
  box.innerHTML=msgs.length?msgs.map(m=>`<div class="alert a-warn">${m}</div>`).join(''):'<div class="alert a-ok">✅ Voluntário disponível neste horário.</div>';
}

async function salvarEscala(){
  const min=document.getElementById('e-min').value;
  const vId=parseInt(document.getElementById('e-vol').value);
  const data=document.getElementById('e-data').value;
  const horario=document.getElementById('e-hor').value;
  const funcao=document.getElementById('e-func').value;
  const local=document.getElementById('e-local').value;
  const culto=document.getElementById('e-culto').value;
  const obs=document.getElementById('e-obs').value;
  if(!min||!vId||!data){toast('Preencha os campos obrigatórios','er');return;}
  const dados={ministerio:min,voluntario_id:vId,data,horario,funcao,local,culto,obs};
  let res;
  if(editEId){
    res=await api('escalas','PUT',dados,editEId);
    if(res?.ok){toast('Escala atualizada! ✅','ok');editEId=null;document.getElementById('fesc-title').textContent='➕ Nova Escala';}
  }else{
    res=await api('escalas','POST',dados);
    if(res?.ok)toast('Escala salva! ✅','ok');
  }
  if(!res?.ok){toast(res?.erro||'Erro ao salvar','er');return;}
  await carregarTudo(); renderEscalas(); renderDash();
  ['e-min','e-func','e-local','e-culto','e-obs'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('e-vol').value=''; document.getElementById('e-data').value='';
  document.getElementById('cf-alert').innerHTML='';
}

function editEscala(id){
  const e=escalas.find(x=>x.id===id); if(!e)return;
  editEId=id;
  document.getElementById('fesc-title').textContent='✏️ Editar Escala';
  document.getElementById('e-min').value=e.ministerio;
  const sel=document.getElementById('e-vol');
  sel.innerHTML='<option value="">Selecione...</option>'+voluntarios.map(v=>`<option value="${v.id}"${v.id===e.voluntario_id?' selected':''}>${v.nome}</option>`).join('');
  document.getElementById('e-data').value=e.data;
  document.getElementById('e-hor').value=e.horario;
  document.getElementById('e-func').value=e.funcao||'';
  document.getElementById('e-local').value=e.local_turma||'';
  document.getElementById('e-culto').value=e.culto_evento||'';
  document.getElementById('e-obs').value=e.observacoes||'';
  document.getElementById('fesc-wrap').scrollIntoView({behavior:'smooth'});
}

function cancelarEscala(){
  editEId=null; document.getElementById('fesc-title').textContent='➕ Nova Escala';
  ['e-min','e-func','e-local','e-culto','e-obs'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('e-vol').value=''; document.getElementById('e-data').value='';
  document.getElementById('cf-alert').innerHTML='';
}

async function delEscala(id){
  if(!confirm('Excluir esta escala?'))return;
  const res=await api('escalas','DELETE',null,id);
  if(res?.ok){toast('Escala excluída','wn');await carregarTudo();renderEscalas();renderDash();}
  else toast(res?.erro||'Erro','er');
}

// ── EXPORTAR CSV ─────────────────────────────
function exportarEscalas(){
  const rows=[['Data','Horário','Ministério','Voluntário','Telefone','Função','Local','Culto','Obs']];
  [...escalas].sort((a,b)=>a.data.localeCompare(b.data)).forEach(e=>{
    rows.push([fd(e.data),e.horario,e.ministerio,e.voluntario_nome||'',e.voluntario_tel||'',e.funcao||'',e.local_turma||'',e.culto_evento||'',e.observacoes||'']);
  });
  downloadCSV(rows,'escalas_shekinah.csv');
}
function exportarVoluntarios(){
  const rows=[['Nome','Telefone','Nascimento','Ministérios','Total Escalas']];
  voluntarios.forEach(v=>{
    rows.push([v.nome,v.telefone||'',v.data_nasc||'',(v.ministerios||[]).join('; '),v.total_escalas||0]);
  });
  downloadCSV(rows,'voluntarios_shekinah.csv');
}
function downloadCSV(rows,filename){
  const csv='\uFEFF'+rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
  a.download=filename; a.click(); toast('Exportado! 📥','ok');
}

// ── VOLUNTÁRIOS ──────────────────────────────
function toggleMin(el){el.classList.toggle('sel');refreshMinTags();}
function refreshMinTags(){
  document.getElementById('v-min-tags').innerHTML=
    [...document.querySelectorAll('#v-min-grid .min-chip.sel')].map(c=>`<span class="min-tag">${c.dataset.min}<button onclick="deselectMin('${c.dataset.min}')">✕</button></span>`).join('');
}
function deselectMin(name){
  const c=document.querySelector(`#v-min-grid .min-chip[data-min="${name}"]`);
  if(c){c.classList.remove('sel');refreshMinTags();}
}
function getSelMin(){return[...document.querySelectorAll('#v-min-grid .min-chip.sel')].map(c=>c.dataset.min);}
function setSelMin(mins){
  document.querySelectorAll('#v-min-grid .min-chip').forEach(c=>c.classList.toggle('sel',mins.includes(c.dataset.min)));
  refreshMinTags();
}

function renderVols(){
  const busca=(document.getElementById('f-vnome')?.value||'').toLowerCase();
  const filMin=document.getElementById('f-vmin')?.value||'';
  let list=voluntarios.filter(v=>{
    if(busca&&!v.nome.toLowerCase().includes(busca))return false;
    if(filMin&&!(v.ministerios||[]).includes(filMin))return false;
    return true;
  });
  const tb=document.getElementById('vol-tbody');
  if(!list.length){tb.innerHTML='<tr><td colspan="5" class="empty">Nenhum voluntário encontrado</td></tr>';return;}
  tb.innerHTML=list.map(v=>{
    const mins=(v.ministerios||[]).map(m=>`<span class="badge b-blue" style="margin:1px">${m}</span>`).join(' ')||'—';
    return`<tr><td><strong>${v.nome}</strong></td><td>${v.telefone||'—'}</td><td style="line-height:1.8">${mins}</td><td>${v.total_escalas||0}</td><td style="display:flex;gap:5px"><button class="btn-e" onclick="editVol(${v.id})">✏ Editar</button><button class="btn-d" onclick="delVol(${v.id})">🗑</button></td></tr>`;
  }).join('');
}

async function salvarVol(){
  const nome=document.getElementById('v-nome').value.trim();
  const tel=document.getElementById('v-tel').value.trim();
  const nasc=document.getElementById('v-nasc').value;
  const senha=document.getElementById('v-senha').value.trim()||'123';
  const ministeriosSel=getSelMin();
  if(!nome){toast('Informe o nome','er');return;}
  if(!ministeriosSel.length){toast('Selecione pelo menos um ministério','er');return;}
  const dados={nome,tel,nasc,senha,ministerios:ministeriosSel};
  let res;
  if(editVId){
    res=await api('voluntarios','PUT',dados,editVId);
    if(res?.ok){toast('Voluntário atualizado! ✅','ok');editVId=null;document.getElementById('fvol-title').textContent='➕ Cadastrar Voluntário';}
  }else{
    res=await api('voluntarios','POST',dados);
    if(res?.ok)toast('Voluntário cadastrado! ✅','ok');
  }
  if(!res?.ok){toast(res?.erro||'Erro ao salvar','er');return;}
  await carregarTudo(); renderVols();
  document.getElementById('v-nome').value=''; document.getElementById('v-tel').value='';
  document.getElementById('v-nasc').value=''; document.getElementById('v-senha').value='123';
  setSelMin([]);
}

function editVol(id){
  const v=voluntarios.find(x=>x.id===id); if(!v)return;
  editVId=id;
  document.getElementById('fvol-title').textContent='✏️ Editar Voluntário';
  document.getElementById('v-nome').value=v.nome;
  document.getElementById('v-tel').value=v.telefone||'';
  document.getElementById('v-nasc').value=v.data_nasc||'';
  document.getElementById('v-senha').value=v.senha||'123';
  setSelMin(v.ministerios||[]);
  window.scrollTo({top:0,behavior:'smooth'});
}
function cancelarVol(){
  editVId=null; document.getElementById('fvol-title').textContent='➕ Cadastrar Voluntário';
  document.getElementById('v-nome').value=''; document.getElementById('v-tel').value='';
  document.getElementById('v-nasc').value=''; document.getElementById('v-senha').value='123';
  setSelMin([]);
}
async function delVol(id){
  if(!confirm('Excluir este voluntário?'))return;
  const res=await api('voluntarios','DELETE',null,id);
  if(res?.ok){toast('Voluntário removido','wn');await carregarTudo();renderVols();}
  else toast(res?.erro||'Erro','er');
}

// ── CONFLITOS ────────────────────────────────
function renderConflitos(){
  const C=getConflicts();
  const nb2=document.getElementById('nbadge');
  nb2.textContent=C.length||'';
  nb2.style.display=C.length?'':'none';
  const div=document.getElementById('cf-list');
  if(!C.length){div.innerHTML='<div class="alert a-ok">✅ Nenhum conflito detectado!</div>';return;}
  div.innerHTML=C.map(c=>`<div class="cf-item">${c.t==='dupla'?'🔴':c.t==='data'?'⛔':'⚠️'} ${c.msg}</div>`).join('');
}

// ── RELATÓRIO ────────────────────────────────
async function renderRelatorio(){
  const today=new Date().toISOString().split('T')[0];
  document.getElementById('rel-stats').innerHTML=`
    <div class="sc c-blue"><div class="n">${voluntarios.length}</div><div class="l">Voluntários</div></div>
    <div class="sc c-blue"><div class="n">${escalas.length}</div><div class="l">Total Escalas</div></div>
    <div class="sc c-green"><div class="n">${escalas.filter(e=>e.data>=today).length}</div><div class="l">Futuras</div></div>
    <div class="sc c-warn"><div class="n">${escalas.filter(e=>e.data<today).length}</div><div class="l">Realizadas</div></div>`;
  const dados=await api('relatorio'); if(!dados)return;
  document.getElementById('rel-ranking').innerHTML=dados.ranking.length
    ?`<table><thead><tr><th>#</th><th>Voluntário</th><th>Escalas</th></tr></thead><tbody>`+dados.ranking.map((r,i)=>`<tr><td>${i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</td><td>${r.nome}</td><td><span class="badge b-blue">${r.total}</span></td></tr>`).join('')+`</tbody></table>`
    :'<p class="empty">Nenhum dado</p>';
  document.getElementById('rel-ministerios').innerHTML=dados.por_ministerio.length
    ?`<table><thead><tr><th>Ministério</th><th>Escalas</th></tr></thead><tbody>`+dados.por_ministerio.map(r=>`<tr><td>${r.nome}</td><td><span class="badge b-blue">${r.total}</span></td></tr>`).join('')+`</tbody></table>`
    :'<p class="empty">Nenhum dado</p>';
}

// ── ANIVERSÁRIOS ─────────────────────────────
// ── TROCAS (ADMIN) ───────────────────────────
async function renderTrocas(){
  if(!cu||cu.perfil!=='admin')return;
  const lista=await api('trocas');
  const div=document.getElementById('trocas-list');
  if(!lista||!div)return;
  if(!lista.length){div.innerHTML='<div class="alert a-ok">✅ Nenhuma solicitação de troca pendente!</div>';return;}
  const pendentes=lista.filter(t=>t.status==='pendente');
  const outras=lista.filter(t=>t.status!=='pendente');
  let html='';
  if(pendentes.length){
    html+=`<div class="prox-label" style="margin-bottom:10px">⏳ Pendentes (${pendentes.length})</div>`;
    html+=pendentes.map(t=>`
      <div class="troca-card">
        <div class="troca-info">
          <div class="troca-vol"><strong>${t.voluntario_nome}</strong></div>
          <div class="troca-esc">${fd(t.escala_data)} · ${t.ministerio} · ${t.escala_horario}</div>
          ${t.motivo?`<div class="troca-motivo">💬 "${t.motivo}"</div>`:''}
          <div class="troca-data">Solicitado em: ${new Date(t.criado_em).toLocaleDateString('pt-BR')}</div>
        </div>
        <div class="troca-actions">
          <button class="btn-confirmar" onclick="resolverTroca(${t.id},'resolvido',this)">✓ Resolver</button>
          <button class="btn-trocar" onclick="resolverTroca(${t.id},'recusado',this)">✗ Recusar</button>
        </div>
      </div>`).join('');
  }
  if(outras.length){
    html+=`<div class="prox-label" style="margin:18px 0 10px">Histórico</div>`;
    html+=`<div class="tcard"><table><thead><tr><th>Voluntário</th><th>Escala</th><th>Ministério</th><th>Motivo</th><th>Status</th></tr></thead><tbody>`+
      outras.map(t=>`<tr>
        <td>${t.voluntario_nome}</td>
        <td>${fd(t.escala_data)}</td>
        <td><span class="badge b-blue">${t.ministerio}</span></td>
        <td>${t.motivo||'—'}</td>
        <td>${t.status==='resolvido'?'<span class="badge b-green">Resolvido</span>':'<span class="badge b-red">Recusado</span>'}</td>
      </tr>`).join('')+`</tbody></table></div>`;
  }
  div.innerHTML=html;
}
async function resolverTroca(id,status,btn){
  btn.disabled=true;
  const res=await api('trocas','PUT',{status},id);
  if(res?.ok){
    toast(status==='resolvido'?'Troca resolvida! Escala removida do voluntário.':'Troca recusada.','ok');
    await carregarTudo();
    renderTrocas();
    renderDash();
  } else {
    toast(res?.erro||'Erro','er');
    btn.disabled=false;
  }
}

// ── MINISTÉRIOS CONFIG ────────────────────────
function renderMinisteriosCfg(){
  const PADRAO=['Diáconos','EBD de Domingo','Intercessão','Recepção','Louvor','Mídia / Data show','Coordenação de lanche EBD'];
  document.getElementById('min-tbody').innerHTML=ministerios.map(m=>{
    const isDef=PADRAO.includes(m.nome);
    return`<tr><td>${m.nome}</td><td>${m.total_voluntarios||0}</td><td>${m.total_escalas||0}</td><td>${!isDef?`<button class="btn-d" onclick="delMinisterio(${m.id})">🗑</button>`:'<span style="color:var(--soft);font-size:.75rem">Padrão</span>'}</td></tr>`;
  }).join('');
}
async function addMinisterio(){
  const nome=document.getElementById('new-min-nome').value.trim();
  if(!nome){toast('Informe o nome','er');return;}
  const res=await api('ministerios','POST',{nome});
  if(res?.ok){
    toast('Ministério adicionado! ✅','ok');
    document.getElementById('new-min-nome').value='';
    await carregarTudo(); renderMinisteriosCfg();
    const grid=document.getElementById('v-min-grid');
    if(grid&&!grid.querySelector(`[data-min="${nome}"]`)){
      const chip=document.createElement('div');
      chip.className='min-chip'; chip.dataset.min=nome;
      chip.onclick=function(){toggleMin(this);}; chip.textContent=nome;
      grid.appendChild(chip);
    }
  }else toast(res?.erro||'Erro','er');
}
async function delMinisterio(id){
  if(!confirm('Excluir ministério?'))return;
  const res=await api('ministerios','DELETE',null,id);
  if(res?.ok){toast('Ministério removido','wn');await carregarTudo();renderMinisteriosCfg();}
  else toast(res?.erro||'Erro','er');
}

// ── PAINEL VOLUNTÁRIO ────────────────────────
function renderVPainel(){
  if(!cu||cu.perfil!=='voluntario')return;
  const v=voluntarios.find(x=>x.id===cu.id); if(!v)return;
  document.getElementById('wgreet').textContent='Olá, '+v.nome+'! 🙏';
  document.getElementById('wmin').textContent='Ministérios: '+((v.ministerios||[]).join(', ')||'—');
  const today=new Date().toISOString().split('T')[0];
  const mine=escalas.filter(e=>e.voluntario_id===v.id);
  const prox=mine.filter(e=>e.data>=today).sort((a,b)=>a.data.localeCompare(b.data));
  document.getElementById('vstats').innerHTML=`
    <div class="sc c-blue"><div class="n">${mine.length}</div><div class="l">Total Escalas</div></div>
    <div class="sc c-green"><div class="n">${prox.length}</div><div class="l">Próximas</div></div>
    <div class="sc c-blue"><div class="n">${(v.disponibilidade||[]).length}</div><div class="l">Períodos Disp.</div></div>`;
  const tb=document.getElementById('vprox-tbody');
  if(!prox.length){tb.innerHTML='<tr><td colspan="4" class="empty">Nenhuma próxima escala</td></tr>';}
  else tb.innerHTML=prox.slice(0,6).map(e=>`<tr><td>${fd(e.data)}</td><td><span class="badge b-blue">${e.ministerio}</span></td><td>${e.funcao||'—'}</td><td>${e.horario}</td></tr>`).join('');

  // ── BANNER PRÓXIMO EVENTO ──
  const banner=document.getElementById('proximo-evento-banner');
  const cardsList=document.getElementById('prox-cards-list');
  const proxEventos=prox.slice(0,2); // mostra até 2 próximos eventos
  if(!proxEventos.length){banner.style.display='none';return;}
  banner.style.display='block';
  cardsList.innerHTML=proxEventos.map((e,i)=>{
    const hora=e.horario||'';
    const horaFmt=hora.match(/(\d{1,2}:\d{2})/)?hora.match(/(\d{1,2}:\d{2})/)[1]:hora;
    const confKey='confirmado_'+e.id+'_'+cu.id;
    const jaConf=localStorage.getItem(confKey)==='1';
    return`<div class="prox-card" id="prox-card-${e.id}">
      <div class="prox-card-info">
        <div class="prox-card-date">${fd(e.data)}</div>
        <div class="prox-card-title">${e.culto_evento||e.ministerio}</div>
        <div class="prox-card-meta">
          <span class="badge b-blue">${e.ministerio}</span>
          ${e.funcao?`<span class="badge b-soft">${e.funcao}</span>`:''}
          ${e.local_turma?`<span class="badge b-soft">${e.local_turma}</span>`:''}
        </div>
      </div>
      <div class="prox-card-time">${horaFmt||'—'}</div>
      <div class="prox-card-actions">
        <button class="btn-trocar" onclick="trocarEscala(${e.id})">↔ Pedir Troca</button>
        <button class="btn-confirmar ${jaConf?'confirmado':''}" id="btn-conf-${e.id}" onclick="confirmarPresenca(${e.id},this)">${jaConf?'✓ Confirmado':'Confirmar'}</button>
      </div>
    </div>`;
  }).join('');
}

async function confirmarPresenca(escalaId,btn){
  if(btn.classList.contains('confirmado'))return;
  const res=await api('confirmar','POST',{escala_id:escalaId,voluntario_id:cu.id});
  const confKey='confirmado_'+escalaId+'_'+cu.id;
  localStorage.setItem(confKey,'1');
  btn.classList.add('confirmado');
  btn.textContent='✓ Confirmado';
  toast('Presença confirmada! 🙏','ok');
}

async function trocarEscala(escalaId){
  const e=escalas.find(x=>x.id===escalaId); if(!e)return;
  const motivo=prompt('Motivo da troca (opcional):','') ;
  if(motivo===null)return; // cancelou
  const res=await api('trocas','POST',{escala_id:escalaId,voluntario_id:cu.id,motivo});
  if(res?.ok){
    toast('Solicitação de troca enviada! O administrador será notificado.','ok');
    // Atualiza botão visualmente
    const btn=document.querySelector(`#prox-card-${escalaId} .btn-trocar`);
    if(btn){btn.textContent='⏳ Aguardando';btn.disabled=true;btn.style.opacity='.5';}
  } else {
    toast(res?.erro||'Erro ao enviar solicitação','er');
  }
}
function renderMinhas(){
  if(!cu||cu.perfil!=='voluntario')return;
  const today=new Date().toISOString().split('T')[0];
  const mine=escalas.filter(e=>e.voluntario_id===cu.id).sort((a,b)=>a.data.localeCompare(b.data));
  const tb=document.getElementById('mine-tbody');
  if(!mine.length){tb.innerHTML='<tr><td colspan="6" class="empty">Nenhuma escala</td></tr>';return;}
  tb.innerHTML=mine.map(e=>{
    const st=e.data>=today?'<span class="badge b-green">Próxima</span>':'<span class="badge b-soft">Realizada</span>';
    return`<tr><td>${fd(e.data)}</td><td><span class="badge b-blue">${e.ministerio}</span></td><td>${e.funcao||'—'}</td><td>${e.local_turma||'—'}</td><td>${e.horario}</td><td>${st}</td></tr>`;
  }).join('');
}

// ── DISPONIBILIDADE ──────────────────────────
function renderDisp(){
  if(!cu||cu.perfil!=='voluntario')return;
  const v=voluntarios.find(x=>x.id===cu.id); if(!v)return;
  document.getElementById('avail-grid').innerHTML=PERIODOS.map(p=>{
    const on=(v.disponibilidade||[]).includes(p.id);
    return`<label class="av-chip ${on?'on':''}" id="avc-${p.id}"><input type="checkbox" id="avcb-${p.id}" ${on?'checked':''} onchange="toggleAv('${p.id}')"><span>${p.l}</span></label>`;
  }).join('');
  renderIndList(v);
}
function toggleAv(id){const on=document.getElementById('avcb-'+id).checked;document.getElementById('avc-'+id).classList.toggle('on',on);}

async function addIndisp(){
  const data=document.getElementById('ind-data').value;
  const motivo=document.getElementById('ind-motivo').value.trim();
  if(!data){toast('Selecione uma data','er');return;}
  const res=await api('indisponibilidade','POST',{voluntario_id:cu.id,data,motivo});
  if(res?.ok){
    toast('Data adicionada','ok');
    document.getElementById('ind-data').value=''; document.getElementById('ind-motivo').value='';
    await carregarTudo();
    const v=voluntarios.find(x=>x.id===cu.id); if(v)renderIndList(v);
  }else toast(res?.erro||'Erro','er');
}
function renderIndList(v){
  const d=document.getElementById('ind-list');
  if(!(v.indisponibilidade||[]).length){d.innerHTML='<p style="color:var(--soft);font-size:.82rem">Nenhuma data indisponível.</p>';return;}
  d.innerHTML=v.indisponibilidade.map(i=>`<div class="indisp-row"><span>❌ ${fd(i.data)}${i.motivo?' — '+i.motivo:''}</span><button class="btn-d" onclick="remIndisp(${i.id})">Remover</button></div>`).join('');
}
async function remIndisp(id){
  const res=await api('indisponibilidade','DELETE',null,id);
  if(res?.ok){toast('Data removida','wn');await carregarTudo();const v=voluntarios.find(x=>x.id===cu.id);if(v)renderIndList(v);}
}
async function salvarDisp(){
  const periodos=PERIODOS.filter(p=>document.getElementById('avcb-'+p.id)?.checked).map(p=>p.id);
  const res=await api('disponibilidade','POST',{voluntario_id:cu.id,periodos});
  if(res?.ok){toast('Disponibilidade salva! ✅','ok');await carregarTudo();}
  else toast(res?.erro||'Erro','er');
}

// ── TOAST ────────────────────────────────────
function toast(msg,type='ok'){
  const c=document.getElementById('toasts');
  const t=document.createElement('div');
  t.className='toast '+type; t.textContent=msg; c.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';t.style.transform='translateX(120px)';t.style.transition='.3s';setTimeout(()=>t.remove(),300);},3000);
}

// ── SPLASH SCREEN ────────────────────────────
(function initSplash(){
  // A barra de carregamento dura 2s (.8s delay + 2s fill)
  // Aguarda 3s no total e então faz a transição para o login
  setTimeout(function(){
    const splash = document.getElementById('screen-splash');
    const login  = document.getElementById('screen-login');
    if(!splash) return;
    splash.classList.add('hide');
    setTimeout(function(){
      splash.style.display = 'none';
      if(login) login.style.display = 'flex';
    }, 560); // duração do fadeOut
  }, 3000);
})();
