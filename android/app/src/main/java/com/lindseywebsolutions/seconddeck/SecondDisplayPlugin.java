package com.lindseywebsolutions.seconddeck;

import android.app.Activity;
import android.app.Presentation;
import android.content.Context;
import android.hardware.display.DisplayManager;
import android.os.Bundle;
import android.view.Display;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SecondDisplay")
public class SecondDisplayPlugin extends Plugin {
    private CompanionPresentation presentation;

    @PluginMethod
    public void getDisplays(PluginCall call) {
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
        call.resolve(response);
    }

    @PluginMethod
    public void showCompanion(PluginCall call) {
        DisplayManager manager = (DisplayManager) getContext().getSystemService(Context.DISPLAY_SERVICE);
        Display[] displays = manager.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION);
        if (displays.length == 0) {
            call.reject("No secondary display is available");
            return;
        }
        String path = call.getString("path", "index.html?mode=companion");
        Activity activity = getActivity();
        activity.runOnUiThread(() -> {
            if (presentation != null) presentation.dismiss();
            presentation = new CompanionPresentation(activity, displays[0], path);
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
        private final String path;
        CompanionPresentation(Context context, Display display, String path) {
            super(context, display);
            this.path = path;
        }
        @Override
        protected void onCreate(Bundle savedInstanceState) {
            super.onCreate(savedInstanceState);
            WebView webView = new WebView(getContext());
            WebSettings settings = webView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setAllowFileAccess(true);
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            webView.loadUrl("file:///android_asset/public/" + path.replaceFirst("^/+", ""));
            setContentView(webView);
        }
    }
}
