# CutNova Android Beta APK

This is a GitHub Actions-built Android browser-backed launcher for the same CutNova PWA used on iOS and Android. It is an actual installable Android APK, **not** a standalone native video rendering engine. The installed browser provides rendering, downloads, storage, and permissions.

Because the project site is hosted below https://addachai03-stack.github.io/index.html-/ and Digital Asset Links must be at the host root, TWA verification isn't configured. Android Browser Helper can fall back to a visible Custom Tab; the address bar may remain. The site has a fixed bottom tab bar on mobile screens. Browser-specific limitations still apply.

To build: GitHub Actions -> CutNova Android Beta APK. The CI build uses **debug signing for sideload testing only**. Updates built on different clean runners may have different signatures and require uninstall/reinstall; do not publish this key as a Play Store release key. Do not store credentials or private signing keys in the repository.

Install: download the APK to an Android phone, allow the browser/file manager to install apps if asked, then open CutNova. Do not uninstall existing versions without backing up drafts from that browser; media in browser storage can be evicted.
