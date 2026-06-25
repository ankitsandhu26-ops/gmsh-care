import { useState, useEffect } from 'react'
import { ref, get, set } from 'firebase/database'
import { db } from './firebase.js'

// ── Palette ────────────────────────────────────────────────────────────────
const C = {
  navy:"#0D2B5E", teal:"#00798C", tealL:"#EBF6F8",
  dir:"#3D1A78",  green:"#1A6E35", greenL:"#E6F4EC",
  red:"#8C2020",  amber:"#A06000", amberL:"#FEF3E0",
  gray:"#F0F4F7", border:"#D0DCE0", muted:"#888",
}

const USERS = [
  { id:"ankit",   name:"Dr. Ankit Sandhu", role:"Director",           pin:"0000", color:C.dir,   initials:"AS", isDir:true,  owns:[1,2,3,4,5,6,7,8] },
  { id:"aditya",  name:"Dr. Aditya",        role:"Attending Physician",pin:"1234", color:C.navy,  initials:"DA", isDir:false, owns:[1,2,3,4,5,6,7,8] },
  { id:"sachin",  name:"Dr. Sachin",         role:"Surgeon",            pin:"2345", color:C.green, initials:"DS", isDir:false, owns:[3,5] },
  { id:"gulshan", name:"Gulshan",             role:"Ward In-charge",     pin:"3456", color:C.teal,  initials:"GU", isDir:false, owns:[3,6,7] },
  { id:"vikas",   name:"Vikas",               role:"ICU In-charge",      pin:"4567", color:C.red,   initials:"VK", isDir:false, owns:[6] },
  { id:"billing", name:"Billing Team",        role:"Accounts & Billing", pin:"5678", color:C.amber, initials:"BT", isDir:false, owns:[8] },
]

const STEPS = [
  { id:1, title:"Morning Ward Round",            time:"10:00 AM",        tags:["Vitals","Blood Sugar"],          checks:["Patient visited on morning round","Vitals recorded","Blood sugar recorded","Abnormal values flagged to doctor"] },
  { id:2, title:"OPD Vitals Verification",        time:"Post-Round",       tags:["OPD Register"],                  checks:["OPD vitals recorded","Pending queries followed up"] },
  { id:3, title:"Admission Flow",                 time:"",                 tags:["Pre-Admission","Investigations"], checks:["Eligibility reviewed by Dr. Sachin","Files handed to Gulshan","Nurse / attendant assigned","Escorted to Lab / Radiology / ECG"] },
  { id:4, title:"Pre-Op Compliance",              time:"Before OT",        tags:["NPO","Consent","Pre-Med"],        checks:["NPO status confirmed","Bowel prep done","Pre-medications given","Skin prep done","IV access established","Consent signed"] },
  { id:5, title:"Investigation Review",           time:"Pre-OT",           tags:["Lab","Imaging","ECG"],            checks:["Lab reports reviewed","Imaging reviewed","ECG / Echo reviewed","Surgical fitness confirmed"] },
  { id:6, title:"Post-Op Receiving",              time:"Post-OT",          tags:["ICU / Ward"],                    checks:["Received in ICU / Ward","Monitoring initiated","Post-op orders noted"] },
  { id:7, title:"Discharge Planning",             time:"Evening",          tags:["Discharge Note"],                 checks:["Patient reviewed for discharge","Discharge summary written","Discharge orders issued"] },
  { id:8, title:"Billing & Discharge Clearance",  time:"Before Discharge", tags:["Bills","TPA","Ayushman"],         checks:["Pharmacy bill verified","Investigation bill verified","Hospital bill verified","Scheme / TPA clearance obtained"] },
]

const WARDS     = ["General Ward","ICU","HDU","Private Room","Semi-Private","Post-Op Ward","OPD"]
const ADM_TYPES = ["Medical Management","Elective Surgery","Emergency","Day Care","Observation","OPD"]

