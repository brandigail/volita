package com.brandigail.volita;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.RemoteInput;
import android.content.Intent;
import android.os.Bundle;
import android.os.Parcelable;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

/**
 * Reads WhatsApp's notifications as they arrive and keeps the messages in {@link WhatsAppInbox}, on this phone only. The person
 * must switch this on themselves in Android's "Notification access" settings; until they do, Android never starts it.
 * It also remembers each chat's "Reply" button, so a reply the person approved by voice can be sent without opening WhatsApp.
 */
public class WhatsAppListenerService extends NotificationListenerService {
    private static final String[] PACKAGES = {"com.whatsapp", "com.whatsapp.w4b"};
    /** Notifications that are about WhatsApp itself, not a message from a person. */
    private static final Pattern NOISE = Pattern.compile(
            "^(\\d+ (new )?messages?( from \\d+ chats?)?|checking for new messages|backup in progress|whatsapp web is currently active|"
                    + "you have a missed call|ongoing voice call|ongoing video call|incoming voice call|incoming video call|.*is calling.*)$",
            Pattern.CASE_INSENSITIVE);

    /** A chat's Reply button, kept while its notification is on the screen. */
    static final class ReplyTarget {
        final PendingIntent intent;
        final RemoteInput[] inputs;

        ReplyTarget(PendingIntent intent, RemoteInput[] inputs) {
            this.intent = intent;
            this.inputs = inputs;
        }
    }

    /** Chat name (lower case) to its Reply button. */
    private static final Map<String, ReplyTarget> REPLIES = new ConcurrentHashMap<>();
    static volatile boolean connected = false;

    @Override
    public void onListenerConnected() {
        connected = true;
        // Android does not announce notifications that were already showing when access was switched on, so read them now.
        try {
            StatusBarNotification[] showing = getActiveNotifications();
            if (showing != null) for (StatusBarNotification sbn : showing) ingest(sbn);
        } catch (RuntimeException ignored) {
            // Could not list them; new messages are still kept as they arrive.
        }
    }

    @Override
    public void onListenerDisconnected() {
        connected = false;
        // Android may stop the service to save memory; asking to be bound again brings it back.
        try {
            requestRebind(new android.content.ComponentName(this, WhatsAppListenerService.class));
        } catch (RuntimeException ignored) {
            // The person turned notification access off.
        }
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        ingest(sbn);
    }

    /** Keeps the messages in one WhatsApp notification, whether it just arrived or was already showing. */
    private void ingest(StatusBarNotification sbn) {
        if (sbn == null || !isWhatsApp(sbn.getPackageName())) return;
        Notification notification = sbn.getNotification();
        if (notification == null || (notification.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
        Bundle extras = notification.extras;
        if (extras == null) return;

        String title = text(extras.getCharSequence(Notification.EXTRA_TITLE));
        String conversationTitle = text(extras.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE));
        boolean group = extras.getBoolean("android.isGroupConversation") || !conversationTitle.isEmpty();
        String chat = group && !conversationTitle.isEmpty() ? conversationTitle : title;
        if (chat.isEmpty() || chat.equalsIgnoreCase("WhatsApp")) return;

        WhatsAppInbox inbox = WhatsAppInbox.get(getApplicationContext());
        boolean stored = false;
        Parcelable[] messages = extras.getParcelableArray(Notification.EXTRA_MESSAGES);
        if (messages != null) {
            for (Parcelable item : messages) {
                if (!(item instanceof Bundle)) continue;
                Bundle message = (Bundle) item;
                String body = text(message.getCharSequence("text"));
                if (body.isEmpty() || NOISE.matcher(body).matches()) continue;
                String sender = text(message.getCharSequence("sender"));
                if (sender.isEmpty()) sender = group ? "" : chat;
                long time = message.getLong("time", sbn.getPostTime());
                inbox.add(chat, sender.isEmpty() ? chat : sender, body, time);
                stored = true;
            }
        }
        if (!stored) {
            String body = text(extras.getCharSequence(Notification.EXTRA_TEXT));
            if (body.isEmpty() || NOISE.matcher(body).matches()) return;
            String sender = chat;
            // Older WhatsApp versions put a group message in the text as "Sender: message".
            if (group) {
                int colon = body.indexOf(": ");
                if (colon > 0 && colon < 40) {
                    sender = body.substring(0, colon);
                    body = body.substring(colon + 2);
                }
            }
            inbox.add(chat, sender, body, sbn.getPostTime());
        }
        rememberReplyButton(chat, notification);
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        // The Reply button stops working once WhatsApp removes the notification, so it is forgotten with it.
        if (sbn == null || !isWhatsApp(sbn.getPackageName()) || sbn.getNotification() == null || sbn.getNotification().extras == null) return;
        Bundle extras = sbn.getNotification().extras;
        String conversationTitle = text(extras.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE));
        String chat = !conversationTitle.isEmpty() ? conversationTitle : text(extras.getCharSequence(Notification.EXTRA_TITLE));
        if (!chat.isEmpty()) REPLIES.remove(chat.toLowerCase(Locale.ROOT));
    }

    private static void rememberReplyButton(String chat, Notification notification) {
        if (notification.actions == null) return;
        for (Notification.Action action : notification.actions) {
            RemoteInput[] inputs = action.getRemoteInputs();
            if (inputs == null || inputs.length == 0 || action.actionIntent == null) continue;
            String label = text(action.title).toLowerCase(Locale.ROOT);
            if (!label.contains("reply")) continue;
            REPLIES.put(chat.toLowerCase(Locale.ROOT), new ReplyTarget(action.actionIntent, inputs));
            return;
        }
    }

    /** The Reply button of the chat whose name matches (whole name first, then part of it), or null. */
    static ReplyTarget replyFor(String chat) {
        String wanted = chat.toLowerCase(Locale.ROOT).trim();
        if (wanted.isEmpty()) return null;
        ReplyTarget exact = REPLIES.get(wanted);
        if (exact != null) return exact;
        for (Map.Entry<String, ReplyTarget> entry : REPLIES.entrySet()) {
            if (entry.getKey().contains(wanted) || wanted.contains(entry.getKey())) return entry.getValue();
        }
        return null;
    }

    /** Types the text into the chat's Reply button and presses it, so WhatsApp sends it without being opened. */
    static boolean sendReply(android.content.Context context, String chat, String message) {
        ReplyTarget target = replyFor(chat);
        if (target == null) return false;
        try {
            Intent fillIn = new Intent();
            Bundle results = new Bundle();
            for (RemoteInput input : target.inputs) results.putCharSequence(input.getResultKey(), message);
            RemoteInput.addResultsToIntent(target.inputs, fillIn, results);
            target.intent.send(context, 0, fillIn);
            return true;
        } catch (PendingIntent.CanceledException e) {
            // The notification went away between the check and the send.
            REPLIES.remove(chat.toLowerCase(Locale.ROOT));
            return false;
        }
    }

    private static boolean isWhatsApp(String packageName) {
        for (String name : PACKAGES) if (name.equals(packageName)) return true;
        return false;
    }

    private static String text(CharSequence value) {
        return value == null ? "" : value.toString().trim();
    }
}
