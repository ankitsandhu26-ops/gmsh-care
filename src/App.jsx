import { useState, useEffect, useRef, useContext, createContext } from 'react'
import { ref, get, set, remove } from 'firebase/database'
import { db } from './firebase.js'

// ─── Dark Mode Context ─────────────────────────────────────────────────────
const DarkCtx = createContext(false)

function pal(d) {
  return d ? {
    navy:"#5B8FD4",teal:"#29AABB",tealL:"#152030",dir:"#9370DB",
    green:"#4BCB7A",greenL:"#122A1E",red:"#E07070",amber:"#CCA040",amberL:"#2A1E08",
    bg:"#0E1320",border:"#2A3550",muted:"#6A7A9A",card:"#182030",text:"#DCE5F5",sub:"#8090B0",ib:"#1C2840",
  } : {
    navy:"#0D2B5E",teal:"#00798C",tealL:"#EBF6F8",dir:"#3D1A78",
    green:"#1A6E35",greenL:"#E6F4EC",red:"#8C2020",amber:"#A06000",amberL:"#FEF3E0",
    bg:"#F0F4F7",border:"#D0DCE0",muted:"#888",card:"#fff",text:"#0D2B5E",sub:"#555",ib:"#fff",
  }
}

const COLOR_OPTS = [
  "#0D2B5E","#3D1A78","#00798C","#1A6E35",
  "#8C2020","#A06000","#1A5C8C","#6B3A1F",
  "#2D6A8C","#4A1A6B","#1A6B4A","#8C5A00",
]

const DEFAULT_USERS = [
  {id:"ankit",  name:"Dr. Ankit Sandhu",role:"Director",           pin:"0000",color:"#3D1A78",initials:"AS",isDir:true, owns:[1,2,3,4,5,6,7,8]},
  {id:"aditya", name:"Dr. Aditya",       role:"Attending Physician",pin:"1234",color:"#0D2B5E",initials:"DA",isDir:false,owns:[1,2,3,4,5,6,7,8]},
  {id:"sachin", name:"Dr. Sachin",       role:"Surgeon",            pin:"2345",color:"#1A6E35",initials:"DS",isDir:false,owns:[3,5]},
  {id:"gulshan",name:"Gulshan",          role:"Ward In-charge",     pin:"3456",color:"#00798C",initials:"GU",isDir:false,owns:[3,6,7]},
  {id:"vikas",  name:"Vikas",            role:"ICU In-charge",      pin:"4567",color:"#8C2020",initials:"VK",isDir:false,owns:[6]},
  {id:"billing",name:"Billing Team",     role:"Accounts & Billing", pin:"5678",color:"#A06000",initials:"BT",isDir:false,owns:[8]},
]

const DEFAULT_STEPS = [
  {id:1,title:"Morning Ward Round",           time:"10:00 AM",     tags:["Vitals","Blood Sugar"],           checks:["Patient visited on morning round","Vitals recorded","Blood sugar recorded","Abnormal values flagged to doctor"]},
  {id:2,title:"OPD Vitals Verification",       time:"Post-Round",   tags:["OPD Register"],                   checks:["OPD vitals recorded","Pending queries followed up"]},
  {id:3,title:"Admission Flow",                time:"",             tags:["Pre-Admission","Investigations"],  checks:["Eligibility reviewed","Files handed over","Nurse / attendant assigned","Escorted to Lab / Radiology / ECG"]},
  {id:4,title:"Pre-Op Compliance",             time:"Before OT",    tags:["NPO","Consent","Pre-Med"],         checks:["NPO status confirmed","Bowel prep done","Pre-medications given","Skin prep done","IV access established","Consent signed"]},
  {id:5,title:"Investigation Review",          time:"Pre-OT",       tags:["Lab","Imaging","ECG"],             checks:["Lab reports reviewed","Imaging reviewed","ECG / Echo reviewed","Surgical fitness confirmed"]},
  {id:6,title:"Post-Op Receiving",             time:"Post-OT",      tags:["ICU / Ward"],                     checks:["Received in ICU / Ward","Monitoring initiated","Post-op orders noted"]},
  {id:7,title:"Discharge Planning",            time:"Evening",      tags:["Discharge Note"],                  checks:["Patient reviewed for discharge","Discharge summary written","Discharge orders issued"]},
  {id:8,title:"Billing & Discharge Clearance", time:"Before Discharge",tags:["Bills","TPA","Ayushman"],      checks:["Pharmacy bill verified","Investigation bill verified","Hospital bill verified","Scheme / TPA clearance obtained"]},
]

const WARDS     = ["General Ward","ICU","HDU","Private Room","Semi-Private","Post-Op Ward","OPD"]
const ADM_TYPES = ["Medical Management","Elective Surgery","Emergency","Day Care","Observation","OPD"]

