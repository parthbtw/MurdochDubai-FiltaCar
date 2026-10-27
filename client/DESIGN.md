# FiltaCar frontend design

## Inventory and jobs

1. Ten synthetic used side mirrors, MIR-0001 through MIR-0010, in workspace DXB-SLV-014.
2. Three readiness lanes are computed from the returned records, not separate counters.
3. Seller approval is a separate final state. Nothing is published in this prototype.
4. A yard worker holds an iPhone in bright sun, often one-handed, and needs readable blockers.
5. An office lister uses the same portrait app for longer evidence checks.
6. Item IDs and part numbers are compared character by character, never truncated.
7. Photos are the recorded uploads and synthetic labels. Missing files stay visibly missing.
8. English and Arabic questions stack, with the Arabic evidence in its own reading direction.
9. Donor vehicles are evidence only. A conflicting year stays recorded with both sources.
10. Weight uses kg; packaged dimensions use cm; storage is explicitly internal.
11. Facts, gaps, source labels, OCR evidence and seller history all come from the API.
12. Queue job: choose a readiness lane and open a part. Detail job: trace a fact and understand the next confirmation.

## Screen questions and order

Queue: Which parts can I approve now, and what is blocking the rest?
Finding: computed missing count and the most frequent blocking field among missing parts.
Order: product and workspace, large title and finding, segmented lanes, full lane heading,
part list, compact evidence metrics, synthetic scope note.
The list is the biggest element, and its first cell starts in the top 60% at 375 x 667.

Detail: Can this part be listed, and if not, what must I confirm?
Finding: the lowest-priority-number blocking action, in English then Arabic.
Order: back navigation, item ID and readiness, next step, photos, grouped facts and notes.
A fact is one tap from the evidence sheet. No editing or approval controls in this task.

## Direction

Dealt style: Framed sheet. Seed: 407422327. No redraw.
Reason: flat white work surfaces on a tinted ground keep evidence legible in an iPhone list.
Move: one low-chroma frame, white work surfaces, hairline separators and no resting shadows.
Phone adaptation: no sidebar, no desktop grid, no search without a job, no extra detail tabs.
The requested grouped inset lists replace the desktop sheet; the tint and white tone step remain.
The iPhone large title and segmented control take precedence over desktop title and underline tabs.
Density: comfortable 17 px fact text, 16 px inset, 16 px group spacing, content-sized cells.
Radius decision: 16 px groups and sheets, 8 px nested media and controls, full status pills.
Face: mirror-glass-tinted ground, native Apple type and unchanged supplied mark.
Signature element: a source chip turns each recorded value into a traceable statement.
Blue belongs to part identity and at most one selected control, not decorative chrome.

## Named colour roles

Six base tokens:

| Token | Hex | Role |
| :--- | :--- | :--- |
| glass-ground | #F1F5F8 | Low-chroma mirror glass tint, grouped background and opaque bars |
| paper | #FFFFFF | White grouped cells and sheets |
| mirror-ink | #14203B | Darkened mirror navy, body and titles, over 12:1 on white |
| filta-blue | #086BCA | Part identity and focus indication |
| body-amber | #EAA902 | Missing-information family, only pale tint and darkened ink in UI |
| car-red | #D91B1F | Conflict and specialist family, only pale tint and darkened ink in UI |

Derived semantic pairs: ready #E7F3EB with #205B36; missing #FFF4D9 with #715000;
specialist and conflict #FCEBEC with #8F171B; neutral #E9EDF2 with #4C586C.
Secondary text #526077. Hairlines #E2E8EF; control borders #AEBAC9.
All word-bearing tones must reach 4.5:1 on their surfaces. No gradients or glass.
CSS uses HSL channel tokens for Tailwind and these named roles as the source of truth.

## Type and interaction

Sans: -apple-system, BlinkMacSystemFont, "IBM Plex Sans", system-ui, sans-serif.
Arabic: -apple-system, "IBM Plex Sans Arabic", system-ui, sans-serif.
Mono: ui-monospace, "SF Mono", "IBM Plex Mono", monospace, only IDs and part numbers.
Apple faces are intentional, with locally bundled Plex fallback, never remote font requests.
Weights: sans 400 and 600; Arabic 400 and 600; mono 400 and 600.
Dynamic Type roles: large title 34/41, title 28/34, title 22/28 and 20/26,
headline 17/24 semibold, body 17/25, callout 16/23, subheadline 15/21,
footnote 13/19, caption 12/18. No type below 11 px. Inputs at least 16 px.
Arabic is 18/29 when paired with 17 px English.
Counts use tabular figures; IDs and numbers keep every character visible.
Minimum touch target 44 px. Explicit pressed and keyboard focus states, no hover-only actions.
Opaque safe-area bars with hairline edges. Scroll containers contain overscroll.
Navigation pushes for 250 ms; reduced motion removes travel. No entrance animations.
Evidence sheets have a grabber, medium and large detents, named close control and focus return.

