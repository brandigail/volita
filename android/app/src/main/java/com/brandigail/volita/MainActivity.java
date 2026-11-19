package com.brandigail.volita;

import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;

public class MainActivity extends BridgeActivity {
    /** Voice notes larger than this are not sent: the server accepts clips up to 4 MB. */
    private static final int MAX_SHARED_AUDIO_BYTES = 3 * 1024 * 1024;
    /** Chat screenshots are shrunk here, before they reach the web page, so a big PNG never has to be passed across. */
    private static final int MAX_SHARED_IMAGE_SIDE = 1400;
    private static final int MAX_SHARED_IMAGES = 4;
    private static final int SHARED_IMAGE_QUALITY = 70;
    /** On a cold start the web page needs a moment to load before it can receive a share. */
    private static final long COLD_START_DELAY_MS = 3000;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(VolitaListeningPlugin.class);
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
        return intent != null && (Intent.ACTION_SEND.equals(intent.getAction()) || Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction()));
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
                script = "window.__volitaShared={kind:'text',text:" + quoted + "};"
                    + "window.dispatchEvent(new CustomEvent('volita:shared-text',{detail:" + quoted + "}));";
            }
        } else if (type.startsWith("image/")) {
            String images = sharedImages(intent);
            if (images != null) {
                script = "window.__volitaShared={kind:'images',images:" + images + "};"
                    + "window.dispatchEvent(new CustomEvent('volita:shared-images',{detail:" + images + "}));";
            }
        } else if (type.startsWith("audio/")) {
            Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            String base64 = uri == null ? null : readBase64(uri);
            if (base64 != null) {
                String mime = JSONObject.quote(type);
                script = "window.__volitaShared={kind:'audio',mimeType:" + mime + ",base64:'" + base64 + "'};"
                    + "window.dispatchEvent(new CustomEvent('volita:shared-audio',{detail:{mimeType:" + mime + ",base64:'" + base64 + "'}}));";
            }
        }
        if (script != null) webView.evaluateJavascript(script, null);
    }

    /** The shared screenshots as a JSON array of small JPEG data URLs, or null if none could be read. */
    private String sharedImages(Intent intent) {
        ArrayList<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction())) {
            ArrayList<Uri> many = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (many != null) uris.addAll(many);
        } else {
            Uri one = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (one != null) uris.add(one);
        }
        JSONArray images = new JSONArray();
        for (Uri uri : uris) {
            if (images.length() >= MAX_SHARED_IMAGES) break;
            String dataUrl = shrinkToDataUrl(uri);
            if (dataUrl != null) images.put(dataUrl);
        }
        return images.length() == 0 ? null : images.toString();
    }

    /** Decodes a shared picture at a reduced size and returns it as a JPEG data URL, or null if it cannot be read. */
    private String shrinkToDataUrl(Uri uri) {
        try {
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            try (InputStream in = getContentResolver().openInputStream(uri)) {
                if (in == null) return null;
                BitmapFactory.decodeStream(in, null, bounds);
            }
            int longest = Math.max(bounds.outWidth, bounds.outHeight);
            if (longest <= 0) return null;
            int sample = 1;
            while (longest / (sample * 2) >= MAX_SHARED_IMAGE_SIDE) sample *= 2;
            BitmapFactory.Options decode = new BitmapFactory.Options();
            decode.inSampleSize = sample;
            Bitmap bitmap;
            try (InputStream in = getContentResolver().openInputStream(uri)) {
                if (in == null) return null;
                bitmap = BitmapFactory.decodeStream(in, null, decode);
            }
            if (bitmap == null) return null;
            float scale = Math.min(1f, (float) MAX_SHARED_IMAGE_SIDE / Math.max(bitmap.getWidth(), bitmap.getHeight()));
            if (scale < 1f) {
                Bitmap scaled = Bitmap.createScaledBitmap(bitmap, Math.round(bitmap.getWidth() * scale), Math.round(bitmap.getHeight() * scale), true);
                bitmap.recycle();
                bitmap = scaled;
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.JPEG, SHARED_IMAGE_QUALITY, out);
            bitmap.recycle();
            return "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
        } catch (Exception e) {
            return null;
        }
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
