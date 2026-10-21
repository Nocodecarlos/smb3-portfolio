# SMB3 Portfolio

A playable portfolio inspired by Super Mario Bros. 3. The overworld has one numbered panel per project. Each world is a case study: bricks carry the copy, billboards show the work, pipes are the decisions.

All art and sound are original and generated in code. Nintendo's assets aren't used.

## Run

```bash
npm install
npm run dev
```

Every push to `main` builds and deploys to GitHub Pages (`.github/workflows/deploy.yml`), the same way the Pause site deploys.

URL flags: `?dev` opens the editor, `?desktop` skips the phone gate, `?timer` runs the game loop on setTimeout (for background testing).

## Content

- `content/site.json`: title screen, about house, castle letter, repo, map layout
- `content/worlds/*.json`: one file per world, with an ordered list of `beats`
- `public/content/<world>/`: images

Beat types and what the level builder makes from them:

| type | in the level |
|---|---|
| `copy` | bricks with the headline painted on; the ? block opens the body |
| `image` | a billboard; bump the caption bar to open the image |
| `decision` | two pipes (press ↓ on one to read it) and a ? block with the choice and why |
| `metric` | a ? block that pops the number |

Any beat can have `"lens": "design"` or `"lens": "build"` to only show in that title-screen mode.

## Dev mode

Type ↑ ↑ ↓ ↓ ← → ← → B A anywhere. The TV flips, the game goes black and white, and the editor opens. Every edit rebuilds the level live. Click an outlined beat in the game to jump to its fields.

**Save** commits the changed JSON and uploaded images to `repo` in `site.json` as one commit, using the GitHub API. It needs a fine-grained token with **Contents: read and write** on this repo, pasted under "I'm Carlos". The token is stored only in that browser's localStorage. Visitors can edit for fun, but they can't save.
