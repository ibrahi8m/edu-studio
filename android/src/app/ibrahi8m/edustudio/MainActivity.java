package app.ibrahi8m.edustudio;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * IBRAHI8M EDU STUDIO for Android (1.4.0).
 *
 * The same web app as the web and Windows versions, bundled in the APK under assets/www and served to
 * the WebView from a private https origin that never reaches the network.
 * The page talks to this class through window.ibrahi8mAndroid:
 *  - save(name, mime, base64): opens Android's «Save as» screen for a download (TXT, PNG, backups…)
 *  - version(): the app version
 * File pickers (<input type="file">) open Android's document picker.
 */
public class MainActivity extends Activity {
    static final String VERSION = "1.4.0";
    static final String HOST = "appassets.androidplatform.net";
    static final String START = "https://" + HOST + "/index.html";
    static final int REQ_PICK = 1;
    static final int REQ_SAVE = 2;

    WebView web;
    ValueCallback<Uri[]> pickCallback;
    byte[] pendingBytes;

    static final Map<String, String> MIME = new HashMap<String, String>();
    static {
        MIME.put("html", "text/html");
        MIME.put("js", "text/javascript");
        MIME.put("mjs", "text/javascript");
        MIME.put("css", "text/css");
        MIME.put("json", "application/json");
        MIME.put("webmanifest", "application/manifest+json");
        MIME.put("svg", "image/svg+xml");
        MIME.put("png", "image/png");
        MIME.put("jpg", "image/jpeg");
        MIME.put("jpeg", "image/jpeg");
        MIME.put("webp", "image/webp");
        MIME.put("gif", "image/gif");
        MIME.put("ico", "image/x-icon");
        MIME.put("woff2", "font/woff2");
        MIME.put("woff", "font/woff");
        MIME.put("ttf", "font/ttf");
        MIME.put("txt", "text/plain");
        MIME.put("pdf", "application/pdf");
        MIME.put("wasm", "application/wasm");
        MIME.put("mp3", "audio/mpeg");
        MIME.put("mp4", "video/mp4");
    }

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true); // localStorage
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(true); // sound never starts by itself
        s.setTextZoom(100);
        s.setSupportZoom(false);

        web.addJavascriptInterface(new Bridge(), "ibrahi8mAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return serve(request.getUrl());
            }

            @Override
            @SuppressWarnings("deprecation") // the request variant is API 24+; on 24+ it calls this one
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                Uri u = Uri.parse(url);
                if (HOST.equals(u.getHost())) return false;
                // an outside link: open it in the user's browser, never inside the app
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (ActivityNotFoundException ignored) {
                }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pickCallback != null) pickCallback.onReceiveValue(null);
                pickCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), REQ_PICK);
                } catch (ActivityNotFoundException e) {
                    pickCallback = null;
                    return false;
                }
                return true;
            }
        });

        if (state != null) web.restoreState(state);
        else web.loadUrl(START);
    }

    /** Serves the bundled app files for the private origin; anything else is not loaded. */
    WebResourceResponse serve(Uri uri) {
        if (!HOST.equals(uri.getHost())) return null;
        String path = uri.getPath();
        if (path == null || path.equals("/") || path.isEmpty()) path = "/index.html";
        path = path.substring(1);
        if (path.contains("..")) return notFound();
        int dot = path.lastIndexOf('.');
        String ext = dot >= 0 ? path.substring(dot + 1).toLowerCase() : "";
        String mime = MIME.containsKey(ext) ? MIME.get(ext) : "application/octet-stream";
        try {
            InputStream in = getAssets().open("www/" + path);
            String charset = mime.startsWith("text/") || mime.contains("json") || mime.contains("svg") ? "utf-8" : null;
            return new WebResourceResponse(mime, charset, in);
        } catch (IOException e) {
            return notFound();
        }
    }

    static WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", new HashMap<String, String>(), new ByteArrayInputStream(new byte[0]));
    }

    /** What the page can call. */
    class Bridge {
        @JavascriptInterface
        public void save(final String name, final String mime, final String base64) {
            final byte[] bytes;
            try {
                bytes = Base64.decode(base64, Base64.DEFAULT);
            } catch (IllegalArgumentException e) {
                return;
            }
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    pendingBytes = bytes;
                    Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType(mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
                    i.putExtra(Intent.EXTRA_TITLE, name);
                    try {
                        startActivityForResult(i, REQ_SAVE);
                    } catch (ActivityNotFoundException e) {
                        pendingBytes = null;
                        Toast.makeText(MainActivity.this, R.string.save_failed, Toast.LENGTH_LONG).show();
                    }
                }
            });
        }

        @JavascriptInterface
        public String version() {
            return VERSION;
        }
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == REQ_PICK) {
            if (pickCallback != null) pickCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
            pickCallback = null;
        } else if (request == REQ_SAVE) {
            byte[] bytes = pendingBytes;
            pendingBytes = null;
            if (result != RESULT_OK || data == null || data.getData() == null || bytes == null) return;
            OutputStream out = null;
            try {
                out = getContentResolver().openOutputStream(data.getData());
                if (out == null) throw new IOException("no stream");
                out.write(bytes);
                Toast.makeText(this, R.string.saved, Toast.LENGTH_SHORT).show();
            } catch (IOException e) {
                Toast.makeText(this, R.string.save_failed, Toast.LENGTH_LONG).show();
            } finally {
                if (out != null) try {
                    out.close();
                } catch (IOException ignored) {
                }
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        if (web != null) web.saveState(out);
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.removeJavascriptInterface("ibrahi8mAndroid");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
