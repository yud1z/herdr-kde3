# Known host limitations

Tested with Herdr app 0.1.15 and core 0.1.20.

## Terminal redraw between tabs/windows

Replacing a native overlay reattaches terminal views. In a fixed-size test,
the PTY briefly changed from 104×31 to 120×40 and back, causing htop to redraw.
The theme avoids redundant rebuilds and defers focus until after layout, but
cannot remove that host-level resize through the current mod API.

The public API exposes openOverlay/closeOverlay, not retained overlay content
updates or explicit raise. Desktop layout.select does not select overlay stacks.
Taskbar activation therefore replaces/raises its keyed native window, then focuses
the selected terminal. A brief redraw may still occur.

## Splits and desktop scope

Arbitrary existing nested split trees are not exposed to mods; this theme renders
the terminals in a row/column without rewriting their original split model.
Snapping operates within the Herdr application viewport and leaves the panel
visible. It does not manage other OS application windows or virtual desktops.
