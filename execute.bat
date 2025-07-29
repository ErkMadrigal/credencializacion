@echo off
REM Inicia el servidor con PM2
pm2 start server.js --name "credencializacion"

REM Abre el navegador en http://localhost:3000
start http://localhost:3000

REM Opcional: Muestra los logs de PM2 en una nueva ventana de terminal
start cmd /k "pm2 logs credencializacion"