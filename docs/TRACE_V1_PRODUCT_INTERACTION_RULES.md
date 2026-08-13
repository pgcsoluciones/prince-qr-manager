# INTAP TRACE V1 · Reglas de interacción de producto

Fecha: 2026-08-12

Estas reglas complementan la arquitectura técnica de TRACE V1 y son obligatorias para las pantallas, flujos y plantillas del producto.

## 1. TRACE es horizontal, no un producto de un solo rubro

El motor de TRACE sirve para múltiples sectores: construcción, propiedades, alquileres, mantenimiento, logística, almacenes, hotelería, servicios, inspecciones, calidad y otros procesos configurables.

El énfasis comercial y la mayor profundidad inicial de plantillas estarán en:

- construcción;
- propiedades e inmobiliaria;
- alquileres;
- mantenimiento de propiedades, áreas y equipos.

Ese énfasis no limita la arquitectura ni el catálogo futuro.

## 2. El usuario no parte de una página en blanco

La premisa de producto es reducir trabajo. El sistema debe ofrecer soluciones precargadas compuestas por los puntos de control necesarios para cada combinación de sector + proceso.

Una solución puede incluir de fábrica:

- pasos y actividades;
- formularios y listas de revisión;
- evidencias requeridas;
- responsables tipo;
- reglas y fechas;
- incidencias y correcciones;
- revisiones y aprobaciones;
- notificaciones;
- indicadores y resultados;
- reportes;
- configuración de vista pública.

Después de seleccionar una solución, el usuario principalmente:

1. identifica el proyecto, propiedad, operación o recurso;
2. asigna responsables, equipos o departamentos;
3. ajusta solo lo necesario;
4. activa el control.

El usuario puede editar, agregar o eliminar elementos, pero no debe estar obligado a construir la estructura completa.

## 3. Lenguaje sencillo en la interfaz

Los nombres técnicos se mantienen en código y arquitectura, pero no deben dominar la experiencia del usuario.

Preferir:

- Control
- Actividad
- Trabajo en curso
- Responsable
- Evidencia
- Incidencia
- Corrección
- Revisión
- Confirmación
- Calificación
- Nivel de recomendación
- Resultados
- Historial

Evitar en la interfaz principal términos como workflow, execution, asset, score o NPS cuando exista una expresión operativa más clara.

## 4. Catálogo de soluciones, no solo catálogo de rubros

La entrada principal para crear debe responder: **¿Qué quieres controlar?**

Los rubros ayudan a organizar, pero cada rubro contiene varias soluciones.

Ejemplos prioritarios:

### Construcción y propiedades
- Avance de obra
- Inspección de calidad
- Entrega de propiedad
- Postventa y garantías
- Mantenimiento de propiedades y áreas
- Entrada y salida de alquiler

### Logística y almacenes
- Pedido, despacho y entrega
- Recepción de mercancía
- Transferencias entre ubicaciones

### Hotelería y servicios
- Limpieza y preparación de habitaciones
- Mantenimiento
- Evaluación del servicio

### Generales
- Inspección y lista de verificación
- Control personalizado

## 5. Evaluaciones y formularios son parte del motor

TRACE debe soportar controles y reportes para:

- listas de revisión;
- inspecciones;
- evaluaciones;
- encuestas;
- calificaciones;
- nivel de recomendación;
- comentarios;
- resultados por período, ubicación, control, responsable y formulario.

No deben quedar aislados del historial del elemento o de la operación cuando estén asociados a un control.

## 6. Diferenciar crear un control de registrar actividad

**Nuevo control** configura qué se va a controlar y parte de una solución precargada.

**Registrar actividad** documenta algo que ocurrió dentro de un control existente: avance, evidencia, incidencia, revisión, entrega, comentario, corrección u otra acción permitida.

## 7. Vista pública es estructural

Todo control que lo requiera puede tener una proyección pública segura para:

- cliente;
- inversionista;
- propietario;
- inquilino;
- huésped;
- usuario final;
- otro tercero autorizado.

La vista pública puede abrirse mediante enlace o QR y no requiere instalar una aplicación.

Nunca se reutiliza directamente la entidad interna. Debe utilizarse una proyección pública segura que decida expresamente qué campos son visibles.

Por defecto no se exponen:

- notas internas;
- datos privados de responsables;
- conversaciones internas;
- campos administrativos;
- información de otros controles o tenants.

La vista pública puede mostrar, según el caso:

- progreso;
- estado;
- hitos;
- evidencias autorizadas;
- incidencias visibles;
- correcciones;
- fechas;
- documentos permitidos;
- confirmaciones;
- historial autorizado.

## 8. Tres experiencias del mismo control

Un mismo control puede ofrecer distintas vistas sin duplicar el dominio:

- **Operación:** qué debo hacer ahora.
- **Supervisión:** qué requiere atención, corrección o confirmación.
- **Vista pública:** qué puede consultar el tercero autorizado.

## 9. Modelo de producto

La fórmula de TRACE V1 es:

**motor común + soluciones precargadas + adaptación por sector + edición opcional + reutilización + proyección pública segura**.

La tecnología debe absorber complejidad para que el usuario trabaje con conceptos de su operación y no con conceptos internos del software.
