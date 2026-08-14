import { stageActivityAggregate } from "./activity-context.js";

function uuid(){return crypto.randomUUID();}
function source(session){return session.role==="supervisor"?"supervisor":"operator";}

async function event(db,session,approval,eventType,description,payload={}){
  await db.prepare(`INSERT INTO trace_events (id,tenant_id,execution_id,execution_stage_id,execution_activity_id,asset_id,event_type,event_source,actor_user_id,actor_role,description,payload_json,occurred_at,received_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`)
    .bind(uuid(),session.tenant_id,approval.execution_id,approval.execution_stage_id,approval.execution_activity_id,approval.asset_id||null,eventType,source(session),session.user_id,session.role,description,JSON.stringify(payload)).run();
}

export async function decideActivityApproval(db,session,approval,decision,notes){
  const activity=await db.prepare(`SELECT * FROM trace_execution_activities WHERE id=? AND tenant_id=? AND execution_id=? AND execution_stage_id=? LIMIT 1`)
    .bind(approval.execution_activity_id,session.tenant_id,approval.execution_id,approval.execution_stage_id).first();
  if(!activity)return{ok:false,status:404,error:"activity_not_found",message:"La actividad asociada a la aprobación no existe."};

  if(decision==="approve"){
    await db.batch([
      db.prepare(`UPDATE trace_approvals SET status='approved',decision_notes=?,decided_at=datetime('now'),decided_by=? WHERE id=? AND status='pending'`).bind(notes,session.user_id,approval.id),
      db.prepare(`UPDATE trace_execution_activities SET status='completed',completed_at=COALESCE(completed_at,datetime('now')),updated_at=datetime('now') WHERE id=? AND status IN ('pending_approval','in_progress','completed')`).bind(activity.id),
    ]);
    const agg=await stageActivityAggregate(db,{tenantId:session.tenant_id,executionId:approval.execution_id,executionStageId:approval.execution_stage_id});
    const completedAt=agg.derivedStatus==='completed'?"datetime('now')":"NULL";
    await db.prepare(`UPDATE trace_execution_stages SET status=?,completed_at=CASE WHEN ?='completed' THEN COALESCE(completed_at,datetime('now')) ELSE completed_at END,updated_at=datetime('now') WHERE id=?`).bind(agg.derivedStatus,agg.derivedStatus,approval.execution_stage_id).run();
    await event(db,session,approval,"activity.approved",`Actividad aprobada: ${activity.title}`,{approvalId:approval.id,activityId:activity.id,stageProgress:agg.progress});
    return{ok:true,data:{approvalId:approval.id,activityId:activity.id,status:"approved",activityStatus:"completed",stageStatus:agg.derivedStatus,stageProgress:agg.progress}};
  }

  const approvalStatus=decision==="reject"?"rejected":"correction_required";
  await db.batch([
    db.prepare(`UPDATE trace_approvals SET status=?,decision_notes=?,decided_at=datetime('now'),decided_by=? WHERE id=? AND status='pending'`).bind(approvalStatus,notes,session.user_id,approval.id),
    db.prepare(`UPDATE trace_execution_activities SET status='correction_required',updated_at=datetime('now') WHERE id=?`).bind(activity.id),
    db.prepare(`UPDATE trace_execution_stages SET status='correction_required',updated_at=datetime('now') WHERE id=?`).bind(approval.execution_stage_id),
  ]);
  await event(db,session,approval,decision==="reject"?"activity.rejected":"activity.correction_requested",decision==="reject"?`Actividad rechazada: ${activity.title}`:`Corrección solicitada: ${activity.title}`,{approvalId:approval.id,activityId:activity.id,notes});
  return{ok:true,data:{approvalId:approval.id,activityId:activity.id,status:approvalStatus,activityStatus:"correction_required",stageStatus:"correction_required"}};
}