## Wireframes

390 px queue, 16 + 358 + 16 = 390:

```text
+--------------------------------------+
| mark FiltaCar       DXB-SLV-014       | 48 + safe area
| Readiness queue                      | large title
| 5 parts need information from you.    | computed finding
| Most common blocker: ...             |
| [ Ready 3 | Missing 5 | Specialist 2 ]| 44 pt segments
| Ready for review                     | full lane heading
| +----------------------------------+ |
| | label  MIR-0001                >  | |
| |        Used wing mirror ...      | |
| |        Donor Toyota ...          | |
| |        UK side, guidance         | |
| |        0 questions, not approved | |
| |----------------------------------| |
| | label  MIR-0002                >  | |
| |        ...                       | |
| +----------------------------------+ |
| Evidence summary                     |
| Facts with a source             351  | one grouped list
| Open questions                   16  |
| ...                                  |
| Synthetic demo. Nothing published.   |
+--------------------------------------+
```

390 px detail, same inset arithmetic:

```text
+--------------------------------------+
| < Readiness queue      MIR-0007       | inline ID on scroll
| MIR-0007                             | large mono title
| [Information missing]                |
| Not approved yet                     |
| Used N/S Wing Mirror SBM-7943-AC15    |
| Next step                            |
| +----------------------------------+ |
| | The years do not agree ...        | |
| |             Arabic question RTL  | |
| +----------------------------------+ |
| Photos                               |
| [Missing file] [recorded label] ...  | horizontal strip
| Part                                 |
| +----------------------------------+ |
| | Part number       SBM-7943-AC15   | |
| | [spreadsheet row 9]               | trace chip
| +----------------------------------+ |
| Donor vehicle                        |
| | Year 2018 [Conflict]              | both sources named
| | [spreadsheet row 9]               | opens evidence sheet
| Donor is evidence only.              |
| Shipping and storage                 |
| | Storage: Rack B7, Bay 2           |
| Internal, never shown to buyers       |
| Seller notes: English then Arabic    |
+--------------------------------------+
```

1440 px, identical phone application without a device bezel:

```text
+-----------------------------------------------------------------------+
|           tinted ground     430 px app     tinted ground               |
|         505 px gutter   +----------------+   505 px gutter             |
|                         | same top bar   |                             |
|                         | same queue or  |                             |
|                         | detail groups  |                             |
|                         | same scrolling |                             |
|                         +----------------+                             |
+-----------------------------------------------------------------------+
```

375 px: 16 + 343 + 16. 430 px: 16 + 398 + 16. Above 600 px the column is 430 px.
Safe areas add logical inline padding only when larger than the normal inset.

## Principles and generic-default review

Facts in. Guesses out. Missing values say Not recorded, never an inferred replacement.
Raw seller titles and notes are labelled original evidence, not promoted as listing claims.
Code decides, AI only reads. Source classification explains the label without changing it.
Source names returned by the API remain visible, including names of the original readers.
Every conflict names its sources; cannot-claim reasons use neutral ink and a strike marker.
English comes first; every Arabic string uses the same lang and direction component.
Use logical spacing so future Arabic navigation can flip without component rewrites.

Removed generic dashboard defaults: no KPI tiles, hero banner, decorative icons, sidebar,
avatars, search without a need, empty future destinations or tab bar for one destination.
Changed desktop assumptions to a native navigation stack and grouped inset fact cells.
Kept system type despite the generic-font warning because this is an iPhone app by instruction.
Kept monospace exclusively where sellers must distinguish individual identifier characters.
No stock media, no data substitute for a missing upload, no runtime remote dependencies.
Final accessory removal: removed the repeated link icon beside every source chip.
The chip and the whole fact cell remain tappable with their field-specific accessible names.

## Inspection log

Style: Framed sheet, seed 407422327. Face: mirror glass tint, Apple system faces and supplied mark.
Signature: traceable source chips. No redraw, stock assets, service worker or remote fonts.
Node 18.20.8 was retained. The browser inspector requires Node 22, so its FAIL and WARN
counts are not available in any round. Used the requested source lint and Chrome screenshots.
The source lint does not support a rule-specific allow flag. Its mono warnings are retained:
only item IDs and part numbers use mono, because sellers compare every character.
The system-face exception follows the iPhone requirement, not an unloaded font substitute.

