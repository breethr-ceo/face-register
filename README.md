# Face Register

A mobile-friendly web app with two actions:

1. **Register:** enter a person's name, take a camera photo or upload a phone photo. Detect one face, check the shared Supabase registry, and either show **User is registered** without inserting a row, or save a new person.
2. **Identify:** take or upload a photo, then display the matched person's name. Unknown faces show **Product not found**, as requested.

## Delivery status

The app is deployed to **https://face-register-three.vercel.app** on Vercel. Supabase connection settings are configured for production, and the live sign-in page and Supabase endpoint have been verified. Registration and identification with real people still require testing after operator sign-in.

To run your own copy, configure your own Supabase project and environment variables using the steps below. Local credentials and deployment account settings are excluded from this repository.

## Requirements

- Node.js 22.12+ and npm.
- A Supabase project and Vercel account.
- Safari on iPhone or Chrome on Android, with camera permission.
- HTTPS on a phone. Desktop `localhost` also works. An HTTP LAN address normally cannot open a camera; upload still works.

## 1. Install

Run these commands **inside this folder**, not the parent voice application:

```sh
cd face-register
npm ci
cp .env.example .env.local
```

If your local npm cache has permission problems, use `npm ci --cache ../.npm-cache`.

## 2. Create and configure Supabase

1. Create a project at https://supabase.com/dashboard and wait for provisioning.
2. Open **SQL Editor → New query**, paste the entire file `supabase/migrations/202609160001_face_registry.sql`, and run it once. It creates two tables and two RPC functions. It is a one-time migration, not an idempotent reset script.
3. Under **Authentication → Users**, create an operator with an email and password. Confirm the email when creating the account. Disable public sign-ups under Authentication settings if you do not need them.
4. Copy the new user's UUID and run the following in SQL Editor:

```sql
insert into public.face_operators (user_id)
values ('REPLACE-WITH-AUTH-USER-UUID');
```

5. Open your project's Connect/API settings and copy the **Project URL** and **publishable key** (a legacy `anon` key also works).
6. Fill `.env.local`:

```dotenv
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR-PUBLISHABLE-OR-ANON-KEY
```

These are browser configuration values. **Never put a secret key, service-role key, database password, or access token in any `VITE_` variable.** Vite embeds these values in public JavaScript. Database access is controlled by login, operator membership, function grants, and RLS.

All approved operators share one registry. Registered people do not need Supabase Auth accounts. The operator's login is separate from the people being recognized. Merely creating an Auth account does not grant registry access.

### Optional CLI migration path

If you prefer CLI migrations over SQL Editor:

