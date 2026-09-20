/**
 * Download a generated file in both regular browsers and the Deva Android app.
 * The Android WebView exposes DevaDownload so the native shell can save/share
 * Blob responses that WebView cannot download through an object URL.
 */
const NATIVE_RESULT_EVENT = "deva-download-result";

function nativeRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `deva-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sendToAndroid(blob, safeName) {
  const supportsAcknowledgement = window.DevaDownloadCapabilities?.acknowledgements === true;
  const requestId = nativeRequestId();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    let timeout = null;
    const cleanup = () => {
      if (timeout) window.clearTimeout(timeout);
      window.removeEventListener(NATIVE_RESULT_EVENT, onResult);
    };
    const onResult = (event) => {
      if (event?.detail?.requestId !== requestId) return;
      cleanup();
      if (event.detail.ok) resolve(event.detail);
      else reject(new Error(event.detail.message || "The file could not be saved."));
    };

    reader.onerror = () => {
      cleanup();
      reject(new Error("The downloaded file could not be prepared."));
    };
    reader.onload = () => {
      try {
        if (supportsAcknowledgement) {
          window.addEventListener(NATIVE_RESULT_EVENT, onResult);
          timeout = window.setTimeout(() => {
            cleanup();
            reject(new Error("The app did not confirm that the file was saved."));
          }, 30000);
        }
        window.DevaDownload.postMessage(
          JSON.stringify({
            requestId,
            fileName: safeName,
            mimeType: blob.type || "application/octet-stream",
            dataUrl: reader.result,
          }),
        );
        // Older installed APKs support the bridge but not acknowledgements.
        // Preserve their existing share-sheet behaviour during the upgrade.
        if (!supportsAcknowledgement) resolve({ ok: true, legacy: true });
      } catch (error) {
        cleanup();
        reject(error);
      }
    };
    reader.readAsDataURL(blob);
  });
}

export function downloadBlob(blob, fileName) {
  const safeName = String(fileName || "deva-download")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .slice(0, 180);

  if (window.DevaDownload?.postMessage) {
    return sendToAndroid(blob, safeName);
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return Promise.resolve();
}
