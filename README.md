# RelaxNote

## Run it

1. Install Node.js 18 or newer from https://nodejs.org
2. In this folder run: `npm install`
3. Start the server with your email as the admin:
   - Mac/Linux: `ADMIN_EMAIL=you@example.com npm start`
   - Windows PowerShell: `$env:ADMIN_EMAIL="you@example.com"; npm start`
   - Windows cmd: `set ADMIN_EMAIL=you@example.com && npm start`
4. Open http://localhost:3000
5. Click Sign in, choose Sign up, and register with that same email. You are now the admin.

## Add the free songs

Put the mp3 files in the `songs` folder, using the file names in `songs/catalog.json`. Songs whose file is missing are skipped, so you can add them one at a time. Each entry shows its credit and a Source link on the now-playing screen.

| File | Song | Author | License | Page |
| --- | --- | --- | --- | --- |
| megasong.mp3 | Megasong | Emma_MA | CC0 | https://opengameart.org/content/megasong |
| untitled_metal_track.mp3 | Untitled Metal Track | Kistol | CC0 | https://opengameart.org/content/untitled-metal-track |
| rock4.mp3 | Electric Rock | Alex McCulloch (Pro Sensory) | CC0 | https://opengameart.org/content/electric-rock |
| quickietrix.mp3 | Quickie Trix | iamoneabe | CC0 | https://opengameart.org/content/quickie-trix |

More free music to browse (check each song's license and add its credit):
- Tanner Helland's collection, about 50 songs, CC BY 4.0: https://github.com/tannerhelland/free-music (credit: "Music by Tanner Helland")
- Journey Through Fury by Fatal Exit, electronic rock/metal, CC BY 4.0, ogg or wav only: https://fatalexit.itch.io/journey-through-fury

To add another song, copy an entry in `songs/catalog.json` and change the fields. Genres are lofi, electronic, rock, metal, kpop and other.

## Cover art

Put a picture (jpg, png or webp) in `songs/covers` with the same name as the song, for example `songs/covers/megasong.jpg` for `megasong.mp3`. It shows up automatically on the song card, in the player bar and on the now-playing screen. To use a different file name, add `"cover": "myimage.jpg"` to the song's entry in `songs/catalog.json`. Songs without a picture keep the colored gradient.

Community songs can include cover art too. The upload form has an optional cover field (jpg, png or webp, up to 3 MB). You see the cover next to the song in the Review queue.

## Desktop app

The desktop app is the same player in its own window, with the server built in, so it needs no browser and no terminal commands to run.

1. Run `npm install` once (it also downloads Electron).
2. Run `npm run desktop` to open the app.
3. The first account you create in the app becomes the admin.
4. In the app menu (press Alt if the menu is hidden), File, Open songs folder opens the folder where your mp3 files and `catalog.json` live. Add songs there the same way as above.
5. Your accounts, playlists and songs are stored in the app's own data folder, separate from the web version.
6. The space bar plays and pauses, and the keyboard media keys control playback.

To make an installer for your own computer, run `npm run dist`. Windows gives an .exe installer, Mac a .dmg and Linux an AppImage. Run it on the system you want to build for. Installers appear in the `dist` folder.

To use the desktop app as a window onto a website you host, choose File, Open settings file, set `"serverUrl"` to your site address (for example `"https://relaxnote.example.com"`), and restart the app.

## Community songs

1. Signed-in users open Submit, fill in the form and upload an mp3, wav, ogg, flac or m4a file (up to 30 MB).
2. The song is saved as pending and is not visible to anyone else.
3. You open Submit and see the Review queue. Listen to each song, then press Approve or Reject, with an optional reason that the artist can see.
4. Approved songs appear in the Hub for everyone. To take one down later, send `DELETE /api/admin/songs/<id>` with your admin token.

## Before putting it on the internet

- Host it on a service that keeps files between restarts (a VPS, or Render or Railway with a persistent disk) and serve it over HTTPS.
- Set `JWT_SECRET` to a long random string and keep `data/` and `uploads/` backed up.
- Accounts and songs are stored in `data/db.json`. That is fine for a small site; move to a real database such as PostgreSQL if it grows.
- There is no email verification or password reset yet.