```sh
npx supabase login
npx supabase init
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Use either SQL Editor or CLI for initial migration, not both. Review the linked project before pushing. Then create and approve the operator as above.

## 3. Run locally

```sh
npm run dev
```

Open the localhost URL printed by Vite (normally http://localhost:5173). Sign in as the approved operator. The first face check loads approximately 8 MB of local model weights and may take several seconds. No external recognition service or paid AI key is needed. With missing configuration, the UI displays a setup message and disables registry actions instead of simulating success.

- **Register:** enter a name, open camera → take photo (or upload), confirm permission, then **Register**.
- **Identify:** select Identify, capture/upload a photo, confirm permission, then **Identify**.
- To use another camera, choose an existing photo taken with your phone's camera app; the live view defaults to the front camera.
- JPEG, PNG and WebP work. HEIC/HEIF depends on browser decoding support; convert to JPEG if rejected.
- Images are limited to 15 MB and resized to at most 1280 pixels before inference.

## 4. Deploy to Vercel

### Dashboard (recommended)

1. Push this project to a Git repository and import that repository into Vercel.
2. If importing the existing parent repository, set **Root Directory** to `face-register`. Do not deploy the parent voice app as this app.
3. Select **Vite**, build command `npm run build`, output directory `dist`, and Node.js 22.x or newer compatible runtime. Install command: `npm ci`.
4. Add both environment variables from `.env.local` to the Production environment (and Preview if wanted).
5. Deploy. Open the resulting HTTPS URL on your phone, sign in, and allow camera access.
6. If using Supabase email links later, update Supabase Auth's Site URL and allowed redirects to match the deployment. This app currently uses email/password login without a redirect flow.

Environment variables are baked into the build: after changing one, **redeploy**.

### CLI

From this folder:

```sh
npx vercel login
npx vercel link
npx vercel env add VITE_SUPABASE_URL production
npx vercel env add VITE_SUPABASE_PUBLISHABLE_KEY production
npx vercel --prod
```

When asked, use this folder as the project root. Paste values into the prompts; do not commit `.env.local`. If your CLI reports EACCES reading its authentication file, repair the ownership of your own Vercel configuration through your normal system administration process or use the dashboard deployment path. This project does not change permissions on account files.

## How recognition works

- The pinned `@vladmandic/face-api` 1.7.15 runtime loads three models: tiny face detector, 68-point landmarks, and face recognition. It does not run age, gender, emotion, or other attribute inference.
- The phone converts exactly one detected face into a 128-number descriptor. Photos/camera frames stay in browser memory and are not uploaded or saved to Supabase. The descriptor is biometric data and is sent to Supabase over HTTPS.
- `face_lookup` calculates Euclidean distance against stored references inside PostgreSQL. The default match threshold is **0.50**. Lower distance means closer resemblance; this is not a confidence percentage.
- Multiple close candidates produce an ambiguous result. Registration also stops when the nearest match is in the 0.50–0.55 uncertainty band, rather than creating a likely duplicate.
- A PostgreSQL transaction advisory lock serializes check-and-insert, including registrations from different phones. This prevents a race between duplicate lookup and insertion. It cannot prevent duplicates caused by an incorrect model non-match.
- Only the matched name and ID leave the database. Browsers cannot list/download stored descriptors directly.

This is a small-registry prototype. Matching scans every stored descriptor and serializes requests; use indexed vector search and a revised concurrency design for a large deployment. Model thresholds require validation with consenting people and representative phones, lighting and demographics. One photo per person is supported. Different expressions, angles, masks, lighting and similar faces can cause false matches or missed matches.

This package's upstream repository is archived. The dependency is pinned for reproducibility; evaluate a maintained engine before a long-lived production rollout. Replacing the embedding model generally requires re-enrolling everyone, because descriptors from different models are not interchangeable.

**No liveness detection or identity proofing is included.** A photograph of a photograph may match. Descriptors are generated by the browser and could be forged by an authorized operator. Do not use this prototype to authorize payments, unlock doors, or make high-stakes identity decisions. Confirm displayed matches with the person.

## Data management

`face_people` stores UUID, name, 128-number face reference, creation time, operator UUID, and permission confirmation time. The checkbox is an operator attestation. No original image is retained. Determine appropriate consent and retention practices for your deployment.

To remove a person, delete their row through Supabase Table Editor, or use a specific ID:

```sql
delete from public.face_people where id = 'PERSON-UUID';
```

To revoke an operator:

```sql
delete from public.face_operators where user_id = 'OPERATOR-UUID';
```

RLS is enabled with no browser table policies. The two `SECURITY DEFINER` functions have empty search paths and explicitly restricted execution grants. `face_lookup` checks operator membership on every call. Keep database administrator credentials private. Supabase backups may retain deleted data according to your project settings.

## Validation

```sh
npm test
npm run build
npm run preview
```

A mobile browser smoke check also passed at 390 px width: setup-state rendering, no horizontal overflow, local model loading, and blank-image rejection. To repeat it, leave `npm run dev -- --port 5177` running in another terminal, install a Playwright browser with `npx playwright install chromium`, and run `node scripts/browser-smoke.mjs`. Alternatively set `CHROME_PATH` to your installed Chrome executable. The smoke test expects no Supabase configuration.

Database tests use embedded PostgreSQL (PGlite) to execute the actual migration and exercise registration, duplicate handling, identification, unknown and ambiguous results, malformed inputs, and access restrictions. They do not substitute for testing your hosted Supabase Auth setup or real phone camera. No real biometric accuracy or live cloud deployment was verified during development.

Before use, run this acceptance check on the HTTPS deployment:

1. Sign in as an approved operator; register one consenting person.
2. Upload the same photo under a different name: expect **User is registered** and just one database row.
3. Identify with a different clear photo of the same person: expect their original name.
4. Identify an unregistered person: expect **Product not found**.
5. Try a blank image and a group photo: expect explicit errors and no insert.
6. Deny camera permission: expect a usable upload fallback.
7. Sign in with an unapproved account: expect access denied.
8. From two devices, register the same photo at once: expect one new row.
9. Check portrait layout on an actual iPhone and Android phone, retake/remove photos, and sign out.

## Files

- `src/main.js`: UI, camera/upload lifecycle, login and RPC calls.
- `src/face.js`: local face detection and descriptor extraction.
- `src/style.css`: responsive phone layout.
- `supabase/migrations/202609160001_face_registry.sql`: schema, restricted RPCs and atomic matching.
- `scripts/copy-models.mjs`: copies the installed, pinned runtime and required weights into public assets during dev/build; no runtime CDN dependency for recognition.
- `vercel.json`: Vite build and response headers.
- `tests/database.test.mjs`: database behavior and authorization checks.

The face-api license is copied to `/vendor/face-api-LICENSE.txt`. Review upstream model licensing for your intended use. The interface uses system fonts and has no external font requests.

## References

- Supabase database functions: https://supabase.com/docs/guides/database/functions
- Supabase row-level security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Vite on Vercel: https://vercel.com/docs/frameworks/frontend/vite
- FaceAPI source and model documentation: https://github.com/vladmandic/face-api
