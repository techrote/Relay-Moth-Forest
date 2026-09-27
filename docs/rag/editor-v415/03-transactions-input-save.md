# Transactions, input lifecycle and save behavior

## Current transaction shape

`beginTransaction(label)` stores only:

```js
{ label, before: clone(this.rawRoom()) }
```

There is no `roomKey`.

## Cross-room undo hazard

`undoOne()` takes the stored room snapshot but writes it to:

```js
this.game.maps.rooms[this.roomKey()]
```

where `roomKey()` is the **currently active room**.

Therefore this sequence is unsafe:

1. edit room A;
2. retain editor undo history;
3. change to room B;
4. Undo.

The room-A snapshot can be assigned to room B.

v4.15 transactions must be room-bound.

Suggested transaction information:

```js
{
  roomKey,
  label,
  before,
  after
}
```

Per-room undo stacks are acceptable and may be simpler than a global stack.

## Current pointer lifecycle

- valid pointerdown captures pointer;
- pointerup calls `onUp()` and commits paint/erase/move;
- `pointercancel` is also wired to `onUp()`.

That means a browser cancellation can commit a partial gesture.

Escape while a drag is active calls `cancelTransaction()` and clears `dragMode`, but does not go through the complete pointer-state reset path or necessarily release the captured pointer immediately.

## Target pointer behavior

- `pointerup` = commit;
- `pointercancel` = cancel transaction + reset pointer state;
- Escape during active gesture = cancel + release capture + reset all gesture state;
- closing editor with an active transaction must have one explicit behavior, preferably commit only completed gestures and cancel incomplete captured gestures;
- room transition while an editor gesture exists must not leave a transaction associated with the wrong room.

## Current undo capacity

Undo is capped at 48 transactions.

Preserve a bounded history.

## Current local save endpoint

Editor `saveProject()` posts the full maps object to:

```text
POST /__editor/save_maps
```

Server behavior already includes:

- payload limit: 4 MiB;
- JSON parse/shape validation;
- map schema prefix validation;
- timestamped `editor_backups/`;
- temporary write;
- atomic replacement of `relay_moth_maps.json`.

This server-side backup behavior is valuable and should remain.

## Hosted web behavior

The GitHub Pages mirror cannot write to the source repository; its editor save action downloads map JSON instead.

Do not make v4.15 depend on a writable server in order to edit.

## Missing dirty-state semantics

Current editor does not clearly show:

- whether in-memory maps differ from the last saved/downloaded baseline;
- which room is dirty;
- when the last successful save occurred.

Target UI should include a clear dirty/saved state and warn before destructive navigation/reload where feasible.

Undoing back to the saved state should clear dirty status if the data matches the saved baseline.
