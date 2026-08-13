import jwt from "@tsndr/cloudflare-worker-jwt";
import { getTraceDatabase } from "./trace/shared/database.js";

const BASE = "/api/trace/v1/admin/evaluations";
const TYPES = new Set(["quality","checklist","survey","delivery","service"]);
const CORS = {
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Methods":"GET,POST,OPTIONS",
  "Access-Control-Allow-Headers":"Content-Type, Authorization"
};

const json = (data,status=200) =>
  new Response(JSON.stringify(data),{
    status,
    headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}
  });

const clean = (v,n=300) =>
  v == null ? "" : String(v).trim().slice(0,n);

async function auth(request,env){
  const h=request.headers.get("Authorization")||"";
  if(!h.startsWith("Bearer ")) return null;

  const token=h.slice(7).trim();
  let valid=false;

  try {
    valid=await jwt.verify(
      token,
      env.JWT_SECRET||"changeme-set-in-cloudflare-dashboard"
    );
  } catch {
    return null;
  }

  if(!valid) return null;

  const payload=jwt.decode(token)?.payload||{};
  if((payload.session_type||"standard")!=="standard") return null;

  const userId=
    payload.user_id||
    payload.userId||
    payload.id||
    payload.sub;

  if(!userId) return null;

  const db=getTraceDatabase(env);

  const user=await db.prepare(`
    SELECT id,email,role,enterprise_id,is_active
    FROM users
    WHERE id=?
    LIMIT 1
  `).bind(userId).first();

  if(!user || Number(user.is_active)!==1) return null;

  return {
    db,
    user,
    tenantId:user.enterprise_id||user.id
  };
}

async function listEvaluations(request,env){
  const a=await auth(request,env);
  if(!a) return json({ok:false,error:"unauthorized"},401);

  const r=await a.db.prepare(`
    SELECT
      e.id,
      e.name,
      e.evaluation_type,
      e.status,
      e.project_id,
      e.execution_id,
      e.public_enabled,
      e.created_at,
      p.name project_name,
      x.title execution_title,
      COUNT(r.id) responses,
      ROUND(AVG(r.score),1) average_score
    FROM trace_evaluations e
    LEFT JOIN trace_assets p
      ON p.id=e.project_id
     AND p.tenant_id=e.tenant_id
    LEFT JOIN trace_executions x
      ON x.id=e.execution_id
     AND x.tenant_id=e.tenant_id
    LEFT JOIN trace_evaluation_responses r
      ON r.evaluation_id=e.id
     AND r.tenant_id=e.tenant_id
    WHERE e.tenant_id=?
      AND e.status!='archived'
    GROUP BY e.id
    ORDER BY e.created_at DESC
  `).bind(a.tenantId).all();

  return json({ok:true,data:r.results||[]});
}

async function createEvaluation(request,env){
  const a=await auth(request,env);
  if(!a) return json({ok:false,error:"unauthorized"},401);

  let body={};
  try {
    body=await request.json();
  } catch {
    return json({ok:false,error:"invalid_json"},400);
  }

  const name=clean(body.name,180);
  const type=clean(body.type||body.evaluationType,40)||"quality";
  const projectId=clean(body.projectId,100)||null;
  const executionId=clean(body.executionId,100)||null;

  if(!name){
    return json({
      ok:false,
      error:"name_required",
      message:"Escribe el nombre de la evaluación."
    },422);
  }

  if(!TYPES.has(type)){
    return json({
      ok:false,
      error:"invalid_evaluation_type"
    },422);
  }

  if(projectId){
    const p=await a.db.prepare(`
      SELECT id
      FROM trace_assets
      WHERE id=?
        AND tenant_id=?
        AND asset_type='project'
      LIMIT 1
    `).bind(projectId,a.tenantId).first();

    if(!p){
      return json({ok:false,error:"project_not_found"},422);
    }
  }

  if(executionId){
    const x=await a.db.prepare(`
      SELECT id
      FROM trace_executions
      WHERE id=?
        AND tenant_id=?
      LIMIT 1
    `).bind(executionId,a.tenantId).first();

    if(!x){
      return json({ok:false,error:"execution_not_found"},422);
    }
  }

  const id=crypto.randomUUID();

  await a.db.prepare(`
    INSERT INTO trace_evaluations (
      id,
      tenant_id,
      name,
      evaluation_type,
      status,
      project_id,
      execution_id,
      public_enabled,
      definition_json,
      created_by,
      created_at,
      updated_at
    )
    VALUES (
      ?,?,?,?,'active',?,?,?,'{}',?,datetime('now'),datetime('now')
    )
  `).bind(
    id,
    a.tenantId,
    name,
    type,
    projectId,
    executionId,
    body.publicEnabled ? 1 : 0,
    a.user.id
  ).run();

  return json({
    ok:true,
    data:{
      id,
      name,
      evaluationType:type,
      status:"active"
    }
  },201);
}

async function createResponse(request,env,evaluationId){
  const a=await auth(request,env);
  if(!a) return json({ok:false,error:"unauthorized"},401);

  const evaluation=await a.db.prepare(`
    SELECT id,execution_id
    FROM trace_evaluations
    WHERE id=?
      AND tenant_id=?
      AND status='active'
    LIMIT 1
  `).bind(evaluationId,a.tenantId).first();

  if(!evaluation){
    return json({ok:false,error:"evaluation_not_found"},404);
  }

  let body={};
  try {
    body=await request.json();
  } catch {
    return json({ok:false,error:"invalid_json"},400);
  }

  const score=
    body.score===null ||
    body.score===undefined ||
    body.score===""
      ? null
      : Number(body.score);

  if(score!==null && (!Number.isFinite(score) || score<1 || score>5)){
    return json({
      ok:false,
      error:"invalid_score",
      message:"La calificación debe estar entre 1 y 5."
    },422);
  }

  const id=crypto.randomUUID();

  await a.db.prepare(`
    INSERT INTO trace_evaluation_responses (
      id,
      tenant_id,
      evaluation_id,
      execution_id,
      respondent_user_id,
      respondent_name,
      score,
      answers_json,
      comment,
      source,
      created_at
    )
    VALUES (
      ?,?,?,?,?,?,?,?,?,?,datetime('now')
    )
  `).bind(
    id,
    a.tenantId,
    evaluationId,
    evaluation.execution_id||null,
    a.user.id,
    clean(body.respondentName,180)||null,
    score,
    JSON.stringify(
      body.answers &&
      typeof body.answers==="object" &&
      !Array.isArray(body.answers)
        ? body.answers
        : {}
    ),
    clean(body.comment,1000)||null,
    "internal"
  ).run();

  return json({
    ok:true,
    data:{id,evaluationId,score}
  },201);
}

export async function handleTraceV1EvaluationsApi(request,env){
  const url=new URL(request.url);

  if(!url.pathname.startsWith(BASE)) return null;

  if(request.method==="OPTIONS"){
    return new Response(null,{status:204,headers:CORS});
  }

  if(url.pathname===BASE && request.method==="GET"){
    return listEvaluations(request,env);
  }

  if(url.pathname===BASE && request.method==="POST"){
    return createEvaluation(request,env);
  }

  const responseMatch=url.pathname.match(
    /^\/api\/trace\/v1\/admin\/evaluations\/([^/]+)\/responses$/
  );

  if(responseMatch && request.method==="POST"){
    return createResponse(
      request,
      env,
      decodeURIComponent(responseMatch[1])
    );
  }

  return json({ok:false,error:"not_found"},404);
}