// ─── Firebase ──────────────────────────────────────────────────────────────
function todayKey() { return new Date().toISOString().slice(0,10) }
function safeKey(k) { return String(k).replace(/[.#$/[\]]/g,"_") }

async function fbGet(path) {
  try { const s=await get(ref(db,path)); return s.exists()?s.val():null }
  catch(e) { console.error("fbGet",path,e); return null }
}
async function fbSet(path,val) {
  try { await set(ref(db,path),val) } catch(e) { console.error("fbSet",path,e) }
}
async function fbDel(path) {
  try { await remove(ref(db,path)) } catch(e) { console.error("fbDel",path,e) }
}

// Users
async function dbLoadUsers() {
  const v=await fbGet("gmsh/users"); if(!v)return null
  const all=Object.values(v)
  return [...all.filter(u=>u.isDir),...all.filter(u=>!u.isDir).sort((a,b)=>a.name.localeCompare(b.name))]
}
async function dbSeedUsers() { const o={}; DEFAULT_USERS.forEach(u=>{o[u.id]=u}); await fbSet("gmsh/users",o); return DEFAULT_USERS }
async function dbSaveUser(u) { await fbSet(`gmsh/users/${u.id}`,u) }
async function dbDeleteUser(id) { await fbDel(`gmsh/users/${id}`) }

// Steps
async function dbLoadSteps() {
  const v=await fbGet("gmsh/config/steps"); if(!v)return null
  return Object.values(v).sort((a,b)=>a.id-b.id)
}
async function dbSeedSteps() { const o={}; DEFAULT_STEPS.forEach(s=>{o[s.id]=s}); await fbSet("gmsh/config/steps",o); return [...DEFAULT_STEPS] }
async function dbSaveStep(s) { await fbSet(`gmsh/config/steps/${s.id}`,s) }
async function dbDeleteStep(id) { await fbDel(`gmsh/config/steps/${id}`) }

// Patients — scan last 14 days, include all (discharged flag preserved)
async function dbLoadActivePatients() {
  const all=[],seen=new Set()
  for(let i=0;i<14;i++){
    const d=new Date(); d.setDate(d.getDate()-i)
    const dk=d.toISOString().slice(0,10)
    const v=await fbGet(`gmsh/${dk}/patients`)
    if(v) Object.values(v).forEach(p=>{ if(!seen.has(p.id)){seen.add(p.id);all.push(p)} })
  }
  return all
}
async function dbSavePatient(pt) {
  const dk=pt.admDate||todayKey()
  await fbSet(`gmsh/${dk}/patients/${safeKey(pt.id)}`,pt)
}

// Checks — value: {checked,by,byName,at} when ticked, {checked:false} when unticked
const chkPath=(dk,ptId,uid)=>`gmsh/${dk}/checks/${safeKey(ptId)}/${uid}`
const subPath=(dk,ptId)=>`gmsh/${dk}/submissions/${safeKey(ptId)}`

async function dbLoadChecks(ptId,uid,dk=null) { return (await fbGet(chkPath(dk||todayKey(),ptId,uid)))||{} }
async function dbSaveChecks(ptId,uid,d,dk=null) { await fbSet(chkPath(dk||todayKey(),ptId,uid),d) }
async function dbLoadSubmission(ptId,dk=null) { return await fbGet(subPath(dk||todayKey(),ptId)) }
async function dbSaveSubmission(ptId,d,dk=null) { await fbSet(subPath(dk||todayKey(),ptId),d) }

function isTicked(v) { return v?.checked===true||v===true }
function tickInfo(v) { return (v&&v!==true&&v.checked)?{by:v.byName,at:v.at}:null }

// ─── Utils ─────────────────────────────────────────────────────────────────
function newId()    { return "pt"+Date.now()+Math.floor(Math.random()*999) }
function clockStr() { return new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"}) }
function dateStr()  { return new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric"}) }
function fmtTs(iso) { if(!iso)return""; return new Date(iso).toLocaleString("en-IN",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}) }
function fmtDate(dk){ return new Date(dk+"T00:00:00").toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"}) }
function nDaysAgo(n){ const d=new Date(); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10) }
function daysAgoLabel(dk){ if(!dk)return""; const days=Math.round((Date.now()-new Date(dk+"T00:00:00").getTime())/86400000); return days===0?"today":days===1?"yesterday":`${days}d ago` }
function dateRangeKeys(s,e){ const keys=[],cur=new Date(s),end=new Date(e); while(cur<=end){keys.push(cur.toISOString().slice(0,10));cur.setDate(cur.getDate()+1)} return keys }

// ─── Style Factories ───────────────────────────────────────────────────────
const inp  = C=>({width:"100%",border:"1.5px solid "+C.border,borderRadius:8,padding:"9px 12px",fontSize:13,outline:"none",background:C.ib,color:C.text,boxSizing:"border-box"})
const lbl  = C=>({fontSize:11,fontWeight:700,color:C.sub,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:.5})
const sbtn = (C,dis)=>({width:"100%",background:dis?C.border:C.navy,border:"none",borderRadius:10,padding:"14px",color:dis?C.muted:"#fff",fontSize:14,fontWeight:700,cursor:dis?"not-allowed":"pointer"})

// ─── Session Timeout ───────────────────────────────────────────────────────
function useSessionTimeout(active,onExpire,mins=15) {
  const last=useRef(Date.now())
  useEffect(()=>{
    if(!active)return
    const bump=()=>{last.current=Date.now()}
    const evts=["mousedown","keydown","touchstart","scroll","click"]
    evts.forEach(e=>document.addEventListener(e,bump,true))
    const t=setInterval(()=>{ if(Date.now()-last.current>mins*60000)onExpire() },30000)
    return()=>{ evts.forEach(e=>document.removeEventListener(e,bump,true)); clearInterval(t) }
  },[active,onExpire,mins])
}

// ══ MANAGE USERS ═══════════════════════════════════════════════════════════
function ManageUsers({ users, onUsersChanged }) {
  const dark=useContext(DarkCtx), C=pal(dark)
  const blank={name:"",role:"",pin:"",initials:"",color:COLOR_OPTS[0],owns:[]}
  const [showForm,  setShowForm]  = useState(false)
  const [editTgt,   setEditTgt]   = useState(null)
  const [form,      setForm]      = useState(blank)
  const [delConf,   setDelConf]   = useState(null)
  const [saving,    setSaving]    = useState(false)
  const [err,       setErr]       = useState("")
  const sf=k=>v=>setForm(p=>({...p,[k]:v}))
  function openAdd()  { setForm(blank); setEditTgt(null); setErr(""); setShowForm(true) }
  function openEdit(u){ setForm({...u,owns:[...u.owns]}); setEditTgt(u); setErr(""); setShowForm(true) }
  function toggleStep(id){ setForm(p=>({...p,owns:p.owns.includes(id)?p.owns.filter(x=>x!==id):[...p.owns,id].sort((a,b)=>a-b)})) }
  async function save(){
    if(!form.name.trim()){setErr("Name required");return}
    if(!/^\d{4}$/.test(form.pin)){setErr("PIN must be 4 digits");return}
    if(!form.initials.trim()){setErr("Initials required");return}
    const dup=users.find(u=>u.pin===form.pin&&u.id!==(editTgt?.id))
    if(dup){setErr(`PIN already used by ${dup.name}`);return}
    setSaving(true);setErr("")
    const uid=editTgt?editTgt.id:"u"+Date.now()
    const updated={id:uid,name:form.name.trim(),role:form.role.trim(),pin:form.pin,initials:form.initials.trim().toUpperCase().slice(0,2),color:form.color,isDir:editTgt?.isDir||false,owns:form.owns}
    await dbSaveUser(updated)
    onUsersChanged(editTgt?users.map(u=>u.id===editTgt.id?updated:u):[...users,updated])
    setSaving(false);setShowForm(false)
  }
  async function del(u){ await dbDeleteUser(u.id); onUsersChanged(users.filter(x=>x.id!==u.id)); setDelConf(null) }
  const staff=users.filter(u=>!u.isDir)
  return (
    <div style={{padding:"14px 14px 60px",background:C.bg}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <div style={{fontWeight:700,fontSize:15,color:C.text}}>Staff Accounts <span style={{color:C.muted,fontWeight:400,fontSize:12}}>({staff.length})</span></div>
        <button onClick={openAdd} style={{background:C.navy,border:"none",borderRadius:9,color:"#fff",fontSize:13,padding:"9px 16px",cursor:"pointer",fontWeight:700}}>+ Add User</button>
      </div>
      {staff.map(u=>(
        <div key={u.id} style={{background:C.card,borderRadius:11,padding:"13px 14px",marginBottom:10,boxShadow:"0 1px 5px rgba(0,0,0,.1)"}}>
          <div style={{display:"flex",alignItems:"center",gap:11}}>
            <div style={{width:42,height:42,borderRadius:10,background:u.color,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:13,flexShrink:0}}>{u.initials}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,fontSize:14,color:C.text}}>{u.name}</div>
              <div style={{color:C.muted,fontSize:11,marginTop:1}}>{u.role} · PIN: {u.pin}</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:3,marginTop:5}}>
                {u.owns.map(id=><span key={id} style={{background:C.tealL,border:"1px solid "+C.border,borderRadius:4,padding:"1px 6px",fontSize:10,color:C.teal,fontWeight:600}}>Step {id}</span>)}
                {u.owns.length===0&&<span style={{color:C.red,fontSize:10,fontWeight:600}}>No steps assigned</span>}
              </div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6,flexShrink:0}}>
              <button onClick={()=>openEdit(u)} style={{background:C.tealL,border:"1px solid "+C.border,borderRadius:7,color:C.teal,fontSize:11,padding:"5px 12px",cursor:"pointer",fontWeight:600}}>Edit</button>
              <button onClick={()=>setDelConf(u)} style={{background:"#FEE2E2",border:"1px solid #FCA5A5",borderRadius:7,color:C.red,fontSize:11,padding:"5px 12px",cursor:"pointer",fontWeight:600}}>Delete</button>
            </div>
          </div>
        </div>
      ))}
      {showForm&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:300,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
          <div style={{background:C.card,borderRadius:"18px 18px 0 0",width:"100%",maxWidth:680,maxHeight:"92vh",overflowY:"auto"}}>
            <div style={{background:C.navy,padding:"15px 18px",borderRadius:"18px 18px 0 0",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:10}}>
              <div style={{color:"#fff",fontWeight:700,fontSize:15}}>{editTgt?"Edit User":"Add New User"}</div>
              <button onClick={()=>setShowForm(false)} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:8,color:"#fff",width:34,height:34,fontSize:18,cursor:"pointer"}}>✕</button>
            </div>
            <div style={{padding:"18px 18px 40px",display:"flex",flexDirection:"column",gap:14}}>
              {err&&<div style={{background:"#FEE2E2",border:"1px solid #FCA5A5",borderRadius:8,padding:"10px 14px",color:"#B91C1C",fontSize:13}}>{err}</div>}
              <div><label style={lbl(C)}>Full Name *</label><input style={inp(C)} value={form.name} onChange={e=>sf("name")(e.target.value)} placeholder="e.g. Dr. Priya Sharma" /></div>
              <div><label style={lbl(C)}>Role / Designation</label><input style={inp(C)} value={form.role} onChange={e=>sf("role")(e.target.value)} placeholder="e.g. Anaesthesiologist" /></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div><label style={lbl(C)}>4-Digit PIN *</label><input style={inp(C)} value={form.pin} onChange={e=>sf("pin")(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="e.g. 6789" inputMode="numeric" /></div>
                <div><label style={lbl(C)}>Initials (2) *</label><input style={inp(C)} value={form.initials} onChange={e=>sf("initials")(e.target.value.slice(0,2))} placeholder="e.g. PS" /></div>
              </div>
              <div>
                <label style={lbl(C)}>Colour</label>
                <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:4}}>
                  {COLOR_OPTS.map(col=><div key={col} onClick={()=>sf("color")(col)} style={{width:34,height:34,borderRadius:9,background:col,cursor:"pointer",boxShadow:form.color===col?"0 0 0 2px #fff, 0 0 0 4px "+col:"0 1px 4px rgba(0,0,0,.2)"}} />)}
                </div>
              </div>
              <div>
                <label style={lbl(C)}>Assign Steps</label>
                <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:4}}>
                  {DEFAULT_STEPS.map(s=>{
                    const on=form.owns.includes(s.id)
                    return (
                      <div key={s.id} onClick={()=>toggleStep(s.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:9,border:"1.5px solid "+(on?C.teal:C.border),background:on?C.tealL:C.card,cursor:"pointer"}}>
                        <div style={{width:20,height:20,borderRadius:5,border:"2px solid "+(on?C.teal:"#B0C8CC"),background:on?C.teal:C.card,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                          {on&&<span style={{color:"#fff",fontSize:11,fontWeight:800}}>✓</span>}
                        </div>
                        <span style={{fontSize:12,fontWeight:700,color:C.navy}}>Step {s.id}: </span><span style={{fontSize:12,color:C.sub}}>{s.title}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
              <button onClick={save} disabled={saving||!form.name.trim()||form.pin.length!==4||!form.initials.trim()} style={sbtn(C,saving||!form.name.trim()||form.pin.length!==4||!form.initials.trim())}>
                {saving?"Saving…":editTgt?"✓  Save Changes":"✓  Add User"}
              </button>
            </div>
          </div>
        </div>
      )}
      {delConf&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:C.card,borderRadius:14,padding:"22px 20px",maxWidth:340,width:"100%"}}>
            <div style={{textAlign:"center",marginBottom:16}}>
              <div style={{fontSize:28,marginBottom:8}}>⚠️</div>
              <div style={{fontWeight:700,fontSize:15,color:C.red}}>Delete User?</div>
              <div style={{color:C.sub,fontSize:12,marginTop:6}}><b>{delConf.name}</b> will be permanently removed.</div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <button onClick={()=>setDelConf(null)} style={{border:"1.5px solid "+C.border,borderRadius:9,padding:"12px",background:C.card,cursor:"pointer",color:C.text,fontSize:13,fontWeight:600}}>Cancel</button>
              <button onClick={()=>del(delConf)} style={{border:"none",borderRadius:9,padding:"12px",background:C.red,cursor:"pointer",color:"#fff",fontSize:13,fontWeight:700}}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ══ MANAGE STEPS ═══════════════════════════════════════════════════════════
function ManageSteps({ steps, onStepsChanged }) {
  const dark=useContext(DarkCtx), C=pal(dark)
  const blank={title:"",time:"",tags:"",checks:[""]}
  const [showForm,  setShowForm]  = useState(false)
  const [editTgt,   setEditTgt]   = useState(null)
  const [form,      setForm]      = useState(blank)
  const [delConf,   setDelConf]   = useState(null)
  const [saving,    setSaving]    = useState(false)
  const [err,       setErr]       = useState("")
  function openAdd()  { setForm(blank); setEditTgt(null); setErr(""); setShowForm(true) }
  function openEdit(s){ setForm({...s,tags:(s.tags||[]).join(", ")}); setEditTgt(s); setErr(""); setShowForm(true) }
  function setChk(i,v){ setForm(f=>{const c=[...f.checks];c[i]=v;return{...f,checks:c}}) }
  function addChk()  { setForm(f=>({...f,checks:[...f.checks,""]})) }
  function remChk(i) { setForm(f=>({...f,checks:f.checks.filter((_,j)=>j!==i)})) }
  function moveChk(i,dir){
    setForm(f=>{
      const c=[...f.checks],ni=i+dir
      if(ni<0||ni>=c.length)return f
      ;[c[i],c[ni]]=[c[ni],c[i]]; return{...f,checks:c}
    })
  }
  async function save(){
    if(!form.title.trim()){setErr("Title required");return}
    const cleanChecks=form.checks.map(c=>c.trim()).filter(Boolean)
    if(!cleanChecks.length){setErr("At least one check item required");return}
    setSaving(true);setErr("")
    const id=editTgt?editTgt.id:Math.max(0,...steps.map(s=>s.id))+1
    const updated={id,title:form.title.trim(),time:form.time.trim(),tags:form.tags.split(",").map(t=>t.trim()).filter(Boolean),checks:cleanChecks}
    await dbSaveStep(updated)
    onStepsChanged(editTgt?steps.map(s=>s.id===editTgt.id?updated:s):[...steps,updated].sort((a,b)=>a.id-b.id))
    setSaving(false);setShowForm(false)
  }
  async function del(s){ await dbDeleteStep(s.id); onStepsChanged(steps.filter(x=>x.id!==s.id)); setDelConf(null) }
  return (
    <div style={{padding:"14px 14px 60px",background:C.bg}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <div>
          <div style={{fontWeight:700,fontSize:15,color:C.text}}>Checklist Steps</div>
          <div style={{color:C.muted,fontSize:11}}>{steps.length} steps · changes apply instantly to all staff</div>
        </div>
        <button onClick={openAdd} style={{background:C.navy,border:"none",borderRadius:9,color:"#fff",fontSize:13,padding:"9px 16px",cursor:"pointer",fontWeight:700}}>+ Add Step</button>
      </div>
      {steps.map(s=>(
        <div key={s.id} style={{background:C.card,borderRadius:11,padding:"12px 14px",marginBottom:10,boxShadow:"0 1px 5px rgba(0,0,0,.1)"}}>
          <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
            <div style={{width:30,height:30,borderRadius:8,background:C.teal,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:12,flexShrink:0}}>{s.id}</div>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:13,color:C.text}}>{s.title} {s.time&&<span style={{color:C.muted,fontWeight:400,fontSize:11}}>· {s.time}</span>}</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:3,marginTop:4}}>{(s.tags||[]).map(t=><span key={t} style={{background:C.tealL,border:"1px solid "+C.border,borderRadius:4,padding:"1px 6px",fontSize:10,color:C.teal,fontWeight:600}}>{t}</span>)}</div>
              <div style={{marginTop:5}}>{s.checks.map((c,i)=><div key={i} style={{color:C.sub,fontSize:11,padding:"1px 0"}}>• {c}</div>)}</div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:5,flexShrink:0}}>
              <button onClick={()=>openEdit(s)} style={{background:C.tealL,border:"1px solid "+C.border,borderRadius:7,color:C.teal,fontSize:11,padding:"4px 10px",cursor:"pointer",fontWeight:600}}>Edit</button>
              <button onClick={()=>setDelConf(s)} style={{background:"#FEE2E2",border:"1px solid #FCA5A5",borderRadius:7,color:C.red,fontSize:11,padding:"4px 10px",cursor:"pointer",fontWeight:600}}>Delete</button>
            </div>
          </div>
        </div>
      ))}
      {showForm&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:300,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
          <div style={{background:C.card,borderRadius:"18px 18px 0 0",width:"100%",maxWidth:680,maxHeight:"92vh",overflowY:"auto"}}>
            <div style={{background:C.navy,padding:"15px 18px",borderRadius:"18px 18px 0 0",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:10}}>
              <div style={{color:"#fff",fontWeight:700,fontSize:15}}>{editTgt?"Edit Step":"Add New Step"}</div>
              <button onClick={()=>setShowForm(false)} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:8,color:"#fff",width:34,height:34,fontSize:18,cursor:"pointer"}}>✕</button>
            </div>
            <div style={{padding:"18px 18px 40px",display:"flex",flexDirection:"column",gap:14}}>
              {err&&<div style={{background:"#FEE2E2",border:"1px solid #FCA5A5",borderRadius:8,padding:"10px 14px",color:"#B91C1C",fontSize:13}}>{err}</div>}
              <div><label style={lbl(C)}>Step Title *</label><input style={inp(C)} value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="e.g. Pre-Op Assessment" /></div>
              <div><label style={lbl(C)}>Time / When</label><input style={inp(C)} value={form.time} onChange={e=>setForm(f=>({...f,time:e.target.value}))} placeholder="e.g. 9:00 AM" /></div>
              <div><label style={lbl(C)}>Tags (comma-separated)</label><input style={inp(C)} value={form.tags} onChange={e=>setForm(f=>({...f,tags:e.target.value}))} placeholder="e.g. Vitals, Lab" /></div>
              <div>
                <label style={lbl(C)}>Check Items</label>
                {form.checks.map((c,i)=>(
                  <div key={i} style={{display:"flex",gap:5,marginBottom:6,alignItems:"center"}}>
                    <input style={{...inp(C),marginBottom:0}} value={c} onChange={e=>setChk(i,e.target.value)} placeholder={`Check item ${i+1}`} />
                    <button onClick={()=>moveChk(i,-1)} disabled={i===0} style={{background:C.tealL,border:"1px solid "+C.border,borderRadius:6,color:C.teal,padding:"6px 8px",cursor:"pointer",opacity:i===0?.3:1}}>▲</button>
                    <button onClick={()=>moveChk(i,1)} disabled={i===form.checks.length-1} style={{background:C.tealL,border:"1px solid "+C.border,borderRadius:6,color:C.teal,padding:"6px 8px",cursor:"pointer",opacity:i===form.checks.length-1?.3:1}}>▼</button>
                    <button onClick={()=>remChk(i)} style={{background:"#FEE2E2",border:"1px solid #FCA5A5",borderRadius:6,color:C.red,padding:"6px 8px",cursor:"pointer"}}>✕</button>
                  </div>
                ))}
                <button onClick={addChk} style={{background:C.tealL,border:"1px solid "+C.border,borderRadius:8,color:C.teal,fontSize:12,padding:"7px 14px",cursor:"pointer",fontWeight:600,marginTop:4}}>+ Add Item</button>
              </div>
              <button onClick={save} disabled={saving||!form.title.trim()} style={sbtn(C,saving||!form.title.trim())}>{saving?"Saving…":editTgt?"✓  Save Changes":"✓  Add Step"}</button>
            </div>
          </div>
        </div>
      )}
      {delConf&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:C.card,borderRadius:14,padding:"22px 20px",maxWidth:340,width:"100%"}}>
            <div style={{textAlign:"center",marginBottom:16}}>
              <div style={{fontSize:28,marginBottom:8}}>⚠️</div>
              <div style={{fontWeight:700,fontSize:15,color:C.red}}>Delete Step {delConf.id}?</div>
              <div style={{color:C.sub,fontSize:12,marginTop:6}}><b>{delConf.title}</b> will be removed from all staff checklists.</div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <button onClick={()=>setDelConf(null)} style={{border:"1.5px solid "+C.border,borderRadius:9,padding:"12px",background:C.card,cursor:"pointer",color:C.text,fontSize:13,fontWeight:600}}>Cancel</button>
              <button onClick={()=>del(delConf)} style={{border:"none",borderRadius:9,padding:"12px",background:C.red,cursor:"pointer",color:"#fff",fontSize:13,fontWeight:700}}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ══ PERFORMANCE VIEW ═══════════════════════════════════════════════════════
