# CutNova Android Beta v2.6.1 — launcher fix

V2.6.0 sometimes showed the app icon then returned to the Android Home screen. It used Android Browser Helper LauncherActivity, which depends on a browser/TWA launch flow that was not verified on the user's physical device.

The new main Activity is a persistent native Android WebView container for the existing HTTPS CutNova website. It has INTERNET permission, JavaScript, DOM storage, video/audio file chooser, reload, offline WebView cache and an Open CHROME fallback. It does not close itself on startup.

Limitations: embedded WebView may not support local canvas/MediaRecorder export and cannot directly download generated blob videos. Use the CHROME button at the top for local video exports and downloads. Local WebView drafts and Chrome drafts are stored separately; keep original media on the phone. The website has five fixed bottom tabs.

This is a debug-signed sideload beta APK, NOT a Play Store release, not an independent native video engine. The signing key can differ from the original beta; if an update says 'App not installed', back up original video files and uninstall the OLD beta before installing the new one. No private signing key is in the repository.

Do not claim physical Android testing was done until the owner confirms video/audio editing and download on their device. Android automated emulator smoke testing is part of the build.
