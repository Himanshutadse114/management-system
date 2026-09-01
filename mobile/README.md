# Deva mobile

This folder contains the Flutter foundation for the Deva Android app. It is designed to use the same backend API, PostgreSQL data, Google identity and role-based permissions as the Deva web application.

## Current foundation

- Deva-only branding
- Google Sign-In
- Google ID token exchange through `POST /api/auth/google`
- Secure storage of the Deva JWT on Android
- Session restore through `GET /api/auth/status`
- Pending-access state
- Role-aware workspace tiles
- Assigned branch display
- Shared API configuration for local development or the deployed backend

The operational mobile screens for stock, sales, restaurant, waiter, cashier, analytics, reports and staff can now be connected one by one to the existing API endpoints without creating a second backend or database.

## Create the Android wrapper

Flutter-generated Android wrapper files are intentionally not hand-written in Git because Flutter should generate them for the installed SDK version.

From the repository root:

```bash
cd mobile
flutter create . --platforms=android --project-name=deva
flutter pub get
```

After generation, set the Android application ID to the production package name you register for Deva in Google Cloud.

For `flutter_secure_storage`, keep Android backup disabled in `android/app/src/main/AndroidManifest.xml`:

```xml
<application
    android:allowBackup="false"
    ...>
```

## Google Sign-In

The backend already verifies Google ID tokens against its configured `GOOGLE_CLIENT_ID`. Register the Android application in the same Google Cloud project and add the signing certificate fingerprints for debug and release builds.

Pass the web OAuth client ID used by the backend as the server client ID:

```bash
flutter run \
  --dart-define=DEVA_API_URL=https://YOUR-DEVA-BACKEND.onrender.com \
  --dart-define=DEVA_GOOGLE_SERVER_CLIENT_ID=YOUR_WEB_OAUTH_CLIENT_ID.apps.googleusercontent.com
```

For an Android emulator connected to a local backend, the default API URL is already `http://10.0.2.2:5001`.

## Production build

```bash
flutter build appbundle --release \
  --dart-define=DEVA_API_URL=https://YOUR-DEVA-BACKEND.onrender.com \
  --dart-define=DEVA_GOOGLE_SERVER_CLIENT_ID=YOUR_WEB_OAUTH_CLIENT_ID.apps.googleusercontent.com
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
