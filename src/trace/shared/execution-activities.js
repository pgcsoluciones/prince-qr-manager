function uuid(){return crypto.randomUUID();}

export async function loadDefinedActivities(db, tenantId, processVersionId){
  const result=await db.prepare(`
    SELECT a.*, s.stage_order
    FROM trace_stage_activities a
    JOIN trace_stages s ON s.id=a.stage_id
    WHERE a.tenant_id=?
      AND s.process_version_id=?
    ORDER BY s.stage_order ASC, a.activity_order ASC
  `).bind(tenantId,processVersionId).all();
  return result.results||[];
}

export function buildExecutionActivityStatements(db,{
  tenantId,
  executionId,
  definitions,
  executionStages,
  roleAssignments={},
}){
  const byStage=new Map(
    executionStages.map(item=>[item.stageId,{executionStageId:item.executionStageId,assignedTo:item.assignedTo,stageOrder:Number(item.stageOrder)}])
  );
  const firstActivityByStage=new Map();
  for(const def of definitions){
    if(!firstActivityByStage.has(def.stage_id))firstActivityByStage.set(def.stage_id,Number(def.activity_order));
  }
  const activityRows=[];
  const statements=[];
  for(const def of definitions){
    const stage=byStage.get(def.stage_id);
    if(!stage)continue;
    const explicitRoleUser=def.responsible_role?roleAssignments[def.responsible_role]:null;
    const assignedTo=explicitRoleUser||stage.assignedTo||null;
    const firstStageOrder=Math.min(...executionStages.map(x=>Number(x.stageOrder)));
    const isFirstAvailable=stage.stageOrder===firstStageOrder&&Number(def.activity_order)===firstActivityByStage.get(def.stage_id);
    const id=uuid();
    activityRows.push({id,stageActivityId:def.id,executionStageId:stage.executionStageId,stageId:def.stage_id,assignedTo,responsibleRole:def.responsible_role,activityOrder:Number(def.activity_order),status:isFirstAvailable?'available':'pending'});
    statements.push(db.prepare(`
      INSERT INTO trace_execution_activities (
        id,tenant_id,execution_id,execution_stage_id,stage_activity_id,
        title,description,activity_order,is_required,status,priority,
        responsible_role,assigned_to,planned_start_at,due_at,
        requires_evidence,requires_approval,metadata_json,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,?,?,?,datetime('now'),datetime('now'))
    `).bind(
      id,tenantId,executionId,stage.executionStageId,def.id,
      def.title,def.description,Number(def.activity_order),Number(def.is_required),
      isFirstAvailable?'available':'pending',def.priority||'normal',def.responsible_role,assignedTo,
      Number(def.requires_evidence||0),Number(def.requires_approval||0),def.settings_json||'{}'
    ));
  }
  return{statements,activityRows};
}
