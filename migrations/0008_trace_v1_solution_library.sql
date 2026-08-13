PRAGMA foreign_keys = ON;

-- INTAP TRACE V1 · Biblioteca ampliada de soluciones precargadas.
-- El usuario parte de controles listos y editables, nunca de una página en blanco.

INSERT OR IGNORE INTO trace_process_templates (
  id, template_key, industry, name, description, version, process_json, stages_json, fields_json, metadata_json
) VALUES
(
  'tpl-property-handover-v1','property.handover','property','Entrega digital de propiedad',
  'Control completo para revisar una unidad, documentar pendientes, evidencias, responsables y aceptación del propietario.',1,
  '{"category":"property","icon":"home","settings":{"publicView":true}}',
  '[{"key":"prepare","name":"Preparar entrega","stageType":"start","responsibleRole":"supervisor","instructions":"Confirmar unidad, documentos y responsables.","requiresEvidence":0,"requiresApproval":0},{"key":"review","name":"Revisión por áreas","stageType":"inspection","responsibleRole":"executor","instructions":"Revisar áreas y registrar hallazgos.","requiresEvidence":1,"requiresApproval":0},{"key":"pending","name":"Pendientes y desperfectos","stageType":"operation","responsibleRole":"executor","instructions":"Documentar pendientes, responsable y fecha objetivo.","requiresEvidence":1,"requiresApproval":0},{"key":"correction","name":"Correcciones","stageType":"operation","responsibleRole":"executor","instructions":"Registrar solución y evidencia de cada pendiente.","requiresEvidence":1,"requiresApproval":0},{"key":"owner-review","name":"Confirmación del propietario","stageType":"approval","responsibleRole":"approver","instructions":"Revisar correcciones y confirmar conformidad.","requiresEvidence":0,"requiresApproval":1},{"key":"close","name":"Cierre de entrega","stageType":"completion","responsibleRole":"supervisor","instructions":"Cerrar expediente y dejar historial disponible.","requiresEvidence":0,"requiresApproval":1}]',
  '[{"stageKey":"review","key":"area","label":"Área revisada","type":"text","required":true},{"stageKey":"review","key":"condition","label":"Estado del área","type":"select","required":true,"options":["Conforme","Requiere corrección","Pendiente"]},{"stageKey":"owner-review","key":"owner_confirmation","label":"Confirmación del propietario","type":"yes_no","required":true}]',
  '{"editable":true,"source":"intap-v1","priority":1,"publicAudience":["propietario","cliente"]}'
),
(
  'tpl-property-postsale-v1','property.postsale-warranty','property','Postventa y garantías',
  'Seguimiento de solicitudes posteriores a la entrega, garantías, responsables, fechas y cierre verificable.',1,
  '{"category":"property","icon":"shield","settings":{"publicView":true}}',
  '[{"key":"request","name":"Solicitud recibida","stageType":"start","responsibleRole":"executor","instructions":"Registrar solicitud, ubicación y detalle.","requiresEvidence":1,"requiresApproval":0},{"key":"review","name":"Revisión y diagnóstico","stageType":"inspection","responsibleRole":"reviewer","instructions":"Determinar causa, cobertura y acción requerida.","requiresEvidence":1,"requiresApproval":0},{"key":"assign","name":"Asignación y fecha compromiso","stageType":"handoff","responsibleRole":"department_lead","instructions":"Asignar responsable y fecha objetivo.","requiresEvidence":0,"requiresApproval":0},{"key":"resolve","name":"Corrección","stageType":"operation","responsibleRole":"executor","instructions":"Ejecutar trabajo y registrar evidencia.","requiresEvidence":1,"requiresApproval":0},{"key":"confirm","name":"Confirmación del cliente","stageType":"approval","responsibleRole":"approver","instructions":"Confirmar que la solicitud fue atendida.","requiresEvidence":0,"requiresApproval":1},{"key":"close","name":"Cierre","stageType":"completion","responsibleRole":"supervisor","instructions":"Cerrar solicitud y conservar historial.","requiresEvidence":0,"requiresApproval":0}]',
  '[]','{"editable":true,"source":"intap-v1","priority":1,"publicAudience":["propietario","cliente"]}'
),
(
  'tpl-property-maintenance-v1','property.maintenance','property','Mantenimiento de propiedades y áreas',
  'Control de averías, inspecciones, trabajos, responsables, solución e historial por propiedad, área o equipo.',1,
  '{"category":"maintenance","icon":"wrench","settings":{"publicView":true}}',
  '[{"key":"report","name":"Reporte o inspección","stageType":"start","responsibleRole":"executor","instructions":"Registrar la avería, necesidad o inspección.","requiresEvidence":1,"requiresApproval":0},{"key":"diagnose","name":"Diagnóstico","stageType":"inspection","responsibleRole":"reviewer","instructions":"Evaluar condición y definir trabajo requerido.","requiresEvidence":1,"requiresApproval":0},{"key":"assign","name":"Asignar trabajo","stageType":"handoff","responsibleRole":"department_lead","instructions":"Asignar técnico, prioridad y fecha objetivo.","requiresEvidence":0,"requiresApproval":0},{"key":"work","name":"Trabajo realizado","stageType":"operation","responsibleRole":"executor","instructions":"Registrar trabajo y materiales utilizados.","requiresEvidence":1,"requiresApproval":0},{"key":"verify","name":"Verificación","stageType":"approval","responsibleRole":"approver","instructions":"Verificar resultado y condición final.","requiresEvidence":1,"requiresApproval":1},{"key":"history","name":"Cierre e historial","stageType":"completion","responsibleRole":"supervisor","instructions":"Cerrar y dejar registro asociado al área o equipo.","requiresEvidence":0,"requiresApproval":0}]',
  '[]','{"editable":true,"source":"intap-v1","priority":1,"publicAudience":["administrador","propietario","usuario"]}'
),
(
  'tpl-rental-turnover-v1','rental.unit-turnover','rental','Entrada y salida de alquiler',
  'Inspección documentada de una unidad al recibir o entregar un alquiler, con inventario, daños, evidencias y aceptación.',1,
  '{"category":"rental","icon":"key","settings":{"publicView":true}}',
  '[{"key":"prepare","name":"Preparar inspección","stageType":"start","responsibleRole":"supervisor","instructions":"Confirmar unidad, ocupante y tipo de inspección.","requiresEvidence":0,"requiresApproval":0},{"key":"inventory","name":"Inventario y condición","stageType":"inspection","responsibleRole":"executor","instructions":"Revisar mobiliario, equipos y estado general.","requiresEvidence":1,"requiresApproval":0},{"key":"issues","name":"Daños o pendientes","stageType":"operation","responsibleRole":"executor","instructions":"Documentar daños, faltantes o trabajos necesarios.","requiresEvidence":1,"requiresApproval":0},{"key":"agreement","name":"Confirmación de las partes","stageType":"approval","responsibleRole":"approver","instructions":"Confirmar revisión y observaciones.","requiresEvidence":0,"requiresApproval":1},{"key":"close","name":"Cierre de inspección","stageType":"completion","responsibleRole":"supervisor","instructions":"Guardar historial de la unidad.","requiresEvidence":0,"requiresApproval":0}]',
  '[]','{"editable":true,"source":"intap-v1","priority":1,"publicAudience":["propietario","inquilino","administrador"]}'
),
(
  'tpl-construction-quality-v1','construction.quality-inspection','construction','Inspección de calidad de obra',
  'Lista de revisión por etapa con evidencias, observaciones, correcciones y aprobación del supervisor.',1,
  '{"category":"construction","icon":"check-circle"}',
  '[{"key":"scope","name":"Definir área y alcance","stageType":"start","responsibleRole":"supervisor","instructions":"Seleccionar área, etapa y criterios de revisión.","requiresEvidence":0,"requiresApproval":0},{"key":"inspect","name":"Inspección","stageType":"inspection","responsibleRole":"reviewer","instructions":"Completar revisión y evidencias.","requiresEvidence":1,"requiresApproval":0},{"key":"correct","name":"Correcciones","stageType":"operation","responsibleRole":"executor","instructions":"Atender observaciones y documentar corrección.","requiresEvidence":1,"requiresApproval":0},{"key":"approve","name":"Aprobación","stageType":"approval","responsibleRole":"approver","instructions":"Aceptar o devolver para corrección.","requiresEvidence":0,"requiresApproval":1},{"key":"close","name":"Cierre","stageType":"completion","responsibleRole":"supervisor","instructions":"Cerrar inspección y conservar historial.","requiresEvidence":0,"requiresApproval":0}]',
  '[]','{"editable":true,"source":"intap-v1","priority":1}'
),
(
  'tpl-hospitality-housekeeping-v1','hospitality.housekeeping','hospitality','Control de limpieza y preparación de habitaciones',
  'Seguimiento de limpieza, revisión, incidencias y liberación de habitaciones o unidades.',1,
  '{"category":"hospitality","icon":"bed"}',
  '[{"key":"assign","name":"Asignar habitación","stageType":"start","responsibleRole":"department_lead","instructions":"Asignar habitación y responsable.","requiresEvidence":0,"requiresApproval":0},{"key":"clean","name":"Limpieza y preparación","stageType":"operation","responsibleRole":"executor","instructions":"Completar tareas de limpieza y reposición.","requiresEvidence":0,"requiresApproval":0},{"key":"inspect","name":"Revisión","stageType":"inspection","responsibleRole":"reviewer","instructions":"Verificar estándares y reportar incidencias.","requiresEvidence":1,"requiresApproval":0},{"key":"release","name":"Habitación lista","stageType":"approval","responsibleRole":"approver","instructions":"Confirmar disponibilidad para el huésped.","requiresEvidence":0,"requiresApproval":1}]',
  '[]','{"editable":true,"source":"intap-v1","priority":2}'
),
(
  'tpl-warehouse-receiving-v1','warehouse.receiving','warehouse','Recepción y verificación de mercancía',
  'Control de llegada, conteo, condición, diferencias, evidencias y aceptación en almacén.',1,
  '{"category":"warehouse","icon":"boxes"}',
  '[{"key":"arrival","name":"Llegada","stageType":"start","responsibleRole":"executor","instructions":"Registrar proveedor, referencia y hora.","requiresEvidence":0,"requiresApproval":0},{"key":"verify","name":"Conteo y verificación","stageType":"inspection","responsibleRole":"executor","instructions":"Verificar cantidades y condición.","requiresEvidence":1,"requiresApproval":0},{"key":"differences","name":"Diferencias o daños","stageType":"operation","responsibleRole":"reviewer","instructions":"Registrar diferencias y acciones requeridas.","requiresEvidence":1,"requiresApproval":0},{"key":"receive","name":"Recepción aprobada","stageType":"approval","responsibleRole":"approver","instructions":"Confirmar entrada a almacén.","requiresEvidence":0,"requiresApproval":1}]',
  '[]','{"editable":true,"source":"intap-v1","priority":2}'
),
(
  'tpl-logistics-transfer-v1','logistics.transfer','logistics','Transferencia entre almacenes o ubicaciones',
  'Seguimiento de preparación, salida, traslado, recepción y diferencias entre ubicaciones.',1,
  '{"category":"logistics","icon":"truck"}',
  '[{"key":"prepare","name":"Preparación","stageType":"start","responsibleRole":"executor","instructions":"Preparar transferencia y referencias.","requiresEvidence":1,"requiresApproval":0},{"key":"dispatch","name":"Salida","stageType":"handoff","responsibleRole":"executor","instructions":"Registrar despacho y responsable.","requiresEvidence":1,"requiresApproval":0},{"key":"transit","name":"Traslado","stageType":"operation","responsibleRole":"executor","instructions":"Registrar novedades del traslado.","requiresEvidence":0,"requiresApproval":0},{"key":"receive","name":"Recepción y verificación","stageType":"inspection","responsibleRole":"reviewer","instructions":"Confirmar cantidades y condición.","requiresEvidence":1,"requiresApproval":0},{"key":"close","name":"Transferencia cerrada","stageType":"approval","responsibleRole":"approver","instructions":"Confirmar recepción final.","requiresEvidence":0,"requiresApproval":1}]',
  '[]','{"editable":true,"source":"intap-v1","priority":2}'
),
(
  'tpl-service-evaluation-v1','service.evaluation','service','Evaluación de servicio y satisfacción',
  'Formulario precargado para medir experiencia, calificación, nivel de recomendación, comentarios y seguimiento.',1,
  '{"category":"evaluation","icon":"star","settings":{"publicView":true}}',
  '[{"key":"identify","name":"Identificar servicio","stageType":"start","responsibleRole":"executor","instructions":"Relacionar evaluación con servicio, ubicación o responsable.","requiresEvidence":0,"requiresApproval":0},{"key":"evaluate","name":"Evaluación","stageType":"inspection","responsibleRole":"executor","instructions":"Completar preguntas de experiencia y calificación.","requiresEvidence":0,"requiresApproval":0},{"key":"followup","name":"Seguimiento si requiere atención","stageType":"operation","responsibleRole":"supervisor","instructions":"Atender evaluaciones que requieran respuesta.","requiresEvidence":0,"requiresApproval":0},{"key":"close","name":"Cerrar evaluación","stageType":"completion","responsibleRole":"supervisor","instructions":"Incluir resultado en reportes de calificación.","requiresEvidence":0,"requiresApproval":0}]',
  '[{"stageKey":"evaluate","key":"overall_rating","label":"Calificación general","type":"rating","required":true},{"stageKey":"evaluate","key":"recommendation_level","label":"Qué tan probable es que nos recomiende","type":"rating","required":true},{"stageKey":"evaluate","key":"comment","label":"Comentario","type":"textarea","required":false}]',
  '{"editable":true,"source":"intap-v1","priority":2,"publicAudience":["cliente","usuario"]}'
),
(
  'tpl-general-inspection-v1','general.inspection','general','Inspección y lista de verificación',
  'Control adaptable para revisar condiciones, registrar hallazgos, evidencias, correcciones y aprobación.',1,
  '{"category":"inspection","icon":"clipboard-check"}',
  '[{"key":"prepare","name":"Preparar revisión","stageType":"start","responsibleRole":"supervisor","instructions":"Definir objeto y responsable de la revisión.","requiresEvidence":0,"requiresApproval":0},{"key":"inspect","name":"Completar revisión","stageType":"inspection","responsibleRole":"executor","instructions":"Completar lista y registrar hallazgos.","requiresEvidence":1,"requiresApproval":0},{"key":"correct","name":"Atender hallazgos","stageType":"operation","responsibleRole":"executor","instructions":"Resolver pendientes y documentar corrección.","requiresEvidence":1,"requiresApproval":0},{"key":"approve","name":"Confirmar resultado","stageType":"approval","responsibleRole":"approver","instructions":"Validar resultado final.","requiresEvidence":0,"requiresApproval":1}]',
  '[]','{"editable":true,"source":"intap-v1","priority":3}'
);
