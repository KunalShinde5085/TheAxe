const C=window.STA_CONFIG||{};
let supabaseClient=null, user=null, localMode=false;
const LOCAL_KEY="sta_max_local_v1";
let local=JSON.parse(localStorage.getItem(LOCAL_KEY)||"null")||{courses:[],lessons:[],progress:{},streak:0,lastActivity:null};

const $=id=>document.getElementById(id);
function saveLocal(){localStorage.setItem(LOCAL_KEY,JSON.stringify(local))}
function configured(){return C.SUPABASE_URL?.startsWith("https://")&&!C.SUPABASE_URL.includes("YOUR_")&&C.SUPABASE_PUBLISHABLE_KEY&&!C.SUPABASE_PUBLISHABLE_KEY.includes("YOUR_")}
function setMsg(id,t,good=false){$(id).textContent=t;$(id).style.color=good?"#55dc91":""}

async function init(){
  if(configured()&&window.supabase){
    supabaseClient=supabase.createClient(C.SUPABASE_URL,C.SUPABASE_PUBLISHABLE_KEY);
    const {data}=await supabaseClient.auth.getSession(); user=data.session?.user||null;
    supabaseClient.auth.onAuthStateChange((_e,s)=>{user=s?.user||null; showApp()});
  }else localMode=true;
  showApp();
}
function showApp(){
  const signed=!!user;
  $("authView").classList.toggle("hidden",signed||localMode);
  $("appView").classList.toggle("hidden",!(signed||localMode));
  $("logoutBtn").classList.toggle("hidden",!signed);
  $("syncState").textContent=signed?"☁ Synced to Supabase":localMode?"💾 Local mode":"Not connected";
  loadAll();
}
async function auth(action){
  const email=$("email").value.trim(), password=$("password").value;
  if(!email||!password)return setMsg("authMsg","Enter email and password.");
  if(!supabaseClient)return setMsg("authMsg","Add Supabase settings in js/config.js first.");
  const r=action==="login"?await supabaseClient.auth.signInWithPassword({email,password}):await supabaseClient.auth.signUp({email,password});
  if(r.error)return setMsg("authMsg",r.error.message);
  setMsg("authMsg",action==="login"?"Signed in. Check the dashboard.":"Account created. Check email if confirmation is enabled.",true);
}
$("loginBtn").onclick=()=>auth("login");$("signupBtn").onclick=()=>auth("signup");
$("guestBtn").onclick=()=>{localMode=true;showApp()};$("logoutBtn").onclick=async()=>{await supabaseClient.auth.signOut()};
$("refreshBtn").onclick=loadAll;

