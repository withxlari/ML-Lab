# Interface and navigation

## Page roles

- `/`: public home introducing Nexo, its media categories and the path into exploration. It does not show personal library controls.
- `/explore`: an eight-title editorial sample with filters, accent-insensitive search, detail dialogs and local saves.
- `/explore?type=book` (also `movie`, `series`): opens the category selected from the home page.
- `/library`: titles saved in this browser, with the same filters and search.
- `/dev/status`: development-only API diagnostic. It is absent from the visitor-facing home and is not registered in production.
- Unknown paths have a return-home page.

React Router handles navigation without full page reloads. BrowserRouter requires the production host to serve index.html for application routes; Vite already handles this locally.

## Visual decisions

The original Cotton / Cherry Red / Maroon / Noir Black reference remains the palette foundation. Light mode uses warm ivory surfaces; dark mode uses warm black surfaces. Derived text and border colors preserve hierarchy in each theme.

DM Sans handles controls and body copy. Newsreader handles headings. Both are bundled through Fontsource and served locally; their license notices are included in public/licenses.

The previous asterisk logo decoration, orbit illustration and placeholder launch copy have been removed. Technical health messages are kept on their development route.

The home introduces the product through a cover composition, media-category entry points and a concise explanation of the current visitor journey. Exploration is a separate workspace.

## Interaction and scope

Theme choice is applied before React renders, with the operating-system preference used on first visit. Subsequent choices are saved under `nexo:theme`. Saved title IDs use `nexo:saved`. Storage errors fall back to in-memory state, shared across routes.

The search matches titles, original titles, creators and genres, ignoring accents and letter case. Detail dialogs use the browser's native dialog element, support Escape and block background interaction.

The surprise action chooses randomly from the editorial sample. No personalization or recommendation-model quality is implied. The sample is static and does not represent a completed catalog integration. Lists are local to the browser, not attached to an account.

## Image sources

Assets are stored in `frontend/public/images` for this local prototype.

| Asset | Source |
| --- | --- |
| interstellar-backdrop.jpg | https://image.tmdb.org/t/p/w1280/rAiYTfKGqDCRIIqo664sY9XZIvQ.jpg |
| interstellar.jpg | https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg |
| budapest.jpg | https://image.tmdb.org/t/p/w500/eWdyYQreja6JGCzqHWXpWHDrrPo.jpg |
| severance.jpg | https://image.tmdb.org/t/p/w500/pPHpeI2X1qEd1CS1SeyrdhZ4qnT.jpg |
| dune.jpg | https://image.tmdb.org/t/p/w500/d5NXSklXo0qyIYkgV94XAgMIckC.jpg |
| past-lives.jpg | https://image.tmdb.org/t/p/w500/k3waqVXSnvCZWfJYNtdamTgTtTA.jpg |
| dark.jpg | https://image.tmdb.org/t/p/w500/apbrbWs8M9lyOpJYU5WXrpFbk1Z.jpg |
| dune-book.jpg | https://covers.openlibrary.org/b/isbn/9780441172719-L.jpg |
| midnight-library.jpg | https://covers.openlibrary.org/b/isbn/9780525559474-L.jpg |
| tmdb.svg | https://files.readme.io/29c6fee-blue_short.svg |

Credits and the official TMDB notice are available from the footer's About dialog. No ownership of posters or book covers is claimed. Metadata source links are included in each detail dialog. Public deployment must follow current provider terms; Open Library asks public pages to reference covers.openlibrary.org directly.

Sources: [TMDB FAQ](https://developer.themoviedb.org/docs/faq), [Open Library covers](https://openlibrary.org/dev/docs/api/covers), [DM Sans](https://fontsource.org/fonts/dm-sans), [Newsreader](https://fontsource.org/fonts/newsreader), [React Router](https://reactrouter.com/start/declarative/routing).

## Verification on 2026-10-28

- 13 frontend tests passed: API status, theme persistence, filtering, searching, saved-list persistence, blocked/corrupt browser storage, public-home navigation, category navigation and StrictMode dialog lifecycle.
- ESLint, Prettier, TypeScript and the Vite production build passed.
- Browser checks covered light and dark themes, persisted theme after reload, navigation between home/explore/library, real detail dialogs, saving and keyboard dismissal.
- The exploration layout was inspected at 432 px and 1054 px without horizontal overflow; the final public home was inspected at 1054 px.
- The existing local server was reused. No server or database behavior was changed.
