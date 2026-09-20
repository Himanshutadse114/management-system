# Deva mobile

This folder contains the native Flutter Android app for Deva. It uses the same backend API, PostgreSQL data and role permissions as the web application.

## Current app

- Deva-only branding
- Username/password sign-in through `POST /api/auth/password`
- Secure storage of the Deva JWT on Android
- Session restore through `GET /api/auth/status`
- Forced password change for temporary credentials
- Super Admin business and owner-account creation
- Business owner branch and staff-account creation
- Staff role assignment, suspension and password reset
- Role-aware current-platform module navigation
- Assigned branch display
- Shared API configuration for local development or the deployed backend

Current platform areas represented in the app include stock/batches/stocktakes/transfers, sales/refunds/shifts, restaurant/kitchen/guest orders/reservations, Growth, Owner Control, Ecosystem, Sales & Profit, Reports, Settings, devices and staff access.

## Create the Android wrapper

Flutter-generated Android wrapper files are intentionally not hand-written in Git because Flutter should generate them for the installed SDK version.

From the repository root:

```bash
cd mobile
flutter create . --platforms=android --project-name=deva
flutter pub get
```

After generation:

1. Set the Android application ID to the production Deva package name.
2. Use Android API 23 or newer as the minimum SDK because secure token storage requires it.
3. Keep Android backup disabled for the application so authentication material is not included in device backups.

In `android/app/src/main/AndroidManifest.xml`:

```xml
<application
    android:allowBackup="false"
    ...>
```

## Bootstrap Super Admin

Set these variables on the backend service. Do not commit real passwords:

```text
SUPER_ADMIN_EMAIL=platform-owner@example.com
SUPER_ADMIN_USERNAME=superadmin
SUPER_ADMIN_PASSWORD=<strong unique bootstrap password>
```

The backend creates this password credential only if it does not already exist. Changing the environment variable later does not silently overwrite the database password. Owner and staff temporary passwords must be changed on first sign-in.

Render may keep using only its private/internal PostgreSQL connection in `DATABASE_URL`; an external database URL is not required. The backend also remains compatible with the split `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` and `DB_PASS` variables used by `render.yaml`.

## Run

```bash
flutter run \
  --dart-define=DEVA_API_URL=https://YOUR-DEVA-BACKEND.onrender.com
```

For an Android emulator connected to a local backend, the default API URL is already `http://10.0.2.2:5001`.

## Production build

```bash
flutter build appbundle --release \
  --dart-define=DEVA_API_URL=https://YOUR-DEVA-BACKEND.onrender.com
```

Use the generated `.aab` for Google Play distribution after signing configuration is added.

## Architecture

```text
Deva Web (React) ─────┐
                      ├── Deva API (Node/Express) ── PostgreSQL
Deva Android (Flutter)┘              │
                                     └── object storage / media
```

Both clients authenticate independently but receive the same Deva JWT format and the same access snapshot. Permissions remain enforced by the backend rather than trusted to the client UI.