async function dbCourses(){
  if(localMode)return local.courses;
  const {data,error}=await supabaseClient.from("courses").select("*").order("created_at",{ascending:false});
  if(error)throw error; return data||[];
}
async function dbLessons(){
  if(localMode)return local.lessons;
  const {data,error}=await supabaseClient.from("lessons").select("*").order("order_index");
  if(error)throw error; return data||[];
}
async function dbProgress(){
  if(localMode)return Object.entries(local.progress).map(([lesson_id,completed])=>({lesson_id,completed}));
  const {data,error}=await supabaseClient.from("lesson_progress").select("lesson_id,completed").eq("user_id",user.id);
  if(error)throw error; return data||[];
}
async function loadAll(){
  try{
    const [courses,lessons,prog]=await Promise.all([dbCourses(),dbLessons(),dbProgress()]);
    render(courses,lessons,prog);
  }catch(e){console.error(e);setMsg("generateMsg","Database error: "+e.message)}
}
function render(courses,lessons,prog){
  const p=new Map(prog.map(x=>[x.lesson_id,x.completed]));
  $("completed").textContent=[...p.values()].filter(Boolean).length;
  const pct=lessons.length?Math.round([...p.values()].filter(Boolean).length/lessons.length*100):0;
  $("overall").textContent=pct+"%"; $("streak").textContent=localMode?local.streak:"—";
  $("courses").innerHTML=courses.length?courses.map(c=>{
    const ls=lessons.filter(l=>l.course_id===c.id);
    const mods=[...new Set(ls.map(l=>l.module_title||"Lessons"))];
    return `<div class="course"><div class="course-head"><strong>${esc(c.name)}</strong><span class="pill">${ls.length} lessons</span></div>${mods.map(m=>`<div class="module"><b>${esc(m)}</b>${ls.filter(l=>(l.module_title||"Lessons")===m).map(l=>lessonHTML(l,p.get(l.id))).join("")}</div>`).join("")}</div>`
  }).join(""):"<p class='muted'>No courses yet. Paste a YouTube URL above.</p>";
  const pending=lessons.filter(l=>!p.get(l.id));
  $("queueCount").textContent=pending.length+" pending";
  $("queue").innerHTML=pending.slice(0,12).map(l=>`<div class="queue-row"><div><strong>${esc(l.title)}</strong><div class="muted tiny">${esc(l.course_name||"Course")} • ${esc(l.difficulty||"")}</div></div><button class="btn small" onclick="completeLesson('${l.id}')">Complete</button></div>`).join("")||"<p class='muted'>🎉 Nothing pending.</p>";
  const next=pending[0];
  $("missionTitle").textContent=next?.title||"All lessons complete!";
  $("missionDesc").textContent=next?.description||"Great work. Add another course or review your completed lessons.";
  $("missionBar").style.width=pct+"%";
  const status=$("statusText");status.className="";
  if(!next){status.textContent="🟢 MASTERED";status.classList.add("status-green")}
  else if(local.lastActivity===new Date().toDateString()){status.textContent="🟢 ON TRACK";status.classList.add("status-green")}
  else if(local.lastActivity){status.textContent="🟡 STUDY TODAY";status.classList.add("status-yellow")}
  else{status.textContent="🔴 ACTION REQUIRED";status.classList.add("status-red")}
}
function lessonHTML(l,done){return `<div class="lesson"><input type="checkbox" ${done?"checked":""} onchange="completeLesson('${l.id}',this.checked)"><div><div class="${done?"done":""}"><strong>${esc(l.title)}</strong></div><small class="muted">${esc(l.duration_minutes?l.duration_minutes+" min":"")} ${l.youtube_url?`• <a href="${esc(l.youtube_url)}" target="_blank" rel="noopener">YouTube</a>`:""}</small></div></div>`}
window.completeLesson=async(id,checked=true)=>{
  try{
    if(localMode){local.progress[id]=checked; if(checked)markActivity();saveLocal();loadAll();return}
    const payload={user_id:user.id,lesson_id:id,completed:!!checked,completed_at:checked?new Date().toISOString():null};
    const r=await supabaseClient.from("lesson_progress").upsert(payload,{onConflict:"user_id,lesson_id"});
    if(r.error)throw r.error; if(checked)markActivity(); loadAll();
  }catch(e){alert(e.message)}
};
function markActivity(){
  const today=new Date().toDateString();
  if(local.lastActivity!==today){
    if(local.lastActivity){
      const d=Math.round((new Date(today)-new Date(local.lastActivity))/86400000);
      local.streak=d===1?local.streak+1:1;
    }else local.streak=1;
    local.lastActivity=today;saveLocal();
  }
}
$("completeMissionBtn").onclick=async()=>{const pending=[...document.querySelectorAll("#queue .queue-row button")][0];if(pending)pending.click()};
$("generateBtn").onclick=generateCourse;
async function generateCourse(){
  const url=$("youtubeUrl").value.trim(); if(!url)return setMsg("generateMsg","Paste a YouTube URL.");
  $("generateBtn").disabled=true;setMsg("generateMsg","Analyzing the public YouTube video with Gemini…");
  try{
    if(localMode)throw new Error("AI generation needs Supabase Edge Functions. Connect Supabase first.");
    const {data,error}=await supabaseClient.functions.invoke("analyze-youtube",{body:{youtube_url:url,course_name:$("courseName").value.trim()||null}});
    if(error)throw error;
    if(!data?.course)throw new Error(data?.error||"No course returned.");
    await insertCourseData(data.course);
    $("youtubeUrl").value="";$("courseName").value="";
    setMsg("generateMsg","Course generated and saved.",true);loadAll();
  }catch(e){console.error(e);setMsg("generateMsg","Generation failed: "+e.message)}
  finally{$("generateBtn").disabled=false}
}
async function insertCourseData(c){
  const courseRow={name:c.name,description:c.description||"",source_url:c.source_url||null,category:c.category||"General"};
  if(localMode){
    const cid=crypto.randomUUID();local.courses.push({id:cid,...courseRow});
    (c.modules||[]).forEach((m,mi)=>(m.lessons||[]).forEach((l,li)=>local.lessons.push({id:crypto.randomUUID(),course_id:cid,course_name:c.name,module_title:m.title,title:l.title,youtube_url:l.youtube_url||c.source_url,duration_minutes:l.duration_minutes||null,difficulty:l.difficulty||"Beginner",description:l.description||"",order_index:mi*100+li})));
    saveLocal();return;
  }
  const {data:course,error:e1}=await supabaseClient.from("courses").insert({...courseRow,user_id:user.id}).select().single();if(e1)throw e1;
  const rows=[];(c.modules||[]).forEach((m,mi)=>(m.lessons||[]).forEach((l,li)=>rows.push({course_id:course.id,user_id:user.id,module_title:m.title,title:l.title,youtube_url:l.youtube_url||c.source_url,duration_minutes:l.duration_minutes||null,difficulty:l.difficulty||"Beginner",description:l.description||"",order_index:mi*100+li})));
  if(rows.length){const {error:e2}=await supabaseClient.from("lessons").insert(rows);if(e2)throw e2}
}
$("importJsonBtn").onclick=async()=>{
  const f=$("jsonFile").files[0];if(!f)return setMsg("importMsg","Choose a JSON file.");
  try{const data=JSON.parse(await f.text());await insertCourseData(data.course||data);setMsg("importMsg","JSON imported.",true);loadAll()}catch(e){setMsg("importMsg",e.message)}
};
$("exportJsonBtn").onclick=async()=>{
  const [courses,lessons]=await Promise.all([dbCourses(),dbLessons()]);
  download("sharpeningtheaxe-export.json",JSON.stringify({courses,lessons},null,2),"application/json");
};
$("importCsvBtn").onclick=async()=>{
  const f=$("csvFile").files[0];if(!f)return setMsg("importMsg","Choose a CSV file.");
  try{const rows=parseCSV(await f.text());if(!rows.length)throw new Error("CSV is empty.");const grouped={};
    rows.forEach(r=>{const n=r.course||"Imported Course";(grouped[n]??={name:n,description:"Imported from CSV",modules:[{title:r.module||"Lessons",lessons:[]}]});grouped[n].modules[0].lessons.push({title:r.title,youtube_url:r.youtube_url,duration_minutes:Number(r.duration_minutes)||null,difficulty:r.difficulty||"Beginner",description:r.description||""})});
    for(const c of Object.values(grouped))await insertCourseData(c);setMsg("importMsg","CSV imported.",true);loadAll();
  }catch(e){setMsg("importMsg",e.message)}
};
$("exportCsvBtn").onclick=async()=>{
 const [courses,lessons]=await Promise.all([dbCourses(),dbLessons()]);const names=new Map(courses.map(c=>[c.id,c.name]));
 const head=["course","module","title","youtube_url","duration_minutes","difficulty","description"];
 const lines=[head.join(",")].concat(lessons.map(l=>[names.get(l.course_id)||l.course_name,l.module_title,l.title,l.youtube_url,l.duration_minutes,l.difficulty,l.description].map(csvEsc).join(",")));
 download("sharpeningtheaxe-lessons.csv",lines.join("\n"),"text/csv");
};
function csvEsc(v){return `"${String(v??"").replaceAll('"','""')}"`}
function parseCSV(s){const lines=s.split(/\r?\n/).filter(Boolean),head=splitCSV(lines.shift());return lines.map(x=>{const a=splitCSV(x),o={};head.forEach((h,i)=>o[h.trim()]=a[i]??"");return o})}
function splitCSV(s){const a=[];let cur="",q=false;for(let i=0;i<s.length;i++){const ch=s[i];if(ch==='"'&&s[i+1]==='"'){cur+='"';i++;continue}if(ch==='"'){q=!q;continue}if(ch===","&&!q){a.push(cur);cur="";continue}cur+=ch}a.push(cur);return a}
function download(name,text,type){const b=new Blob([text],{type}),a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=name;a.click();URL.revokeObjectURL(a.href)}
function esc(x){return String(x??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
init();
