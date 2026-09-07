package com.lindseywebsolutions.seconddeck;

import android.app.Activity;
import android.app.AppOpsManager;
import android.app.Presentation;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.hardware.display.DisplayManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Process;
import android.provider.Settings;
import android.util.Base64;
import android.view.Display;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "SecondDisplay")
public class SecondDisplayPlugin extends Plugin {
    private CompanionPresentation presentation;

    @PluginMethod
    public void getDisplays(PluginCall call) {
        call.resolve(displayState());
    }

    @PluginMethod
    public void getRuntimeState(PluginCall call) {
        JSObject response = displayState();
        boolean usageAccess = hasUsageAccess();
        response.put("usageAccessGranted", usageAccess);
        if (usageAccess) {
            JSObject foreground = recentForegroundApp();
            if (foreground != null) {
                response.put("foregroundPackage", foreground.getString("packageName"));
                response.put("foregroundDetectedAt", foreground.optLong("detectedAt"));
            }
        }
        call.resolve(response);
    }

    @PluginMethod
    public void openUsageAccessSettings(PluginCall call) {
        Activity activity = getActivity();
        try {
            Intent intent = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
            activity.startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("Unable to open Android Usage Access settings", error);
        }
    }

    private JSObject displayState() {
        DisplayManager manager = (DisplayManager) getContext().getSystemService(Context.DISPLAY_SERVICE);
        Display[] displays = manager.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION);
        JSArray result = new JSArray();
        for (Display display : displays) {
            JSObject item = new JSObject();
            item.put("id", display.getDisplayId());
            item.put("name", display.getName());
            item.put("state", display.getState());
            result.put(item);
        }
        JSObject response = new JSObject();
        response.put("displays", result);
        response.put("isExtended", displays.length > 0);
        return response;
    }

    private boolean hasUsageAccess() {
        AppOpsManager manager = (AppOpsManager) getContext().getSystemService(Context.APP_OPS_SERVICE);
        int mode = manager.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), getContext().getPackageName());
        return mode == AppOpsManager.MODE_ALLOWED;
    }

    private JSObject recentForegroundApp() {
        UsageStatsManager manager = (UsageStatsManager) getContext().getSystemService(Context.USAGE_STATS_SERVICE);
        long end = System.currentTimeMillis();
        UsageEvents events = manager.queryEvents(end - 30 * 60 * 1000L, end);
        UsageEvents.Event event = new UsageEvents.Event();
        String packageName = null;
        long detectedAt = 0;
        while (events.hasNextEvent()) {
            events.getNextEvent(event);
            int type = event.getEventType();
            if ((type == UsageEvents.Event.MOVE_TO_FOREGROUND || type == UsageEvents.Event.ACTIVITY_RESUMED)
                && !getContext().getPackageName().equals(event.getPackageName())
                && event.getTimeStamp() >= detectedAt) {
                packageName = event.getPackageName();
                detectedAt = event.getTimeStamp();
            }
        }
        if (packageName == null) return null;
        JSObject result = new JSObject();
        result.put("packageName", packageName);
        result.put("detectedAt", detectedAt);
        return result;
    }

    @PluginMethod
    public void showCompanion(PluginCall call) {
        DisplayManager manager = (DisplayManager) getContext().getSystemService(Context.DISPLAY_SERVICE);
        Display[] displays = manager.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION);
        if (displays.length == 0) {
            call.reject("No secondary display is available");
            return;
        }
        JSObject deck = call.getObject("deck");
        if (deck == null) {
            call.reject("A validated Deck is required");
            return;
        }
        String deckJson = deck.toString();
        if (deckJson.getBytes(StandardCharsets.UTF_8).length > 65536) {
            call.reject("Deck data exceeds the 64 KiB companion limit");
            return;
        }
        String encodedDeck = Base64.encodeToString(deckJson.getBytes(StandardCharsets.UTF_8), Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
        Activity activity = getActivity();
        activity.runOnUiThread(() -> {
            if (presentation != null) presentation.dismiss();
            presentation = new CompanionPresentation(activity, displays[0], encodedDeck);
            presentation.show();
            call.resolve();
        });
    }

    @Override
    protected void handleOnDestroy() {
        if (presentation != null) presentation.dismiss();
        presentation = null;
    }

    private static class CompanionPresentation extends Presentation {
        private final String encodedDeck;
        CompanionPresentation(Context context, Display display, String encodedDeck) {
            super(context, display);
            this.encodedDeck = encodedDeck;
        }
        @Override
        protected void onCreate(Bundle savedInstanceState) {
            super.onCreate(savedInstanceState);
            WebView webView = new WebView(getContext());
            WebSettings settings = webView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setAllowFileAccess(true);
            settings.setAllowContentAccess(false);
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            webView.loadUrl("file:///android_asset/public/index.html?mode=companion#deck=" + encodedDeck);
            setContentView(webView);
        }
    }
}
