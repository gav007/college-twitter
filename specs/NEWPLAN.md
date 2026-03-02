# Loopfeed UI Upgrade Plan
Target: X level feel with low CPU cost and minimal dependencies

## Goals
1. Make the feed feel like a premium timeline, not a dashboard of cards
2. Improve readability through consistent width, contrast, and type rhythm
3. Reduce action clutter while keeping power features one click away
4. Add small realism details that make it feel like a real social network
5. Keep it accessible, keyboard usable, and visually calm

## Guiding references
1. WCAG contrast requirements for text and non text UI components :contentReference[oaicite:0]{index=0}
2. WAI ARIA menu button pattern and warnings about menu roles :contentReference[oaicite:1]{index=1}
3. Touch target sizing guidance, 44 by 44 and 48 by 48 :contentReference[oaicite:2]{index=2}
4. Skeleton screens and infinite scroll usability guidance :contentReference[oaicite:3]{index=3}
5. Live region announcements for new posts and updates :contentReference[oaicite:4]{index=4}
6. Dark theme elevation via lighter surfaces at higher elevation :contentReference[oaicite:5]{index=5}
7. Emoji picker accessibility interaction model reference :contentReference[oaicite:6]{index=6}
8. Font options from Google Fonts :contentReference[oaicite:7]{index=7}

## Phase 1 Timeline feed conversion
Objective: remove the dashboard vibe and get the X timeline feel

☐ Step 1 Create a single feed container
1. Center column contains one feed surface with subtle border and slightly lighter background than page
2. Feed surface has rounded corners once, not per post

☐ Step 2 Convert each post from a card to a row
1. Each post becomes a row inside the feed surface
2. Add a 1px divider line between rows
3. Remove per post shadows and heavy borders
4. Add a hover row tint that is subtle and consistent

☐ Step 3 Normalize spacing and rhythm
1. Row padding consistent top bottom and left right
2. Consistent vertical spacing between header, body, media, actions

Done when
1. Scrolling feels like one continuous timeline
2. No rounded card boundaries per post
3. Hover state is subtle and predictable

## Phase 2 Action area cleanup
Objective: keep it powerful but calmer, less going on visually

☐ Step 1 Reduce visible actions to four
Visible row actions
1. Like
2. Comments
3. Share
4. More

Everything else moves into More
1. Quote
2. Message
3. Poke
4. Copy link
5. Report

Accessibility note
Use the WAI ARIA menu button pattern and implement the required keyboard behavior for the menu button and menu items :contentReference[oaicite:8]{index=8}

☐ Step 2 Replace the emoji reaction strip with one React control
1. Replace multiple emoji pills with a single React button
2. Show only the top 2 or 3 reactions as small chips with counts
3. Clicking React opens a popover picker with a grid of reactions
4. Picker supports keyboard navigation and sensible focus behavior :contentReference[oaicite:9]{index=9}

☐ Step 3 Make click targets feel expensive
1. Ensure tappable targets meet minimum size guidance
2. Do not allow tiny pills or cramped icons
3. Increase padding and spacing in the action row :contentReference[oaicite:10]{index=10}

Done when
1. Action row looks calm and readable at a glance
2. Secondary actions are discoverable in More
3. Reaction picker is one clean entry point
4. All targets are comfortable to click or tap

## Phase 3 Typography and contrast pass
Objective: make reading effortless

☐ Step 1 Set baseline type rules
1. Body text size 15 to 16px
2. Line height about 1.6
3. Slightly bolder display names
4. Timestamps smaller and quieter than body text

☐ Step 2 Meet contrast targets
1. Normal text meets 4.5 to 1 contrast minimum :contentReference[oaicite:11]{index=11}
2. UI components like pill borders and input borders meet 3 to 1 non text contrast :contentReference[oaicite:12]{index=12}
3. Use a contrast checker during the pass :contentReference[oaicite:13]{index=13}

☐ Step 3 Add font upgrade
Recommended pairing
1. Inter for UI and body :contentReference[oaicite:14]{index=14}
2. Space Grotesk for headings only :contentReference[oaicite:15]{index=15}

