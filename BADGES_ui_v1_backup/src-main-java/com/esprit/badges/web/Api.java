package com.esprit.badges.web;

import java.util.LinkedHashMap;
import java.util.Map;

/** Fabrique des reponses JSON du type {"success": true, ...}. */
public final class Api {

    private Api() { }

    /** ok("user", u, "badges", list) donne {"success":true,"user":u,"badges":list}. */
    public static Map<String, Object> ok(Object... keysAndValues) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", true);
        for (int i = 0; i < keysAndValues.length; i += 2) {
            body.put((String) keysAndValues[i], keysAndValues[i + 1]);
        }
        return body;
    }

    public static Map<String, Object> error(String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", false);
        body.put("message", message);
        return body;
    }
}
