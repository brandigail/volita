package com.brandigail.volita;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * A private copy, kept only on this phone, of the WhatsApp messages that arrived as notifications. It lets the assistant
 * answer "catch me up with Abigail" without anyone opening WhatsApp. Nothing here is sent anywhere by this class: the web
 * app asks for a chat and decides what to pass to the assistant. Messages older than {@link #KEEP_DAYS} are deleted.
 */
final class WhatsAppInbox extends SQLiteOpenHelper {
    private static final String NAME = "whatsapp_inbox.db";
    private static final int VERSION = 1;
    static final int KEEP_DAYS = 7;
    private static final long DAY_MS = 24L * 60 * 60 * 1000;
    /** Most messages kept for one chat, so a noisy group cannot fill the phone. */
    private static final int MAX_PER_CHAT = 200;

    private static WhatsAppInbox instance;

    static synchronized WhatsAppInbox get(Context context) {
        if (instance == null) instance = new WhatsAppInbox(context.getApplicationContext());
        return instance;
    }

    private WhatsAppInbox(Context context) {
        super(context, NAME, null, VERSION);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE messages ("
                + "id INTEGER PRIMARY KEY AUTOINCREMENT,"
                + "chat TEXT NOT NULL,"
                + "sender TEXT NOT NULL,"
                + "body TEXT NOT NULL,"
                + "ts INTEGER NOT NULL,"
                + "UNIQUE(chat, ts, body))");
        db.execSQL("CREATE INDEX messages_chat_ts ON messages (chat, ts)");
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        // Version 1 is the only one so far.
    }

    /** Stores one message. The same message seen twice (a notification updated) is kept once. */
    void add(String chat, String sender, String body, long timestamp) {
        SQLiteDatabase db = getWritableDatabase();
        ContentValues row = new ContentValues();
        row.put("chat", chat);
        row.put("sender", sender);
        row.put("body", body);
        row.put("ts", timestamp);
        db.insertWithOnConflict("messages", null, row, SQLiteDatabase.CONFLICT_IGNORE);
        db.delete("messages", "ts < ?", new String[] {String.valueOf(System.currentTimeMillis() - KEEP_DAYS * DAY_MS)});
        db.execSQL("DELETE FROM messages WHERE chat = ? AND id NOT IN "
                + "(SELECT id FROM messages WHERE chat = ? ORDER BY ts DESC LIMIT " + MAX_PER_CHAT + ")", new Object[] {chat, chat});
    }

    /** The newest messages of one chat (matched on part of its name, ignoring case), oldest first. */
    JSONArray read(String chat, int limit) throws JSONException {
        SQLiteDatabase db = getReadableDatabase();
        JSONArray out = new JSONArray();
        try (Cursor cursor = db.rawQuery(
                "SELECT chat, sender, body, ts FROM messages WHERE chat LIKE ? ESCAPE '\\' ORDER BY ts DESC LIMIT ?",
                new String[] {"%" + escapeLike(chat) + "%", String.valueOf(limit)})) {
            while (cursor.moveToNext()) out.put(message(cursor));
        }
        // Newest first from the query; the assistant reads a conversation oldest first.
        JSONArray ordered = new JSONArray();
        for (int i = out.length() - 1; i >= 0; i--) ordered.put(out.get(i));
        return ordered;
    }

    /** One entry per chat that had a message since `sinceMs`, newest first: its name, how many messages and the last one. */
    JSONArray chats(long sinceMs, int limit) throws JSONException {
        SQLiteDatabase db = getReadableDatabase();
        JSONArray out = new JSONArray();
        try (Cursor cursor = db.rawQuery(
                "SELECT chat, COUNT(*) AS n, MAX(ts) AS last FROM messages WHERE ts >= ? GROUP BY chat ORDER BY last DESC LIMIT ?",
                new String[] {String.valueOf(sinceMs), String.valueOf(limit)})) {
            while (cursor.moveToNext()) {
                out.put(new JSONObject()
                        .put("chat", cursor.getString(0))
                        .put("count", cursor.getInt(1))
                        .put("lastTime", cursor.getLong(2)));
            }
        }
        return out;
    }

    int count() {
        try (Cursor cursor = getReadableDatabase().rawQuery("SELECT COUNT(*) FROM messages", null)) {
            return cursor.moveToFirst() ? cursor.getInt(0) : 0;
        }
    }

    void clear() {
        getWritableDatabase().delete("messages", null, null);
    }

    private static JSONObject message(Cursor cursor) throws JSONException {
        return new JSONObject()
                .put("chat", cursor.getString(0))
                .put("sender", cursor.getString(1))
                .put("text", cursor.getString(2))
                .put("time", cursor.getLong(3));
    }

    private static String escapeLike(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
