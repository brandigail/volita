package com.brandigail.apexvoice;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

public class MainActivity extends BridgeActivity {
    /** Voice notes larger than this are not sent: the server accepts clips up to 4 MB. */
    private static final int MAX_SHARED_AUDIO_BYTES = 3 * 1024 * 1024;
    /** On a cold start the web page needs a moment to load before it can receive a share. */
    private static final long COLD_START_DELAY_MS = 3000;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ApexListeningPlugin.class);
        super.onCreate(savedInstanceState);
        Intent intent = getIntent();
        if (isShare(intent)) {
            new Handler(Looper.getMainLooper()).postDelayed(() -> handleShare(intent), COLD_START_DELAY_MS);
        }
    }

    /** The app is already open and another app shares into it. */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (isShare(intent)) handleShare(intent);
    }

    private static boolean isShare(Intent intent) {
        return intent != null && Intent.ACTION_SEND.equals(intent.getAction());
    }

    /** Hands a shared message or voice note to the web app, which turns it into a draft reply. */
    private void handleShare(Intent intent) {
        if (getBridge() == null) return;
        WebView webView = getBridge().getWebView();
        String type = intent.getType() == null ? "" : intent.getType();
        String script = null;

        if (type.startsWith("text/")) {
            String text = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (text != null && !text.trim().isEmpty()) {
                String quoted = JSONObject.quote(text);
                script = "window.__apexShared={kind:'text',text:" + quoted + "};"
                    + "window.dispatchEvent(new CustomEvent('apex:shared-text',{detail:" + quoted + "}));";
            }
        } else if (type.startsWith("audio/")) {
            Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            String base64 = uri == null ? null : readBase64(uri);
            if (base64 != null) {
                String mime = JSONObject.quote(type);
                script = "window.__apexShared={kind:'audio',mimeType:" + mime + ",base64:'" + base64 + "'};"
                    + "window.dispatchEvent(new CustomEvent('apex:shared-audio',{detail:{mimeType:" + mime + ",base64:'" + base64 + "'}}));";
            }
        }
        if (script != null) webView.evaluateJavascript(script, null);
    }

    /** Reads a shared file as base64, or null if it cannot be read or is too large. */
    private String readBase64(Uri uri) {
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            if (in == null) return null;
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[16 * 1024];
            int read;
            while ((read = in.read(buffer)) != -1) {
                out.write(buffer, 0, read);
                if (out.size() > MAX_SHARED_AUDIO_BYTES) return null;
            }
            return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * While a conversation is running, keep the web page's timers and audio going after the screen turns off or
     * the user switches apps; the foreground service is what makes this allowed.
     */
    @Override
    public void onPause() {
        super.onPause();
        if (ListeningService.running && getBridge() != null) {
            WebView webView = getBridge().getWebView();
            webView.onResume();
            webView.resumeTimers();
        }
    }
}
