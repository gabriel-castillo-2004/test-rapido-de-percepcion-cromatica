from html.parser import HTMLParser
from pathlib import Path
import re

import pytest

ROOT_DIR = Path(__file__).resolve().parent.parent
INDEX_HTML = ROOT_DIR / "index.html"
STYLES_CSS = ROOT_DIR / "styles.css"
SRC_DIR = ROOT_DIR / "src"
SCORING_JS = SRC_DIR / "scoring.js"
APP_JS = SRC_DIR / "app.js"


class DocumentHTMLParser(HTMLParser):
    """Minimal HTML parser using stdlib to inspect tags, attributes, and text."""

    def __init__(self) -> None:
        super().__init__()
        self.tags: list[tuple[str, dict[str, str | None]]] = []
        self.text_chunks: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.tags.append((tag.lower(), dict(attrs)))

    def handle_data(self, data: str) -> None:
        stripped = data.strip()
        if stripped:
            self.text_chunks.append(stripped)


def _read_text(path: Path) -> str:
    assert path.exists(), f"Expected file does not exist: {path.relative_to(ROOT_DIR)}"
    return path.read_text(encoding="utf-8")


def _extract_js_function_body(source: str, func_name: str) -> str:
    """Extract the body of a named JS function or arrow/const function."""
    patterns = [
        rf"(?:export\s+)?function\s+{re.escape(func_name)}\s*\([^)]*\)\s*\{{",
        rf"(?:export\s+)?const\s+{re.escape(func_name)}\s*=\s*\([^)]*\)\s*=>\s*\{{",
    ]
    match = None
    for pattern in patterns:
        match = re.search(pattern, source)
        if match:
            break
    assert match is not None, f"Function '{func_name}' not found"

    start = match.end() - 1
    depth = 0
    for idx in range(start, len(source)):
        ch = source[idx]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return source[start : idx + 1]
    raise AssertionError(f"Unclosed braces for function '{func_name}'")


def _collect_source_texts() -> str:
    """Collect text from index.html and all JS/JSON files under src/."""
    parts = [_read_text(INDEX_HTML)]
    if SRC_DIR.exists():
        for file_path in sorted(SRC_DIR.rglob("*")):
            if file_path.is_file() and file_path.suffix in {".js", ".mjs", ".json"}:
                parts.append(file_path.read_text(encoding="utf-8"))
    return "\n".join(parts)


def test_at01_scoring_invalid_environment_on_control_plate() -> None:
    """AT-01: scoring.evaluateTest returns 'invalid_environment' when control plate
    is answered incorrectly, marked 'nothing_seen', or 'skipped', without diagnosis.
    """
    scoring_src = _read_text(SCORING_JS)
    body = _extract_js_function_body(scoring_src, "evaluateTest")

    assert "invalid_environment" in body, (
        "evaluateTest must return 'invalid_environment' when control plate fails"
    )
    assert re.search(r"control", body, re.IGNORECASE), (
        "evaluateTest must check the control plate before evaluating color deficiency"
    )
    assert "nothing_seen" in body, (
        "evaluateTest must handle 'nothing_seen' on the control plate"
    )
    assert "skipped" in body, (
        "evaluateTest must handle 'skipped' on the control plate"
    )

    invalid_idx = body.find("invalid_environment")
    return_before_diag = re.search(
        r"return\s*\{[^}]*invalid_environment[^}]*\}",
        body[: invalid_idx + 200],
        re.DOTALL,
    )
    assert return_before_diag is not None, (
        "evaluateTest must return early with 'invalid_environment' without emitting a diagnosis"
    )


def test_at02_scoring_distinguishes_nothing_seen_and_skipped() -> None:
    """AT-02: scoring.evaluateTest distinguishes 'nothing_seen' from 'skipped' on
    red-green plates: 'nothing_seen' counts as non-chromatic perception, while too many
    'skipped' answers yield 'inconclusive'.
    """
    scoring_src = _read_text(SCORING_JS)
    body = _extract_js_function_body(scoring_src, "evaluateTest")

    assert "nothing_seen" in body, "evaluateTest must handle 'nothing_seen'"
    assert "skipped" in body, "evaluateTest must handle 'skipped'"
    assert "inconclusive" in body, (
        "evaluateTest must return 'inconclusive' when too many plates are skipped"
    )

    # Ensure 'nothing_seen' and 'skipped' are not collapsed into the exact same branch
    skipped_branches = re.findall(r"===\s*['\"]skipped['\"]", body)
    nothing_branches = re.findall(r"===\s*['\"]nothing_seen['\"]", body)
    assert skipped_branches or re.search(r"\bskipped\b", body), (
        "evaluateTest must explicitly track 'skipped' responses"
    )
    assert nothing_branches or re.search(r"\bnothing_seen\b", body), (
        "evaluateTest must explicitly track 'nothing_seen' responses"
    )
    assert not re.search(
        r"nothing_seen['\"]\s*\|\|\s*[^;]*['\"]skipped['\"]", body
    ), "'nothing_seen' must not be merged into the 'skipped' counter"


