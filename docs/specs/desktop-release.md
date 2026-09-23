# Desktop Release

## Behavior

- A tag-triggered desktop release builds production installers for Linux x64/arm64, macOS x64/arm64, and Windows x64.
- Production installers use the `ZCode` identity and omit the `_TEST` suffix. Their filenames use the normalized, explicitly selected target architecture (`x64` or `arm64`), not Electron Builder's target-specific `${arch}` expansion, which differs between Linux package formats.
- Each Linux architecture validates the complete AppImage, deb, rpm, and pacman installer set before uploading its artifact. The build log lists generated filenames to make packaging mismatches visible at their source.
- The publish job downloads the platform artifacts, validates the complete release set, then creates the GitHub Release against the exact triggering `v`-prefixed tag. The unprefixed version is only the release title and installer version.

## Ownership and invariants

- `.github/workflows/release-desktop.yml` owns CI build environment selection and artifact handoff between jobs.
- `packages/desktop/electron-builder.config.js` owns installer naming; the workflow must supply `ZCODE_ENV=production` and `ZCODE_PREVIEW_IDENTITY=0` for public releases.
- For tag pushes, the triggering `v`-prefixed tag is the explicit release version used by artifact validation and publication; installer metadata must produce filenames for that version. Manual builds do not infer a release version and only report generated filenames.
- Do not rename Preview/test installers to production filenames; rebuild with production identity instead.
- Missing or empty required installers fail the producing Linux job before artifact upload; missing cross-platform installers fail the publish job before GitHub Release mutation.

## Recovery boundary

- A failed run does not create a GitHub Release when installer validation fails.
- To retry the same version after correcting the workflow, confirm that no GitHub Release was created, then explicitly move the same version tag to the corrected commit and rerun its tag workflow. Never change the version or move a tag implicitly.
