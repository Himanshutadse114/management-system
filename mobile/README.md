# Deva mobile

This folder contains the Flutter Android shell for the complete responsive Deva platform. Android users receive the same menus, workflows and live data as browser users.

## Current app

- Deva-only branding
- Complete responsive web-platform experience inside the Android app
- Username/password sign-in and persistent web session
- Super Admin, owner and staff workflows without reduced summary screens
- Branded Deva launcher icon and release-mode APK
- Friendly offline/retry screen
- One web-platform URL for deployed environments

The Android app includes stock, sales, restaurant, Growth, Owner Control, Ecosystem, analytics, reports, settings, devices and staff access through the same responsive interface used on the web.

## Create the Android project files

Flutter-generated Android project files are created by the installed Flutter SDK.

From the repository root:

```bash
cd mobile
flutter create . --platforms=android --project-name=deva
flutter pub get
```

After generation:

1. Set the Android application ID to the production Deva package name.
2. Use Android API 23 or newer as the minimum SDK for the supported WebView and sharing plugins.
3. Keep Android backup disabled for the application.

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
  --dart-define=DEVA_WEB_URL=https://YOUR-DEVA-FRONTEND.onrender.com
```

The app keeps the same secure web session used by the loaded platform. The backend URL remains owned by the web deployment, so it is not duplicated in the APK configuration.

## Production build

```bash
flutter build appbundle --release \
  --dart-define=DEVA_WEB_URL=https://YOUR-DEVA-FRONTEND.onrender.com
```

Use the generated `.aab` for Google Play distribution after signing configuration is added.

## Architecture

```text
Deva Android (Flutter WebView) ── Deva Web (React) ── Deva API ── PostgreSQL
                                                        │
                                                        └── object storage / media
```

Android and browser users run the same responsive interface and backend workflows. Permissions remain enforced by the backend rather than trusted to the client UI.
