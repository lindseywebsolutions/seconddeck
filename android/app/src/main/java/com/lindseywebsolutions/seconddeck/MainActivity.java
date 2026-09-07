package com.lindseywebsolutions.seconddeck;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SecondDisplayPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