// ── Firebase helpers ───────────────────────────────────────────────────────
function todayKey() { return new Date().toISOString().slice(0,10) }
function safeKey(k) { return k.replace(/[.#$/[\]]/g,"_") }

async function fbGet(path) {
  try {
    const snap = await get(ref(db, path))
    return snap.exists() ? snap.val() : null
  } catch(e) { console.error("fbGet error", path, e); return null }
}
async function fbSet(path, value) {
  try { await set(ref(db, path), value) }
  catch(e) { console.error("fbSet error", path, e) }
}

const PT_PATH   = () => `gmsh/${todayKey()}/patients`
const CHK_PATH  = (ptId, uid) => `gmsh/${todayKey()}/checks/${safeKey(ptId)}/${uid}`
const SUB_PATH  = (ptId) => `gmsh/${todayKey()}/submissions/${safeKey(ptId)}`

async function dbLoadPatients()          { const v = await fbGet(PT_PATH());         return v ? Object.values(v) : [] }
async function dbSavePatients(list)      { const obj = {}; list.forEach(p => { obj[safeKey(p.id)] = p }); await fbSet(PT_PATH(), obj) }
async function dbLoadChecks(ptId, uid)   { const v = await fbGet(CHK_PATH(ptId,uid)); return v || {} }
async function dbSaveChecks(ptId,uid,d)  { await fbSet(CHK_PATH(ptId,uid), d) }
async function dbLoadSubmission(ptId)    { return await fbGet(SUB_PATH(ptId)) }
async function dbSaveSubmission(ptId, d) { await fbSet(SUB_PATH(ptId), d) }

// ── Utils ──────────────────────────────────────────────────────────────────
function newId()    { return "pt" + Date.now() + Math.floor(Math.random()*999) }
function clockStr() { return new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"}) }
function dateStr()  { return new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric"}) }
function fmtTs(iso) { if(!iso)return""; return new Date(iso).toLocaleString("en-IN",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}) }

// ── Shared style helpers ───────────────────────────────────────────────────
const inp = { width:"100%", border:"1.5px solid "+C.border, borderRadius:8, padding:"9px 12px", fontSize:13, outline:"none", background:"#fff", boxSizing:"border-box" }
const lbl = { fontSize:11, fontWeight:700, color:"#555", display:"block", marginBottom:4, textTransform:"uppercase", letterSpacing:.5 }
const submitBtn = (disabled) => ({ width:"100%", background:disabled?"#C0CDD5":C.navy, border:"none", borderRadius:10, padding:"14px", color:"#fff", fontSize:14, fontWeight:700, cursor:disabled?"not-allowed":"pointer" })

// ══ LOGIN ══════════════════════════════════════════════════════════════════
function Login({ onLogin }) {
  const [sel, setSel]     = useState(null)
  const [pin, setPin]     = useState("")
  const [err, setErr]     = useState(false)
  const [shake, setShake] = useState(false)

  function pick(u) { setSel(u); setPin(""); setErr(false) }
  function digit(d) {
    if (pin.length >= 4) return
    const n = pin + d; setPin(n); setErr(false)
    if (n.length === 4) setTimeout(() => {
      if (n === sel.pin) { onLogin(sel) }
      else { setShake(true); setErr(true); setTimeout(() => { setPin(""); setShake(false) }, 600) }
    }, 120)
  }

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#3D1A78 0%,#1B3A6B 55%,#00798C 100%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{textAlign:"center",marginBottom:24}}>
        <div style={{fontSize:30,marginBottom:8}}>🏥</div>
        <div style={{color:"#C4A8E8",fontSize:10,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase"}}>Gurdevi Memorial Superspeciality Hospital</div>
        <div style={{color:"#fff",fontSize:18,fontWeight:700,marginTop:4}}>Patient Care Portal</div>
        <div style={{color:"rgba(196,168,232,.6)",fontSize:11,marginTop:2}}>{dateStr()}</div>
      </div>

      {!sel ? (
        <div style={{width:"100%",maxWidth:400}}>
          <div style={{color:"rgba(255,255,255,.4)",fontSize:10,fontWeight:700,textAlign:"center",letterSpacing:1,marginBottom:10,textTransform:"uppercase"}}>Select account</div>
          {USERS.map(u => (
            <button key={u.id} onClick={() => pick(u)}
              style={{width:"100%",display:"flex",alignItems:"center",gap:12,background:u.isDir?"rgba(106,61,184,.25)":"rgba(255,255,255,.07)",border:u.isDir?"1.5px solid rgba(196,168,232,.4)":"1.5px solid rgba(255,255,255,.12)",borderRadius:11,padding:"12px 15px",marginBottom:8,cursor:"pointer",textAlign:"left"}}>
              <div style={{width:38,height:38,borderRadius:9,background:u.color,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:13,flexShrink:0}}>{u.initials}</div>
              <div style={{flex:1}}>
                <div style={{color:"#fff",fontWeight:700,fontSize:13}}>{u.name}</div>
                <div style={{color:u.isDir?"#C4A8E8":"rgba(168,213,219,.7)",fontSize:11}}>{u.role}</div>
              </div>
              {u.isDir && <span>👑</span>}
              <span style={{color:"rgba(255,255,255,.3)",fontSize:17}}>›</span>
            </button>
          ))}
        </div>
      ) : (
        <div style={{width:"100%",maxWidth:280,textAlign:"center"}}>
          <button onClick={() => setSel(null)} style={{background:"none",border:"none",color:"rgba(196,168,232,.6)",cursor:"pointer",fontSize:13,marginBottom:16,display:"block",margin:"0 auto 16px"}}>← Back</button>
          <div style={{width:50,height:50,borderRadius:12,background:sel.color,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:17,margin:"0 auto 10px"}}>{sel.initials}</div>
          <div style={{color:"#fff",fontWeight:700,fontSize:15}}>{sel.name}</div>
          <div style={{color:"rgba(196,168,232,.65)",fontSize:11,marginBottom:20}}>{sel.role}</div>
          <div style={{display:"flex",justifyContent:"center",gap:13,marginBottom:8,animation:shake?"shake .5s":"none"}}>
            {[0,1,2,3].map(i => <div key={i} style={{width:13,height:13,borderRadius:"50%",border:"2px solid "+(err?"#F87171":"rgba(196,168,232,.5)"),background:pin.length>i?(err?"#F87171":"#C4A8E8"):"transparent"}} />)}
          </div>
          {err && <div style={{color:"#F87171",fontSize:12,marginBottom:10}}>Incorrect PIN. Try again.</div>}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:9}}>
            {[1,2,3,4,5,6,7,8,9].map(d => (
              <button key={d} onClick={() => digit(String(d))} style={{background:"rgba(255,255,255,.1)",border:"1.5px solid rgba(255,255,255,.15)",borderRadius:9,padding:"14px 0",color:"#fff",fontSize:17,fontWeight:600,cursor:"pointer"}}>{d}</button>
            ))}
            <div />
            <button onClick={() => digit("0")} style={{background:"rgba(255,255,255,.1)",border:"1.5px solid rgba(255,255,255,.15)",borderRadius:9,padding:"14px 0",color:"#fff",fontSize:17,fontWeight:600,cursor:"pointer"}}>0</button>
            <button onClick={() => setPin(p => p.slice(0,-1))} style={{background:"rgba(255,255,255,.06)",border:"1.5px solid rgba(255,255,255,.1)",borderRadius:9,padding:"14px 0",color:"rgba(255,255,255,.5)",fontSize:17,cursor:"pointer"}}>⌫</button>
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
  const [f, setF] = useState({ name:"", age:"", gender:"M", uhid:"", ward:"General Ward", admType:"Medical Management", dx:"" })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState("")
  const set = (k,v) => setF(prev => ({...prev,[k]:v}))

  async function submit() {
    if (!f.name.trim()) { setError("Patient name is required."); return }
    setSaving(true); setError("")
    try {
      const newPt = { id:newId(), name:f.name.trim(), age:f.age, gender:f.gender, uhid:f.uhid.trim()||"—", ward:f.ward, admType:f.admType, dx:f.dx.trim(), addedBy:user.id, addedByName:user.name, addedAt:new Date().toISOString() }
      const existing = await dbLoadPatients()
      const updated  = [newPt, ...existing]
      await dbSavePatients(updated)
      onDone(updated)
    } catch(e) { setError("Save failed. Check your internet connection.") }
    setSaving(false)
  }

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:300,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div style={{background:"#fff",borderRadius:"18px 18px 0 0",width:"100%",maxWidth:680,maxHeight:"92vh",overflowY:"auto"}}>
        <div style={{background:C.navy,padding:"15px 18px",borderRadius:"18px 18px 0 0",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:10}}>
          <div>
            <div style={{color:"#fff",fontWeight:700,fontSize:15}}>Add New Patient</div>
            <div style={{color:"#A8D5DB",fontSize:11}}>{dateStr()}</div>
          </div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:8,color:"#fff",width:34,height:34,fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>
        <div style={{padding:"18px 18px 40px",display:"flex",flexDirection:"column",gap:14}}>
          {error && <div style={{background:"#FEE2E2",border:"1px solid #FCA5A5",borderRadius:8,padding:"10px 14px",color:"#B91C1C",fontSize:13}}>{error}</div>}
          <div>
            <label style={lbl}>Patient Name *</label>
            <input style={inp} value={f.name} onChange={e=>set("name",e.target.value)} placeholder="Full name" />
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div>
              <label style={lbl}>Age (years)</label>
              <input style={inp} type="number" value={f.age} onChange={e=>set("age",e.target.value)} placeholder="e.g. 45" />
            </div>
            <div>
              <label style={lbl}>Gender</label>
              <select style={inp} value={f.gender} onChange={e=>set("gender",e.target.value)}>
                <option value="M">Male</option>
                <option value="F">Female</option>
                <option value="O">Other</option>
              </select>
            </div>
          </div>
          <div>
            <label style={lbl}>UHID / MR Number</label>
            <input style={inp} value={f.uhid} onChange={e=>set("uhid",e.target.value)} placeholder="e.g. GMSH-2026-001" />
          </div>
          <div>
            <label style={lbl}>Diagnosis / Chief Complaint</label>
            <input style={inp} value={f.dx} onChange={e=>set("dx",e.target.value)} placeholder="e.g. Ureteric calculus, Post-op care…" />
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div>
              <label style={lbl}>Ward / Unit</label>
              <select style={inp} value={f.ward} onChange={e=>set("ward",e.target.value)}>
                {WARDS.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Admission Type</label>
              <select style={inp} value={f.admType} onChange={e=>set("admType",e.target.value)}>
                {ADM_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <button onClick={submit} disabled={saving||!f.name.trim()} style={submitBtn(saving||!f.name.trim())}>
            {saving ? "Saving…" : "✓  Add Patient"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ══ PATIENT LIST ═══════════════════════════════════════════════════════════
function PatientList({ user, onPick }) {
  const [patients, setPatientState] = useState([])
  const [sums,     setSums]         = useState({})
  const [loading,  setLoading]      = useState(true)
  const [showAdd,  setShowAdd]      = useState(false)

  async function load() {
    setLoading(true)
    const pts = await dbLoadPatients()
    setPatientState(pts)
    const s = {}
    for (const pt of pts) {
      const sub = await dbLoadSubmission(pt.id)
      const staffU = USERS.filter(u => !u.isDir)
      let done=0, total=0
      for (const u of staffU) {
        const c = await dbLoadChecks(pt.id, u.id)
        STEPS.forEach(st => { total+=st.checks.length; done+=st.checks.filter((_,i)=>c[st.id+"-"+i]).length })
      }
      s[pt.id] = { sub, pct:total>0?Math.round(done/total*100):0 }
    }
    setSums(s)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function handleAdded(updated) { setPatientState(updated); setShowAdd(false); load() }

  if (loading) return (
    <div style={{padding:40,textAlign:"center",color:C.muted}}>
      <div style={{fontSize:26,marginBottom:8}}>⏳</div>Loading patients…
    </div>
  )

  return (
    <div style={{padding:"14px 14px 90px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <div>
          <div style={{fontSize:15,fontWeight:700,color:C.navy}}>Today's Patients</div>
          <div style={{color:C.muted,fontSize:11}}>{patients.length} patient{patients.length!==1?"s":""} · {dateStr()}</div>
        </div>
        <button onClick={load} style={{background:C.tealL,border:"1px solid #B8D8DC",borderRadius:8,color:C.teal,fontSize:11,padding:"6px 12px",cursor:"pointer",fontWeight:600}}>↻ Refresh</button>
      </div>

      {patients.length === 0 && (
        <div style={{background:"#fff",borderRadius:12,padding:"32px 20px",textAlign:"center",boxShadow:"0 1px 5px rgba(0,0,0,.07)"}}>
          <div style={{fontSize:32,marginBottom:10}}>🛏️</div>
          <div style={{color:C.navy,fontWeight:700,fontSize:14,marginBottom:6}}>No patients yet today</div>
          <div style={{color:C.muted,fontSize:12,marginBottom:18}}>Tap the + button below to add the first patient.</div>
          <button onClick={() => setShowAdd(true)} style={{background:C.navy,border:"none",borderRadius:9,padding:"11px 24px",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>+ Add First Patient</button>
        </div>
      )}

      {patients.map(pt => {
        const sum = sums[pt.id]||{pct:0,sub:null}
        const submitted = sum.sub?.submitted
        return (
          <div key={pt.id} onClick={() => onPick(pt)}
            style={{background:"#fff",borderRadius:11,padding:"13px 14px",marginBottom:10,cursor:"pointer",boxShadow:submitted?"0 0 0 2px "+C.green:"0 1px 5px rgba(0,0,0,.08)",border:submitted?"1.5px solid "+C.green:"1.5px solid transparent"}}>
            <div style={{display:"flex",alignItems:"flex-start",gap:11}}>
              <div style={{width:40,height:40,borderRadius:10,background:submitted?C.green:C.navy,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:submitted?18:14,fontWeight:800,flexShrink:0}}>
                {submitted?"✓":pt.gender}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
                  <span style={{fontWeight:700,fontSize:14,color:C.navy}}>{pt.name}</span>
                  {pt.age&&<span style={{color:C.muted,fontSize:12}}>{pt.age}y</span>}
                  {submitted&&<span style={{background:C.greenL,color:C.green,fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:5}}>Submitted</span>}
                </div>
                <div style={{color:"#666",fontSize:11,marginTop:2}}>UHID: {pt.uhid} · {pt.ward} · {pt.admType}</div>
                {pt.dx&&<div style={{color:C.teal,fontSize:11,marginTop:2,fontStyle:"italic"}}>{pt.dx}</div>}
                <div style={{marginTop:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                    <span style={{fontSize:10,color:C.muted}}>Overall progress</span>
                    <span style={{fontSize:11,fontWeight:700,color:sum.pct===100?C.green:C.navy}}>{sum.pct}%</span>
                  </div>
                  <div style={{background:"#EEF2F5",borderRadius:4,height:5,overflow:"hidden"}}>
                    <div style={{width:sum.pct+"%",height:"100%",background:sum.pct===100?C.green:C.teal,borderRadius:4,transition:"width .4s"}} />
                  </div>
                </div>
                {submitted&&sum.sub.submittedAt&&<div style={{color:C.green,fontSize:10,marginTop:4}}>✓ Submitted · {fmtTs(sum.sub.submittedAt)}</div>}
              </div>
              <span style={{color:"#C0CDD5",fontSize:18,flexShrink:0}}>›</span>
            </div>
          </div>
        )
      })}

      <button onClick={() => setShowAdd(true)}
        style={{position:"fixed",bottom:30,right:20,background:C.navy,border:"none",borderRadius:"50%",width:54,height:54,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",boxShadow:"0 4px 16px rgba(13,43,94,.4)",zIndex:50,color:"#fff",fontSize:26,lineHeight:1}}>
        +
      </button>
      {showAdd&&<AddPatient user={user} onDone={handleAdded} onClose={()=>setShowAdd(false)} />}
    </div>
  )
}

// ══ CHECKLIST ══════════════════════════════════════════════════════════════
function Checklist({ pt, user }) {
  const [chkState,   setChkState]   = useState({})
  const [sub,        setSub]        = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [expanded,   setExpanded]   = useState({})
  const [confirm,    setConfirm]    = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    async function load() {
      const c = await dbLoadChecks(pt.id, user.id)
      const s = await dbLoadSubmission(pt.id)
      setChkState(c); setSub(s); setLoading(false)
    }
    load()
  }, [pt.id, user.id])

  async function tap(stepId, idx) {
    if (sub?.submitted) return
    const key  = stepId+"-"+idx
    const next = {...chkState,[key]:!chkState[key]}
    setChkState(next)
    await dbSaveChecks(pt.id, user.id, next)
  }

  async function doSubmit() {
    setSubmitting(true)
    const rec = { submitted:true, submittedBy:user.id, submittedByName:user.name, submittedAt:new Date().toISOString(), ptId:pt.id, ptName:pt.name }
    await dbSaveSubmission(pt.id, rec)
    setSub(rec); setSubmitting(false); setConfirm(false)
  }

  const mySteps = STEPS.filter(s => user.owns.includes(s.id))
  const myTotal = mySteps.reduce((a,s)=>a+s.checks.length,0)
  const myDone  = mySteps.reduce((a,s)=>a+s.checks.filter((_,i)=>chkState[s.id+"-"+i]).length,0)
  const myPct   = myTotal>0?Math.round(myDone/myTotal*100):0
  const allDone = myDone===myTotal&&myTotal>0
  const submitted = sub?.submitted

  if (loading) return <div style={{padding:40,textAlign:"center",color:C.muted}}>Loading…</div>

  return (
    <div style={{padding:"14px 14px 130px"}}>
      <div style={{background:C.navy,borderRadius:12,padding:"14px 16px",marginBottom:14,color:"#fff"}}>
        <div style={{fontWeight:700,fontSize:16}}>{pt.name}</div>
        <div style={{color:"#A8D5DB",fontSize:11,marginTop:2}}>{pt.age&&pt.age+"y · "}{pt.gender==="M"?"Male":pt.gender==="F"?"Female":"Other"} · UHID: {pt.uhid}</div>
        <div style={{color:"#A8D5DB",fontSize:11}}>{pt.ward} · {pt.admType}</div>
        {pt.dx&&<div style={{color:"#EBF6F8",fontSize:11,fontStyle:"italic",marginTop:3}}>{pt.dx}</div>}
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
        <div style={{background:C.greenL,border:"1.5px solid #A8D8B0",borderRadius:10,padding:"12px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:22}}>✅</span>
          <div>
            <div style={{color:C.green,fontWeight:700,fontSize:13}}>Record submitted</div>
            <div style={{color:"#2D7A4A",fontSize:11}}>By {sub.submittedByName} · {fmtTs(sub.submittedAt)}</div>
          </div>
        </div>
      )}

      <div style={{fontSize:10,fontWeight:700,color:user.color,letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>Your Steps for This Patient</div>

      {mySteps.map(s => {
        const done  = s.checks.every((_,i)=>chkState[s.id+"-"+i])
        const count = s.checks.filter((_,i)=>chkState[s.id+"-"+i]).length
        const open  = expanded[s.id]
        return (
          <div key={s.id} style={{marginBottom:9}}>
            <div style={{background:"#fff",borderRadius:10,overflow:"hidden",boxShadow:done?"0 0 0 2px "+C.green:"0 1px 5px rgba(0,0,0,.07)"}}>
              <div onClick={()=>setExpanded(e=>({...e,[s.id]:!e[s.id]}))}
                style={{background:done?C.green:user.color,padding:"11px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:28,height:28,borderRadius:7,background:"rgba(0,0,0,.22)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:12,flexShrink:0}}>{s.id}</div>
                <div style={{flex:1}}>
                  <div style={{color:"#fff",fontWeight:700,fontSize:13}}>{s.title}</div>
                  {s.time&&<div style={{color:"rgba(255,255,255,.6)",fontSize:10}}>{s.time}</div>}
                </div>
                <div style={{background:"rgba(0,0,0,.18)",borderRadius:8,padding:"2px 7px",color:"#fff",fontSize:10,fontWeight:700}}>{count}/{s.checks.length}</div>
                <span style={{color:"rgba(255,255,255,.7)",fontSize:12}}>{open?"▲":"▼"}</span>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:4,padding:"6px 12px",background:C.tealL,borderBottom:"1px solid #D8E8EB"}}>
                {s.tags.map(t=><span key={t} style={{background:"#fff",border:"1px solid #C0D4D8",borderRadius:4,padding:"2px 6px",fontSize:10,fontWeight:600,color:"#005F6E"}}>{t}</span>)}
              </div>
              {open&&(
                <div style={{padding:"10px 14px 12px"}}>
                  {s.checks.map((c,i)=>{
                    const ticked=!!chkState[s.id+"-"+i]
                    return (
                      <div key={i} onClick={()=>!submitted&&tap(s.id,i)}
                        style={{display:"flex",alignItems:"flex-start",gap:10,cursor:submitted?"default":"pointer",padding:"8px 10px",borderRadius:7,background:ticked?C.greenL:"#F6FAFB",border:"1px solid "+(ticked?"#A8D8B0":"#DCE8EB"),marginBottom:5}}>
                        <div style={{width:20,height:20,borderRadius:5,border:"2px solid "+(ticked?C.green:"#B0C8CC"),background:ticked?C.green:"#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>
                          {ticked&&<span style={{color:"#fff",fontSize:11,fontWeight:800}}>✓</span>}
                        </div>
                        <span style={{fontSize:13,color:ticked?C.green:C.navy,fontWeight:ticked?600:400,textDecoration:ticked?"line-through":"none",opacity:ticked?.8:1,lineHeight:1.4}}>{c}</span>
                      </div>
                    )
                  })}
                  {done&&<div style={{marginTop:6,background:C.greenL,border:"1px solid #A8D8B0",borderRadius:7,padding:"6px 12px",display:"flex",gap:7,alignItems:"center"}}><span>✅</span><span style={{color:C.green,fontSize:12,fontWeight:600}}>Step {s.id} complete</span></div>}
                </div>
              )}
            </div>
          </div>
        )
      })}

      {!submitted&&(
        <div style={{position:"fixed",bottom:0,left:0,right:0,padding:"10px 14px 20px",background:"#F0F4F7",borderTop:"1px solid #D8E0E8",zIndex:50}}>
          <div style={{maxWidth:680,margin:"0 auto"}}>
            {!allDone&&<div style={{background:C.amberL,border:"1px solid #F0D098",borderRadius:8,padding:"7px 12px",marginBottom:8,color:C.amber,fontSize:12}}>⚠ {myTotal-myDone} task{myTotal-myDone!==1?"s":""} remaining before you can submit.</div>}
            <button onClick={()=>allDone&&setConfirm(true)} style={submitBtn(!allDone)}>
              {allDone?"📋  Submit — All Tasks Complete":myPct+"% Done · "+( myTotal-myDone)+" remaining"}
            </button>
          </div>
        </div>
      )}

      {confirm&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:"#fff",borderRadius:14,padding:"22px 20px",maxWidth:360,width:"100%"}}>
            <div style={{textAlign:"center",marginBottom:16}}>
              <div style={{fontSize:30,marginBottom:8}}>📋</div>
              <div style={{fontWeight:700,fontSize:15,color:C.navy}}>Submit Patient Record?</div>
              <div style={{color:"#666",fontSize:12,marginTop:6}}>This will lock the record for <b>{pt.name}</b>.</div>
            </div>
            <div style={{background:C.tealL,borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:12,color:"#005F6E",lineHeight:1.7}}>
              <b>Patient:</b> {pt.name}<br/>
              <b>UHID:</b> {pt.uhid}<br/>
              <b>Completed:</b> {myDone}/{myTotal} tasks<br/>
              <b>Submitted by:</b> {user.name}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <button onClick={()=>setConfirm(false)} style={{border:"1.5px solid "+C.border,borderRadius:9,padding:"12px",background:"#fff",cursor:"pointer",color:"#555",fontSize:13,fontWeight:600}}>Cancel</button>
              <button onClick={doSubmit} disabled={submitting} style={{border:"none",borderRadius:9,padding:"12px",background:C.navy,cursor:"pointer",color:"#fff",fontSize:13,fontWeight:700}}>{submitting?"Submitting…":"Confirm"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ══ DIRECTOR ═══════════════════════════════════════════════════════════════
function Director() {
  const [patients, setPatientState] = useState([])
  const [allData,  setAllData]      = useState({})
  const [loading,  setLoading]      = useState(true)
  const [openPt,   setOpenPt]       = useState(null)
  const [showRpt,  setShowRpt]      = useState(false)
  const [showAdd,  setShowAdd]      = useState(false)
  const staff = USERS.filter(u=>!u.isDir)

  async function load() {
    setLoading(true)
    const pts = await dbLoadPatients()
    setPatientState(pts)
    const d = {}
    for (const pt of pts) {
      const checks = {}
      for (const u of USERS) checks[u.id] = await dbLoadChecks(pt.id, u.id)
      const sub = await dbLoadSubmission(pt.id)
      let done=0,total=0
      staff.forEach(u=>STEPS.forEach(s=>{total+=s.checks.length;done+=s.checks.filter((_,i)=>checks[u.id][s.id+"-"+i]).length}))
      d[pt.id]={checks,sub,pct:total>0?Math.round(done/total*100):0}
    }
    setAllData(d); setLoading(false)
  }
  useEffect(()=>{load()},[])

  function stSym(ptId,stepId,userId) {
    const s=STEPS.find(x=>x.id===stepId),u=USERS.find(x=>x.id===userId)
    if(!u.owns.includes(stepId))return{sym:"—",bg:"transparent",c:"#CCC"}
    const c=allData[ptId]?.checks?.[userId]||{}
    const done=s.checks.filter((_,i)=>c[stepId+"-"+i]).length
    if(done===0)               return{sym:"✗",bg:"#FFF2F2",c:C.red}
    if(done===s.checks.length) return{sym:"✓",bg:C.greenL, c:C.green}
    return{sym:"~",bg:C.amberL,c:C.amber}
  }

  if(loading)return<div style={{padding:40,textAlign:"center",color:C.muted}}><div style={{fontSize:24,marginBottom:8}}>⏳</div>Loading…</div>

  const submitted=patients.filter(p=>allData[p.id]?.sub?.submitted).length

  if(showRpt) return (
    <div style={{padding:"14px 14px 40px"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
        <button onClick={()=>setShowRpt(false)} style={{background:C.tealL,border:"1px solid #B8D8DC",borderRadius:8,color:C.teal,fontSize:12,padding:"7px 12px",cursor:"pointer",fontWeight:600}}>← Back</button>
        <div style={{flex:1,fontWeight:700,fontSize:14,color:C.navy}}>Patient Care Report</div>
        <button onClick={()=>window.print()} style={{background:C.navy,border:"none",borderRadius:8,color:"#fff",fontSize:12,padding:"7px 12px",cursor:"pointer",fontWeight:600}}>🖨️ Print</button>
      </div>
      <div style={{background:"#fff",borderRadius:12,padding:"16px",marginBottom:14}}>
        <div style={{fontWeight:800,fontSize:15,color:C.navy}}>Gurdevi Memorial Superspeciality Hospital</div>
        <div style={{color:C.muted,fontSize:11}}>Jagadhri–Yamunanagar · NABH-Accredited</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:12,marginTop:10,padding:"10px 0",borderTop:"1px solid #EEF2F5",fontSize:11,color:"#555"}}>
          <span><b>Date:</b> {dateStr()}</span>
          <span><b>Generated:</b> {new Date().toLocaleString("en-IN")}</span>
          <span><b>By:</b> Dr. Ankit Sandhu, Director</span>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14}}>
        {[["Total",patients.length,C.navy],["Submitted",submitted,C.green],["Pending",patients.length-submitted,C.amber]].map(([l,v,col])=>(
          <div key={l} style={{background:"#fff",borderRadius:10,padding:"12px 10px",textAlign:"center",boxShadow:"0 1px 4px rgba(0,0,0,.07)"}}>
            <div style={{fontWeight:800,fontSize:22,color:col}}>{v}</div>
            <div style={{color:C.muted,fontSize:10,marginTop:2}}>{l}</div>
          </div>
        ))}
      </div>
      {patients.map((pt,idx)=>{
        const d=allData[pt.id]||{},sub=d.sub
        return (
          <div key={pt.id} style={{background:"#fff",borderRadius:12,marginBottom:14,overflow:"hidden",boxShadow:"0 1px 5px rgba(0,0,0,.07)"}}>
            <div style={{background:C.navy,padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:26,height:26,borderRadius:6,background:"rgba(255,255,255,.2)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:11}}>{idx+1}</div>
              <div style={{flex:1}}>
                <div style={{color:"#fff",fontWeight:700,fontSize:13}}>{pt.name}{pt.age?" · "+pt.age+"y":""}</div>
                <div style={{color:"#A8D5DB",fontSize:11}}>UHID: {pt.uhid} · {pt.ward}</div>
              </div>
              {sub?.submitted?<span style={{background:C.greenL,color:C.green,fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:5}}>✓ Done</span>:<span style={{background:C.amberL,color:C.amber,fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:5}}>Pending</span>}
            </div>
            {pt.dx&&<div style={{padding:"6px 14px",background:C.tealL,color:C.teal,fontSize:11,fontStyle:"italic"}}>{pt.dx}</div>}
            {staff.map(u=>{
              const mySteps=STEPS.filter(s=>u.owns.includes(s.id)),c=d.checks?.[u.id]||{}
              const done=mySteps.reduce((a,s)=>a+s.checks.filter((_,i)=>c[s.id+"-"+i]).length,0)
              const total=mySteps.reduce((a,s)=>a+s.checks.length,0)
              return (
                <div key={u.id} style={{borderTop:"1px solid #EEF2F5",padding:"10px 14px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                    <div style={{width:22,height:22,borderRadius:5,background:u.color,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:8,fontWeight:800}}>{u.initials}</div>
                    <span style={{fontWeight:700,fontSize:11,color:u.color}}>{u.name}</span>
                    <span style={{color:C.muted,fontSize:10,marginLeft:"auto"}}>{done}/{total}</span>
                  </div>
                  {mySteps.map(s=>s.checks.map((ch,i)=>(
                    <div key={s.id+"-"+i} style={{display:"flex",alignItems:"center",gap:7,padding:"4px 0",borderBottom:"1px solid #F4F6F8",fontSize:11}}>
                      <span style={{color:c[s.id+"-"+i]?C.green:"#DDD",fontWeight:800,fontSize:13}}>{c[s.id+"-"+i]?"✓":"○"}</span>
                      <span style={{color:c[s.id+"-"+i]?C.green:"#888",textDecoration:c[s.id+"-"+i]?"line-through":"none"}}>{ch}</span>
                    </div>
                  )))}
                </div>
              )
            })}
            {sub?.submitted&&<div style={{padding:"8px 14px",background:C.greenL,borderTop:"1px solid #A8D8B0",color:C.green,fontSize:11,fontWeight:600}}>✓ Submitted by {sub.submittedByName} · {fmtTs(sub.submittedAt)}</div>}
          </div>
        )
      })}
      <style>{`@media print{button{display:none}}`}</style>
    </div>
  )

  return (
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
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
          {[["Patients",patients.length],["Submitted",submitted],["Pending",patients.length-submitted]].map(([l,v])=>(
            <div key={l} style={{background:"rgba(0,0,0,.2)",borderRadius:8,padding:"8px 10px",textAlign:"center"}}>
              <div style={{color:"#fff",fontWeight:800,fontSize:20}}>{v}</div>
              <div style={{color:"rgba(196,168,232,.65)",fontSize:10}}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {patients.length===0&&(
        <div style={{background:"#fff",borderRadius:10,padding:"24px 20px",textAlign:"center",color:C.muted}}>
          <div style={{fontSize:28,marginBottom:8}}>🛏️</div>No patients added today yet.
        </div>
      )}

      {patients.map(pt=>{
        const d=allData[pt.id]||{},sub=d.sub,isOpen=openPt===pt.id,done=sub?.submitted
        return (
          <div key={pt.id} style={{background:"#fff",borderRadius:11,marginBottom:10,overflow:"hidden",boxShadow:done?"0 0 0 2px "+C.green:"0 1px 5px rgba(0,0,0,.08)"}}>
            <div onClick={()=>setOpenPt(isOpen?null:pt.id)} style={{padding:"12px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:36,height:36,borderRadius:9,background:done?C.green:C.navy,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:done?16:13,flexShrink:0}}>{done?"✓":pt.gender}</div>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:13,color:C.navy}}>{pt.name}{pt.age?" · "+pt.age+"y":""}</div>
                <div style={{color:"#888",fontSize:11}}>{pt.uhid} · {pt.ward}</div>
                <div style={{display:"flex",alignItems:"center",gap:8,marginTop:5}}>
                  <div style={{flex:1,background:"#EEF2F5",borderRadius:4,height:5,overflow:"hidden"}}>
                    <div style={{width:(d.pct||0)+"%",height:"100%",background:(d.pct||0)===100?C.green:C.teal,borderRadius:4}} />
                  </div>
                  <span style={{fontSize:11,fontWeight:700,color:(d.pct||0)===100?C.green:C.navy}}>{d.pct||0}%</span>
                  {done&&<span style={{background:C.greenL,color:C.green,fontSize:10,fontWeight:700,padding:"1px 6px",borderRadius:4}}>✓</span>}
                </div>
              </div>
              <span style={{color:"#C0CDD5",fontSize:16}}>{isOpen?"▲":"▼"}</span>
            </div>
            {isOpen&&(
              <div style={{borderTop:"1px solid #EEF2F5",padding:"10px 14px 12px"}}>
                {pt.dx&&<div style={{color:C.teal,fontSize:11,fontStyle:"italic",marginBottom:8}}>{pt.dx}</div>}
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
                    <thead>
                      <tr style={{background:"#F0F4F8"}}>
                        <th style={{padding:"5px 7px",textAlign:"left",color:C.navy,fontWeight:700}}>Step</th>
                        {staff.map(u=><th key={u.id} style={{padding:"5px 6px",textAlign:"center"}}><div style={{width:22,height:22,borderRadius:6,background:u.color,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:8,fontWeight:800,margin:"0 auto"}}>{u.initials}</div></th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {STEPS.map((s,si)=>(
                        <tr key={s.id} style={{background:si%2===0?"#fff":"#FAFCFD"}}>
                          <td style={{padding:"5px 7px",color:C.navy,fontWeight:600}}><span style={{background:C.teal,color:"#fff",borderRadius:4,padding:"1px 5px",fontSize:9,fontWeight:800,marginRight:4}}>{s.id}</span>{s.title}</td>
                          {staff.map(u=>{const{sym,bg,c}=stSym(pt.id,s.id,u.id);return<td key={u.id} style={{padding:"4px 6px",textAlign:"center"}}><span style={{background:bg,color:c,borderRadius:4,padding:"1px 6px",fontWeight:800,fontSize:11}}>{sym}</span></td>})}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {sub?.submitted&&<div style={{marginTop:8,color:C.green,fontSize:11,fontWeight:600}}>✓ Submitted by {sub.submittedByName} · {fmtTs(sub.submittedAt)}</div>}
              </div>
            )}
          </div>
        )
      })}

      <button onClick={()=>setShowRpt(true)} style={{width:"100%",background:"linear-gradient(135deg,#3D1A78,#6A3DB8)",border:"none",borderRadius:10,padding:"14px",color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:9,marginTop:6,boxShadow:"0 4px 14px rgba(61,26,120,.35)"}}>
        <span style={{fontSize:18}}>📋</span> View &amp; Print Full Report
      </button>

      <button onClick={()=>setShowAdd(true)} style={{position:"fixed",bottom:30,right:20,background:C.navy,border:"none",borderRadius:"50%",width:54,height:54,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",boxShadow:"0 4px 16px rgba(13,43,94,.4)",zIndex:50,color:"#fff",fontSize:26,lineHeight:1}}>+</button>
      {showAdd&&<AddPatient user={USERS[0]} onDone={updated=>{setPatientState(updated);setShowAdd(false);load()}} onClose={()=>setShowAdd(false)} />}
    </div>
  )
}

// ══ ROOT ═══════════════════════════════════════════════════════════════════
export default function App() {
  const [user,  setUser]  = useState(null)
  const [selPt, setSelPt] = useState(null)
  const [clock, setClock] = useState(clockStr())

  useEffect(()=>{const t=setInterval(()=>setClock(clockStr()),30000);return()=>clearInterval(t)},[])

  if (!user) return <Login onLogin={u=>{setUser(u);setSelPt(null)}} />

  return (
    <div style={{fontFamily:"system-ui,'Segoe UI',sans-serif",background:C.gray,minHeight:"100vh"}}>
      <div style={{background:"linear-gradient(135deg,"+(user.isDir?"#3D1A78":C.navy)+" 0%,"+user.color+" 100%)",padding:"12px 15px 0",position:"sticky",top:0,zIndex:100,boxShadow:"0 2px 10px rgba(13,43,94,.3)"}}>
        <div style={{maxWidth:680,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
            {selPt&&!user.isDir
              ?<button onClick={()=>setSelPt(null)} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:7,color:"#fff",fontSize:13,padding:"5px 11px",cursor:"pointer",fontWeight:600}}>← Back</button>
              :<div style={{width:32,height:32,borderRadius:8,background:"rgba(0,0,0,.25)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:12,flexShrink:0}}>{user.initials}</div>
            }
            <div style={{flex:1,minWidth:0}}>
              <div style={{color:"#fff",fontWeight:700,fontSize:13}}>{selPt&&!user.isDir?selPt.name:user.name}{user.isDir?" 👑":""}</div>
              <div style={{color:"rgba(196,168,232,.75)",fontSize:10}}>{selPt&&!user.isDir?"UHID: "+selPt.uhid+" · "+selPt.ward:user.role+" · "+clock}</div>
            </div>
            <button onClick={()=>{setUser(null);setSelPt(null)}} style={{background:"rgba(255,255,255,.12)",border:"1px solid rgba(255,255,255,.2)",borderRadius:7,color:"#fff",fontSize:10,padding:"5px 10px",cursor:"pointer",fontWeight:600}}>Sign Out</button>
          </div>
          {!selPt&&(
            <div style={{display:"flex",gap:4}}>
              <button style={{flex:1,padding:"8px 0",borderRadius:"8px 8px 0 0",border:"none",background:"rgba(255,255,255,.18)",color:"#fff",fontSize:11,fontWeight:700,cursor:"default",borderBottom:"2px solid rgba(255,255,255,.5)"}}>
                {user.isDir?"📊 Dashboard":"🛏️ Patients"}
              </button>
            </div>
          )}
        </div>
      </div>
      <div style={{maxWidth:680,margin:"0 auto"}}>
        {user.isDir&&<Director/>}
        {!user.isDir&&!selPt&&<PatientList user={user} onPick={pt=>setSelPt(pt)} />}
        {!user.isDir&&selPt&&<Checklist pt={selPt} user={user} />}
      </div>
    </div>
  )
}
