# La Plancha · Control de ventas, stock y caja

App web (Node.js + Express + PostgreSQL). Roles: **Admin** (productos, stock, usuarios, dinero, gastos, turnos) y **Turno** (abrir caja, vender, cerrar caja).

## Correr local
    docker compose up -d                 # PostgreSQL local
    npm install
    cp .env.example .env                 # (o exporta las variables a mano)
    DATABASE_URL=postgresql://postgres:plancha@localhost:5432/plancha ADMIN_PASSWORD=tu-clave npm start
Abre http://localhost:3000. Sin `ADMIN_PASSWORD` el admin inicial es `admin` / `admin123` y la app pide cambiarla.

## Desplegar gratis: Vercel + Neon
1. **Base de datos:** crea una cuenta en https://neon.tech, crea un proyecto y copia la *connection string* (`postgresql://...`).
2. **Código:** sube esta carpeta a un repositorio de GitHub (el `.gitignore` ya excluye `node_modules` y `.env`).
3. **Vercel:** en https://vercel.com → *Add New → Project* → importa el repositorio. No cambies la configuración de build.
4. En *Environment Variables* agrega:
   - `DATABASE_URL` = la cadena de Neon
   - `ADMIN_PASSWORD` = la contraseña del administrador inicial
   - (opcional) `ADMIN_USER` = usuario del admin (por defecto `admin`)
5. *Deploy*. Al primer ingreso la app crea las tablas, las categorías y el admin automáticamente.

Los datos viven en Neon, así que se conservan entre despliegues. Cada vez que hagas `git push`, Vercel redespliega sin tocar los datos.
