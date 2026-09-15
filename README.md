# SCAR · Skin CARe

Un diario personal de piel, pequeños rituales y ciclo. HTML, CSS y JavaScript vanilla, sin compilación ni frameworks. Preparado para GitHub Pages y Safari en iPhone.

## Ponerlo en marcha

1. Abrí tu proyecto en Supabase y entrá a **SQL Editor**.
2. Elegí **solo uno** de estos archivos:
   - **Base vacía:** `supabase/instalar_scar.sql`.
   - **Ya ejecutaste exactamente SCAR V3:** `supabase/migrar_v3_a_v4.sql`.
3. Pegá todo el archivo y ejecutalo. Ambos usan una transacción. La migración conserva datos y puede repetirse. El instalador es para una base vacía y no debe repetirse. Si tenés V1/V2 u otra estructura, primero comparala con V3; no borres tablas para evitar el error.
4. En **Authentication → URL Configuration**, agregá `https://ilean01.github.io/SCAR/` como Site URL y Redirect URL. Si usás otra dirección, reemplazala en esos ajustes.
5. En **Authentication → Providers**, habilitá Email. Con confirmación de correo activa, confirmá el mensaje antes del primer inicio de sesión. La recuperación de contraseña vuelve a la misma app mediante un enlace de correo.
6. Copiá **Project URL** y la **publishable key** (o `anon` legacy) desde la configuración API de Supabase.
7. En SCAR, abrí **Mi espacio → Conexión de Supabase**, pegá esos dos valores, guardá y creá tu cuenta. También podés completar `config.js` para no configurarlos en cada dispositivo.
8. En GitHub: **Settings → Pages → Deploy from a branch → main → /(root)**. No requiere GitHub Actions ni un dominio personalizado.
9. Entrá con la misma cuenta en los demás dispositivos. En Safari: **Compartir → Agregar a inicio**.

Las claves publishable y anon son públicas y se pueden incluir en una PWA. Nunca pongas una clave `service_role`, `sb_secret_…` ni la contraseña de la base de datos en el repositorio. El acceso a los datos depende de Supabase Auth y RLS.

## Novedades visuales V4.1

- La paleta crema, rosa y ciruela se conserva. Stickers SVG propios de moños, flores y corazones, disponibles sin conexión.
- 31 frases originales: una por día según la fecha local del dispositivo, con botón Otra frase. La selección manual dura mientras la app esté abierta; al reabrir vuelve la frase del día. La colección se repite cada 31 días.
- Guía dibujada de frente y ambos lados del rostro, consejos de iluminación, acceso a cámara/galería y etiquetas de ángulo. En dispositivos compatibles, Sacar una foto ahora solicita la cámara frontal; la disponibilidad depende del navegador.
- Círculo decorativo con el día real del ciclo. El arco es ornamental, no una escala de fertilidad ni porcentaje de avance. Las estimaciones siguen usando el historial existente.
- Guía de activación y creación de cuenta dentro de Mi espacio. Guardar las claves no se presenta como una verificación de conexión.
- Esta actualización visual no necesita SQL adicional si ya instalaste V4. La nube real sigue pendiente de configurar y verificar en tu proyecto.

## Lo que incluye

- Nueva estética crema, rosa empolvado y ciruela; ilustraciones y recursos propios, disponibles sin conexión.
- Rutinas libres por mañana/noche, pasos ordenables y copia histórica de cada plan. Elegir una plantilla no marca sus productos como usados. Estado explícito: pendiente, terminé o descansé; no impone una puntuación diaria de cumplimiento.
- Productos, favoritos, valoración, intención de recompra y archivo sin perder referencias históricas.
- Envases independientes con compra, apertura, PAO, precio y vencimiento impreso. La vista nueva y la app usan la primera fecha aplicable. Las antiguas columnas de inventario de V3 se conservan por compatibilidad; el historial nuevo vive en `envases`.
- Estado de piel, síntomas e intensidades, notas por zona, etiquetas y hábitos opcionales. Los hábitos pasan por sin registrar → sí → no al tocarlos.
- Hasta tres fotografías privadas por día; compresión a JPEG, 1200 px de lado mayor; ángulo opcional.
- Calendario navegable que abre el registro de la fecha elegida. Evolución basada en días reales, sin inventar datos en fechas vacías.
- Períodos editables, validación de fechas y solapamientos, conteo que continúa después del día 28. Las estimaciones no confirman ovulación ni sirven para anticoncepción.
- Cuenta, recuperación de contraseña, guardado local por usuario y proyecto, sincronización y detección de conflictos.
- Exportación JSON con fotografías. Esta versión exporta copias; no incluye restauración general de archivos JSON.

