# Spec: lite-mode

> Delta spec for the spark-messaging-center change.
> Covers auto-detection of low RAM, blur disabling, font localization, radar interval adjustment, and GIF optimization.

---

## ADDED Requirements

### Requirement: Auto-Detection of Low RAM

The system MUST auto-detect machines with ≤ 8 GB of total RAM and activate lite mode automatically. Lite mode MAY also be force-enabled via the `SPARK_LITE=1` environment variable or the `?lite=1` URL parameter. A manual override via `SPARK_LITE=0` MUST disable lite mode even on low-RAM machines.

**Scenario: Auto-detect on a machine with 8 GB RAM**

- **Given** the host machine has exactly 8 GB of total RAM and no `SPARK_LITE` environment variable is set
- **When** the application starts
- **Then** the system MUST activate lite mode automatically and apply all lite-mode optimizations.

**Scenario: Manual override disables lite mode on low-RAM machine**

- **Given** the host machine has 6 GB of total RAM and `SPARK_LITE=0` is set in the environment
- **When** the application starts
- **Then** the system MUST NOT activate lite mode, regardless of the detected RAM.

**Scenario: URL parameter forces lite mode on a high-RAM machine**

- **Given** the host machine has 32 GB of RAM and no `SPARK_LITE` environment variable is set
- **When** the application loads the renderer with `?lite=1` in the URL
- **Then** the system MUST activate lite mode for that renderer session.

---

### Requirement: Blur Disabling

In lite mode, the system MUST disable all `backdrop-filter` blur effects and use solid background colors instead. This applies to all UI elements including the chat panel, speech bubbles, and any overlay surfaces.

**Scenario: Lite mode replaces blur with solid backgrounds**

- **Given** lite mode is active
- **When** the renderer applies CSS styles
- **Then** all elements that use `backdrop-filter` in non-lite mode MUST instead use solid background colors with no blur, and non-essential CSS animations (bubble pop, pulse dots, shadow) MUST be disabled.

**Scenario: Non-lite mode retains blur effects**

- **Given** lite mode is not active
- **When** the renderer applies CSS styles
- **Then** `backdrop-filter` blur effects and non-essential animations MUST remain enabled as in the current behavior.

---

### Requirement: Font Localization

In lite mode, the system MUST use local font files (`.woff2`) via `@font-face` declarations instead of loading fonts from the Google Fonts CDN. The system SHOULD download and bundle Outfit (400, 600, 700) and JetBrains Mono (400) as `.woff2` files. If the local font files are unavailable or download fails, the system MUST fall back to a system font stack.

**Scenario: Lite mode uses local fonts**

- **Given** lite mode is active and local `.woff2` font files are present
- **When** the renderer loads styles
- **Then** the system MUST apply `@font-face` declarations pointing to the local `.woff2` files and MUST NOT make any requests to the Google Fonts CDN.

**Scenario: Font files missing — fallback to system stack**

- **Given** lite mode is active but the local `.woff2` font files are not present
- **When** the renderer loads styles
- **Then** the system MUST fall back to the system font stack (`-apple-system, 'Segoe UI', sans-serif` for body text and `'Consolas', monospace` for code) and MUST NOT error or crash.

---

### Requirement: Radar Interval Adjustment

In lite mode, the system MUST increase the Agent Radar scan interval from the default 12 seconds to 30 seconds to reduce CPU usage. The radar interval MUST be configurable so that lite mode changes only the default value without preventing manual configuration.

**Scenario: Lite mode slows radar to 30-second interval**

- **Given** lite mode is active and the radar module initializes
- **When** the Agent Radar begins scanning
- **Then** the scan interval MUST be 30 seconds between scans instead of the default 12 seconds.

**Scenario: Non-lite mode retains 12-second interval**

- **Given** lite mode is not active
- **When** the Agent Radar begins scanning
- **Then** the scan interval MUST remain at the default 12 seconds.

---

### Requirement: GIF Optimization and Wander Disabling

In lite mode, the system MUST disable the Wander engine so the window remains stationary. The system MAY reduce GIF-related processing overhead. These optimizations MUST NOT affect character skin display — the avatar GIF MUST still render.

**Scenario: Wander engine disabled in lite mode**

- **Given** lite mode is active
- **When** the application initializes the Wander engine
- **Then** the Wander engine MUST remain disabled (always off) and the window MUST NOT move from its position, even if previously enabled by the user.

**Scenario: Character GIF still displays in lite mode**

- **Given** lite mode is active and a character skin is selected
- **When** the renderer displays the avatar
- **Then** the character GIF MUST still render and animate, and the selected character skin MUST display correctly.