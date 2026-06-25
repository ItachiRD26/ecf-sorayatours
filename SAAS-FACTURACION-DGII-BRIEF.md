# SaaS de Certificación y Facturación Electrónica DGII — Brief del Proyecto

> Este documento es un "brief" de captura para arrancar el proyecto nuevo (separado de
> soraya-tours-ecf). Cópialo al repo nuevo (ej. como `PROJECT-BRIEF.md` o pégalo en el
> `AGENTS.md`/`CLAUDE.md` de ese proyecto) para que una sesión de Claude ahí tenga contexto
> completo desde el primer momento.

## 1. Origen y objetivo

Tras certificar y entregar el sistema e-CF de Soraya y Leonardo Tours (15 pasos DGII completados,
sistema en producción), el plan es convertir ese conocimiento en un **producto SaaS**: una
plataforma que ofrezca certificación + facturación electrónica DGII a otros negocios
(clientes/desarrolladores), cobrando una **suscripción mensual**.

## 2. Decisiones ya tomadas

- **Proyecto nuevo y separado** de soraya-tours-ecf — no se extiende ese repo directamente.
- **Multi-tenant desde el diseño**: cada cliente tiene su propia configuración, subdominio y,
  eventualmente, su propio entorno certificado ante DGII.
- **Reutilizar como base/referencia** la lógica DGII ya construida y probada:
  - `lib/dgii/xml-builder.ts`, `xml-signer.ts`, `dgii-client.ts`, `qr-builder.ts`
  - `hooks/usesecuencias.ts` (patrón de numeración e-CF — incremento simple, sin bloqueos)
  - Reglas de negocio DGII ya documentadas (memoria `feedback-bugs.md` de soraya-tours-ecf):
    - `calcLinea()` devuelve `itbisAmt`, no `itbis`
    - E41 requiere `MontoITBISRetenido` (18%) y `MontoISRRetenido` (10%) por ítem
    - Secuencias e-CF no se reutilizan una vez enviadas, aunque sean rechazadas
    - `TipoPago` es requerido en E41 aunque el XSD lo marque opcional
  - Tipos TypeScript de e-CF (`types/*`) como punto de partida del modelo de datos

## 3. Los 3 módulos

### Módulo A — Registro y Suscripción
- El cliente se registra con sus datos reales: RNC/cédula, razón social, nombre del
  representante, dirección, teléfono, etc.
- Pago mensual (suscripción) — define el acceso a la plataforma.
- Da acceso al dashboard donde luego se gestiona todo (suscripción, estado de certificación,
  acceso al sistema en producción).

### Módulo B — Personalización del Sistema de Facturación (PRIORIDAD #1 — empezar por aquí)
- **Cuestionario de selección múltiple** sobre el negocio del cliente:
  - Tipo de negocio (ferretería, farmacia, restaurante, servicios/turismo, etc.)
  - Unidades de medida que usa
  - Cómo vende (por unidad, por volumen, por servicio, etc.)
  - Cualquier otra característica que afecte qué campos/módulos necesita
- Cada respuesta determina la configuración del sistema generado: campos visibles,
  terminología (ej. "excursiones" vs "productos" vs "medicamentos"), unidades de medida
  disponibles, y qué tipos de e-CF aplican a ese negocio (no todos los negocios emiten los 11
  tipos E31-E47).
- **Preview usable**: no es un mockup estático — es el sistema real funcionando con esa
  configuración, navegable. Si algo no le gusta al cliente, puede volver y ajustar respuestas
  antes de continuar.

### Módulo C — Certificación Guiada + Entrega
- La plataforma da instrucciones al cliente para:
  1. Iniciar el proceso de facturación electrónica en la Oficina Virtual de la DGII
  2. Tramitar su **firma digital** con el organismo certificador correspondiente
  3. Verificar que los datos del representante que firmará coincidan exactamente con lo
     registrado en DGII
  4. Subir su archivo **.p12** a la plataforma
- Una vez subido el `.p12`, la plataforma:
  - Crea el subdominio del cliente (según su registro)
  - Ejecuta el proceso de certificación paso a paso (análogo a los 15 pasos hechos para Soraya
    y Leonardo, pero parametrizado por tenant)
- **IMPORTANTE — limitación actual**: mientras la SaaS no sea "proveedor certificado" ante DGII
  para actuar en nombre de terceros, ciertos pasos los debe hacer el cliente final manualmente
  desde la Oficina Virtual DGII (ej. Paso 2: descargar el Excel de comprobantes y subirlo a la
  plataforma para que esta lo procese). La plataforma guía, pero no automatiza el 100% al inicio.
- Al completar la certificación 10/10 → se entrega la **URL de producción** del sistema del
  cliente, accesible desde su dashboard (donde también gestiona su suscripción).

## 4. Roadmap sugerido

1. **Módulo B primero** (cuestionario + preview) — es el que da valor demostrable sin depender
   de pagos ni certificación, y define el "producto" central.
2. **Módulo A** (registro + pagos) — necesario para monetizar una vez el producto central
   funciona.
3. **Módulo C** (certificación guiada) — el más complejo y el que más depende de validar
   aspectos legales/operativos (ver preguntas abiertas).

## 5. Preguntas abiertas para retomar

- Taxonomía completa de tipos de negocio y mapeo exacto a configuración del sistema (campos,
  unidades de medida, tipos de e-CF aplicables por tipo de negocio).
- Stack tecnológico del proyecto nuevo (¿Next.js + Firebase igual que soraya-tours-ecf?
  ¿multi-tenant con subdominios vía Vercel/Cloudflare/DNS propio?).
- ¿Existe la figura de "proveedor certificado ante DGII para terceros"? Si existe, qué requiere
  — esto cambiaría cuánto del Módulo C se puede automatizar.
- Procesador de pagos para las suscripciones (Stripe, Azul, CardNet — opciones en RD).
- Cómo se genera el "sistema personalizado" por tenant en términos técnicos: ¿un core único
  con feature flags/config por tenant, o generación de código (codegen) por cliente?

## 6. Cómo continuar

- Cuando se cree el repo nuevo, copiar este documento como punto de partida.
- En soraya-tours-ecf queda un resumen + puntero a este archivo en la memoria del proyecto
  (`project-saas-idea.md`), por si se sigue hablando del tema aquí antes de migrar.