Before round 1: source lint 1 FAIL, 4 WARN. The FAIL mistook a remote-URL rejection test
for display placeholder data. Changed the rejected URL to filtacar.invalid, preserving the assertion.
Round 1: source lint 0 FAIL, 4 WARN. Opened queue and detail at 375 x 667, 390 x 844 and 430 x 932.
Also opened donor-year and source-sheet crops. First queue cell started at y=277.
Critique: list and bilingual next step lead; equal group edges and tint are clear. Part numbers
broke across title lines, the donor heading could sit under the bar, and the medium sheet
used an oversized scroll area. Fixes: intact mono number spans, scroll padding, full-height
sheet geometry with detent-sized visible content and a keyboard-operable grabber.

Round 2: source lint 0 FAIL, 5 WARN. Added mono spans account for the extra allowed warning.
Opened all six portrait shots plus donor year, medium/large sheets, notes, metrics, Missing lane
and both desktop shots. Numbers now stay intact; Arabic and source conflicts stay readable.
Remaining visible flaw: the grabber sat against the top edge because its bundled hit area was
not flex-centred. Corrected that hit area's layout. Also verified Back should pop, not push,
and kept photo captions sourced. Removed the repeated source-link icon as the accessory check.
A supplemental browser probe used incorrect capitalization in a source selector and timed out;
corrected it to the actual accessible name. This was not an API or screenshot-capture failure.

Round 3: source lint 0 FAIL, 5 WARN. Opened every final screenshot listed below.
No page or app horizontal overflow at any phone width. All measured controls are at least 44 px.
Large titles are 34 px. First queue cell is y=277 at every width, within the top 60% at 375 x 667.
At 1440 x 900 both routes use x=505, width=430, with equal 505 px outer gutters and no bezel.
Medium/large sheet controls respond; Done closes; focus returns to the source cell.
Back retains the Missing lane and measured scroll position 220. Reduced-motion animation is none.
Observed external page requests: zero. Production page, API proxy and demo label returned HTTP 200.

Final app-screen critique:
1. The largest region answers the queue question; detail leads with the actual bilingual blocker.
2. Groups share 16 px inset edges. No orphan column; the large sheet's spare area is its intentional detent.
3. The chosen tint and mark are visible. Blue marks identity; semantic tints carry readiness and gaps.
4. Lane counts 3 + 5 + 2 = 10. Finding count 5 agrees with Missing. Metrics remain the returned
   351 sources, 16 questions, 4 conflicts, 4 blocked claims and 2 declined guesses, with aligned digits.
5. Zero questions print 0; absent values print Not recorded; missing photos name the file once.
6. No chart or legend exists. No colliding labels; source chips retain every source label.
7. One pane at a time, no sidebar or premature tab bar. At 375 px long bilingual evidence needs
   vertical scrolling; this preserves readability rather than shrinking type. Photos swipe within their strip.

Screenshot paths, all under the ignored .taste-skill working folder:
Round 1: round-1/queue-375.png, queue-390.png, queue-430.png, detail-375.png,
  detail-390.png, detail-430.png, donor-year-390.png, source-sheet-390.png.
Round 2: round-2/queue-375.png, queue-390.png, queue-430.png, detail-375.png,
  detail-390.png, detail-430.png, donor-year-390.png, source-sheet-medium-390.png,
  source-sheet-large-390.png, notes-390.png, metrics-390.png, missing-390.png,
  queue-1440.png, detail-1440.png.
Round 3: round-3/queue-375.png, queue-390.png, queue-430.png, detail-375.png,
  detail-390.png, detail-430.png, donor-year-390.png, source-sheet-medium-390.png,
  source-sheet-large-390.png, notes-390.png, label-photo-390.png, metrics-390.png,
  missing-390.png, queue-1440.png, detail-1440.png.

Validation: server 266 passing, client 66 passing. Typecheck passes; lint 0 errors and 3 copied
component refresh warnings. Production JS 350.17 kB, gzip 111.11 kB; CSS 25.85 kB, gzip 6.19 kB.
Fixture conversions live only in test/fixtures/index.ts. Genuine contract corrections: export
included IDs are strings; AI status reason is nullable; reference years are range strings and
compatibility entries carry their source dictionary. Production part types were not loosened.
The two test failures were a duplicate photo filename and an async two-error-state race;
fixed the presentation and waited for both errors without deleting or weakening assertions.
