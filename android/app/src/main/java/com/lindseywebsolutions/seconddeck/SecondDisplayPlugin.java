package com.lindseywebsolutions.seconddeck;

import android.app.Activity;
import android.app.Presentation;
import android.content.Context;
import android.hardware.display.DisplayManager;
import android.os.Bundle;
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
