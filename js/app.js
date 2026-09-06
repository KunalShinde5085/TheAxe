/* SharpeningTheAxe V3 - dynamic frontend. Keeps js/config.js untouched. */
const C = window.STA_CONFIG || {};
let supabaseClient = null, user = null, localMode = false;
const LOCAL_KEY = "sta_v3_local_v1";
let local = JSON.parse(localStorage.getItem(LOCAL_KEY) || "null") || {
  courses: [], lessons: [], progress: {}, streak: 0, lastActivity: null,
  dailyTarget: 60, reminderTime: "19:00", reminderEnabled: false
};
let cache = { courses: [], lessons: [], progress: [] };
let undoStack = null;

const $ = id => document.getElementById(id);
const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
function saveLocal(){ localStorage.setItem(LOCAL_KEY, JSON.stringify(local)); }
function configured(){ return C.SUPABASE_URL?.startsWith("https://") && !C.SUPABASE_URL.includes("YOUR_") && C.SUPABASE_PUBLISHABLE_KEY && !C.SUPABASE_PUBLISHABLE_KEY.includes("YOUR_"); }
function esc(x){ return String(x ?? "").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m])); }
function setMsg(id,t,good=false){ const el=$(id); if(!el)return; el.textContent=t; el.className=`msg ${good?"good":""}`; }
function download(name,text,type){ const b=new Blob([text],{type}),a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),500); }

async function init(){
  if(configured() && window.supabase){
    supabaseClient = supabase.createClient(C.SUPABASE_URL,C.SUPABASE_PUBLISHABLE_KEY);
    const {data} = await supabaseClient.auth.getSession(); user = data.session?.user || null;
    supabaseClient.auth.onAuthStateChange((_e,s)=>{ user=s?.user||null; localMode=false; showApp(); });
  } else localMode = true;
  wireUI(); showApp();
}
function wireUI(){
  $("loginBtn").onclick=()=>auth("login"); $("signupBtn").onclick=()=>auth("signup");
  $("guestBtn").onclick=()=>{localMode=true;showApp()};
  $("logoutBtn").onclick=async()=>{ if(supabaseClient) await supabaseClient.auth.signOut(); };
  $("refreshBtn").onclick=loadAll; $("generateBtn").onclick=generateCourse;
  $("importJsonBtn").onclick=importJSON; $("exportJsonBtn").onclick=exportJSON;
  $("importCsvBtn").onclick=importCSV; $("exportCsvBtn").onclick=exportCSV;
  $("addCourseBtn").onclick=addCourse; $("searchBox").oninput=renderFromCache;
  $("filterBox").onchange=renderFromCache; $("targetMinutes").onchange=saveSettings;
  $("reminderTime").onchange=saveSettings; $("reminderEnabled").onchange=saveSettings;
  $("notificationBtn").onclick=requestNotifications;
}
function showApp(){
  const signed=!!user; $("authView").classList.toggle("hidden",signed||localMode); $("appView").classList.toggle("hidden",!(signed||localMode));
  $("logoutBtn").classList.toggle("hidden",!signed);
  $("syncState").textContent=signed?"☁ Synced to Supabase":"💾 Local mode";
  if(signed||localMode) loadAll();
}
async function auth(action){
  const email=$("email").value.trim(),password=$("password").value;
  if(!email||!password)return setMsg("authMsg","Enter email and password.");
  if(!supabaseClient)return setMsg("authMsg","Supabase is not configured in js/config.js.");
  const r=action==="login"?await supabaseClient.auth.signInWithPassword({email,password}):await supabaseClient.auth.signUp({email,password});
  if(r.error)return setMsg("authMsg",r.error.message); setMsg("authMsg",action==="login"?"Signed in.":"Account created. Check email if confirmation is enabled.",true);
}