Done when
1. Post text is easy to read for long sessions
2. Metadata is quiet but still legible
3. Borders and input outlines are visible without being harsh

## Phase 4 Dark theme depth and elevation
Objective: depth without neon and without heavy shadows

☐ Step 1 Apply elevation by lightening surfaces
1. Page background darkest
2. Feed surface slightly lighter
3. Composer and hovered rows slightly lighter again
4. Use minimal shadow only on hover for key interactive surfaces :contentReference[oaicite:16]{index=16}

Done when
1. Surfaces have depth without looking glossy
2. Hover and focus states are visible but subtle

## Phase 5 Layout efficiency and rails
Objective: stop wasting space and make the desktop layout feel intentional

☐ Step 1 Lock in three column rails
1. Left rail becomes primary navigation on desktop
2. Center feed has a fixed readable width
3. Right rail contains 2 to 3 stacked modules

☐ Step 2 Make the top bar calmer
1. Keep search and primary actions
2. Remove redundant large search help panel in the feed
3. Keep tabs like For You and Following near the feed header

☐ Step 3 Right rail modules
Pick 2 to 3 for MVP
1. Suggested users
2. Events near campus
3. Internships
4. Trending

Done when
1. Wide screens feel filled with purpose
2. Center feed stays readable, never stretches too wide
3. Right rail makes the app feel populated

## Phase 6 Perceived performance
Objective: feel fast even when it is not

☐ Step 1 Add skeleton loading
1. Show skeleton rows for feed while loading
2. Show skeleton blocks for link preview media and title
3. Avoid full page spinners :contentReference[oaicite:17]{index=17}

Done when
1. Loading states look like the final layout
2. No sudden jumps when content arrives

## Phase 7 Feed behavior polish
Objective: infinite scroll done right, with control

☐ Step 1 Infinite scroll plus fallback
1. Infinite scroll for browsing
2. Add Load more as a fallback or safety
3. Add Back to top after some scrolling :contentReference[oaicite:18]{index=18}

☐ Step 2 New posts pill
1. When new posts arrive, do not jump the feed
2. Show a pill at the top: for example 3 new posts
3. Clicking loads and scrolls to top

☐ Step 3 Announce updates accessibly
1. Announce new posts and key updates via a polite live region :contentReference[oaicite:19]{index=19}

Done when
1. Browsing is smooth
2. Users can regain control easily
3. New content does not disrupt reading position

## Phase 8 Content hygiene and AI vibe removal
Objective: remove bot smell from the UI

☐ Step 1 Remove emoji prefixes from titles
1. Strip leading emoji from bot titles
2. Replace with a small category chip like News Jobs Events

☐ Step 2 Clean validation UX
1. Avoid native browser required field bubbles
2. Disable Comment until text exists
3. Show a small inline hint instead

Done when
1. Titles look human and editorial
2. Commenting feels clean and modern

## Acceptance checklist
☐ Feed looks like a single timeline surface with row separators  
☐ Visible actions are calm and minimal  
☐ Reactions are one React entry point plus small top reaction chips  
☐ Contrast meets WCAG targets for text and UI components :contentReference[oaicite:20]{index=20}  
☐ Touch targets meet recommended minimum sizing :contentReference[oaicite:21]{index=21}  
☐ Skeleton loading present on feed and link previews :contentReference[oaicite:22]{index=22}  
☐ Infinite scroll includes Load more fallback and Back to top :contentReference[oaicite:23]{index=23}  
☐ New posts pill exists and updates are announced politely :contentReference[oaicite:24]{index=24}  
☐ No redundant search help panel wasting center space  
☐ Titles no longer scream AI due to emoji prefixes  
☐ Comment validation is clean and inline

## Implementation order
1. Timeline feed conversion
2. Action cleanup plus React picker plus More menu
3. Typography plus contrast
4. Dark theme elevation
5. Rails and right modules
6. Skeleton loading
7. Infinite scroll plus new posts pill
8. Content hygiene and validation UX
