/**
 * Download a generated file in both regular browsers and the Deva Android app.
 * The Android WebView exposes DevaDownload so the native shell can save/share
 * Blob responses that WebView cannot download through an object URL.
 */
export function downloadBlob(blob, fileName) {
  const safeName = String(fileName || "deva-download")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .slice(0, 180);

  if (window.DevaDownload?.postMessage) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("The downloaded file could not be prepared."));
      reader.onloadend = () => {
        try {
          window.DevaDownload.postMessage(
            JSON.stringify({
              fileName: safeName,
              mimeType: blob.type || "application/octet-stream",
              dataUrl: reader.result,
            }),
          );
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      reader.readAsDataURL(blob);
    });
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