async function dbCourses(){ if(localMode)return local.courses; const {data,error}=await supabaseClient.from("courses").select("*").order("created_at",{ascending:false}); if(error)throw error; return data||[]; }
async function dbLessons(){ if(localMode)return local.lessons; const {data,error}=await supabaseClient.from("lessons").select("*").order("order_index"); if(error)throw error; return data||[]; }
async function dbProgress(){ if(localMode)return Object.entries(local.progress).map(([lesson_id,completed])=>({lesson_id,completed})); const {data,error}=await supabaseClient.from("lesson_progress").select("lesson_id,completed").eq("user_id",user.id); if(error)throw error; return data||[]; }
async function loadAll(){
  try{
    const [courses,lessons,progress]=await Promise.all([dbCourses(),dbLessons(),dbProgress()]);
    cache={courses,lessons,progress}; renderFromCache();
  }catch(e){ console.error(e); setMsg("globalMsg","Database error: "+e.message); }
}
function renderFromCache(){ render(cache.courses,cache.lessons,cache.progress); }
function render(courses,lessons,prog){
  const p=new Map(prog.map(x=>[x.lesson_id,!!x.completed]));
  const search=($("searchBox")?.value||"").trim().toLowerCase(); const filter=$("filterBox")?.value||"all";
  const filteredLessons=lessons.filter(l=>{
    const matches=!search || [l.title,l.description,l.module_title,l.difficulty].some(v=>String(v||"").toLowerCase().includes(search));
    const done=!!p.get(l.id); return matches && (filter==="all" || (filter==="completed"&&done) || (filter==="pending"&&!done));
  });
  const completed=lessons.filter(l=>p.get(l.id)).length, pct=lessons.length?Math.round(completed/lessons.length*100):0;
  $("completed").textContent=completed; $("overall").textContent=pct+"%"; $("streak").textContent=localMode?local.streak:"—"; $("courseCount").textContent=courses.length;
  const todayDone=lessons.filter(l=>p.get(l.id)).length; $("targetLabel").textContent=`Daily target: ${local.dailyTarget||60} min`;
  const visibleCourses=courses.filter(c=>!search || c.name.toLowerCase().includes(search) || filteredLessons.some(l=>l.course_id===c.id));
  $("courses").innerHTML=visibleCourses.length?visibleCourses.map(c=>courseHTML(c,lessons.filter(l=>l.course_id===c.id),p,search,filter)).join(""):"<p class='muted'>No matching courses.</p>";
  const pending=filteredLessons.filter(l=>!p.get(l.id)); $("queueCount").textContent=`${pending.length} pending`;
  $("queue").innerHTML=pending.slice(0,15).map(l=>`<div class="queue-row"><div><strong>${esc(l.title)}</strong><div class="muted tiny">${esc(courseName(courses,l.course_id))} • ${esc(l.module_title||"Lessons")} • ${esc(l.difficulty||"")}</div></div><button class="btn small" onclick="completeLesson('${l.id}',true)">Complete</button></div>`).join("")||"<p class='muted'>🎉 Nothing pending in this filter.</p>";
  const allPending=lessons.filter(l=>!p.get(l.id)), next=allPending[0]; $("missionTitle").textContent=next?.title||"All lessons complete!"; $("missionDesc").textContent=next?.description||"Great work. Add another course or review completed lessons."; $("missionBar").style.width=pct+"%";
  const status=$("statusText"); status.className="status"; if(!next){status.textContent="🟢 MASTERED";status.classList.add("status-green")} else if(local.lastActivity===new Date().toDateString()){status.textContent="🟢 ON TRACK";status.classList.add("status-green")} else if(local.lastActivity){status.textContent="🟡 STUDY TODAY";status.classList.add("status-yellow")} else {status.textContent="🔴 ACTION REQUIRED";status.classList.add("status-red")}
  $("settingsSummary").textContent=`${local.reminderEnabled?"🔔 Reminder on":"🔕 Reminder off"} • ${local.reminderTime||"19:00"}`;
}
function courseName(courses,id){return courses.find(c=>c.id===id)?.name||"Course";}
function courseHTML(c,ls,p){
  const modules=[...new Set(ls.map(l=>l.module_title||"Lessons"))];
  return `<div class="course" data-course="${esc(c.id)}"><div class="course-head"><div><strong>${esc(c.name)}</strong><div class="muted tiny">${esc(c.category||"General")} • ${ls.length} lessons</div></div><div class="row-actions"><button class="icon-btn" title="Rename course" onclick="renameCourse('${c.id}')">✏️</button><button class="icon-btn danger" title="Delete course" onclick="deleteCourse('${c.id}')">🗑️</button></div></div><p class="course-desc">${esc(c.description||"")}</p>${modules.map(m=>moduleHTML(c, m, ls.filter(l=>(l.module_title||"Lessons")===m),p)).join("")}<button class="btn tiny-btn" onclick="addLesson('${c.id}')">＋ Add lesson</button> <button class="btn tiny-btn" onclick="addModule('${c.id}')">＋ Add module</button></div>`;
}
function moduleHTML(c,m,ls,p){ return `<div class="module"><div class="module-head"><b>${esc(m)}</b><div class="row-actions"><button class="icon-btn" title="Rename module" onclick="renameModule('${c.id}',${JSON.stringify(m)})">✏️</button><button class="icon-btn danger" title="Delete module" onclick="deleteModule('${c.id}',${JSON.stringify(m)})">🗑️</button></div></div>${ls.map(l=>lessonHTML(l,p.get(l.id))).join("")}</div>`; }
function lessonHTML(l,done){return `<div class="lesson"><input type="checkbox" ${done?"checked":""} onchange="completeLesson('${l.id}',this.checked)"><div class="lesson-main"><div class="${done?"done":""}"><strong>${esc(l.title)}</strong></div><small class="muted">${esc(l.duration_minutes?l.duration_minutes+" min":"")} ${l.youtube_url?`• <a href="${esc(l.youtube_url)}" target="_blank" rel="noopener">YouTube</a>`:""}</small></div><div class="row-actions"><button class="icon-btn" title="Edit lesson" onclick="editLesson('${l.id}')">✏️</button><button class="icon-btn danger" title="Delete lesson" onclick="deleteLesson('${l.id}')">🗑️</button></div></div>`; }

