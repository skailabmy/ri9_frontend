/* ============================================================
   RI9 · OTA updates (Capgo — @capgo/capacitor-updater)
   Auto-update mode: the plugin checks the Capgo channel in the
   background and stages the next web bundle; notifyAppReady()
   confirms the current bundle booted fine so a bad update can
   be rolled back automatically.

   Web/dev is a no-op (the plugin only exists on native).
   First-time setup (run once, needs your Capgo account):
     npx @capgo/cli init
   Then push web-only updates with:
     npm run build && npx @capgo/cli bundle upload
   ============================================================ */
import { Capacitor } from '@capacitor/core';

export async function initOta(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return; // browser/dev — skip

  try {
    const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
    await CapacitorUpdater.notifyAppReady();
  } catch (err) {
    // Never let OTA block the app from working
    console.warn('[ota] updater not active yet:', err);
  }
}
