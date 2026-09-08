package com.lindseywebsolutions.seconddeck;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.content.ComponentName;
import android.content.Context;
import android.graphics.Path;
import android.hardware.display.DisplayManager;
import android.os.Build;
import android.os.Handler;
import android.provider.Settings;
import android.text.TextUtils;
import android.util.DisplayMetrics;
import android.view.Display;
import android.view.accessibility.AccessibilityEvent;
import java.lang.ref.WeakReference;
import java.util.Collection;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * Opt-in gesture bridge for a trackpad Deck. It never retrieves window content:
 * the only observed value is the package attached to a window-state event.
 */
public class SecondDeckTrackpadService extends AccessibilityService {
    private static final Object LOCK = new Object();
    private static WeakReference<SecondDeckTrackpadService> activeService = new WeakReference<>(null);
    private static Set<String> allowedPackages = new HashSet<>();
    private static String foregroundPackage;

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        synchronized (LOCK) {
            activeService = new WeakReference<>(this);
        }
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return;
        CharSequence packageName = event.getPackageName();
        String normalized = packageName == null ? "" : packageName.toString().toLowerCase(Locale.ROOT);
        synchronized (LOCK) {
            foregroundPackage = validPackageName(normalized) && !getPackageName().equals(normalized)
                ? normalized : null;
        }
    }

    @Override
    public void onInterrupt() {}

    @Override
    public void onDestroy() {
        synchronized (LOCK) {
            if (activeService.get() == this) activeService = new WeakReference<>(null);
            allowedPackages = new HashSet<>();
            foregroundPackage = null;
        }
        super.onDestroy();
    }

    static void configureSession(Collection<String> packageNames) {
        Set<String> normalized = new HashSet<>();
        if (packageNames != null) {
            for (String packageName : packageNames) {
                String candidate = packageName == null ? "" : packageName.toLowerCase(Locale.ROOT);
                if (validPackageName(candidate)) normalized.add(candidate);
            }
        }
        synchronized (LOCK) {
            allowedPackages = normalized;
            foregroundPackage = null;
        }
    }

    static void clearSession() {
        synchronized (LOCK) {
            allowedPackages = new HashSet<>();
            foregroundPackage = null;
        }
    }

    static boolean hasConnection() {
        synchronized (LOCK) {
            return activeService.get() != null;
        }
    }

    static boolean targetActive() {
        synchronized (LOCK) {
            return foregroundPackage != null && allowedPackages.contains(foregroundPackage);
        }
    }

    static boolean isEnabled(Context context) {
        String enabled = Settings.Secure.getString(
            context.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (TextUtils.isEmpty(enabled)) return false;
        ComponentName expected = new ComponentName(context, SecondDeckTrackpadService.class);
        TextUtils.SimpleStringSplitter splitter = new TextUtils.SimpleStringSplitter(':');
        splitter.setString(enabled);
        while (splitter.hasNext()) {
            ComponentName current = ComponentName.unflattenFromString(splitter.next());
            if (expected.equals(current)) return true;
        }
        return false;
    }

    static boolean tap(float x, float y) {
        return dispatch(x, y, x, y, 80L);
    }

    static boolean swipe(float startX, float startY, float endX, float endY, long durationMs) {
        return dispatch(startX, startY, endX, endY, durationMs);
    }

    private static boolean dispatch(float startX, float startY, float endX, float endY, long durationMs) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R
            || !validCoordinate(startX) || !validCoordinate(startY)
            || !validCoordinate(endX) || !validCoordinate(endY)
            || !targetActive()) return false;
        SecondDeckTrackpadService service;
        synchronized (LOCK) {
            service = activeService.get();
        }
        if (service == null) return false;
        DisplayManager manager = (DisplayManager) service.getSystemService(Context.DISPLAY_SERVICE);
        Display display = manager == null ? null : manager.getDisplay(Display.DEFAULT_DISPLAY);
        if (display == null || display.getState() != Display.STATE_ON) return false;
        DisplayMetrics metrics = new DisplayMetrics();
        display.getRealMetrics(metrics);
        if (metrics.widthPixels <= 0 || metrics.heightPixels <= 0) return false;
        Path path = new Path();
        path.moveTo(startX * (metrics.widthPixels - 1), startY * (metrics.heightPixels - 1));
        if (startX != endX || startY != endY) {
            path.lineTo(endX * (metrics.widthPixels - 1), endY * (metrics.heightPixels - 1));
        }
        GestureDescription.StrokeDescription stroke = new GestureDescription.StrokeDescription(
            path, 0, clampDuration(durationMs));
        GestureDescription gesture = new GestureDescription.Builder()
            .setDisplayId(Display.DEFAULT_DISPLAY)
            .addStroke(stroke)
            .build();
        new Handler(service.getMainLooper()).post(() -> {
            synchronized (LOCK) {
                if (activeService.get() != service || foregroundPackage == null
                    || !allowedPackages.contains(foregroundPackage)) return;
            }
            service.dispatchGesture(gesture, null, null);
        });
        return true;
    }

    static boolean validCoordinate(float value) {
        return !Float.isNaN(value) && !Float.isInfinite(value) && value >= 0f && value <= 1f;
    }

    static long clampDuration(long value) {
        return Math.max(50L, Math.min(value, 1500L));
    }

    static boolean validPackageName(String value) {
        return value != null && value.length() >= 3 && value.length() <= 200
            && value.matches("[a-z][a-z0-9_]*(\\.[a-z0-9_]+)+");
    }
}