window.completeLesson=async(id,checked=true)=>{ try{ if(localMode){local.progress[id]=!!checked;if(checked)markActivity();saveLocal();return loadAll();} const payload={user_id:user.id,lesson_id:id,completed:!!checked,completed_at:checked?new Date().toISOString():null,updated_at:new Date().toISOString()};const r=await supabaseClient.from("lesson_progress").upsert(payload,{onConflict:"user_id,lesson_id"});if(r.error)throw r.error;if(checked)markActivity();await loadAll(); }catch(e){alert(e.message)} };
function markActivity(){const today=new Date().toDateString();if(local.lastActivity!==today){if(local.lastActivity){const d=Math.round((new Date(today)-new Date(local.lastActivity))/86400000);local.streak=d===1?local.streak+1:1}else local.streak=1;local.lastActivity=today;saveLocal();}}
$("completeMissionBtn").onclick=()=>{const next=cache.lessons.find(l=>!cache.progress.find(p=>p.lesson_id===l.id&&p.completed));if(next)completeLesson(next.id,true)};

async function addCourse(){const name=prompt("Course name:");if(!name?.trim())return;const row={name:name.trim(),description:prompt("Description (optional):")||"",category:prompt("Category (optional):")||"General",source_url:null};try{if(localMode){const id=uid();local.courses.push({id,...row});saveLocal()}else{const {error}=await supabaseClient.from("courses").insert({...row,user_id:user.id});if(error)throw error}await loadAll()}catch(e){alert(e.message)}}
async function renameCourse(id){const c=cache.courses.find(x=>x.id===id);if(!c)return;const name=prompt("New course name:",c.name);if(!name?.trim()||name.trim()===c.name)return;try{if(localMode){c.name=name.trim();local.lessons.filter(l=>l.course_id===id).forEach(l=>l.course_name=c.name);saveLocal()}else{let r=await supabaseClient.from("courses").update({name:name.trim()}).eq("id",id).eq("user_id",user.id);if(r.error)throw r.error}await loadAll()}catch(e){alert(e.message)}}
async function editLesson(id){const l=cache.lessons.find(x=>x.id===id);if(!l)return;const title=prompt("Lesson name:",l.title);if(!title?.trim())return;const descInput=prompt("Description:",l.description||""); const desc=descInput===null?(l.description||""):descInput;const diff=prompt("Difficulty (Beginner / Intermediate / Advanced):",l.difficulty||"Beginner")||l.difficulty;const dur=prompt("Duration in minutes:",l.duration_minutes||"");try{const changes={title:title.trim(),description:desc,difficulty:diff,duration_minutes:dur?Number(dur):null};if(localMode){Object.assign(l,changes);saveLocal()}else{const r=await supabaseClient.from("lessons").update(changes).eq("id",id).eq("user_id",user.id);if(r.error)throw r.error}await loadAll()}catch(e){alert(e.message)}}
async function addLesson(courseId,moduleTitle){const title=prompt("Lesson title:");if(!title?.trim())return;moduleTitle=moduleTitle||prompt("Module name:","Lessons")||"Lessons";const url=prompt("YouTube URL (optional):")||"";try{const row={course_id:courseId,module_title:moduleTitle,title:title.trim(),youtube_url:url||null,description:"",duration_minutes:null,difficulty:"Beginner",order_index:Date.now()};if(localMode){local.lessons.push({id:uid(),course_name:courseName(local.courses,courseId),user_id:null,...row});saveLocal()}else{const r=await supabaseClient.from("lessons").insert({...row,user_id:user.id});if(r.error)throw r.error}await loadAll()}catch(e){alert(e.message)}}
async function addModule(courseId){const module=prompt("New module name:");if(!module?.trim())return;await addLesson(courseId,module.trim());}
async function renameModule(courseId,oldName){const name=prompt("New module name:",oldName);if(!name?.trim()||name.trim()===oldName)return;try{if(localMode){local.lessons.filter(l=>l.course_id===courseId&&(l.module_title||"Lessons")===oldName).forEach(l=>l.module_title=name.trim());saveLocal()}else{const r=await supabaseClient.from("lessons").update({module_title:name.trim()}).eq("course_id",courseId).eq("module_title",oldName).eq("user_id",user.id);if(r.error)throw r.error}await loadAll()}catch(e){alert(e.message)}}
async function deleteModule(courseId,module){const ls=cache.lessons.filter(l=>l.course_id===courseId&&(l.module_title||"Lessons")===module);if(!confirm(`Delete module "${module}" and its ${ls.length} lesson(s)?`))return;await deleteLessons(ls);}
async function deleteLessons(ls){if(!ls.length)return;undoStack={type:"lessons",items:JSON.parse(JSON.stringify(ls)),time:Date.now()};try{if(localMode){const ids=new Set(ls.map(l=>l.id));local.lessons=local.lessons.filter(l=>!ids.has(l.id));ls.forEach(l=>delete local.progress[l.id]);saveLocal()}else{const ids=ls.map(l=>l.id);const r=await supabaseClient.from("lessons").delete().in("id",ids).eq("user_id",user.id);if(r.error)throw r.error}showUndo("Lessons deleted");await loadAll()}catch(e){undoStack=null;alert(e.message)}}
async function deleteLesson(id){const l=cache.lessons.find(x=>x.id===id);if(!l||!confirm(`Delete "${l.title}"?`))return;await deleteLessons([l]);}
async function deleteCourse(id){const c=cache.courses.find(x=>x.id===id);if(!c)return;const ls=cache.lessons.filter(l=>l.course_id===id);if(!confirm(`Delete "${c.name}" and its ${ls.length} lesson(s)? This cannot be undone after the undo window.`))return;undoStack={type:"course",course:JSON.parse(JSON.stringify(c)),lessons:JSON.parse(JSON.stringify(ls)),time:Date.now()};try{if(localMode){local.courses=local.courses.filter(x=>x.id!==id);local.lessons=local.lessons.filter(x=>x.course_id!==id);ls.forEach(l=>delete local.progress[l.id]);saveLocal()}else{const r=await supabaseClient.from("courses").delete().eq("id",id).eq("user_id",user.id);if(r.error)throw r.error}showUndo("Course deleted");await loadAll()}catch(e){undoStack=null;alert(e.message)}}
function showUndo(text){$("undoText").textContent=text;$("undoBar").classList.remove("hidden");clearTimeout(window.undoTimer);window.undoTimer=setTimeout(()=>{$("undoBar").classList.add("hidden");undoStack=null},10000)}
$("undoBtn").onclick=async()=>{if(!undoStack)return;const item=undoStack;undoStack=null;$("undoBar").classList.add("hidden");try{if(localMode){if(item.type==="course"){local.courses.push(item.course);local.lessons.push(...item.lessons)}else local.lessons.push(...item.items);saveLocal()}else if(item.type==="course"){const cr={...item.course};delete cr.created_at;const {data:c,error}=await supabaseClient.from("courses").insert({...cr,user_id:user.id}).select().single();if(error)throw error;const rows=item.lessons.map(l=>{const x={...l};delete x.id;delete x.created_at;return {...x,course_id:c.id,user_id:user.id}});if(rows.length){const r=await supabaseClient.from("lessons").insert(rows);if(r.error)throw r.error}}else{const rows=item.items.map(l=>{const x={...l};delete x.id;delete x.created_at;return {...x,user_id:user.id}});const r=await supabaseClient.from("lessons").insert(rows);if(r.error)throw r.error}await loadAll()}catch(e){alert("Undo failed: "+e.message)}};

