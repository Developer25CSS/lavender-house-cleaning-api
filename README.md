# Lavender House Cleaning — API

Backend for [lavendercleanco.com](https://lavendercleanco.com). Node + Express + Prisma + PostgreSQL. Provides customer accounts, staff/admin accounts, and a real bookings database for the static frontend at [github.com/Developer25CSS/lavender-house-cleaning](https://github.com/Developer25CSS/lavender-house-cleaning).

## Endpoints

```
POST   /api/auth/signup     create a customer account
POST   /api/auth/login      email+password -> httpOnly session cookie
POST   /api/auth/logout
GET    /api/auth/me

POST   /api/bookings        create a booking (guest or logged-in customer)
GET    /api/bookings        customer: own bookings. staff/admin: all bookings
PATCH  /api/bookings/:id    staff/admin only — update status
```

## Deploying on Render

1. Go to [dashboard.render.com](https://dashboard.render.com) → **New → PostgreSQL**. Create a free instance, copy its **Internal Database URL**.
2. **New → Web Service** → connect this GitHub repo.
   - Build command: `npm install && npm run build`
   - Start command: `npm start`
3. Under **Environment**, add:
   - `DATABASE_URL` — the Postgres Internal Database URL from step 1
   - `JWT_SECRET` — any long random string
   - `CORS_ORIGIN` — `https://lavendercleanco.com,https://developer25css.github.io`
   - `NODE_ENV` — `production`
4. Deploy. Render will run `npm run build` (which runs `prisma db push` to create the tables) then `npm start`.
5. Once live, create the first staff/admin login from the Render shell:
   ```
   npm run seed:staff -- --name="Your Name" --email=you@example.com --password=yourpassword --role=admin
   ```
6. Copy the Render service URL (e.g. `https://lavender-house-cleaning-api.onrender.com`) into `API_BASE` in the frontend's `assets/api.js`.

## Local development

```
npm install
cp .env.example .env   # fill in a local DATABASE_URL (Postgres or SQLite for quick testing)
npm run prisma:generate
npx prisma db push
npm run dev
```
