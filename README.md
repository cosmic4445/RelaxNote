# RelaxNote

## Set up sign-in (Firebase)

Sign-in, email verification and password reset are handled by Firebase Authentication, which is free for this kind of use. Do this once:

1. Go to https://console.firebase.google.com and create a project (you can turn Google Analytics off).
2. Open Project settings (the gear icon), then General. Under Your apps, add a Web app (the `</>` icon) and name it RelaxNote. Copy the four values it shows: `apiKey`, `authDomain`, `projectId` and `appId`.
3. In this folder, put the `apiKey`, `authDomain`, `projectId`, and `appId` into each area in `firebase-config.json` (These values identify your project and are not secret.)
4. In the Firebase console open Build, then Authentication, then Get started. Under Sign-in method turn on Email/Password. Optionally turn on Google as well.
5. Under Authentication, then Templates, you can change the wording and sender name of the verification and password reset emails.
6. When you put the site online, add your domain under Authentication, then Settings, then Authorized domains. `localhost` is already there.

## Run it

1. Install Node.js 18 or newer from https://nodejs.org
2. In this folder run: `npm install`
3. Start the server with `npm start` (restart it after changing `firebase-config.json`).
4. Open http://localhost:3000
5. Click Sign in, then Sign up. Firebase emails you a verification link; open it, then press "I have verified" in the banner.

The admin is the only account with powers to review, and accept/deny songs, with its email verified, sees the Review queue and can approve or reject songs. Signing in with Google using that Gmail address also counts as verified. Everyone else can only submit songs, and only after verifying their email. Because verification is required, nobody else can take over the admin email.

To change the admin email, edit the `ADMIN_EMAIL` line near the top of `server.js` and restart.

Passwords are never stored by RelaxNote. Firebase holds them. The server keeps only each person's name, email and account ID in `data/db.json`.

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
3. Put your `firebase-config.json` in the project folder before you run the app (see Set up sign-in), then sign in with email and password. The admin is cuberalted@gmail.com once its email is verified. The Continue with Google button is hidden in the desktop app because Google does not allow sign-in inside embedded apps.
4. In the app menu (press Alt if the menu is hidden), File, Open songs folder opens the folder where your mp3 files and `catalog.json` live. Add songs there the same way as above.
5. By default the app uses its own built-in server, so its accounts, songs and review queue are separate from the web version. To share one set of accounts and songs between the app and the website, choose File, Connect to a server, and enter the server address (for example http://localhost:3000 while `npm start` is running on the same computer). You sign in again after switching. Leave the address empty to go back to the built-in server.
6. The space bar plays and pauses, and the keyboard media keys control playback.

### Mini player

When RelaxNote is not the window in front (you clicked another app, or minimized it) and a song is loaded, a small mini player appears in the bottom-left corner of your main screen, just above the taskbar.
- It first opens as a small box with the song name, the artist, the cover, and previous, play/pause and next buttons.
- After a few seconds it shrinks to a small tab in the corner. Move the mouse over the tab to open it again.
- Click the cover or the song name to bring RelaxNote to the front. The mini player hides itself when you do.
- To turn it off, open View, then Show mini player when RelaxNote is not in front.

To make an installer for your own computer, run `npm run dist`. Windows gives an .exe installer, Mac a .dmg and Linux an AppImage. Run it on the system you want to build for. Installers appear in the `dist` folder.

## Community songs

1. Signed-in users open Submit, fill in the form and upload an mp3, wav, ogg, flac or m4a file (up to 30 MB).
2. The song is saved as pending and is not visible to anyone else.
3. You open Submit and see the Review queue. Listen to each song, then press Approve or Reject, with an optional reason that the artist can see.
4. Approved songs appear in the Hub for everyone. To take one down later, send `DELETE /api/admin/songs/<id>` with your admin token.

## Before putting it on the internet

- Host it on a service that keeps files between restarts (a VPS, or Render or Railway with a persistent disk) and serve it over HTTPS.
- Add your site's domain to Firebase under Authentication, then Settings, then Authorized domains, and put `firebase-config.json` on the server.
- Keep `data/` and `uploads/` backed up. Songs, covers and each person's name and email are stored there; `data/secret.txt` signs the short-lived links that let you preview pending songs.
- Songs and accounts are stored in `data/db.json`. That is fine for a small site; move to a real database such as PostgreSQL if it grows.
- Replace the [bracketed] placeholders in `public/terms.html` and `public/privacy.html` with your own details.