async function generateCourse(){const url=$("youtubeUrl").value.trim();if(!url)return setMsg("generateMsg","Paste a YouTube URL.");if(localMode)return setMsg("generateMsg","Connect Supabase to use the secure Gemini generator.");$("generateBtn").disabled=true;setMsg("generateMsg","Analyzing the public YouTube video with Gemini…");try{const {data,error}=await supabaseClient.functions.invoke("analyze-youtube",{body:{youtube_url:url,course_name:$("courseName").value.trim()||null}});if(error)throw error;if(!data?.course)throw new Error(data?.error||"No course returned.");await insertCourseData(data.course);$("youtubeUrl").value="";$("courseName").value="";setMsg("generateMsg","Course generated and saved.",true);await loadAll()}catch(e){console.error(e);setMsg("generateMsg","Generation failed: "+(e.message||e))}finally{$("generateBtn").disabled=false}}
async function insertCourseData(c){const courseRow={name:c.name,description:c.description||"",source_url:c.source_url||null,category:c.category||"General"};if(localMode){const cid=uid();local.courses.push({id:cid,...courseRow});(c.modules||[]).forEach((m,mi)=>(m.lessons||[]).forEach((l,li)=>local.lessons.push({id:uid(),course_id:cid,course_name:c.name,module_title:m.title,title:l.title,youtube_url:l.youtube_url||c.source_url,duration_minutes:l.duration_minutes||null,difficulty:l.difficulty||"Beginner",description:l.description||"",order_index:mi*100+li})));saveLocal();return}const {data:course,error:e1}=await supabaseClient.from("courses").insert({...courseRow,user_id:user.id}).select().single();if(e1)throw e1;const rows=[];(c.modules||[]).forEach((m,mi)=>(m.lessons||[]).forEach((l,li)=>rows.push({course_id:course.id,user_id:user.id,module_title:m.title,title:l.title,youtube_url:l.youtube_url||c.source_url,duration_minutes:l.duration_minutes||null,difficulty:l.difficulty||"Beginner",description:l.description||"",order_index:mi*100+li})));if(rows.length){const {error:e2}=await supabaseClient.from("lessons").insert(rows);if(e2)throw e2}}

