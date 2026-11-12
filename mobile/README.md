# OGCE v8.0 mobile packaging

The responsive PWA in `web/` is the currently runnable cross-platform mobile experience.
These directories contain native-wrapper integration specifications, not signed or store-ready
APK/AAB/IPA binaries. Android Studio / Xcode builds, signing identities, device testing and store
submission require platform toolchains and developer accounts.

- Android: use a Trusted Web Activity or Capacitor wrapper pointing to the HTTPS deployment.
- iOS: use WKWebView / Capacitor with the deployed HTTPS origin and an explicit offline asset strategy.
- Keep authentication in platform secure storage; never put service tokens in the web bundle.
