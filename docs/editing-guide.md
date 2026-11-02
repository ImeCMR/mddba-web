# Editing the MDDB America website

The website has an editor at **[mddba.com/admin](https://mddba.com/admin/)**. You change text, news, events and so on in forms, then press **Publish**, and the live site updates about a minute later. You don't need to touch any code.

## Logging in

1. Ask the site admin to add your GitHub account to the website's repository (`ImeCMR/mddba-web`). If you don't have a GitHub account yet, create one at [github.com](https://github.com/signup).
2. Open `/admin` on the site and click **Login with GitHub**. The first time, GitHub asks you to approve the "MDDB America website editor" app.

## What you can edit

The sidebar lists everything you can change:

| Section | What it changes |
|---|---|
| **News posts** | One entry per news post. Each post gets its own page and appears automatically on the Home page (newest three), the News page and under "More News". |
| **Events** | The Events page. Events dated today or later are listed as *Upcoming*, older ones as *Past*. The home page counts the events that are not hidden. |
| **Publications** | The Publications page, and the home page counter. |
| **Partners** | The partner cards on the Partners page, and the logos on the home page. |
| **Nodes & globe** | The main nodes next to the globe, and the nodes inside them (the dots on the globe). The home page counters ("MDDB Nodes", "Partner Institutions") count these. |
| **Page text** | Headings and text of the Home, News and Community pages (the text of the other pages is in their own sections above). |
| **Site settings** | Contact email, X and LinkedIn links, footer text, the search suggestions in the menu. |

The design, the animations (FAIR viewer, globe) and the page layout are not in the editor. Ask a developer for those.

## Adding a news post

1. **Start the post.** Click **News posts** → **New News post**.
2. **Fill in the form:**
   - **Title.**
   - **Date.** This is today unless you change it. Posts are listed newest first.
   - **Topics:** Milestone, Conference and/or Publication. They are shown as chips and used by the filter on the News page.
   - **Picture:** a wide photo (16:9 works best), at least 1600 pixels wide. Upload it here. On phone photos, remove the location data first.
   - **Card text:** one or two sentences shown on the news cards.
   - **Opening paragraph** (optional): shown larger at the top of the post.
   - **Post text:** use the toolbar for bold, links, headings and lists. Links to other sites open in a new tab.
   - **Button** (optional): e.g. *Read the \*\*Paper\*\** with the link to the paper.
3. **Publish.** Press **Publish** → **Publish now**.

The preview on the right shows the post in the site's style.

Good to know:
- **The web address is fixed.** It is made from the title when you first publish, e.g. `/pages/news-my-title`, and doesn't change if you edit the title later. This keeps shared links working.
- **Hiding a post.** **Hide from the site** keeps a post saved but unpublished. **Delete entry** removes it.

## Adding an event or a publication

1. **Open the list.** Open **Events** (or **Publications**) → *Events page*.
2. **Fill in the new entry.** Under *Events*, click **Add event** and fill it in. For an event:
   - **Button text and link** are optional, e.g. *View \*\*Recap\*\** linking to the news post (`/pages/news-….html`), or *\*\*Register\*\** linking to a sign-up page.
   - **Hide from the site** keeps an event saved without showing or counting it.
3. **Publish.** Press **Publish** → **Publish now**.

The order in the list doesn't matter: the site sorts events by date.

## Formatting tips

- **Blue highlight:** in titles and statements, put `**` around words to colour them in the blue gradient, e.g. `Our **Partners**`. In button texts, `**` makes the words bold.
- **Line breaks:** in the multi-line title fields (Home page title, the blue "get in touch" bands), a new line starts a new line on the page.
- **Separators:** in the small capital labels, ` | ` shows a separator, e.g. `Our Vision | FAIR Data`.
- **Coordinates** (Nodes & globe): longitude is east-positive and west-negative, latitude is north-positive. Look a place up on a map and right-click to copy them.

## When will I see my change?

About a minute after **Publish now**, reload the page; if it hasn't changed, force-reload with Ctrl+Shift+R (Cmd+Shift+R on a Mac). Every publish is saved in the repository's history, so a developer can undo any change.