async function importJSON(){const f=$("jsonFile").files[0];if(!f)return setMsg("importMsg","Choose a JSON file.");try{const data=JSON.parse(await f.text());if(data.courses&&Array.isArray(data.courses)&&data.lessons){for(const c of data.courses){const ls=data.lessons.filter(l=>l.course_id===c.id);await insertCourseData({name:c.name,description:c.description,category:c.category,source_url:c.source_url,modules:groupLessons(ls)})}}else await insertCourseData(data.course||data);setMsg("importMsg","JSON imported.",true);await loadAll()}catch(e){setMsg("importMsg",e.message)}}
function groupLessons(ls){const map={};ls.forEach(l=>(map[l.module_title||"Lessons"]??=[]).push(l));return Object.entries(map).map(([title,lessons])=>({title,lessons}))}
async function exportJSON(){const [courses,lessons]=await Promise.all([dbCourses(),dbLessons()]);download("sharpeningtheaxe-export.json",JSON.stringify({courses,lessons,exported_at:new Date().toISOString()},null,2),"application/json")}
async function importCSV(){const f=$("csvFile").files[0];if(!f)return setMsg("importMsg","Choose a CSV file.");try{const rows=parseCSV(await f.text());if(!rows.length)throw new Error("CSV is empty.");const grouped={};rows.forEach(r=>{const n=r.course||"Imported Course";(grouped[n]??={name:n,description:"Imported from CSV",modules:{}});const m=r.module||"Lessons";(grouped[n].modules[m]??=[]).push({title:r.title,youtube_url:r.youtube_url,duration_minutes:Number(r.duration_minutes)||null,difficulty:r.difficulty||"Beginner",description:r.description||""})});for(const c of Object.values(grouped))await insertCourseData({...c,modules:Object.entries(c.modules).map(([title,lessons])=>({title,lessons}))});setMsg("importMsg","CSV imported.",true);await loadAll()}catch(e){setMsg("importMsg",e.message)}}
async function exportCSV(){const [courses,lessons]=await Promise.all([dbCourses(),dbLessons()]);const names=new Map(courses.map(c=>[c.id,c.name]));const head=["course","module","title","youtube_url","duration_minutes","difficulty","description"];const lines=[head.join(",")].concat(lessons.map(l=>[names.get(l.course_id)||"Course",l.module_title,l.title,l.youtube_url,l.duration_minutes,l.difficulty,l.description].map(csvEsc).join(",")));download("sharpeningtheaxe-lessons.csv",lines.join("\n"),"text/csv")}
function csvEsc(v){return `"${String(v??"").replaceAll('"','""')}"`}
function parseCSV(s){const lines=s.split(/\r?\n/).filter(Boolean),head=splitCSV(lines.shift());return lines.map(x=>{const a=splitCSV(x),o={};head.forEach((h,i)=>o[h.trim()]=a[i]??"");return o})}
function splitCSV(s){const a=[];let cur="",q=false;for(let i=0;i<s.length;i++){const ch=s[i];if(ch==='"'&&s[i+1]==='"'){cur+='"';i++;continue}if(ch==='"'){q=!q;continue}if(ch===','&&!q){a.push(cur);cur="";continue}cur+=ch}a.push(cur);return a}

