# Testing Your Mod

## Launch through the local server

Use:

```text
0Play.cmd
```

or:

```text
python relay_moth_server.py
```

Do not rely on opening `index.html` directly with `file://`; browser security and fetch behavior differ.

## Run the self-test

From the repository root:

```text
python self_test.py
```

The test suite checks substantially more than JSON syntax.

Current coverage includes:

- nine-room story/map relationship;
- 27 staged routes;
- Tin Stream bridge progression;
- objective reachability;
- unique moth IDs;
- movement/collision invariants;
- follower no-route recovery;
- wildlife/mini-robot contracts;
- atlas/material consistency;
- tree reconstruction;
- shader contracts;
- editor/save behavior.

## Install authoring/test dependencies

```text
python -m pip install -r tools/requirements-authoring.txt
```

Node is also required for JavaScript regression tests used by the full suite.

## Resetting progression while testing

Preferred method:

- open the level/save menu;
- use **RESET THIS LEVEL** or **RESET ALL SAVE**.

Current primary story save key:

```text
relayMothForestPretty394
```

The loader also supports older keys for migration.

## Resetting graphics settings

Use the Graphics menu's **RESET DEFAULTS**.

Current primary key:

```text
relayMothGraphics400
```

If you are debugging manually in DevTools, remember that old compatibility keys can migrate forward, so deleting only one historical key may not always reproduce a completely fresh browser profile.

## Localhost and hosted saves are separate

Browser storage is origin-specific.

For example:

- `http://127.0.0.1:8765`
- `https://techrote.github.io`

do not share localStorage.

This is useful when testing, but it can also make you think a save disappeared when you merely changed origin.

## Common JSON mistakes

### Trailing comma

Invalid:

```json
{
  "count": 3,
}
```

### Duplicate persistent ID

Do not reuse moth/robot IDs.

### Story/map ID mismatch

If story says:

```json
"object_id": "new_lamp"
```

the map must have:

```json
"objects": {
  "new_lamp": [x, y]
}
```

### Unreachable objective

Valid JSON can still produce an impossible room. The route tests are designed to catch many of these mistakes.

### Water/path confusion

A path visual does not automatically make a water tile walkable.

## Test changes incrementally

For larger mods:

1. make one class of change;
2. launch and inspect;
3. run self-test;
4. commit;
5. move to the next class.

This makes it much easier to identify whether a failure came from story, map geometry, IDs or rendering.