function PerformanceView({ users, steps }) {
  const dark=useContext(DarkCtx), C=pal(dark)
  const [start,  setStart]  = useState(nDaysAgo(6))
  const [end,    setEnd]    = useState(todayKey())
  const [data,   setData]   = useState(null)
  const [loading,setLoading]= useState(false)
  const staff=users.filter(u=>!u.isDir)

  async function load() {
    setLoading(true)
    const dates=dateRangeKeys(start,end)
    const perf={}
    staff.forEach(u=>{perf[u.id]={done:0,total:0,byDate:{}}})
    for(const dk of dates){
      const pv=await fbGet(`gmsh/${dk}/patients`)
      const pts=pv?Object.values(pv):[]
      for(const u of staff){
        const mySteps=steps.filter(s=>u.owns.includes(s.id))
        const totalPerPt=mySteps.reduce((a,s)=>a+s.checks.length,0)
        let dd=0, dt=pts.length*totalPerPt
        for(const pt of pts){
          const chk=await dbLoadChecks(pt.id,u.id,dk)
          mySteps.forEach(s=>s.checks.forEach((_,i)=>{if(isTicked(chk[s.id+"-"+i]))dd++}))
        }
        perf[u.id].done+=dd; perf[u.id].total+=dt
        perf[u.id].byDate[dk]=dt>0?Math.round(dd/dt*100):null
      }
    }
    setData(perf); setLoading(false)
  }
  useEffect(()=>{load()},[])
  const dates=dateRangeKeys(start,end).slice(-14)
  return (
    <div style={{padding:"14px 14px 40px",background:C.bg}}>
      <div style={{fontWeight:700,fontSize:15,color:C.text,marginBottom:10}}>Staff Performance</div>
      <div style={{background:C.card,borderRadius:10,padding:"12px 14px",marginBottom:14,display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end",boxShadow:"0 1px 4px rgba(0,0,0,.08)"}}>
        <div style={{flex:1,minWidth:120}}><label style={lbl(C)}>From</label><input type="date" style={inp(C)} value={start} onChange={e=>setStart(e.target.value)} /></div>
        <div style={{flex:1,minWidth:120}}><label style={lbl(C)}>To</label><input type="date" style={inp(C)} value={end} onChange={e=>setEnd(e.target.value)} /></div>
        <button onClick={load} style={{background:C.navy,border:"none",borderRadius:8,color:"#fff",fontSize:12,padding:"9px 16px",cursor:"pointer",fontWeight:600,height:38,alignSelf:"flex-end"}}>Load</button>
      </div>
      {loading&&<div style={{padding:40,textAlign:"center",color:C.muted}}>⏳ Loading…</div>}
      {!loading&&data&&staff.map(u=>{
        const d=data[u.id], pct=d.total>0?Math.round(d.done/d.total*100):0
        const col=pct>=80?C.green:pct>=50?C.amber:C.red
        return (
          <div key={u.id} style={{background:C.card,borderRadius:11,padding:"13px 14px",marginBottom:10,boxShadow:"0 1px 5px rgba(0,0,0,.08)"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
              <div style={{width:36,height:36,borderRadius:9,background:u.color,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:12,flexShrink:0}}>{u.initials}</div>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:13,color:C.text}}>{u.name}</div>
                <div style={{color:C.muted,fontSize:11}}>{d.done}/{d.total} tasks · {dates.length} day{dates.length!==1?"s":""}</div>
              </div>
              <div style={{fontWeight:800,fontSize:22,color:col}}>{pct}%</div>
            </div>
            <div style={{background:C.bg,borderRadius:4,height:7,overflow:"hidden",marginBottom:8}}>
              <div style={{width:pct+"%",height:"100%",background:col,borderRadius:4,transition:"width .4s"}} />
            </div>
            <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
              {dates.map(dk=>{
                const v=d.byDate[dk]; const bc=v===null?C.border:v>=80?C.green:v>=50?C.amber:C.red
                return <div key={dk} title={`${fmtDate(dk)}: ${v!==null?v+"%":"No patients"}`} style={{width:18,height:18,borderRadius:3,background:bc,opacity:v===null?.35:1,cursor:"default"}} />
              })}
            </div>
            <div style={{color:C.muted,fontSize:9,marginTop:4}}>■ Each square = 1 day &nbsp;·&nbsp; Green ≥80% &nbsp;·&nbsp; Amber 50-79% &nbsp;·&nbsp; Red &lt;50%</div>
          </div>
        )
      })}
    </div>
  )
}

// ══ LOGIN ══════════════════════════════════════════════════════════════════
function Login({ users, onLogin }) {
  const dark=useContext(DarkCtx), C=pal(dark)
  const [sel,  setSel]  = useState(null)
  const [pin,  setPin]  = useState("")
  const [err,  setErr]  = useState(false)
  const [shk,  setShk]  = useState(false)
  function pick(u){setSel(u);setPin("");setErr(false)}
  function digit(d){
    if(pin.length>=4)return
    const n=pin+d; setPin(n); setErr(false)
    if(n.length===4)setTimeout(()=>{
      if(n===sel.pin){onLogin(sel)}
      else{setShk(true);setErr(true);setTimeout(()=>{setPin("");setShk(false)},600)}
    },120)
  }
  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#3D1A78 0%,#1B3A6B 55%,#00798C 100%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{textAlign:"center",marginBottom:24}}>
        <div style={{fontSize:30,marginBottom:8}}>🏥</div>
        <div style={{color:"#C4A8E8",fontSize:10,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase"}}>Gurdevi Memorial Superspeciality Hospital</div>
        <div style={{color:"#fff",fontSize:18,fontWeight:700,marginTop:4}}>Patient Care Portal</div>
        <div style={{color:"rgba(196,168,232,.6)",fontSize:11,marginTop:2}}>{dateStr()}</div>
      </div>
      {!sel?(
        <div style={{width:"100%",maxWidth:400}}>
          <div style={{color:"rgba(255,255,255,.4)",fontSize:10,fontWeight:700,textAlign:"center",letterSpacing:1,marginBottom:10,textTransform:"uppercase"}}>Select account</div>
          {users.map(u=>(
            <button key={u.id} onClick={()=>pick(u)} style={{width:"100%",display:"flex",alignItems:"center",gap:12,background:u.isDir?"rgba(106,61,184,.25)":"rgba(255,255,255,.07)",border:u.isDir?"1.5px solid rgba(196,168,232,.4)":"1.5px solid rgba(255,255,255,.12)",borderRadius:11,padding:"12px 15px",marginBottom:8,cursor:"pointer",textAlign:"left"}}>
              <div style={{width:38,height:38,borderRadius:9,background:u.color,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:13,flexShrink:0}}>{u.initials}</div>
              <div style={{flex:1}}>
                <div style={{color:"#fff",fontWeight:700,fontSize:13}}>{u.name}</div>
                <div style={{color:u.isDir?"#C4A8E8":"rgba(168,213,219,.7)",fontSize:11}}>{u.role}</div>
              </div>
              {u.isDir&&<span>👑</span>}
              <span style={{color:"rgba(255,255,255,.3)",fontSize:17}}>›</span>
            </button>
          ))}
        </div>
      ):(
        <div style={{width:"100%",maxWidth:280,textAlign:"center"}}>
          <button onClick={()=>setSel(null)} style={{background:"none",border:"none",color:"rgba(196,168,232,.6)",cursor:"pointer",fontSize:13,display:"block",margin:"0 auto 16px"}}>← Back</button>
          <div style={{width:50,height:50,borderRadius:12,background:sel.color,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:17,margin:"0 auto 10px"}}>{sel.initials}</div>
          <div style={{color:"#fff",fontWeight:700,fontSize:15}}>{sel.name}</div>
          <div style={{color:"rgba(196,168,232,.65)",fontSize:11,marginBottom:20}}>{sel.role}</div>
          <div style={{display:"flex",justifyContent:"center",gap:13,marginBottom:8,animation:shk?"shake .5s":"none"}}>
            {[0,1,2,3].map(i=><div key={i} style={{width:13,height:13,borderRadius:"50%",border:"2px solid "+(err?"#F87171":"rgba(196,168,232,.5)"),background:pin.length>i?(err?"#F87171":"#C4A8E8"):"transparent"}} />)}
          </div>
          {err&&<div style={{color:"#F87171",fontSize:12,marginBottom:10}}>Incorrect PIN. Try again.</div>}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:9}}>
            {[1,2,3,4,5,6,7,8,9].map(d=><button key={d} onClick={()=>digit(String(d))} style={{background:"rgba(255,255,255,.1)",border:"1.5px solid rgba(255,255,255,.15)",borderRadius:9,padding:"14px 0",color:"#fff",fontSize:17,fontWeight:600,cursor:"pointer"}}>{d}</button>)}
            <div/>
            <button onClick={()=>digit("0")} style={{background:"rgba(255,255,255,.1)",border:"1.5px solid rgba(255,255,255,.15)",borderRadius:9,padding:"14px 0",color:"#fff",fontSize:17,fontWeight:600,cursor:"pointer"}}>0</button>
            <button onClick={()=>setPin(p=>p.slice(0,-1))} style={{background:"rgba(255,255,255,.06)",border:"1.5px solid rgba(255,255,255,.1)",borderRadius:9,padding:"14px 0",color:"rgba(255,255,255,.5)",fontSize:17,cursor:"pointer"}}>⌫</button>
          </div>
          <div style={{color:"rgba(196,168,232,.35)",fontSize:10,marginTop:12}}>Enter 4-digit PIN</div>
        </div>
      )}
      <style>{`@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}`}</style>
    </div>
  )
}

// ══ ADD PATIENT ════════════════════════════════════════════════════════════
function AddPatient({ user, onDone, onClose }) {
  const dark=useContext(DarkCtx), C=pal(dark)
  const [f,setF_]=useState({name:"",age:"",gender:"M",uhid:"",bedNumber:"",ward:"General Ward",admType:"Medical Management",dx:"",notes:""})
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState("")
  const sf=(k,v)=>setF_(p=>({...p,[k]:v}))
  async function submit(){
    if(!f.name.trim()){setError("Patient name is required.");return}
    setSaving(true);setError("")
    try{
      const pt={id:newId(),name:f.name.trim(),age:f.age,gender:f.gender,uhid:f.uhid.trim()||"—",bedNumber:f.bedNumber.trim(),ward:f.ward,admType:f.admType,dx:f.dx.trim(),notes:f.notes.trim(),addedBy:user.id,addedByName:user.name,addedAt:new Date().toISOString(),admDate:todayKey()}
      await dbSavePatient(pt)
      onDone(pt)
    }catch(e){setError("Save failed. Check internet connection.")}
    setSaving(false)
  }
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:300,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div style={{background:C.card,borderRadius:"18px 18px 0 0",width:"100%",maxWidth:680,maxHeight:"92vh",overflowY:"auto"}}>
        <div style={{background:C.navy,padding:"15px 18px",borderRadius:"18px 18px 0 0",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:10}}>
          <div style={{color:"#fff",fontWeight:700,fontSize:15}}>Add New Patient</div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:8,color:"#fff",width:34,height:34,fontSize:18,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{padding:"18px 18px 40px",display:"flex",flexDirection:"column",gap:14}}>
          {error&&<div style={{background:"#FEE2E2",border:"1px solid #FCA5A5",borderRadius:8,padding:"10px 14px",color:"#B91C1C",fontSize:13}}>{error}</div>}
          <div><label style={lbl(C)}>Patient Name *</label><input style={inp(C)} value={f.name} onChange={e=>sf("name",e.target.value)} placeholder="Full name" /></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
            <div><label style={lbl(C)}>Age</label><input style={inp(C)} type="number" value={f.age} onChange={e=>sf("age",e.target.value)} placeholder="e.g. 45" /></div>
            <div><label style={lbl(C)}>Gender</label><select style={inp(C)} value={f.gender} onChange={e=>sf("gender",e.target.value)}><option value="M">Male</option><option value="F">Female</option><option value="O">Other</option></select></div>
            <div><label style={lbl(C)}>Bed / IP No.</label><input style={inp(C)} value={f.bedNumber} onChange={e=>sf("bedNumber",e.target.value)} placeholder="e.g. B-12" /></div>
          </div>
          <div><label style={lbl(C)}>UHID / MR Number</label><input style={inp(C)} value={f.uhid} onChange={e=>sf("uhid",e.target.value)} placeholder="e.g. GMSH-2026-001" /></div>
          <div><label style={lbl(C)}>Diagnosis / Chief Complaint</label><input style={inp(C)} value={f.dx} onChange={e=>sf("dx",e.target.value)} placeholder="e.g. Ureteric calculus" /></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div><label style={lbl(C)}>Ward / Unit</label><select style={inp(C)} value={f.ward} onChange={e=>sf("ward",e.target.value)}>{WARDS.map(w=><option key={w} value={w}>{w}</option>)}</select></div>
            <div><label style={lbl(C)}>Admission Type</label><select style={inp(C)} value={f.admType} onChange={e=>sf("admType",e.target.value)}>{ADM_TYPES.map(a=><option key={a} value={a}>{a}</option>)}</select></div>
          </div>
          <div><label style={lbl(C)}>Notes / Remarks</label><textarea style={{...inp(C),resize:"vertical",minHeight:64,lineHeight:1.5}} value={f.notes} onChange={e=>sf("notes",e.target.value)} placeholder="Allergies, special instructions, family contact…" /></div>
          <button onClick={submit} disabled={saving||!f.name.trim()} style={sbtn(C,saving||!f.name.trim())}>{saving?"Saving…":"✓  Add Patient"}</button>
        </div>
      </div>
    </div>
  )
}

