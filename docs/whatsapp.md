# Envío de presupuestos y facturas por WhatsApp

Vexo envía el PDF por la **API oficial de WhatsApp (Meta Cloud API)** desde el
botón **Enviar** de cada presupuesto o factura, pestaña **WhatsApp**.

## Cómo funciona

1. Vexo genera el PDF (el mismo que en el email).
2. Lo sube a Meta (`POST /{PHONE_NUMBER_ID}/media`).
3. Envía una **plantilla aprobada** con el PDF en la cabecera
   (`POST /{PHONE_NUMBER_ID}/messages`).

Meta solo deja escribir texto libre a un cliente durante las 24 h siguientes a
su último mensaje. Para iniciar tú la conversación —que es el caso normal al
mandar un presupuesto— hace falta una plantilla aprobada. Por eso el texto del
mensaje es fijo y no se edita en el modal.

## Alta en Meta (una sola vez)

1. **Cuenta de empresa**: entra en <https://business.facebook.com> y crea (o usa)
   tu portfolio empresarial.
2. **App**: en <https://developers.facebook.com/apps> → *Crear app* → caso de uso
   *Conectar con clientes a través de WhatsApp* → vincúlala a tu portfolio.
3. **Número**: en la app, *WhatsApp → Configuración de la API*. Meta te da un
   número de prueba (solo envía a 5 teléfonos que añadas a mano). Para
   producción, añade tu número real con *Añadir número de teléfono* y
   verifícalo por SMS o llamada.
   - Si el número ya se usa en el móvil, mira el apartado
     «Usar un número que ya está en WhatsApp» más abajo antes de darlo de alta.
   - Vale un **fijo**: en la verificación elige *Llamada de voz* en vez de
     SMS. La línea tiene que poder recibir la llamada directamente (sin
     centralita ni menú de opciones) y no estar registrada en ninguna app de
     WhatsApp.
   - Copia el **Identificador del número de teléfono** (Phone Number ID). Es un
     número largo, no el teléfono.
4. **Token permanente**: el token que muestra esa pantalla caduca en 24 h. Crea
   uno permanente en *Configuración del negocio → Usuarios → Usuarios del
   sistema*: añade un usuario del sistema (admin), asígnale la app y la cuenta
   de WhatsApp con control total y pulsa *Generar token* con los permisos
   `whatsapp_business_messaging` y `whatsapp_business_management`, caducidad
   *Nunca*.
5. **Método de pago**: en *Configuración de la cuenta de WhatsApp → Pagos*.
   Meta cobra por cada mensaje de plantilla entregado (tarifa de la categoría
   *Utilidad* para España; consulta la tarifa vigente en la documentación de
   precios de Meta).
6. **Verificación del negocio** (recomendada): sin ella los límites de envío
   diario son bajos.

## Usar un número que ya está en WhatsApp

Depende de en qué app esté ahora ese número:

- **App WhatsApp Business** (la del icono con la «B»): se puede mantener la app
  en el móvil y usar además la API con el mismo número. Meta lo llama
  *coexistencia*. El alta no se hace con «Añadir número de teléfono», sino con
  el flujo *Embedded Signup* de un proveedor (360dialog y similares), que pide
  escanear un QR desde la app. Con coexistencia las listas de difusión de la
  app quedan en solo lectura y los grupos no se sincronizan con la API.
  Si el proveedor expone su propia URL y cabecera de autenticación en lugar de
  `graph.facebook.com`, hay que adaptar `graphFetch` en `lib/whatsapp.ts`
  (el cuerpo de las peticiones es el mismo).
- **WhatsApp normal (personal)**: no admite coexistencia. O se pasa antes el
  número a la app WhatsApp Business (conserva los chats) y luego se hace la
  coexistencia, o se borra la cuenta de WhatsApp de ese número y se da de alta
  solo en la API, o se usa otro número para la API.

## Plantilla

En *WhatsApp Manager → Plantillas de mensajes → Crear plantilla*:

| Campo | Valor |
|---|---|
| Categoría | **Utilidad** |
| Nombre | `envio_documento` |
| Idioma | Español (`es`) |
| Cabecera | **Documento** (sube cualquier PDF de muestra) |
| Cuerpo | ver abajo |
| Pie / botones | ninguno |

Cuerpo, tal cual:

```
Hola {{1}}, te enviamos {{2}} nº {{3}} de {{4}} en el PDF adjunto. Para cualquier duda puedes responder a este mensaje.
```

Ejemplos de variables que pide Meta al enviarla a revisión:

| Variable | Contenido | Ejemplo |
|---|---|---|
| `{{1}}` | Persona de contacto (o nombre del cliente) | `Ana` |
| `{{2}}` | Tipo de documento | `la factura` / `el presupuesto` / `la proforma` |
| `{{3}}` | Número | `F-2026-014` |
| `{{4}}` | Nombre comercial | `Vexo` |

La aprobación suele tardar de minutos a unas horas. Si Meta la recategoriza a
*Marketing*, el mensaje es más caro y el cliente puede silenciarlo: edítala
para que el texto sea puramente informativo.

Si cambias el texto, mantén **cabecera Documento + 4 variables en ese orden**.
La vista previa del modal usa el texto de arriba (`WHATSAPP_TEMPLATE_PREVIEW`
en `lib/whatsapp.ts`); actualízalo si apruebas otro distinto.

