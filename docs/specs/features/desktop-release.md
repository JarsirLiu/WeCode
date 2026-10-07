# Desktop Release

## Behavior

- A tag-triggered desktop release builds production installers for Linux x64/arm64, macOS x64/arm64, and Windows x64.
- Production installers use the `ZCode` identity and omit the `_TEST` suffix. Their filenames use the normalized, explicitly selected target architecture (`x64` or `arm64`), not Electron Builder's target-specific `${arch}` expansion, which differs between Linux package formats.
- Each Linux architecture validates the complete AppImage, deb, rpm, and pacman installer set before uploading its artifact. The build log lists generated filenames to make packaging mismatches visible at their source.
- Installer artifact upload paths use one `@actions/glob` pattern per extension; shell brace expansion (`*.{dmg,zip}`) is not supported by `actions/upload-artifact` and must not be used.
- Installer jobs set `ZCODE_SKIP_REMOTE_ASSETS=1`; remote connection assets are built only by the dedicated four-platform matrix job and are never rebuilt during desktop installer packaging.
- The publish job downloads platform artifacts, selects only the 13 expected installer files (8 Linux, 4 macOS, 1 Windows), and ignores auxiliary directories such as unpacked Linux targets. It creates the GitHub Release against the exact triggering `v`-prefixed tag, or uploads/replaces assets on that tag's existing Release to recover a partial publish. The unprefixed version is only the release title and installer version.
- The Release description places a `Download installers` section above the Assets list. It links directly to all 13 installer files by their stable release-download URLs, grouped by operating system and architecture. Remote connection manifests and archives remain Assets-only and are not listed in this section.
- Runtime Release URL resolution treats both the unprefixed application version (`3.14.3`) and GitHub's `v`-prefixed tag (`v3.14.3`) as the same pinned version, and never constructs a duplicate path such as `/v3.14.3/3.14.3/`.

## Ownership and invariants

- `.github/workflows/release-desktop.yml` owns CI build environment selection and artifact handoff between jobs.
- `packages/desktop/electron-builder.config.js` owns installer naming; the workflow must supply `ZCODE_ENV=production` and `ZCODE_PREVIEW_IDENTITY=0` for public releases.
- For tag pushes, the triggering `v`-prefixed tag is the explicit release version used by artifact validation and publication; installer metadata must produce filenames for that version. Manual builds do not infer a release version and only report generated filenames.
- Do not rename Preview/test installers to production filenames; rebuild with production identity instead.
- Missing or empty required installers fail the producing Linux job before artifact upload; missing installers across any platform fail the publish job before GitHub Release mutation.
- The publish job must update the description after create and retry paths alike, preserving generated changelog text below the installer section. A retry must not create duplicate installer sections.

## Recovery boundary

- A failed run does not create or mutate a GitHub Release when installer validation fails. If asset upload partially succeeds, retrying the same tag replaces the named installer assets without treating auxiliary artifact directories as upload inputs.
- To retry the same version after correcting the workflow, confirm that no GitHub Release was created, then explicitly move the same version tag to the corrected commit and rerun its tag workflow. Never change the version or move a tag implicitly.