async function saveSettings(){local.dailyTarget=Math.max(1,Number($("targetMinutes").value)||60);local.reminderTime=$("reminderTime").value||"19:00";local.reminderEnabled=$("reminderEnabled").checked;saveLocal();if(!localMode&&user){try{await supabaseClient.from("daily_goals").upsert({user_id:user.id,goal_date:new Date().toISOString().slice(0,10),target_minutes:local.dailyTarget},{onConflict:"user_id,goal_date"});await supabaseClient.from("reminders").upsert({user_id:user.id,reminder_time:local.reminderTime,enabled:local.reminderEnabled,days:["mon","tue","wed","thu","fri","sat","sun"]});}catch(e){console.warn(e)}}renderFromCache()}
async function requestNotifications(){if(!("Notification" in window))return alert("This browser does not support notifications.");const p=await Notification.requestPermission();if(p==="granted"){local.reminderEnabled=true;saveLocal();$("reminderEnabled").checked=true;setMsg("settingsMsg","Browser notifications enabled. Keep the site allowed in your browser.",true)}else alert("Notification permission was not granted.")}
function checkReminder(){if(!local.reminderEnabled||!("Notification" in window)||Notification.permission!=="granted")return;const now=new Date(), [h,m]=(local.reminderTime||"19:00").split(":").map(Number);if(now.getHours()===h&&now.getMinutes()===m){const key=`${now.toDateString()} ${h}:${m}`;if(localStorage.getItem("sta_last_reminder")!==key){new Notification("SharpeningTheAxe",{body:"Your learning reminder is due. Open your next lesson."});localStorage.setItem("sta_last_reminder",key)}}}
setInterval(checkReminder,30000);

init();
