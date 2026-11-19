package com.brandigail.volita;

import android.Manifest;
import android.database.Cursor;
import android.provider.ContactsContract;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Reads the phone's address book once, when the person taps "Pick from my phone" and allows it, and hands the web page only a
 * name, a number and an email for each person. The web page shows a tick-list, and only the people ticked are ever sent anywhere.
 */
@CapacitorPlugin(
        name = "VolitaContacts",
        permissions = {@Permission(strings = {Manifest.permission.READ_CONTACTS}, alias = "contacts")})
public class VolitaContactsPlugin extends Plugin {
    /** A bigger address book is brought in over more than one go. */
    private static final int MAX_CONTACTS = 500;

    private static final class Person {
        String name = "";
        String phone = "";
        boolean phoneIsMobile = false;
        String email = "";
    }

    /** Asks for permission if needed, then returns every person who has a number or an email. */
    @PluginMethod
    public void read(PluginCall call) {
        if (getPermissionState("contacts") != PermissionState.GRANTED) {
            requestPermissionForAlias("contacts", call, "afterPermission");
            return;
        }
        readContacts(call);
    }

    @PermissionCallback
    private void afterPermission(PluginCall call) {
        if (getPermissionState("contacts") == PermissionState.GRANTED) {
            readContacts(call);
        } else {
            call.reject("denied");
        }
    }

    private void readContacts(PluginCall call) {
        try {
            Map<Long, Person> people = new LinkedHashMap<>();
            collectNumbers(people);
            collectEmails(people);
            JSArray list = new JSArray();
            for (Person person : people.values()) {
                if (list.length() >= MAX_CONTACTS) break;
                if (person.name.trim().isEmpty() || (person.phone.isEmpty() && person.email.isEmpty())) continue;
                list.put(new JSObject().put("name", person.name).put("phone", person.phone).put("email", person.email));
            }
            call.resolve(new JSObject().put("contacts", list));
        } catch (SecurityException e) {
            call.reject("denied");
        } catch (RuntimeException e) {
            call.reject("Could not read the contacts.");
        }
    }

    private void collectNumbers(Map<Long, Person> people) {
        String[] columns = {
            ContactsContract.CommonDataKinds.Phone.CONTACT_ID,
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
            ContactsContract.CommonDataKinds.Phone.NUMBER,
            ContactsContract.CommonDataKinds.Phone.TYPE,
        };
        try (Cursor cursor = getContext().getContentResolver().query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI, columns, null, null,
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " COLLATE NOCASE ASC")) {
            if (cursor == null) return;
            while (cursor.moveToNext()) {
                Person person = personFor(people, cursor.getLong(0), cursor.getString(1));
                String number = cursor.getString(2);
                boolean mobile = cursor.getInt(3) == ContactsContract.CommonDataKinds.Phone.TYPE_MOBILE;
                if (number == null || number.trim().isEmpty()) continue;
                // The first number is kept, unless a later one is a mobile and the first was not.
                if (person.phone.isEmpty() || (mobile && !person.phoneIsMobile)) {
                    person.phone = number.trim();
                    person.phoneIsMobile = mobile;
                }
            }
        }
    }

    private void collectEmails(Map<Long, Person> people) {
        String[] columns = {
            ContactsContract.CommonDataKinds.Email.CONTACT_ID,
            ContactsContract.CommonDataKinds.Email.DISPLAY_NAME,
            ContactsContract.CommonDataKinds.Email.ADDRESS,
        };
        try (Cursor cursor = getContext().getContentResolver().query(
                ContactsContract.CommonDataKinds.Email.CONTENT_URI, columns, null, null, null)) {
            if (cursor == null) return;
            while (cursor.moveToNext()) {
                Person person = personFor(people, cursor.getLong(0), cursor.getString(1));
                String address = cursor.getString(2);
                if (person.email.isEmpty() && address != null) person.email = address.trim();
            }
        }
    }

    private static Person personFor(Map<Long, Person> people, long id, String name) {
        Person person = people.get(id);
        if (person == null) {
            person = new Person();
            people.put(id, person);
        }
        if (person.name.isEmpty() && name != null) person.name = name;
        return person;
    }
}
