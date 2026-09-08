package com.lindseywebsolutions.seconddeck;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class SecondDeckTrackpadServiceTest {
    @Test
    public void normalizedCoordinatesFailClosed() {
        assertTrue(SecondDeckTrackpadService.validCoordinate(0f));
        assertTrue(SecondDeckTrackpadService.validCoordinate(1f));
        assertFalse(SecondDeckTrackpadService.validCoordinate(-0.01f));
        assertFalse(SecondDeckTrackpadService.validCoordinate(Float.NaN));
        assertFalse(SecondDeckTrackpadService.validCoordinate(Float.POSITIVE_INFINITY));
    }

    @Test
    public void gestureDurationsAreBounded() {
        assertEquals(50L, SecondDeckTrackpadService.clampDuration(-1L));
        assertEquals(600L, SecondDeckTrackpadService.clampDuration(600L));
        assertEquals(1500L, SecondDeckTrackpadService.clampDuration(5000L));
    }

    @Test
    public void targetPackagesMustBeExactAndroidPackageNames() {
        assertTrue(SecondDeckTrackpadService.validPackageName("com.example.game"));
        assertFalse(SecondDeckTrackpadService.validPackageName("com.example.game.demo*"));
        assertFalse(SecondDeckTrackpadService.validPackageName("single"));
        assertFalse(SecondDeckTrackpadService.validPackageName("com.Example.game"));
    }
}