## Conservar los datos de la versión anterior

SCAR conserva `scar-db`, la base IndexedDB original. Los registros antiguos y sus fotos se adaptan localmente sin borrar sus originales. Los nuevos datos de una cuenta usan otra base, separada por proyecto y usuario.

Después de iniciar sesión, tocá **Mi espacio → Importar datos de este dispositivo**. Se crean UUID válidos para las relaciones de Supabase. Los productos, rutinas, síntomas, ciclos, envases y registros se copian, con fotografías. La operación recuerda lo que ya importó. Si una fecha ya existe en la cuenta, no la sobrescribe. Una importación con fechas de períodos incompatibles queda pendiente para corregirla; no se descartan datos.

Antes de un cambio de dispositivo o navegador, exportá una copia. El guardado local no está cifrado; usá el bloqueo del dispositivo y cerrá sesión cuando corresponda. Los cambios todavía pendientes solo existen en ese dispositivo hasta sincronizarse.

## Cómo sincroniza

Cada guardado espera a que finalice la transacción de IndexedDB. Una marca persistente `__dirty` mantiene la cola incluso después de cerrar la app. Al reconectar, guardar, volver a la ventana o tocar Sincronizar, se envían los cambios. Mientras la app está abierta, también se comprueba cada minuto. No se promete ejecución en segundo plano cuando iOS cierra la PWA.

La función `scar_guardar` escribe cada entidad y sus relaciones en una sola transacción, con RLS activo, bloqueo por usuario/entidad y revisión esperada. Los cambios en relaciones actualizan la revisión del padre. Los archivos se suben antes de confirmar su metadata. Las eliminaciones de fotos generan una tarea persistente para quitar el archivo por la API de Storage y luego la tarea.

Un cambio de otro dispositivo no se pisa: aparece en **Mi espacio → Cambios para revisar**, con ambas versiones. Se resuelve eligiendo una versión completa de esa entidad; no se mezclan automáticamente campos. Podés exportar una copia antes de resolver. Si elegís la versión de la nube tras subir una foto en un intento fallido, podría quedar un archivo no referenciado; requiere limpieza administrativa de huérfanos. No existe una transacción única entre Storage y PostgreSQL.

Las lecturas se paginan y no se cachean respuestas Auth/API en el service worker. Solo se cachean archivos estáticos de esta app; tampoco se eliminan cachés de otras aplicaciones del mismo dominio. Las fotos de la nube se visualizan con enlaces temporales; las que no tengan copia local necesitan conexión.

## Estructura

- `app.js`: interfaz, formularios y eventos.
- `js/core.js`: fechas, rutinas, ciclos y vencimientos.
- `js/db.js`: guardado local, migración e importación.
- `js/cloud.js`: API Auth, RPC, sincronización y Storage.
- `config.js`: configuración pública de la conexión.
- `supabase/`: instalador y migración V3 → V4.
- `tests/core.test.js`: pruebas de lógica sin dependencias.
- `tests/database.test.mjs`: pruebas de SQL/RLS con PostgreSQL embebido y esquemas Auth/Storage simulados.

## Desarrollo y verificación

```bash
npm test
python3 -m http.server 4173
```

Abrí `http://localhost:4173`. No abras `index.html` con `file://`: módulos ES, IndexedDB y service workers necesitan un origen web. La app funciona bajo `/SCAR/` y utiliza rutas relativas.

Pruebas de base de datos opcionales:

```bash
npm install --no-save @electric-sql/pglite
node tests/database.test.mjs
```

Estas pruebas cubren instalación, escritura atómica, conflictos, aislamiento de dos cuentas, notas de zona sin síntoma, día 29 y borrado de una rutina conservando el usuario. Las APIs administradas de Supabase y el correo deben verificarse en el proyecto real después de configurarlo.

Pruebas de interfaz y sincronización (la API se simula; no usa tu Supabase):

```bash
npm install --no-save playwright
npx playwright install chromium
node tests/browser.test.cjs
```

La prueba levanta su propio servidor local y cubre formularios, calendario, guardado sin conexión, fotos, conflictos y separación de cuentas. `SCAR_CHROMIUM` permite indicar otra instalación local de Chromium.

La app todavía no tiene credenciales de tu proyecto incorporadas y este cambio de Git no ejecuta SQL en Supabase.
