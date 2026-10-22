/**
 * 1.4.0 — Android app support. Inside the Android WebView a click on `<a download href="blob:…">`
 * saves nothing by itself, so every download the app makes (TXT, PNG, backups, exports) is handed
 * to the native bridge, which asks the user where to save the file (Android's «Save as» screen).
 * In a browser or the desktop app `window.ibrahi8mAndroid` does not exist and nothing changes.
 */

function toBase64(blob: Blob): Promise<string> {
  return new Promise((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => fail(r.error);
    r.readAsDataURL(blob);
  });
}

/** The app's Content-Security-Policy does not allow fetch(blob:), so object URLs are remembered when made. */
const objectUrls = new Map<string, Blob>();

function dataUrlToBlob(href: string): Blob {
  const [head, body] = href.split(',', 2);
  const mime = head.slice(5).split(';')[0] || 'application/octet-stream';
  const bytes = head.includes(';base64') ? Uint8Array.from(atob(body), (c) => c.charCodeAt(0)) : new TextEncoder().encode(decodeURIComponent(body));
  return new Blob([bytes], { type: mime });
}

export async function saveThroughBridge(a: HTMLAnchorElement): Promise<boolean> {
  const bridge = window.ibrahi8mAndroid;
  if (!bridge || !a.hasAttribute('download')) return false;
  const href = a.href;
  let blob: Blob | undefined;
  if (href.startsWith('blob:')) blob = objectUrls.get(href);
  else if (href.startsWith('data:')) blob = dataUrlToBlob(href);
  else if (new URL(href, location.href).origin === location.origin) blob = await (await fetch(href)).blob();
  if (!blob) return false;
  const name = a.getAttribute('download') || href.split('/').pop() || 'file';
  bridge.save(name, blob.type || 'application/octet-stream', await toBase64(blob));
  return true;
}

export function installAndroidBridge() {
  if (!window.ibrahi8mAndroid) return;
  document.documentElement.dataset.platform = 'android';
  const create = URL.createObjectURL.bind(URL);
  const revoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (obj: Blob | MediaSource) => {
    const url = create(obj);
    if (obj instanceof Blob) objectUrls.set(url, obj);
    return url;
  };
  URL.revokeObjectURL = (url: string) => {
    objectUrls.delete(url);
    revoke(url);
  };
  const nativeClick = HTMLAnchorElement.prototype.click;
  // programmatic downloads: a = document.createElement('a'); a.download = …; a.click()
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    if (this.hasAttribute('download') && window.ibrahi8mAndroid) {
      void saveThroughBridge(this).then((done) => {
        if (!done) nativeClick.call(this);
      });
      return;
    }
    nativeClick.call(this);
  };
  // download links the user taps
  document.addEventListener(
    'click',
    (e) => {
      const a = (e.target as Element | null)?.closest?.('a[download]') as HTMLAnchorElement | null;
      if (!a) return;
      e.preventDefault();
      void saveThroughBridge(a);
    },
    true,
  );
}