## Variables de entorno

En Vercel (*Settings → Environment Variables*) y en `.env.local`:

| Variable | Obligatoria | Uso |
|---|---|---|
| `WHATSAPP_ACCESS_TOKEN` | sí | Token permanente del usuario del sistema |
| `WHATSAPP_PHONE_NUMBER_ID` | sí | Identificador del número (no el teléfono) |
| `WHATSAPP_TEMPLATE_NAME` | no | Por defecto `envio_documento` |
| `WHATSAPP_TEMPLATE_LANG` | no | Por defecto `es`. Debe coincidir exactamente con el idioma de la plantilla (`es`, `es_ES`…) |
| `WHATSAPP_API_VERSION` | no | Por defecto `v23.0` |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | para la bandeja | Cadena inventada; la misma que en el webhook de Meta |
| `WHATSAPP_APP_SECRET` | para la bandeja | Clave secreta de la app de Meta (verifica la firma de los avisos) |

Tras guardarlas, redespliega. En *Ajustes → Estado de integraciones* debe
aparecer «WhatsApp (Meta Cloud API)» con ✓.

## Uso

- El teléfono sale de la ficha del cliente. Sin prefijo se asume el del país
  del cliente (España → +34). Se puede corregir en el modal antes de enviar.
- Al enviar un presupuesto pasa a estado **Enviado**, igual que por email.

## Recibir respuestas (bandeja WhatsApp)

Vexo tiene una bandeja en el menú lateral (**WhatsApp**) con una conversación
por teléfono: ahí se ven los documentos enviados, las respuestas del cliente
(texto, fotos, audios, PDFs…), el estado de entrega (✓ enviado, ✓✓ entregado,
✓✓ azul leído, ! fallido) y un contador de no leídos en el menú. Si el
teléfono coincide con el de una ficha de cliente, la conversación se asocia a
ese cliente.

Para que los mensajes lleguen hay que suscribir el webhook (una sola vez):

1. **Variables** en Vercel (y redesplegar):
   - `WHATSAPP_WEBHOOK_VERIFY_TOKEN`: una cadena larga que te inventes.
   - `WHATSAPP_APP_SECRET`: en <https://developers.facebook.com/apps> → tu app
     → *Configuración de la app → Básica → Clave secreta de la app*. Vexo
     rechaza cualquier aviso que no venga firmado con ella.
2. **Webhook** en la app de Meta: *WhatsApp → Configuración → Webhook →
   Editar*:
   - URL de devolución de llamada: `https://<tu-dominio-de-producción>/api/whatsapp/webhook`
   - Token de verificación: el mismo valor de `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
   - Pulsa *Verificar y guardar* (Meta hace un GET y Vexo contesta el reto).
3. **Campos**: en esa misma pantalla, *Administrar* → suscribe **messages**.
   Si usas coexistencia (el número sigue en la app WhatsApp Business del
   móvil), suscribe también **smb_message_echoes** para que lo que contestes
   desde el móvil aparezca en el hilo de Vexo.
4. Comprueba en *Ajustes → Estado de integraciones* que «WhatsApp: recibir
   respuestas» sale con ✓, y escríbete desde otro móvil al número: debe
   aparecer en la bandeja en unos segundos (la página se refresca sola).

La URL tiene que ser pública: si el proyecto de Vercel tiene *Deployment
Protection* en producción, Meta recibirá un 401 y no llegará nada.

### Si el webhook verifica pero no llegan mensajes

1. **App en modo Live** (Publicada), no Desarrollo.
2. Campo **messages** suscrito en el webhook.
3. En logs de Vercel, un `POST /api/whatsapp/webhook` con **401** y
   «firma inválida» significa que `WHATSAPP_APP_SECRET` no es la *Clave
   secreta* de **esta** app (Meta → app Vexo → *Configuración → Básica*).
   Cópiala de nuevo, actualízala en Vercel Production y redespliega.
4. Suscribe la WABA a la app (si el panel no lo hizo solo):

```bash
curl -X POST "https://graph.facebook.com/v23.0/<WABA_ID>/subscribed_apps" \
  -H "Authorization: Bearer $WHATSAPP_ACCESS_TOKEN"
```

El **WABA ID** aparece en *WhatsApp → Configuración de la API* (junto al
Phone Number ID), no es el teléfono ni el Phone Number ID.

### Contestar desde Vexo

Desde el hilo se puede responder con texto libre **solo durante las 24 h
siguientes al último mensaje del cliente** (regla de Meta). Fuera de esa
ventana el cuadro de respuesta se bloquea: hay que reenviar el documento (que
usa la plantilla aprobada) o contestar desde el móvil.

## Limitaciones conocidas

- Los adjuntos recibidos se descargan de Meta al abrirlos; Meta no los guarda
  indefinidamente, así que los muy antiguos pueden dejar de abrirse.
- Solo se guardan los mensajes que llegan después de suscribir el webhook (no
  se importa el historial anterior).
- Desde la bandeja solo se envía texto; para mandar un PDF usa el botón
  **Enviar** del presupuesto o la factura.
- Recordatorios de cobro y facturas recurrentes siguen saliendo solo por email.