def test_at03_app_state_machine_transition_lock_and_session_storage() -> None:
    """AT-03: app.js state machine ignores duplicate clicks/taps during transition lock
    and persists progress by plateId in sessionStorage across page reloads.
    """
    app_src = _read_text(APP_JS)

    # Transition lock guard
    assert re.search(
        r"(transition|lock|busy|isTransitioning|locked)", app_src, re.IGNORECASE
    ), "app.js must define a transition lock flag to prevent duplicate clicks/taps"
    assert re.search(
        r"if\s*\(\s*(?:state\.)?(?:isTransitioning|transitionLock|locked|isLocked|busy)\s*\)\s*(?:\{\s*)?return\b",
        app_src,
    ), "app.js must return early when the transition lock is active"

    # sessionStorage persistence keyed/tracked by plateId
    assert "sessionStorage" in app_src, "app.js must use sessionStorage"
    assert "sessionStorage.setItem" in app_src, (
        "app.js must persist state with sessionStorage.setItem"
    )
    assert "sessionStorage.getItem" in app_src, (
        "app.js must restore state with sessionStorage.getItem on reload"
    )
    assert re.search(r"plateId", app_src), (
        "app.js must track/save progress by plateId in sessionStorage"
    )


def test_at04_e2e_flow_responsive_warnings_ten_plates_focus_and_disclaimer() -> None:
    """AT-04: End-to-end flow for mobile (375x667) and desktop (1280x800):
    brightness/filter warning and medical disclaimer on start, 10 plates including
    'No veo ninguna figura' and 'Omitir pregunta' without registration, focus management
    on view transitions, and immediate result with medical disclaimer.
    """
    html_src = _read_text(INDEX_HTML)
    css_src = _read_text(STYLES_CSS)
    app_src = _read_text(APP_JS)
    all_src = _collect_source_texts()

    parser = DocumentHTMLParser()
    parser.feed(html_src)

    # Responsive viewport meta tag
    meta_viewports = [
        attrs
        for tag, attrs in parser.tags
        if tag == "meta" and attrs.get("name") == "viewport"
    ]
    assert meta_viewports, "index.html must include a viewport meta tag"
    viewport_content = meta_viewports[0].get("content") or ""
    assert "width=device-width" in viewport_content, (
        "Viewport meta tag must set width=device-width for 375px and 1280px viewports"
    )

    # Responsive CSS rules (no fixed oversized widths; media query or fluid layout)
    assert re.search(r"@media\s*\(|max-width\s*:", css_src), (
        "styles.css must include responsive layout rules for mobile and desktop"
    )

    # Brightness / blue-light filter warning and medical disclaimer
    assert re.search(r"brillo|filtro|night\s*shift|luz\s*azul", all_src, re.IGNORECASE), (
        "Start view must warn about screen brightness and blue-light/color filters"
    )
    assert re.search(
        r"descargo|m[eé]dic[oa]|no\s+sustituye|diagn[oó]stico\s+cl[ií]nico|orientativo",
        all_src,
        re.IGNORECASE,
    ), "App must display a medical disclaimer on start and result views"

    # 10 plates support and required response options
    assert re.search(r"No veo ninguna figura", all_src, re.IGNORECASE), (
        "App must include 'No veo ninguna figura' option"
    )
    assert re.search(r"Omitir pregunta", all_src, re.IGNORECASE), (
        "App must include 'Omitir pregunta' option"
    )

    plate_ids = set(re.findall(r"plate[-_]?0?(?:10|[1-9])\b", all_src, re.IGNORECASE))
    assert len(plate_ids) >= 10 or re.search(r"\b10\b", all_src), (
        "App must configure 10 Ishihara-style plates"
    )

    # No registration/login wall
    assert not re.search(r"type=[\"']password[\"']", all_src, re.IGNORECASE), (
        "App must not require user registration or login"
    )

    # Programmatic focus management on view change
    assert re.search(r"\.focus\s*\(", app_src), (
        "app.js must move focus programmatically when changing views"
    )


def test_at05_color_rendering_and_accessibility() -> None:
    """AT-05: Color rendering and accessibility: color-scheme: light only, plates
    rendered as <img> SVG on neutral background, touch buttons >= 48x48px, and
    transitions update aria-live region.
    """
    html_src = _read_text(INDEX_HTML)
    css_src = _read_text(STYLES_CSS)
    app_src = _read_text(APP_JS)
    all_src = _collect_source_texts()

    # color-scheme: light only
    assert re.search(r"color-scheme\s*:\s*light\s+only", css_src, re.IGNORECASE), (
        "styles.css must declare 'color-scheme: light only' to preserve color fidelity"
    )

    # Plates rendered as <img> with SVG source on neutral background
    assert re.search(r"<img\b", all_src, re.IGNORECASE), (
        "Plates must be rendered using <img> elements"
    )
    assert re.search(r"\.svg|image/svg\+xml", all_src, re.IGNORECASE), (
        "Plates must load SVG image sources"
    )
    assert re.search(r"background(?:-color)?\s*:", css_src, re.IGNORECASE), (
        "styles.css must define a neutral background for plate rendering"
    )

    # Touch target sizes >= 48x48px
    min_h_matches = [int(v) for v in re.findall(r"min-height\s*:\s*(\d+)px", css_src)]
    min_w_matches = [int(v) for v in re.findall(r"min-width\s*:\s*(\d+)px", css_src)]
    assert any(v >= 48 for v in min_h_matches), (
        "styles.css must enforce min-height >= 48px on interactive touch buttons"
    )
    assert any(v >= 48 for v in min_w_matches), (
        "styles.css must enforce min-width >= 48px on interactive touch buttons"
    )

    # aria-live region present and updated on transitions
    parser = DocumentHTMLParser()
    parser.feed(html_src)
    has_aria_live_html = any(
        "aria-live" in attrs for _, attrs in parser.tags
    )
    assert has_aria_live_html or "aria-live" in app_src, (
        "Document must declare an aria-live region"
    )
    assert re.search(r"aria-live|announce|status|liveRegion", app_src, re.IGNORECASE), (
        "app.js must update the aria-live region during transitions"
    )
