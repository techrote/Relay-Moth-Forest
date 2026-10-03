"""Offline v4.15 release identity, compatibility and documentation-link checks."""
from pathlib import Path
import json
import re
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[2]


def text(path):
    return (ROOT / path).read_text(encoding='utf-8')


def prose(source):
    lines = []
    fence = None
    for line in source.splitlines():
        marker = re.match(r'^\s*(`{3,}|~{3,})', line)
        if marker:
            if fence is None:
                fence = marker.group(1)[0]
            elif marker.group(1)[0] == fence:
                fence = None
            continue
        if fence is None:
            lines.append(line)
    return '\n'.join(lines)


def anchors(source):
    result = set(re.findall(r'\bid=["\']([^"\']+)', source))
    seen = {}
    for heading in re.findall(r'^#{1,6}\s+(.+?)\s*#*$', prose(source), re.M):
        heading = re.sub(r'\[([^]]+)\]\([^)]*\)', r'\1', heading)
        slug = re.sub(r'[^\w\- ]', '', heading.lower()).replace(' ', '-')
        count = seen.get(slug, 0)
        seen[slug] = count + 1
        result.add(slug + (f'-{count}' if count else ''))
    return result


def main():
    docs = [ROOT / 'README.md', *sorted((ROOT / 'docs').glob('*.md')),
            *sorted((ROOT / 'wiki').glob('*.md')),
            ROOT / 'docs/validation/v4.15/README.md',
            ROOT / 'docs/rag/editor-v415/README.md']
    checked = 0
    for path in docs:
        source = prose(path.read_text(encoding='utf-8'))
        links = re.findall(r'!?\[[^\]\n]*\]\(([^)]+)\)', source)
        links += re.findall(r'^\s*\[[^]]+\]:\s*(\S+)', source, re.M)
        for link in links:
            target = link.strip().strip('<>')
            url = urlsplit(target)
            if url.scheme or url.netloc:
                continue  # External web availability is not an offline gate.
            rel = unquote(url.path)
            resolved = (path.parent / rel).resolve() if rel else path
            if path.parent.name == 'wiki' and rel and not resolved.suffix:
                resolved = resolved.with_suffix('.md')
            assert resolved.is_relative_to(ROOT), (path, target, 'outside repository')
            assert resolved.exists(), (path.relative_to(ROOT), target, 'missing target')
            if url.fragment and resolved.suffix == '.md':
                assert unquote(url.fragment) in anchors(resolved.read_text(encoding='utf-8')), (path.relative_to(ROOT), target, 'missing anchor')
            checked += 1

    for name in ['VERSION.txt', 'README.md', 'index.html', 'game.js',
                 'relay_moth_server.py', 'self_test.py', 'wiki/_Footer.md']:
        source = text(name)
        assert '4.15' in source, name
        assert 'Pretty Graphics Edition 4.14' not in source, name
    assert 'HOW TO PLAY · PRETTY GRAPHICS 4.15' in text('index.html')
    assert "relay-moth-runtime-diagnostics-415.json" in text("game.js")
    assert "version:'4.15'" in text('game.js')
    assert 'Relay Moth Forest v4.15 — on-canvas' in text('editor.js')
    assert '4.15' in text('CHANGELOG.txt').splitlines()[0]
    assert '4.14' in text('CHANGELOG.txt')  # Older entries remain historical.
    expected = {
        'relay_moth_maps.json': 'relay-moth-maps/v3.99',
        'relay_moth_pixel_luts.json': 'relay-moth-luts/v3.99',
        'relay_moth_effects.json': 'relay-moth-effects/v3.99',
        'hd_remake_atlas.json': 'relay-moth-hd-atlas/v4.14',
    }
    for name, schema in expected.items():
        assert json.loads(text(name))['schema'] == schema, name
    assert "VERSION='4.14'" in text('foliagefx.js')
    for key in ['relayMothGraphics400', 'relayMothForestPretty394']:
        assert key in text('game.js'), key
    for path in ['docs/4.14 milestone archive/README.md', 'milestones/v4.14',
                 'docs/rag/editor-v415/09-test-matrix-release-gates.md']:
        assert (ROOT / path).exists(), path
    editor = text('docs/EDITOR.md')
    for term in ['SELECT', 'OBJECT', 'Alt+click', 'SHOW SUPPRESSED', 'RESTORE',
                 'HIDE VISUAL', 'SHOW VISUAL', 'CONVERT TO AUTHORED',
                 'SAVE ANYWAY', 'DOWNLOAD ANYWAY', 'DIRTY PROJECT/ROOM',
                 'read-only', 'inspector', 'migration']:
        assert term in editor, term
    for name in ['docs/EDITOR.md', 'docs/DATA_FORMATS.md',
                 'wiki/Robots-Wildlife-and-Relay-Moths.md', 'wiki/Reference.md']:
        source = text(name).lower()
        assert 'decorative' in source and 'persistent id' in source, name
    for page in ['Getting-Started', 'Rooms-and-Maps', 'Sprites-and-Decoration',
                 'Testing-Your-Mod', 'Recipes', 'Reference']:
        source = text(f'wiki/{page}.md')
        assert 'SELECT' in source and 'RESTORE' in source, page
    for path in [ROOT / 'README.md', ROOT / 'docs/EDITOR.md', ROOT / 'docs/TESTING.md',
                 ROOT / 'docs/ARCHITECTURE.md', ROOT / 'docs/DATA_FORMATS.md']:
        assert '\\`' not in path.read_text(encoding='utf-8'), path.name
    print(f'RELEASE DOCS REGRESSION 4.15 PASS — {checked} local links/anchors; release identity, compatibility and workflow guidance')


if __name__ == '__main__':
    main()
