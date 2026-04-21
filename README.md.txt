# Inventario_v1

Interfaz de consulta de stock con captura de evidencias para filas en estado `Inventario Sin Venta`.

## Flujo

- Lee la hoja `Hoja 1` del archivo de Google Sheets configurado en `app.js`.
- Permite registrar evidencias o ajuste de inventario para filas IVS.
- Envía las imágenes a Google Drive y registra el evento en la hoja `Data_ivs` mediante Google Apps Script.

## Configuración

1. Publica el script de Google Apps Script incluido en `apps-script/Code.gs` como Web App.
2. Copia la URL publicada y reemplaza `SCRIPT_URL` en `app.js`.
3. Verifica que la carpeta de Drive y la hoja `Data_ivs` existan y tengan permisos para el propietario del script.