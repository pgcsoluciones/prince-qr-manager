export async function resolveExecutionActivity(db,{tenantId,executionId,executionStageId,activityId}){
  if(!activityId)return null;
  return db.prepare(`
    SELECT ea.*
    FROM trace_execution_activities ea
    WHERE ea.id=?
      AND ea.tenant_id=?
      AND ea.execution_id=?
      AND ea.execution_stage_id=?
    LIMIT 1
  `).bind(activityId,tenantId,executionId,executionStageId).first();
}

export async function stageActivityAggregate(db,{tenantId,executionId,executionStageId}){
  const [activitiesR,evidencesR,approvalsR,incidentsR]=await Promise.all([
    db.prepare(`SELECT * FROM trace_execution_activities WHERE tenant_id=? AND execution_id=? AND execution_stage_id=? ORDER BY activity_order`).bind(tenantId,executionId,executionStageId).all(),
    db.prepare(`SELECT execution_activity_id FROM trace_evidences WHERE tenant_id=? AND execution_id=? AND execution_stage_id=? AND execution_activity_id IS NOT NULL`).bind(tenantId,executionId,executionStageId).all(),
    db.prepare(`SELECT execution_activity_id,status FROM trace_approvals WHERE tenant_id=? AND execution_id=? AND execution_stage_id=? AND execution_activity_id IS NOT NULL`).bind(tenantId,executionId,executionStageId).all(),
    db.prepare(`SELECT status,metadata_json FROM trace_incidents WHERE tenant_id=? AND execution_id=? AND execution_stage_id=?`).bind(tenantId,executionId,executionStageId).all(),
  ]);
  const activities=activitiesR.results||[];
  const evidenceIds=new Set((evidencesR.results||[]).map(x=>x.execution_activity_id));
  const approvedIds=new Set((approvalsR.results||[]).filter(x=>x.status==='approved').map(x=>x.execution_activity_id));
  const required=activities.filter(a=>Number(a.is_required)===1);
  const effectiveComplete=a=>{
    if(a.status!=='completed')return false;
    if(Number(a.requires_evidence)===1&&!evidenceIds.has(a.id))return false;
    if(Number(a.requires_approval)===1&&!approvedIds.has(a.id))return false;
    return true;
  };
  const completedRequired=required.filter(effectiveComplete).length;
  const blockingIncidents=(incidentsR.results||[]).filter(i=>{
    if(['resolved','validated','closed'].includes(i.status))return false;
    try{return JSON.parse(i.metadata_json||'{}').blocking===true}catch{return false}
  });
  let derivedStatus='pending';
  if(blockingIncidents.length)derivedStatus='blocked';
  else if(required.length&&completedRequired===required.length)derivedStatus='completed';
  else if(activities.some(a=>a.status==='correction_required'))derivedStatus='correction_required';
  else if(activities.some(a=>a.status==='pending_approval'))derivedStatus='pending_approval';
  else if(activities.some(a=>a.status==='in_progress'))derivedStatus='in_progress';
  else if(activities.some(a=>a.status==='available'))derivedStatus='available';
  return{activities,requiredCount:required.length,completedRequired,blockingIncidents,derivedStatus,progress:required.length?Math.round(completedRequired*100/required.length):null};
}
