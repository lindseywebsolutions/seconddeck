package com.lindseywebsolutions.seconddeck;

import android.content.Context;
import android.inputmethodservice.InputMethodService;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.inputmethod.InputConnection;
import android.view.inputmethod.InputMethodInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.TextView;
import java.lang.ref.WeakReference;

public class SecondDeckInputMethodService extends InputMethodService {
    private static WeakReference<SecondDeckInputMethodService> activeService = new WeakReference<>(null);
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    @Override
    public void onCreate() {
        super.onCreate();
        activeService = new WeakReference<>(this);
    }

    @Override
    public void onDestroy() {
        if (activeService.get() == this) activeService.clear();
        super.onDestroy();
    }

    @Override
    public View onCreateInputView() {
        TextView status = new TextView(this);
        status.setText("SecondDeck keyboard active · type from the companion screen");
        status.setTextColor(0xffb8c4c0);
        status.setBackgroundColor(0xff091012);
        status.setGravity(Gravity.CENTER);
        status.setTextSize(12);
        status.setPadding(12, 8, 12, 8);
        return status;
    }

    static boolean hasConnection() {
        SecondDeckInputMethodService service = activeService.get();
        return service != null && service.getCurrentInputConnection() != null;
    }

    static boolean commitFromCompanion(String text) {
        SecondDeckInputMethodService service = activeService.get();
        if (service == null || text == null || text.length() == 0 || text.length() > 256) return false;
        InputConnection connection = service.getCurrentInputConnection();
        if (connection == null) return false;
        service.mainHandler.post(() -> {
            InputConnection current = service.getCurrentInputConnection();
            if (current != null) current.commitText(text, 1);
        });
        return true;
    }

    static boolean sendKeyFromCompanion(String name) {
        SecondDeckInputMethodService service = activeService.get();
        if (service == null || service.getCurrentInputConnection() == null) return false;
        int keyCode;
        switch (name) {
            case "BACKSPACE": keyCode = KeyEvent.KEYCODE_DEL; break;
            case "ENTER": keyCode = KeyEvent.KEYCODE_ENTER; break;
            case "TAB": keyCode = KeyEvent.KEYCODE_TAB; break;
            case "ESCAPE": keyCode = KeyEvent.KEYCODE_ESCAPE; break;
            case "DPAD_UP": keyCode = KeyEvent.KEYCODE_DPAD_UP; break;
            case "DPAD_DOWN": keyCode = KeyEvent.KEYCODE_DPAD_DOWN; break;
            case "DPAD_LEFT": keyCode = KeyEvent.KEYCODE_DPAD_LEFT; break;
            case "DPAD_RIGHT": keyCode = KeyEvent.KEYCODE_DPAD_RIGHT; break;
            default: return false;
        }
        service.mainHandler.post(() -> {
            InputConnection current = service.getCurrentInputConnection();
            if (current == null) return;
            long now = android.os.SystemClock.uptimeMillis();
            current.sendKeyEvent(new KeyEvent(now, now, KeyEvent.ACTION_DOWN, keyCode, 0));
            current.sendKeyEvent(new KeyEvent(now, now, KeyEvent.ACTION_UP, keyCode, 0));
        });
        return true;
    }

    static boolean isEnabled(Context context) {
        InputMethodManager manager = (InputMethodManager) context.getSystemService(Context.INPUT_METHOD_SERVICE);
        String packageName = context.getPackageName();
        for (InputMethodInfo info : manager.getEnabledInputMethodList()) {
            if (packageName.equals(info.getPackageName()) && SecondDeckInputMethodService.class.getName().equals(info.getServiceName())) return true;
        }
        return false;
    }

    static boolean isSelected(Context context) {
        String selected = Settings.Secure.getString(context.getContentResolver(), Settings.Secure.DEFAULT_INPUT_METHOD);
        return selected != null && selected.contains(context.getPackageName()) && selected.contains(SecondDeckInputMethodService.class.getSimpleName());
    }
}
