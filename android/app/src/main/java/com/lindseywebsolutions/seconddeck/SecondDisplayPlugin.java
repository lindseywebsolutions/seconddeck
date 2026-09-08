package com.lindseywebsolutions.seconddeck;

import android.app.Activity;
import android.app.ActivityManager;
import android.app.AppOpsManager;
import android.app.Presentation;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.display.DisplayManager;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.os.Process;
import android.provider.Settings;
import android.util.Base64;
import android.view.Display;
import android.view.inputmethod.InputMethodManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name = "SecondDisplay")
public class SecondDisplayPlugin extends Plugin {
    private CompanionPresentation presentation;
    private DisplayManager displayManager;
    private final DisplayManager.DisplayListener displayListener = new DisplayManager.DisplayListener() {
        @Override public void onDisplayAdded(int displayId) {}
        @Override public void onDisplayChanged(int displayId) {
            if (presentation != null && presentation.getDisplay().getDisplayId() == displayId
                && presentation.getDisplay().getState() != Display.STATE_ON) dismissPresentation();
        }
        @Override public void onDisplayRemoved(int displayId) {
            if (presentation != null && presentation.getDisplay().getDisplayId() == displayId) dismissPresentation();
        }
    };

    @Override
    public void load() {
        displayManager = (DisplayManager) getContext().getSystemService(Context.DISPLAY_SERVICE);
        displayManager.registerDisplayListener(displayListener, null);
    }

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
        response.put("input", inputState());
        call.resolve(response);
    }

    @PluginMethod
    public void getInputState(PluginCall call) {
        call.resolve(inputState());
    }

    @PluginMethod
    public void openInputMethodSettings(PluginCall call) {
        try {
            getActivity().startActivity(new Intent(Settings.ACTION_INPUT_METHOD_SETTINGS));
            call.resolve();
        } catch (Exception error) {
            call.reject("Unable to open Android keyboard settings", error);
        }
    }

    @PluginMethod
    public void showInputMethodPicker(PluginCall call) {
        Activity activity = getActivity();
        activity.runOnUiThread(() -> {
            InputMethodManager manager = (InputMethodManager) activity.getSystemService(Context.INPUT_METHOD_SERVICE);
            manager.showInputMethodPicker();
            call.resolve();
        });
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
        Display[] displays = displayManager.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION);
        JSArray result = new JSArray();
        for (Display display : displays) {
            JSObject item = new JSObject();
            item.put("id", display.getDisplayId());
            item.put("name", display.getName());
            item.put("state", display.getState());
            Display.Mode mode = display.getMode();
            item.put("widthPixels", mode.getPhysicalWidth());
            item.put("heightPixels", mode.getPhysicalHeight());
            item.put("refreshRateHz", display.getRefreshRate());
            item.put("rotation", display.getRotation());
            result.put(item);
        }
        JSObject response = new JSObject();
        response.put("displays", result);
        response.put("isExtended", displays.length > 0);
        response.put("companionVisible", presentation != null && presentation.isShowing());
        return response;
    }

    private JSObject inputState() {
        return inputState(getContext());
    }

    private static JSObject inputState(Context context) {
        JSObject response = new JSObject();
        response.put("available", true);
        response.put("enabled", SecondDeckInputMethodService.isEnabled(context));
        response.put("selected", SecondDeckInputMethodService.isSelected(context));
        response.put("connected", SecondDeckInputMethodService.hasConnection());
        response.put("trackpadSupported", false);
        response.put("trackpadReason", "Android reserves global pointer injection for system-role applications.");
        return response;
    }

    private void dismissPresentation() {
        Activity activity = getActivity();
        if (activity == null) return;
        activity.runOnUiThread(() -> {
            if (presentation != null) presentation.dismiss();
            presentation = null;
        });
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
        Display[] displays = displayManager.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION);
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
        boolean inputAllowed = deckAllowsKeyboard(deck);
        String encodedDeck = Base64.encodeToString(deckJson.getBytes(StandardCharsets.UTF_8), Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
        Activity activity = getActivity();
        activity.runOnUiThread(() -> {
            if (presentation != null) presentation.dismiss();
            presentation = new CompanionPresentation(activity, displays[0], encodedDeck, inputAllowed);
            presentation.show();
            call.resolve();
        });
    }

    private static boolean deckAllowsKeyboard(JSObject deck) {
        JSONArray permissions = deck.optJSONArray("permissions");
        if (permissions == null) return false;
        boolean declared = false;
        for (int index = 0; index < permissions.length(); index++) {
            if ("keyboard".equals(permissions.optString(index))) declared = true;
        }
        if (!declared) return false;
        JSONObject layout = deck.optJSONObject("layout");
        JSONArray widgets = layout == null ? null : layout.optJSONArray("widgets");
        if (widgets == null) return false;
        for (int index = 0; index < widgets.length(); index++) {
            JSONObject widget = widgets.optJSONObject(index);
            if (widget != null && "keyboard".equals(widget.optString("type"))) return true;
        }
        return false;
    }

    @PluginMethod
    public void dismissCompanion(PluginCall call) {
        dismissPresentation();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        if (displayManager != null) displayManager.unregisterDisplayListener(displayListener);
        dismissPresentation();
    }

    private static JSObject performanceSnapshot(Context context, Display display) {
        JSObject result = new JSObject();
        Intent battery = context.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if (battery != null) {
            int level = battery.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
            int scale = battery.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
            if (level >= 0 && scale > 0) result.put("batteryPercent", level * 100.0 / scale);
            int temperature = battery.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Integer.MIN_VALUE);
            if (temperature != Integer.MIN_VALUE) result.put("batteryTemperatureC", temperature / 10.0);
            int status = battery.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
            result.put("charging", status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL);
        }
        ActivityManager activityManager = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
        ActivityManager.MemoryInfo memory = new ActivityManager.MemoryInfo();
        activityManager.getMemoryInfo(memory);
        result.put("availableMemoryBytes", memory.availMem);
        result.put("totalMemoryBytes", memory.totalMem);
        if (display != null) result.put("refreshRateHz", display.getRefreshRate());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            PowerManager powerManager = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            result.put("thermalStatus", powerManager.getCurrentThermalStatus());
        }
        result.put("sampledAt", System.currentTimeMillis());
        return result;
    }

    private static class MetricsBridge {
        private final Context context;
        private final Display display;
        MetricsBridge(Context context, Display display) {
            this.context = context.getApplicationContext();
            this.display = display;
        }
        @JavascriptInterface
        public String snapshot() {
            return performanceSnapshot(context, display).toString();
        }
    }

    private static class InputBridge {
        private final Context context;
        InputBridge(Context context) {
            this.context = context.getApplicationContext();
        }
        @JavascriptInterface
        public String status() {
            return inputState(context).toString();
        }
        @JavascriptInterface
        public String commitText(String text) {
            JSObject result = new JSObject();
            boolean accepted = text != null && text.length() > 0 && text.length() <= 256
                && SecondDeckInputMethodService.commitFromCompanion(text);
            result.put("ok", accepted);
            if (!accepted) result.put("error", "Select SecondDeck Keyboard and focus a text field in the upper app.");
            return result.toString();
        }
        @JavascriptInterface
        public String sendKey(String key) {
            JSObject result = new JSObject();
            boolean accepted = key != null && SecondDeckInputMethodService.sendKeyFromCompanion(key);
            result.put("ok", accepted);
            if (!accepted) result.put("error", "Select SecondDeck Keyboard and focus a text field in the upper app.");
            return result.toString();
        }
        @JavascriptInterface
        public void openKeyboardSettings() {
            try {
                context.startActivity(new Intent(Settings.ACTION_INPUT_METHOD_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            } catch (Exception ignored) {}
        }
        @JavascriptInterface
        public void showKeyboardPicker() {
            new android.os.Handler(context.getMainLooper()).post(() -> {
                InputMethodManager manager = (InputMethodManager) context.getSystemService(Context.INPUT_METHOD_SERVICE);
                manager.showInputMethodPicker();
            });
        }
    }

    private static class CompanionPresentation extends Presentation {
        private final String encodedDeck;
        private final boolean inputAllowed;
        CompanionPresentation(Context context, Display display, String encodedDeck, boolean inputAllowed) {
            super(context, display);
            this.encodedDeck = encodedDeck;
            this.inputAllowed = inputAllowed;
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
            settings.setSupportMultipleWindows(false);
            webView.addJavascriptInterface(new MetricsBridge(getContext(), getDisplay()), "SecondDeckMetrics");
            if (inputAllowed) webView.addJavascriptInterface(new InputBridge(getContext()), "SecondDeckInput");
            webView.setWebViewClient(new WebViewClient() {
                private boolean handle(Uri uri) {
                    if ("file".equals(uri.getScheme()) && "/android_asset/public/index.html".equals(uri.getPath())) return false;
                    if ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) {
                        try { getContext().startActivity(new Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
                        catch (Exception ignored) {}
                    }
                    return true;
                }
                @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return handle(request.getUrl()); }
                @Override public boolean shouldOverrideUrlLoading(WebView view, String url) { return handle(Uri.parse(url)); }
            });
            webView.loadUrl("file:///android_asset/public/index.html?mode=companion#deck=" + encodedDeck);
            setContentView(webView);
        }
    }
}
