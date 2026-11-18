package com.brandigail.volita;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.List;

/** Lets the web app start and stop {@link ListeningService}, so the assistant keeps hearing with the screen off. */
@CapacitorPlugin(
        name = "VolitaListening",
        permissions = {@Permission(strings = {Manifest.permission.POST_NOTIFICATIONS}, alias = "notifications")})
public class VolitaListeningPlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        // Android 14 refuses a microphone service unless the microphone permission is already granted.
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            call.reject("Microphone permission is required before background listening can start.");
            return;
        }
        // The notification is how Android shows that Volita is listening; ask for it where it is a runtime permission.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "afterNotificationPermission");
            return;
        }
        startService(call);
    }

    @PermissionCallback
    private void afterNotificationPermission(PluginCall call) {
        // Listening still works if the user declines; the notification is just hidden.
        startService(call);
    }

    private void startService(PluginCall call) {
        try {
            ContextCompat.startForegroundService(getContext(), new Intent(getContext(), ListeningService.class));
            call.resolve(new JSObject().put("running", true));
        } catch (RuntimeException e) {
            call.reject("Could not start background listening: " + e.getMessage());
        }
    }

    /**
     * Opens another app at a link if it is installed, otherwise its Play Store page. The packages must also be
     * listed under queries in AndroidManifest.xml, or Android 11+ hides them from this check.
     */
    @PluginMethod
    public void openApp(PluginCall call) {
        String url = call.getString("url");
        JSArray packages = call.getArray("packages");
        if (url == null || packages == null || packages.length() == 0) {
            call.reject("url and packages are required.");
            return;
        }
        try {
            List<String> names = packages.toList();
            PackageManager pm = getContext().getPackageManager();
            for (String name : names) {
                if (!isInstalled(pm, name)) continue;
                if (startApp(pm, name, url)) {
                    call.resolve(new JSObject().put("opened", "app"));
                    return;
                }
            }
            openStore(names.get(0));
            call.resolve(new JSObject().put("opened", "store"));
        } catch (Exception e) {
            call.reject("Could not open the app: " + e.getMessage());
        }
    }

    private static boolean isInstalled(PackageManager pm, String name) {
        try {
            pm.getPackageInfo(name, 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    /** Opens the link inside the app, or just the app if it does not handle that link. */
    private boolean startApp(PackageManager pm, String name, String url) {
        Intent deepLink = new Intent(Intent.ACTION_VIEW, Uri.parse(url)).setPackage(name);
        try {
            getActivity().startActivity(deepLink);
            return true;
        } catch (ActivityNotFoundException e) {
            Intent launch = pm.getLaunchIntentForPackage(name);
            if (launch == null) return false;
            getActivity().startActivity(launch);
            return true;
        }
    }

    private void openStore(String name) {
        try {
            getActivity().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + name)));
        } catch (ActivityNotFoundException e) {
            getActivity().startActivity(
                    new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=" + name)));
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), ListeningService.class));
        call.resolve(new JSObject().put("running", false));
    }
}
