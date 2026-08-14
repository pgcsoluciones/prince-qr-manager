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
  const [activitiesR,evidencesR,requirementsR,approvalsR,incidentsR]=await Promise.all([
    db.prepare(`SELECT * FROM trace_execution_activities WHERE tenant_id=? AND execution_id=? AND execution_stage_id=? ORDER BY activity_order`).bind(tenantId,executionId,executionStageId).all(),
    db.prepare(`SELECT execution_activity_id,requirement_id,validation_status FROM trace_evidences WHERE tenant_id=? AND execution_id=? AND execution_stage_id=? AND execution_activity_id IS NOT NULL`).bind(tenantId,executionId,executionStageId).all(),
    db.prepare(`SELECT id,execution_activity_id,required_count,requires_validation FROM trace_execution_evidence_requirements WHERE tenant_id=? AND execution_id=? AND execution_stage_id=? ORDER BY requirement_order`).bind(tenantId,executionId,executionStageId).all(),
    db.prepare(`SELECT execution_activity_id,status FROM trace_approvals WHERE tenant_id=? AND execution_id=? AND execution_stage_id=? AND execution_activity_id IS NOT NULL`).bind(tenantId,executionId,executionStageId).all(),
    db.prepare(`SELECT status,metadata_json FROM trace_incidents WHERE tenant_id=? AND execution_id=? AND execution_stage_id=?`).bind(tenantId,executionId,executionStageId).all(),
  ]);
  const activities=activitiesR.results||[],evidences=evidencesR.results||[],requirements=requirementsR.results||[];
  const approvedIds=new Set((approvalsR.results||[]).filter(x=>x.status==='approved').map(x=>x.execution_activity_id));
  const requirementsByActivity=new Map();
  for(const r of requirements){const arr=requirementsByActivity.get(r.execution_activity_id)||[];arr.push(r);requirementsByActivity.set(r.execution_activity_id,arr)}
  const evidenceByActivity=new Map();
  for(const e of evidences){const arr=evidenceByActivity.get(e.execution_activity_id)||[];arr.push(e);evidenceByActivity.set(e.execution_activity_id,arr)}
  const evidenceSatisfied=a=>{
    const reqs=requirementsByActivity.get(a.id)||[],ev=evidenceByActivity.get(a.id)||[];
    if(reqs.length){
      return reqs.every(r=>{
        const valid=ev.filter(x=>x.requirement_id===r.id&&x.validation_status==='approved').length;
        return valid>=Number(r.required_count||1);
      });
    }
    return Number(a.requires_evidence)!==1||ev.length>0;
  };
  const required=activities.filter(a=>Number(a.is_required)===1);
  const effectiveComplete=a=>{
    if(a.status!=='completed')return false;
    if(!evidenceSatisfied(a))return false;
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
