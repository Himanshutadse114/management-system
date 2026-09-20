# Android Operational Workflows

Deva now includes a native Flutter Android app alongside the installable responsive PWA. The native app uses administrator-issued usernames and passwords; the PWA remains available for full browser workflows.

## Supported roles

- Waiter: tables, repeat rounds, modifiers, kitchen notes, bill handoff and ready alerts.
- Cashier: shift open/close, counter billing, split tender, restaurant settlement, receipts and offline queue state.
- Stock staff: purchases, batches/expiry, stocktake, transfers, returns and wastage.
- Manager: KDS, reservations, guest-order acceptance/payment verification, reports, devices and operational controls.

## Device setup

Register each Android terminal under **Settings → Devices** as `TERMINAL`, `KDS`, `KIOSK`, `TOKEN_DISPLAY`, `CALLING_DEVICE`, or `APP` connection. Use **Check in** after installation and monitor `lastSeenAt`. Give every person a separate staff username; never share cashier, waiter or manager credentials.

## Offline behavior

The app shell stays available offline. Counter checkout can queue an idempotent sale after a network failure and displays the pending count. The queue belongs to that browser profile: do not clear storage, uninstall the app, or switch devices until it reaches zero. Restaurant settlement and manager approvals remain online-only because they depend on live bill state.

## Release checklist

Test sign-in, role routing, camera/QR launch, touch targets, rotation, dark/light mode, printer bridge, offline/reconnect, and battery optimization on every supported device model before rollout. Pin the production origin and prevent untrusted sideloaded WebViews from receiving credentials.
