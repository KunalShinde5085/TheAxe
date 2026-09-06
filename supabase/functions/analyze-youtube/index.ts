import { withSupabase } from "npm:@supabase/server@^1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

const schema = {
  type: "object",
  properties: {
    name: {type:"string"},
    description: {type:"string"},
    category: {type:"string"},
    source_url: {type:"string"},
    modules: {
      type:"array",
      items:{
        type:"object",
        properties:{
          title:{type:"string"},
          lessons:{
            type:"array",
            items:{
              type:"object",
              properties:{
                title:{type:"string"},
                description:{type:"string"},
                youtube_url:{type:"string"},
                duration_minutes:{type:"integer"},
                difficulty:{type:"string", enum:["Beginner","Intermediate","Advanced"]}
              },
              required:["title","description","youtube_url","duration_minutes","difficulty"]
            }
          }
        },
        required:["title","lessons"]
      }
    }
  },
  required:["name","description","category","source_url","modules"]
};

Deno.serve(withSupabase({auth:"user"}, async (req, ctx) => {
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  try {
    const {youtube_url, course_name} = await req.json();
    if(!youtube_url || !/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(youtube_url))
      return new Response(JSON.stringify({error:"Please provide a valid public YouTube URL."}),{status:400,headers:cors});

    const key=Deno.env.get("GEMINI_API_KEY");
    if(!key) throw new Error("GEMINI_API_KEY is not configured in Supabase Edge Function secrets.");

    const prompt=`You are a curriculum designer. Analyze the supplied public YouTube educational video and turn it into a structured learning course.
${course_name ? `Preferred course name: ${course_name}` : ""}
Rules:
- Do not invent topics unrelated to the video.
- Make 1 course with sensible modules and lessons.
- Lessons should be actionable learning units, not arbitrary timestamp fragments.
- Keep the number of lessons useful (normally 4-20 depending on the video's content).
- Preserve the supplied YouTube URL in source_url and lesson youtube_url.
- Estimate lesson duration in minutes; use integers.
- Return only the requested JSON structure.`;

    const response=await fetch("https://generativelanguage.googleapis.com/v1beta/interactions",{
      method:"POST",
      headers:{"x-goog-api-key":key,"Content-Type":"application/json"},
      body:JSON.stringify({
        model:"gemini-3.8-flash",
        input:[
          {type:"text",text:prompt},
          {type:"video",uri:youtube_url}
        ],
        response_format:{type:"text",mime_type:"application/json",schema}
      })
    });
    const raw=await response.text();
    if(!response.ok) throw new Error(`Gemini API ${response.status}: ${raw.slice(0,500)}`);
    const result=JSON.parse(raw);
    const text=result.output_text ?? result.steps?.find((s:any)=>s.type==="model_output")?.content?.find((x:any)=>x.type==="text")?.text;
    if(!text) throw new Error("Gemini returned no structured output.");
    const course=JSON.parse(text);
    course.source_url=youtube_url;
    if(course_name) course.name=course_name;
    return new Response(JSON.stringify({course}),{headers:cors});
  } catch(e) {
    return new Response(JSON.stringify({error:e instanceof Error?e.message:String(e)}),{status:500,headers:cors});
  }
}));
