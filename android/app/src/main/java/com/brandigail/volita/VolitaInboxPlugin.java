package com.brandigail.volita;

import android.content.Intent;
import android.provider.Settings;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

/**
 * Lets the web app use the WhatsApp copy kept by {@link WhatsAppListenerService}: see whether it is switched on, read a chat,
 * list the recent chats, and send a reply the person approved. The messages never leave the phone through this plugin; the web
 * app decides what, if anything, to pass to the assistant.
 */
@CapacitorPlugin(name = "VolitaInbox")
public class VolitaInboxPlugin extends Plugin {
    private static final int DEFAULT_READ = 20;
    private static final int MAX_READ = 40;
    private static final int MAX_CHATS = 12;

    private boolean accessGranted() {
        return NotificationManagerCompat.getEnabledListenerPackages(getContext()).contains(getContext().getPackageName());
    }

    /** Whether the person has switched on notification access for Volita, and how many messages are kept. */
    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(new JSObject()
                .put("enabled", accessGranted())
                .put("count", WhatsAppInbox.get(getContext()).count())
                .put("keepDays", WhatsAppInbox.KEEP_DAYS));
    }

    /** Opens Android's "Notification access" screen, where the person turns Volita on or off. */
    @PluginMethod
    public void openSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (RuntimeException e) {
            call.reject("Could not open the settings: " + e.getMessage());
        }
    }

    /** The newest messages of the chat whose name contains `chat`, oldest first. */
    @PluginMethod
    public void read(PluginCall call) {
        String chat = call.getString("chat");
        if (chat == null || chat.trim().isEmpty()) {
            call.reject("chat is required.");
            return;
        }
        int limit = Math.max(1, Math.min(MAX_READ, call.getInt("limit", DEFAULT_READ)));
        try {
            call.resolve(new JSObject().put("messages", WhatsAppInbox.get(getContext()).read(chat.trim(), limit)));
        } catch (JSONException e) {
            call.reject("Could not read the messages.");
        }
    }

    /** The chats that had a message in the last `hours` hours, newest first. */
    @PluginMethod
    public void chats(PluginCall call) {
        int hours = Math.max(1, Math.min(WhatsAppInbox.KEEP_DAYS * 24, call.getInt("hours", 24)));
        long since = System.currentTimeMillis() - hours * 60L * 60 * 1000;
        try {
            call.resolve(new JSObject().put("chats", WhatsAppInbox.get(getContext()).chats(since, MAX_CHATS)));
        } catch (JSONException e) {
            call.reject("Could not list the chats.");
        }
    }

    /** True when the chat's WhatsApp notification is still showing, so a reply can be sent without opening WhatsApp. */
    @PluginMethod
    public void canReply(PluginCall call) {
        String chat = call.getString("chat", "");
        call.resolve(new JSObject().put("canReply", WhatsAppListenerService.replyFor(chat) != null));
    }

    /** Sends the text through the chat's own Reply button. Only the web app calls this, and only after the person said send it. */
    @PluginMethod
    public void sendReply(PluginCall call) {
        String chat = call.getString("chat", "");
        String text = call.getString("text", "");
        if (chat.trim().isEmpty() || text.trim().isEmpty()) {
            call.reject("chat and text are required.");
            return;
        }
        call.resolve(new JSObject().put("sent", WhatsAppListenerService.sendReply(getContext(), chat, text)));
    }

    /** Deletes every message kept on this phone. */
    @PluginMethod
    public void clear(PluginCall call) {
        WhatsAppInbox.get(getContext()).clear();
        call.resolve();
    }
}
