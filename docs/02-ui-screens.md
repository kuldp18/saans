# Screens and UI specification

## Visual direction

A calm editorial dashboard with ivory canvas (#F8F7F2), cloud-white cards (#FFFFFF), deep ink (#132C2B), forest teal actions (#14564C with white text), pale mint selection (#E4F1EC), and slate secondary text (#4B6261). Use ochre (#774500 on #FDF1D8) for caution and burgundy (#841E37 on #FBE8ED) for high risk. Use neutral outlines (#CCD9D3) for dividers and a stronger border for controls when needed. Pair any semantic color with text and a distinctive icon. Validate actual rendered contrast, including disabled, focus, forecast and selected states. Use a system sans stack with tabular numerals, 18px default body copy where space permits, a 32–44px display heading and readable line lengths. Use a 4/8/12/16/24/32 spacing scale and modest 12–16px corners.

Use lightweight CSS and system fonts. Use decorative illustration only if it carries no performance or comprehension cost. Keep cards compact, action titles specific and labels consistent. Use standard browser shortcuts, clear focus outlines, skip-to-content, landmark regions and heading order. Preserve reflow at 320 CSS px and large zoom. Aim for 44×44 px actions. Use polite status messages for loading and completion, assertive alerts only for blocking errors, and a text equivalent for each chart or severity scale.

## 1. Today — /

Header: wordmark, Plan, Sources. Single page title “Make a plan for today’s air.” City field is a native select, with a visible label and no inferred location. Primary action “Build my plan.” Secondary “Try Delhi demo.” On first load, the current-data card prompts city selection or shows an explicitly labeled sample preview. Once city resolves, show AQI number, named band, PM2.5, provider, “Model estimate,” valid local time and forecast availability. Show an inline official CPCB link with an explanation that CPCB uses a different AQI scale.

Desktop: two columns with form left and air card right. Mobile: city and critical air context above the planner CTA, one column. Missing data leaves city controls interactive and offers “Use sample data” as an explicit choice. Stale data shows timestamp, a stale badge and no time-specific CTA.

## 2. Planner — /plan

A progressively disclosed single form. Start with Household or Community, then use one to three predefined activities. Offer fixed or flexible, start/end local time, and feasible alternatives via fieldsets. Budget: No purchases / Existing equipment / Open to purchases. Use a purifier option only if available or explicitly considered. Travel options capture feasible modes, trip distance and car trips that could be combined. Community mode asks for indoor venue availability, not attendee names. No text box or diagnosis field. Keep progress obvious using headings, show inline errors with an error summary on failed submit and trap no focus. A generation label explains that the public demo uses rules. Source timestamps remain visible. Keep validated input when generation fails. If a verified prerecorded Gemini sample is shipped, offer “Replay recorded Gemini plan” as a separate action in the exact matching demo scenario. Label it as a recording and let users compare the order with the Rules plan. Editing the scenario exits replay.

## 3. Results — /plan, results state

Top: “Your plan for [city]”, air provenance, source state and decision method badge (“Rules plan” or “AI-ranked plan”). Show urgent sourced precautions before ranked choices if applicable. Use three sections: Today’s routine, Better air indoors, and Lower-emission choices. Cards contain Action, Why this fits, What changes and caveat. An expandable “See the comparison” reveals baseline, proposed option, units, formula and assumptions. Show unavailable metrics in plain language. An accessible table accompanies any forecast series. Show refresh or edit without scrolling to top unnecessarily. Move programmatic focus to the results heading after submitting and announce plan readiness once.

Desktop: readable 65-character results column with sticky side evidence only if it never obscures focus. Mobile: one column, evidence disclosures below each action. Do not use a fixed footer over fields. When the task is infeasible show a retained-commitment card, not a blank list.

## 4. Community and Sources — /plan community state, /sources

Community result uses a text notice preview with city, local date/time, forecast or sample label, one practical activity adjustment, one lower-emission action and source link. “Copy notice” announces success without shifting focus and offers a selectable-text fallback. “Download text” uses a local file, with no uploads or public profile.

Sources is a separate route with data mode legend, model coverage, CPCB link, home guidance sources, impact definitions and AI/privacy explanation. Preserve ordinary link semantics. Mark all demo notices with “Sample scenario.” Never include household preferences, addresses, IDs, contact information or raw request values in a notice.

## State matrix

| State | User sees |
| --- | --- |
| Loading | Stable layout and one text status, with controls remaining usable where possible |
| API unavailable | Last permitted stale snapshot or neutral state, plus an explicit demo option |
| AI quota/provider failure | Full rules-based plan and a plain status label |
| Missing forecast hour | No score for the incomplete interval, with why the comparison is unavailable |
| No cleaner feasible window | Keep commitment or choose feasible indoor alternative without claiming the air is safe |
| Severe modeled conditions | Sourced precaution first and no recommendation for optional outdoor exertion |
| Invalid profile | Field-level errors and preserved entries |
| Copy blocked | Focusable selectable notice text and download action |
