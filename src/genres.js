// Sorts MusicBrainz's very specific genres ("midwest emo", "easycore", "cloud rap")
// into a few broad groups. Rules are checked in order and the first match wins,
// so "emo rap" lands in Emo & cloud rap before the Emo rule sees it.
export const GROUPS = [
  { id: "emo", name: "Emo", test: g => /\bemo\b|emocore|midwest emo/.test(g) && !/rap/.test(g) },
  { id: "emorap", name: "Emo & cloud rap", test: g => /emo rap|cloud rap|sad rap/.test(g) },
  { id: "heavy", name: "Post-hardcore & metal", test: g => /metal|hardcore(?! hip hop)|screamo|easycore|core$|djent/.test(g) },
  { id: "punk", name: "Pop punk & punk", test: g => /punk|skate/.test(g) },
  { id: "rap", name: "Rap & hip hop", test: g => /hip hop|rap|trap|drill|boom bap|horrorcore|grime/.test(g) },
  { id: "rnb", name: "R&B & soul", test: g => /r&b|soul|funk/.test(g) },
  { id: "indie", name: "Indie & alternative", test: g => /indie|alternative|lo-fi|shoegaze|dream pop|math rock|experimental|slowcore|bedroom/.test(g) },
  { id: "rock", name: "Rock", test: g => /rock|grunge|new wave|britpop/.test(g) },
  { id: "pop", name: "Pop & electronic", test: g => /pop|electronic|dance|house|bass|synth|edm|disco|techno|step/.test(g) },
  { id: "other", name: "Other", test: () => true },
];
export const NO_GENRE = { id: "none", name: "No genre found" };

const groupCache = new Map();
export function groupOf(genre) {
  if (!groupCache.has(genre)) groupCache.set(genre, GROUPS.find(gr => gr.test(genre.toLowerCase())));
  return groupCache.get(genre);
}

// An artist's genres, already picked from your file, MusicBrainz or Last.fm in data.js.
export const artistGenres = artist => artist?.genres || [];

// A song's group comes from its main artist's top genre;
// if the main artist has none, the other artists on the song are tried.
export function songGroup(song, artistByName) {
  for (const name of song.artists) {
    const genres = artistGenres(artistByName(name));
    if (genres.length) return groupOf(genres[0]);
  }
  return NO_GENRE;
}