// ══ PATIENT LIST ═══════════════════════════════════════════════════════════
function PatientList({ user, users, steps, onPick }) {
  const dark=useContext(DarkCtx), C=pal(dark)
  const [patients,setPatients]=useState([])
  const [sums,    setSums]    =useState({})
  const [loading, setLoading] =useState(true)
  const [showAdd, setShowAdd] =useState(false)
  const [search,  setSearch]  =useState("")
  const staff=users.filter(u=>!u.isDir)

  async function load(){
    setLoading(true)
    const pts=await dbLoadActivePatients()
    const active=pts.filter(p=>!p.discharged)
    setPatients(active)
    const s={}
    for(const pt of active){
      const sub=await dbLoadSubmission(pt.id)
      let done=0,total=0
      for(const u of staff){
        const c=await dbLoadChecks(pt.id,u.id)
        steps.forEach(st=>{total+=st.checks.length;done+=st.checks.filter((_,i)=>isTicked(c[st.id+"-"+i])).length})
      }
      s[pt.id]={sub,pct:total>0?Math.round(done/total*100):0}
    }
    setSums(s);setLoading(false)
  }
  useEffect(()=>{load()},[])

  function handleAdded(pt){setPatients(p=>[pt,...p]);setShowAdd(false);load()}

  const filtered=patients.filter(pt=>{
    if(!search.trim())return true
    const q=search.toLowerCase()
    return pt.name?.toLowerCase().includes(q)||pt.uhid?.toLowerCase().includes(q)||pt.bedNumber?.toLowerCase().includes(q)||pt.dx?.toLowerCase().includes(q)
  })

  if(loading)return<div style={{padding:40,textAlign:"center",color:C.muted,background:C.bg,minHeight:"60vh"}}><div style={{fontSize:26,marginBottom:8}}>⏳</div>Loading patients…</div>

  return (
    <div style={{padding:"14px 14px 90px",background:C.bg,minHeight:"60vh"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <div>
          <div style={{fontSize:15,fontWeight:700,color:C.text}}>Today's Patients</div>
          <div style={{color:C.muted,fontSize:11}}>{patients.length} active · {dateStr()}</div>
        </div>
        <button onClick={load} style={{background:C.tealL,border:"1px solid "+C.border,borderRadius:8,color:C.teal,fontSize:11,padding:"6px 12px",cursor:"pointer",fontWeight:600}}>↻ Refresh</button>
      </div>
      <input style={{...inp(C),marginBottom:12}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍  Search by name, UHID, bed, diagnosis…" />

      {filtered.length===0&&(
        <div style={{background:C.card,borderRadius:12,padding:"32px 20px",textAlign:"center",boxShadow:"0 1px 5px rgba(0,0,0,.07)"}}>
          <div style={{fontSize:32,marginBottom:10}}>🛏️</div>
          <div style={{color:C.text,fontWeight:700,fontSize:14,marginBottom:6}}>{search?"No patients match your search":"No patients yet today"}</div>
          {!search&&<button onClick={()=>setShowAdd(true)} style={{background:C.navy,border:"none",borderRadius:9,padding:"11px 24px",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",marginTop:8}}>+ Add First Patient</button>}
        </div>
      )}

      {filtered.map(pt=>{
        const sum=sums[pt.id]||{pct:0,sub:null},submitted=sum.sub?.submitted
        return (
          <div key={pt.id} onClick={()=>onPick(pt)} style={{background:C.card,borderRadius:11,padding:"13px 14px",marginBottom:10,cursor:"pointer",boxShadow:submitted?"0 0 0 2px "+C.green:"0 1px 5px rgba(0,0,0,.08)",border:submitted?"1.5px solid "+C.green:"1.5px solid transparent"}}>
            <div style={{display:"flex",alignItems:"flex-start",gap:11}}>
              <div style={{width:40,height:40,borderRadius:10,background:submitted?C.green:C.navy,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:submitted?18:14,fontWeight:800,flexShrink:0}}>{submitted?"✓":pt.gender}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
                  <span style={{fontWeight:700,fontSize:14,color:C.text}}>{pt.name}</span>
                  {pt.age&&<span style={{color:C.muted,fontSize:12}}>{pt.age}y</span>}
                  {pt.bedNumber&&<span style={{background:C.tealL,color:C.teal,fontSize:10,fontWeight:600,padding:"1px 6px",borderRadius:4}}>{pt.bedNumber}</span>}
                  {submitted&&<span style={{background:C.greenL,color:C.green,fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:5}}>Submitted</span>}
                </div>
                <div style={{color:C.muted,fontSize:11,marginTop:2}}>UHID: {pt.uhid} · {pt.ward} · {daysAgoLabel(pt.admDate)}</div>
                {pt.dx&&<div style={{color:C.teal,fontSize:11,marginTop:2,fontStyle:"italic"}}>{pt.dx}</div>}
                {pt.notes&&<div style={{color:C.sub,fontSize:10,marginTop:2,background:C.tealL,padding:"2px 7px",borderRadius:4,display:"inline-block"}}>📝 {pt.notes.slice(0,60)}{pt.notes.length>60?"…":""}</div>}
                <div style={{marginTop:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                    <span style={{fontSize:10,color:C.muted}}>Overall progress</span>
                    <span style={{fontSize:11,fontWeight:700,color:sum.pct===100?C.green:C.text}}>{sum.pct}%</span>
                  </div>
                  <div style={{background:C.bg,borderRadius:4,height:5,overflow:"hidden"}}>
                    <div style={{width:sum.pct+"%",height:"100%",background:sum.pct===100?C.green:C.teal,borderRadius:4,transition:"width .4s"}} />
                  </div>
                </div>
                {submitted&&sum.sub.submittedAt&&<div style={{color:C.green,fontSize:10,marginTop:4}}>✓ Submitted · {fmtTs(sum.sub.submittedAt)}</div>}
              </div>
              <span style={{color:C.muted,fontSize:18,flexShrink:0}}>›</span>
            </div>
          </div>
        )
      })}

      <button onClick={()=>setShowAdd(true)} style={{position:"fixed",bottom:30,right:20,background:C.navy,border:"none",borderRadius:"50%",width:54,height:54,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",boxShadow:"0 4px 16px rgba(13,43,94,.4)",zIndex:50,color:"#fff",fontSize:26,lineHeight:1}}>+</button>
      {showAdd&&<AddPatient user={user} onDone={handleAdded} onClose={()=>setShowAdd(false)} />}
    </div>
  )
}

// ══ CHECKLIST ══════════════════════════════════════════════════════════════
function Checklist({ pt, user, steps }) {
  const dark=useContext(DarkCtx), C=pal(dark)
  const [chk,    setChk]     = useState({})
  const [sub,    setSub]     = useState(null)
  const [loading,setLoading] = useState(true)
  const [exp,    setExp]     = useState({})
  const [conf,   setConf]    = useState(false)
  const [submitting,setSub2] = useState(false)

  useEffect(()=>{
    async function load(){
      const c=await dbLoadChecks(pt.id,user.id), s=await dbLoadSubmission(pt.id)
      setChk(c);setSub(s);setLoading(false)
    }
    load()
  },[pt.id,user.id])

  async function tap(stepId,idx){
    if(sub?.submitted)return
    const key=stepId+"-"+idx, curr=chk[key], ticked=isTicked(curr)
    const next={...chk,[key]:ticked?{checked:false}:{checked:true,by:user.id,byName:user.name,at:new Date().toISOString()}}
    setChk(next); await dbSaveChecks(pt.id,user.id,next)
  }

  async function doSubmit(){
    setSub2(true)
    const rec={submitted:true,submittedBy:user.id,submittedByName:user.name,submittedAt:new Date().toISOString(),ptId:pt.id,ptName:pt.name}
    await dbSaveSubmission(pt.id,rec); setSub(rec);setSub2(false);setConf(false)
  }

  const mySteps=steps.filter(s=>user.owns.includes(s.id))
  const myTotal=mySteps.reduce((a,s)=>a+s.checks.length,0)
  const myDone =mySteps.reduce((a,s)=>a+s.checks.filter((_,i)=>isTicked(chk[s.id+"-"+i])).length,0)
  const myPct  =myTotal>0?Math.round(myDone/myTotal*100):0
  const allDone=myDone===myTotal&&myTotal>0
  const submitted=sub?.submitted

  const waMsg=encodeURIComponent(`🏥 GMSH Care Update\nPatient: ${pt.name}\nUHID: ${pt.uhid}${pt.bedNumber?" · Bed: "+pt.bedNumber:""}\nStatus: Record Submitted ✅\nBy: ${sub?.submittedByName||user.name}\nTime: ${fmtTs(sub?.submittedAt)}\n${dateStr()}`)

  if(loading)return<div style={{padding:40,textAlign:"center",color:C.muted,background:C.bg}}>Loading…</div>

  return (
    <div style={{padding:"14px 14px 130px",background:C.bg}}>
      <div style={{background:C.navy,borderRadius:12,padding:"14px 16px",marginBottom:14,color:"#fff"}}>
        <div style={{fontWeight:700,fontSize:16}}>{pt.name}</div>
        <div style={{color:"#A8D5DB",fontSize:11,marginTop:2}}>{pt.age&&pt.age+"y · "}{pt.gender==="M"?"Male":pt.gender==="F"?"Female":"Other"} · UHID: {pt.uhid}{pt.bedNumber?" · "+pt.bedNumber:""}</div>
        <div style={{color:"#A8D5DB",fontSize:11}}>{pt.ward} · {pt.admType} · {daysAgoLabel(pt.admDate)}</div>
        {pt.dx&&<div style={{color:"#EBF6F8",fontSize:11,fontStyle:"italic",marginTop:3}}>{pt.dx}</div>}
        {pt.notes&&<div style={{background:"rgba(255,255,255,.1)",borderRadius:6,padding:"6px 10px",marginTop:6,fontSize:11,color:"rgba(235,246,248,.85)"}}>📝 {pt.notes}</div>}
        <div style={{marginTop:12}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
            <span style={{color:"#A8D5DB",fontSize:10}}>My tasks — {myDone}/{myTotal}</span>
            <span style={{color:myPct===100?"#6EE7B7":"#fff",fontSize:12,fontWeight:700}}>{myPct}%</span>
          </div>
          <div style={{background:"rgba(255,255,255,.15)",borderRadius:4,height:6,overflow:"hidden"}}>
            <div style={{width:myPct+"%",height:"100%",background:myPct===100?"#6EE7B7":C.teal,borderRadius:4,transition:"width .4s"}} />
          </div>
        </div>
      </div>

      {submitted&&(
        <div style={{background:C.greenL,border:"1.5px solid "+C.green,borderRadius:10,padding:"12px 14px",marginBottom:12,display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:22}}>✅</span>
          <div style={{flex:1}}>
            <div style={{color:C.green,fontWeight:700,fontSize:13}}>Record submitted</div>
            <div style={{color:C.green,fontSize:11}}>By {sub.submittedByName} · {fmtTs(sub.submittedAt)}</div>
          </div>
        </div>
      )}

      {submitted&&(
        <a href={`https://wa.me/?text=${waMsg}`} target="_blank" rel="noopener noreferrer"
          style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:"#25D366",border:"none",borderRadius:10,padding:"12px",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",textDecoration:"none",marginBottom:14}}>
          📲 Notify via WhatsApp
        </a>
      )}

      <div style={{fontSize:10,fontWeight:700,color:user.color,letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>Your Steps for This Patient</div>

      {mySteps.length===0&&<div style={{background:C.card,borderRadius:10,padding:"24px",textAlign:"center",color:C.muted}}><div style={{fontSize:24,marginBottom:8}}>📋</div>No steps assigned to your account.</div>}

      {mySteps.map(s=>{
        const done=s.checks.every((_,i)=>isTicked(chk[s.id+"-"+i]))
        const count=s.checks.filter((_,i)=>isTicked(chk[s.id+"-"+i])).length
        const open=exp[s.id]
        return (
          <div key={s.id} style={{marginBottom:9}}>
            <div style={{background:C.card,borderRadius:10,overflow:"hidden",boxShadow:done?"0 0 0 2px "+C.green:"0 1px 5px rgba(0,0,0,.07)"}}>
              <div onClick={()=>setExp(e=>({...e,[s.id]:!e[s.id]}))} style={{background:done?C.green:user.color,padding:"11px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:28,height:28,borderRadius:7,background:"rgba(0,0,0,.22)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:12,flexShrink:0}}>{s.id}</div>
                <div style={{flex:1}}>
                  <div style={{color:"#fff",fontWeight:700,fontSize:13}}>{s.title}</div>
                  {s.time&&<div style={{color:"rgba(255,255,255,.6)",fontSize:10}}>{s.time}</div>}
                </div>
                <div style={{background:"rgba(0,0,0,.18)",borderRadius:8,padding:"2px 7px",color:"#fff",fontSize:10,fontWeight:700}}>{count}/{s.checks.length}</div>
                <span style={{color:"rgba(255,255,255,.7)",fontSize:12}}>{open?"▲":"▼"}</span>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:4,padding:"6px 12px",background:C.tealL,borderBottom:"1px solid "+C.border}}>
                {(s.tags||[]).map(t=><span key={t} style={{background:C.card,border:"1px solid "+C.border,borderRadius:4,padding:"2px 6px",fontSize:10,fontWeight:600,color:C.teal}}>{t}</span>)}
              </div>
              {open&&(
                <div style={{padding:"10px 14px 12px",background:C.card}}>
                  {s.checks.map((c,i)=>{
                    const ticked=isTicked(chk[s.id+"-"+i]), info=tickInfo(chk[s.id+"-"+i])
                    return (
                      <div key={i} onClick={()=>!submitted&&tap(s.id,i)} style={{display:"flex",alignItems:"flex-start",gap:10,cursor:submitted?"default":"pointer",padding:"8px 10px",borderRadius:7,background:ticked?C.greenL:C.bg,border:"1px solid "+(ticked?C.green:C.border),marginBottom:5}}>
                        <div style={{width:20,height:20,borderRadius:5,border:"2px solid "+(ticked?C.green:"#B0C8CC"),background:ticked?C.green:C.card,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>
                          {ticked&&<span style={{color:"#fff",fontSize:11,fontWeight:800}}>✓</span>}
                        </div>
                        <div style={{flex:1}}>
                          <span style={{fontSize:13,color:ticked?C.green:C.text,fontWeight:ticked?600:400,textDecoration:ticked?"line-through":"none",opacity:ticked?.8:1,lineHeight:1.4}}>{c}</span>
                          {ticked&&info&&<div style={{fontSize:9,color:C.muted,marginTop:2}}>✓ {info.by} · {fmtTs(info.at)}</div>}
                        </div>
                      </div>
                    )
                  })}
                  {done&&<div style={{marginTop:6,background:C.greenL,border:"1px solid "+C.green,borderRadius:7,padding:"6px 12px",display:"flex",gap:7,alignItems:"center"}}><span>✅</span><span style={{color:C.green,fontSize:12,fontWeight:600}}>Step {s.id} complete</span></div>}
                </div>
              )}
            </div>
          </div>
        )
      })}

      {!submitted&&(
        <div style={{position:"fixed",bottom:0,left:0,right:0,padding:"10px 14px 20px",background:C.bg,borderTop:"1px solid "+C.border,zIndex:50}}>
          <div style={{maxWidth:680,margin:"0 auto"}}>
            {!allDone&&<div style={{background:C.amberL,border:"1px solid "+C.amber,borderRadius:8,padding:"7px 12px",marginBottom:8,color:C.amber,fontSize:12}}>⚠ {myTotal-myDone} task{myTotal-myDone!==1?"s":""} remaining</div>}
            <button onClick={()=>allDone&&setConf(true)} style={sbtn(C,!allDone)}>
              {allDone?"📋  Submit — All Tasks Complete":myPct+"% Done · "+(myTotal-myDone)+" remaining"}
            </button>
          </div>
        </div>
      )}

      {conf&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:C.card,borderRadius:14,padding:"22px 20px",maxWidth:360,width:"100%"}}>
            <div style={{textAlign:"center",marginBottom:16}}>
              <div style={{fontSize:30,marginBottom:8}}>📋</div>
              <div style={{fontWeight:700,fontSize:15,color:C.text}}>Submit Patient Record?</div>
              <div style={{color:C.sub,fontSize:12,marginTop:6}}>This will lock the record for <b>{pt.name}</b>.</div>
            </div>
            <div style={{background:C.tealL,borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:12,color:C.teal,lineHeight:1.7}}>
              <b>Patient:</b> {pt.name}<br/>
              <b>UHID:</b> {pt.uhid}{pt.bedNumber?" · "+pt.bedNumber:""}<br/>
              <b>Completed:</b> {myDone}/{myTotal} tasks<br/>
              <b>Submitted by:</b> {user.name}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <button onClick={()=>setConf(false)} style={{border:"1.5px solid "+C.border,borderRadius:9,padding:"12px",background:C.card,cursor:"pointer",color:C.text,fontSize:13,fontWeight:600}}>Cancel</button>
              <button onClick={doSubmit} disabled={submitting} style={{border:"none",borderRadius:9,padding:"12px",background:C.navy,cursor:"pointer",color:"#fff",fontSize:13,fontWeight:700}}>{submitting?"Submitting…":"Confirm"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ══ DIRECTOR ═══════════════════════════════════════════════════════════════
function Director({ users, steps, onUsersChanged, onStepsChanged }) {
  const dark=useContext(DarkCtx), C=pal(dark)
  const [patients,  setPatients]  = useState([])
  const [allData,   setAllData]   = useState({})
  const [loading,   setLoading]   = useState(true)
  const [openPt,    setOpenPt]    = useState(null)
  const [showRpt,   setShowRpt]   = useState(false)
  const [showAdd,   setShowAdd]   = useState(false)
  const [tab,       setTab]       = useState("dashboard")
  const [search,    setSearch]    = useState("")
  const [filter,    setFilter]    = useState("active")
  const [rptStart,  setRptStart]  = useState(todayKey())
  const [rptEnd,    setRptEnd]    = useState(todayKey())
  const [rptPts,    setRptPts]    = useState(null)
  const [rptLoading,setRptLoad]   = useState(false)

  const staff=users.filter(u=>!u.isDir)
  const dir=users.find(u=>u.isDir)||users[0]

  async function load(){
    setLoading(true)
    const pts=await dbLoadActivePatients()
    setPatients(pts)
    const d={}
    for(const pt of pts){
      const checks={}
      for(const u of users) checks[u.id]=await dbLoadChecks(pt.id,u.id)
      const sub=await dbLoadSubmission(pt.id)
      let done=0,total=0
      staff.forEach(u=>steps.forEach(s=>{total+=s.checks.length;done+=s.checks.filter((_,i)=>isTicked(checks[u.id]?.[s.id+"-"+i])).length}))
      d[pt.id]={checks,sub,pct:total>0?Math.round(done/total*100):0}
    }
    setAllData(d);setLoading(false)
  }
  useEffect(()=>{load()},[users.length,steps.length])

  async function discharge(pt){
    const upd={...pt,discharged:true,dischargedAt:new Date().toISOString(),dischargedByName:dir.name}
    await dbSavePatient(upd)
    setPatients(p=>p.map(x=>x.id===pt.id?upd:x))
  }

  function stSym(ptId,stepId,uid){
    const s=steps.find(x=>x.id===stepId), u=users.find(x=>x.id===uid)
    if(!s||!u||!u.owns.includes(stepId))return{sym:"—",bg:"transparent",c:C.muted}
    const c=allData[ptId]?.checks?.[uid]||{}
    const done=s.checks.filter((_,i)=>isTicked(c[stepId+"-"+i])).length
    if(done===0)               return{sym:"✗",bg:dark?"#2A1010":"#FFF2F2",c:C.red}
    if(done===s.checks.length) return{sym:"✓",bg:C.greenL,c:C.green}
    return{sym:"~",bg:C.amberL,c:C.amber}
  }

  async function loadReport(){
    setRptLoad(true)
    const dates=dateRangeKeys(rptStart,rptEnd)
    const allPts=[], allChecks={}, allSubs={}, seen=new Set()
    for(const dk of dates){
      const v=await fbGet(`gmsh/${dk}/patients`)
      if(v) for(const pt of Object.values(v)){
        if(!seen.has(pt.id)){seen.add(pt.id);allPts.push({...pt,dk})}
        const ch={}; for(const u of users) ch[u.id]=await dbLoadChecks(pt.id,u.id,dk)
        allChecks[pt.id+dk]=ch; allSubs[pt.id+dk]=await dbLoadSubmission(pt.id,dk)
      }
    }
    setRptPts({pts:allPts,checks:allChecks,subs:allSubs,dates})
    setRptLoad(false)
  }

  const displayPts=patients.filter(pt=>{
    if(filter==="active"&&pt.discharged)return false
    if(filter==="discharged"&&!pt.discharged)return false
    if(search.trim()){const q=search.toLowerCase();return pt.name?.toLowerCase().includes(q)||pt.uhid?.toLowerCase().includes(q)||pt.bedNumber?.toLowerCase().includes(q)||pt.dx?.toLowerCase().includes(q)}
    return true
  })

  const activeCnt=patients.filter(p=>!p.discharged).length
  const submitted=patients.filter(p=>!p.discharged&&allData[p.id]?.sub?.submitted).length
  const dischCnt =patients.filter(p=>p.discharged).length

  // ── Report View ──────────────────────────────────────────────────────────
  if(showRpt) return (
    <div style={{padding:"14px 14px 40px",background:C.bg}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
        <button onClick={()=>setShowRpt(false)} style={{background:C.tealL,border:"1px solid "+C.border,borderRadius:8,color:C.teal,fontSize:12,padding:"7px 12px",cursor:"pointer",fontWeight:600}}>← Back</button>
        <div style={{flex:1,fontWeight:700,fontSize:14,color:C.text}}>Patient Care Report</div>
        <button onClick={()=>window.print()} style={{background:C.navy,border:"none",borderRadius:8,color:"#fff",fontSize:12,padding:"7px 12px",cursor:"pointer",fontWeight:600}}>🖨️ Print</button>
      </div>
      <div style={{background:C.card,borderRadius:10,padding:"12px 14px",marginBottom:14,display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end",boxShadow:"0 1px 4px rgba(0,0,0,.08)"}}>
        <div style={{flex:1,minWidth:120}}><label style={lbl(C)}>From</label><input type="date" style={inp(C)} value={rptStart} onChange={e=>setRptStart(e.target.value)} /></div>
        <div style={{flex:1,minWidth:120}}><label style={lbl(C)}>To</label><input type="date" style={inp(C)} value={rptEnd} onChange={e=>setRptEnd(e.target.value)} /></div>
        <button onClick={loadReport} style={{background:C.navy,border:"none",borderRadius:8,color:"#fff",fontSize:12,padding:"9px 16px",cursor:"pointer",fontWeight:600,height:38,alignSelf:"flex-end"}}>{rptLoading?"Loading…":"Load"}</button>
      </div>
      <div style={{background:C.card,borderRadius:12,padding:"16px",marginBottom:14,boxShadow:"0 1px 4px rgba(0,0,0,.07)"}}>
        <div style={{fontWeight:800,fontSize:15,color:C.text}}>Gurdevi Memorial Superspeciality Hospital</div>
        <div style={{color:C.muted,fontSize:11}}>Jagadhri–Yamunanagar · NABH-Accredited</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:12,marginTop:10,padding:"10px 0",borderTop:"1px solid "+C.border,fontSize:11,color:C.sub}}>
          <span><b>Date:</b> {fmtDate(rptStart)}{rptStart!==rptEnd?" – "+fmtDate(rptEnd):""}</span>
          <span><b>Generated:</b> {new Date().toLocaleString("en-IN")}</span>
          <span><b>By:</b> {dir.name}, Director</span>
        </div>
      </div>
      {(()=>{
        const src=rptPts?rptPts.pts:patients
        const tot=src.length, sub2=rptPts?src.filter(p=>rptPts.subs[p.id+(p.dk||todayKey())]?.submitted).length:submitted
        return (
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14}}>
            {[["Total",tot,"#0D2B5E"],["Submitted",sub2,C.green],["Pending",tot-sub2,C.amber]].map(([l,v,col])=>(
              <div key={l} style={{background:C.card,borderRadius:10,padding:"12px 10px",textAlign:"center",boxShadow:"0 1px 4px rgba(0,0,0,.07)"}}>
                <div style={{fontWeight:800,fontSize:22,color:col}}>{v}</div>
                <div style={{color:C.muted,fontSize:10,marginTop:2}}>{l}</div>
              </div>
            ))}
          </div>
        )
      })()}
      {(rptPts?rptPts.pts:patients).map((pt,idx)=>{
        const dk=pt.dk||todayKey(), checksKey=pt.id+dk
        const ch=rptPts?.checks[checksKey]||allData[pt.id]?.checks||{}
        const sb=rptPts?.subs[checksKey]||allData[pt.id]?.sub
        return (
          <div key={pt.id+dk} style={{background:C.card,borderRadius:12,marginBottom:14,overflow:"hidden",boxShadow:"0 1px 5px rgba(0,0,0,.07)"}}>
            <div style={{background:C.navy,padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:26,height:26,borderRadius:6,background:"rgba(255,255,255,.2)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:11}}>{idx+1}</div>
              <div style={{flex:1}}>
                <div style={{color:"#fff",fontWeight:700,fontSize:13}}>{pt.name}{pt.age?" · "+pt.age+"y":""}{pt.bedNumber?" · "+pt.bedNumber:""}</div>
                <div style={{color:"#A8D5DB",fontSize:11}}>UHID: {pt.uhid} · {pt.ward}{pt.admDate&&pt.admDate!==todayKey()?" · Adm: "+fmtDate(pt.admDate):""}</div>
              </div>
              {sb?.submitted?<span style={{background:C.greenL,color:C.green,fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:5}}>✓ Done</span>:<span style={{background:C.amberL,color:C.amber,fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:5}}>Pending</span>}
              {pt.discharged&&<span style={{background:"#E0E8F0",color:"#446",fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:5}}>Discharged</span>}
            </div>
            {pt.dx&&<div style={{padding:"6px 14px",background:C.tealL,color:C.teal,fontSize:11,fontStyle:"italic"}}>{pt.dx}</div>}
            {pt.notes&&<div style={{padding:"5px 14px",background:C.bg,color:C.sub,fontSize:10}}>📝 {pt.notes}</div>}
            {staff.map(u=>{
              const mySteps=steps.filter(s=>u.owns.includes(s.id)),c=ch?.[u.id]||{}
              const done=mySteps.reduce((a,s)=>a+s.checks.filter((_,i)=>isTicked(c[s.id+"-"+i])).length,0)
              const total=mySteps.reduce((a,s)=>a+s.checks.length,0)
              return (
                <div key={u.id} style={{borderTop:"1px solid "+C.border,padding:"10px 14px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                    <div style={{width:22,height:22,borderRadius:5,background:u.color,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:8,fontWeight:800}}>{u.initials}</div>
                    <span style={{fontWeight:700,fontSize:11,color:u.color}}>{u.name}</span>
                    <span style={{color:C.muted,fontSize:10,marginLeft:"auto"}}>{done}/{total}</span>
                  </div>
                  {mySteps.map(s=>s.checks.map((ch2,i)=>{
                    const v=c[s.id+"-"+i], ticked=isTicked(v), info=tickInfo(v)
                    return (
                      <div key={s.id+"-"+i} style={{display:"flex",alignItems:"center",gap:7,padding:"3px 0",borderBottom:"1px solid "+C.border,fontSize:11}}>
                        <span style={{color:ticked?C.green:C.border,fontWeight:800,fontSize:13}}>{ticked?"✓":"○"}</span>
                        <span style={{color:ticked?C.green:C.muted,textDecoration:ticked?"line-through":"none",flex:1}}>{ch2}</span>
                        {ticked&&info&&<span style={{color:C.muted,fontSize:9}}>{info.by}</span>}
                      </div>
                    )
                  }))}
                </div>
              )
            })}
            {sb?.submitted&&<div style={{padding:"8px 14px",background:C.greenL,borderTop:"1px solid "+C.green,color:C.green,fontSize:11,fontWeight:600}}>✓ Submitted by {sb.submittedByName} · {fmtTs(sb.submittedAt)}</div>}
          </div>
        )
      })}
      <style>{`@media print{button,input{display:none}}`}</style>
    </div>
  )

  // ── Main Director Dashboard ───────────────────────────────────────────────
  return (
    <div style={{background:C.bg,minHeight:"60vh"}}>
      <div style={{display:"flex",borderBottom:"2px solid "+C.border,background:C.card,overflowX:"auto"}}>
        {[["dashboard","📊"],["users","👥"],["steps","📋"],["performance","📈"]].map(([key,icon])=>(
          <button key={key} onClick={()=>setTab(key)} style={{flex:1,padding:"11px 8px",border:"none",background:"none",cursor:"pointer",fontSize:11,fontWeight:700,whiteSpace:"nowrap",color:tab===key?C.navy:C.muted,borderBottom:tab===key?"3px solid "+C.navy:"3px solid transparent",marginBottom:-2}}>
            {icon} {key.charAt(0).toUpperCase()+key.slice(1)}
          </button>
        ))}
      </div>

      {tab==="users"       && <ManageUsers users={users} onUsersChanged={onUsersChanged} />}
      {tab==="steps"       && <ManageSteps steps={steps} onStepsChanged={onStepsChanged} />}
      {tab==="performance" && <PerformanceView users={users} steps={steps} />}

      {tab==="dashboard" && (
        <div style={{padding:"14px 14px 30px"}}>
          <div style={{background:"linear-gradient(135deg,#3D1A78,#6A3DB8)",borderRadius:12,padding:"14px 16px",marginBottom:14,color:"#fff"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
              <span style={{fontSize:18}}>👑</span>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:14}}>Director Dashboard</div>
                <div style={{color:"rgba(196,168,232,.75)",fontSize:11}}>{dateStr()}</div>
              </div>
              <button onClick={load} style={{background:"rgba(255,255,255,.15)",border:"1px solid rgba(255,255,255,.25)",borderRadius:7,color:"#fff",fontSize:11,padding:"5px 10px",cursor:"pointer",fontWeight:600}}>↻ Refresh</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
              {[["Active",activeCnt],["Submitted",submitted],["Pending",activeCnt-submitted],["Discharged",dischCnt]].map(([l,v])=>(
                <div key={l} style={{background:"rgba(0,0,0,.2)",borderRadius:8,padding:"7px 6px",textAlign:"center"}}>
                  <div style={{color:"#fff",fontWeight:800,fontSize:18}}>{v}</div>
                  <div style={{color:"rgba(196,168,232,.65)",fontSize:9}}>{l}</div>
                </div>
              ))}
            </div>
          </div>

          <input style={{...inp(C),marginBottom:8}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍  Search by name, UHID, bed…" />
          <div style={{display:"flex",gap:6,marginBottom:14}}>
            {["active","discharged","all"].map(f=>(
              <button key={f} onClick={()=>setFilter(f)} style={{flex:1,padding:"7px 4px",borderRadius:8,border:"1.5px solid "+(filter===f?C.navy:C.border),background:filter===f?C.navy:C.card,color:filter===f?"#fff":C.sub,fontSize:11,fontWeight:700,cursor:"pointer"}}>
                {f==="active"?"Active":f==="discharged"?"Discharged":"All"}
              </button>
            ))}
          </div>

          {loading&&<div style={{padding:40,textAlign:"center",color:C.muted}}><div style={{fontSize:24,marginBottom:8}}>⏳</div>Loading…</div>}
          {!loading&&displayPts.length===0&&<div style={{background:C.card,borderRadius:10,padding:"24px 20px",textAlign:"center",color:C.muted}}><div style={{fontSize:28,marginBottom:8}}>🛏️</div>{search?"No patients match search":"No patients in this view"}</div>}

          {!loading&&displayPts.map(pt=>{
            const d=allData[pt.id]||{}, sb=d.sub, isOpen=openPt===pt.id
            return (
              <div key={pt.id} style={{background:C.card,borderRadius:11,marginBottom:10,overflow:"hidden",boxShadow:pt.discharged?"none":sb?.submitted?"0 0 0 2px "+C.green:"0 1px 5px rgba(0,0,0,.08)",opacity:pt.discharged?.65:1}}>
                <div onClick={()=>setOpenPt(isOpen?null:pt.id)} style={{padding:"12px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:36,height:36,borderRadius:9,background:pt.discharged?"#9AA":sb?.submitted?C.green:C.navy,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:pt.discharged||sb?.submitted?16:13,flexShrink:0}}>{pt.discharged?"D":sb?.submitted?"✓":pt.gender}</div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:13,color:C.text}}>{pt.name}{pt.age?" · "+pt.age+"y":""}{pt.bedNumber?<span style={{background:C.tealL,color:C.teal,fontSize:10,fontWeight:600,padding:"1px 5px",borderRadius:4,marginLeft:6}}>{pt.bedNumber}</span>:null}</div>
                    <div style={{color:C.muted,fontSize:11}}>{pt.uhid} · {pt.ward} · {daysAgoLabel(pt.admDate)}</div>
                    {!pt.discharged&&(
                      <div style={{display:"flex",alignItems:"center",gap:8,marginTop:4}}>
                        <div style={{flex:1,background:C.bg,borderRadius:4,height:5,overflow:"hidden"}}>
                          <div style={{width:(d.pct||0)+"%",height:"100%",background:(d.pct||0)===100?C.green:C.teal,borderRadius:4}} />
                        </div>
                        <span style={{fontSize:11,fontWeight:700,color:(d.pct||0)===100?C.green:C.text}}>{d.pct||0}%</span>
                      </div>
                    )}
                    {pt.discharged&&pt.dischargedAt&&<div style={{color:C.muted,fontSize:10}}>Discharged {fmtTs(pt.dischargedAt)}</div>}
                  </div>
                  <span style={{color:C.muted,fontSize:16}}>{isOpen?"▲":"▼"}</span>
                </div>
                {isOpen&&(
                  <div style={{borderTop:"1px solid "+C.border,padding:"10px 14px 12px"}}>
                    {pt.dx&&<div style={{color:C.teal,fontSize:11,fontStyle:"italic",marginBottom:4}}>{pt.dx}</div>}
                    {pt.notes&&<div style={{background:C.tealL,borderRadius:6,padding:"5px 10px",marginBottom:8,fontSize:11,color:C.sub}}>📝 {pt.notes}</div>}
                    {!pt.discharged&&(
                      <div style={{overflowX:"auto",marginBottom:8}}>
                        <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
                          <thead>
                            <tr style={{background:C.bg}}>
                              <th style={{padding:"5px 7px",textAlign:"left",color:C.text,fontWeight:700}}>Step</th>
                              {staff.map(u=><th key={u.id} style={{padding:"5px 6px",textAlign:"center"}}><div style={{width:22,height:22,borderRadius:6,background:u.color,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:8,fontWeight:800,margin:"0 auto"}}>{u.initials}</div></th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {steps.map((s,si)=>(
                              <tr key={s.id} style={{background:si%2===0?C.card:C.bg}}>
                                <td style={{padding:"5px 7px",color:C.text,fontWeight:600}}><span style={{background:C.teal,color:"#fff",borderRadius:4,padding:"1px 5px",fontSize:9,fontWeight:800,marginRight:4}}>{s.id}</span>{s.title}</td>
                                {staff.map(u=>{const{sym,bg,c}=stSym(pt.id,s.id,u.id);return<td key={u.id} style={{padding:"4px 6px",textAlign:"center"}}><span style={{background:bg,color:c,borderRadius:4,padding:"1px 6px",fontWeight:800,fontSize:11}}>{sym}</span></td>})}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {sb?.submitted&&<div style={{color:C.green,fontSize:11,fontWeight:600,marginBottom:8}}>✓ Submitted by {sb.submittedByName} · {fmtTs(sb.submittedAt)}</div>}
                    {!pt.discharged&&(
                      <button onClick={()=>{ if(window.confirm(`Discharge ${pt.name}?`)) discharge(pt) }}
                        style={{width:"100%",background:"#FEE2E2",border:"1px solid #FCA5A5",borderRadius:8,color:C.red,fontSize:12,padding:"9px",cursor:"pointer",fontWeight:700}}>
                        🏠 Mark as Discharged
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {!loading&&(
            <button onClick={()=>{setShowRpt(true);loadReport()}} style={{width:"100%",background:"linear-gradient(135deg,#3D1A78,#6A3DB8)",border:"none",borderRadius:10,padding:"14px",color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:9,marginTop:6,boxShadow:"0 4px 14px rgba(61,26,120,.35)"}}>
              <span style={{fontSize:18}}>📋</span> View &amp; Print Full Report
            </button>
          )}

          <button onClick={()=>setShowAdd(true)} style={{position:"fixed",bottom:30,right:20,background:C.navy,border:"none",borderRadius:"50%",width:54,height:54,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",boxShadow:"0 4px 16px rgba(13,43,94,.4)",zIndex:50,color:"#fff",fontSize:26,lineHeight:1}}>+</button>
          {showAdd&&<AddPatient user={dir} onDone={pt=>{setPatients(p=>[pt,...p]);setShowAdd(false);load()}} onClose={()=>setShowAdd(false)} />}
        </div>
      )}
    </div>
  )
}

// ══ ROOT ═══════════════════════════════════════════════════════════════════
export default function App() {
  const [user,        setUser]        = useState(null)
  const [users,       setUsers]       = useState([])
  const [steps,       setSteps]       = useState([])
  const [ready,       setReady]       = useState(false)
  const [selPt,       setSelPt]       = useState(null)
  const [clock,       setClock]       = useState(clockStr())
  const [dark,        setDark]        = useState(()=>localStorage.getItem("gmsh_dark")==="1")
  const [timedOut,    setTimedOut]    = useState(false)

  useEffect(()=>{
    async function init(){
      let u=await dbLoadUsers(); if(!u) u=await dbSeedUsers()
      let s=await dbLoadSteps(); if(!s) s=await dbSeedSteps()
      setUsers(u); setSteps(s); setReady(true)
    }
    init()
    const t=setInterval(()=>setClock(clockStr()),30000)
    return()=>clearInterval(t)
  },[])

  function toggleDark(){
    setDark(d=>{const n=!d;localStorage.setItem("gmsh_dark",n?"1":"0");return n})
  }

  function handleUsersChanged(list){
    setUsers(list)
    if(user){const upd=list.find(u=>u.id===user.id);if(upd)setUser(upd)}
  }

  const C=pal(dark)

  useSessionTimeout(!!user,()=>{
    setUser(null);setSelPt(null);setTimedOut(true)
  },15)

  if(!ready) return (
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#3D1A78 0%,#1B3A6B 55%,#00798C 100%)",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12}}>
      <div style={{fontSize:30}}>🏥</div>
      <div style={{color:"#fff",fontSize:14,fontWeight:600}}>Loading GMSH Care…</div>
    </div>
  )

  if(!user) return (
    <DarkCtx.Provider value={dark}>
      {timedOut&&(
        <div style={{position:"fixed",top:0,left:0,right:0,zIndex:999,background:"#A06000",color:"#fff",padding:"10px 16px",textAlign:"center",fontSize:13,fontWeight:600}}>
          ⏱ Session expired after 15 minutes of inactivity. Please sign in again.
          <button onClick={()=>setTimedOut(false)} style={{marginLeft:12,background:"rgba(255,255,255,.2)",border:"none",borderRadius:5,color:"#fff",padding:"2px 8px",cursor:"pointer",fontSize:12}}>✕</button>
        </div>
      )}
      <Login users={users} onLogin={u=>{setUser(u);setSelPt(null);setTimedOut(false)}} />
    </DarkCtx.Provider>
  )

  return (
    <DarkCtx.Provider value={dark}>
      <div style={{fontFamily:"system-ui,'Segoe UI',sans-serif",background:C.bg,minHeight:"100vh"}}>
        <div style={{background:"linear-gradient(135deg,"+(user.isDir?"#3D1A78":user.color)+" 0%,"+user.color+" 100%)",padding:"12px 15px 0",position:"sticky",top:0,zIndex:100,boxShadow:"0 2px 10px rgba(13,43,94,.3)"}}>
          <div style={{maxWidth:680,margin:"0 auto"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
              {selPt&&!user.isDir
                ?<button onClick={()=>setSelPt(null)} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:7,color:"#fff",fontSize:13,padding:"5px 11px",cursor:"pointer",fontWeight:600}}>← Back</button>
                :<div style={{width:32,height:32,borderRadius:8,background:"rgba(0,0,0,.25)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:12,flexShrink:0}}>{user.initials}</div>
              }
              <div style={{flex:1,minWidth:0}}>
                <div style={{color:"#fff",fontWeight:700,fontSize:13}}>{selPt&&!user.isDir?selPt.name:user.name}{user.isDir?" 👑":""}</div>
                <div style={{color:"rgba(196,168,232,.75)",fontSize:10}}>{selPt&&!user.isDir?"UHID: "+selPt.uhid+(selPt.bedNumber?" · "+selPt.bedNumber:""):user.role+" · "+clock}</div>
              </div>
              <button onClick={toggleDark} title={dark?"Light mode":"Dark mode"} style={{background:"rgba(255,255,255,.12)",border:"1px solid rgba(255,255,255,.2)",borderRadius:7,color:"#fff",fontSize:14,padding:"5px 9px",cursor:"pointer"}}>
                {dark?"☀️":"🌙"}
              </button>
              <button onClick={()=>{setUser(null);setSelPt(null)}} style={{background:"rgba(255,255,255,.12)",border:"1px solid rgba(255,255,255,.2)",borderRadius:7,color:"#fff",fontSize:10,padding:"5px 10px",cursor:"pointer",fontWeight:600}}>Sign Out</button>
            </div>
            {!selPt&&!user.isDir&&(
              <div style={{display:"flex",gap:4}}>
                <button style={{flex:1,padding:"8px 0",borderRadius:"8px 8px 0 0",border:"none",background:"rgba(255,255,255,.18)",color:"#fff",fontSize:11,fontWeight:700,cursor:"default",borderBottom:"2px solid rgba(255,255,255,.5)"}}>🛏️ Patients</button>
              </div>
            )}
          </div>
        </div>

        <div style={{maxWidth:680,margin:"0 auto"}}>
          {user.isDir  && <Director users={users} steps={steps} onUsersChanged={handleUsersChanged} onStepsChanged={setSteps} />}
          {!user.isDir && !selPt && <PatientList user={user} users={users} steps={steps} onPick={pt=>setSelPt(pt)} />}
          {!user.isDir && selPt  && <Checklist pt={selPt} user={user} steps={steps} />}
        </div>
      </div>
    </DarkCtx.Provider>
  )
}
