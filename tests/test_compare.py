"""The playlist compare function (fix_added_dates.compare_playlists), on the fixture."""
import json
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from fix_added_dates import compare_playlists  # noqa: E402


def load(name):
    with open(os.path.join(ROOT, "tests", "fixtures", name), encoding="utf-8") as f:
        return json.load(f)["songs"]


class ComparePlaylists(unittest.TestCase):
    def setUp(self):
        self.songs = load("playlist.json")
        self.old = load("old_playlist.json")
        changed, self.kept, unmatched = compare_playlists(self.songs, self.old)
        self.changed = {(s["position"], s["title"]): new for s, _, new in changed}
        self.unmatched = [s["title"] for s in unmatched]

    def date_for(self, title):
        return {t: d for (_, t), d in self.changed.items()}.get(title)

    def test_matches_by_spotify_id(self):
        self.assertEqual(self.date_for("I Smoked Away My Brain (I'm God x Demons Mashup) (feat. Imogen Heap & Clams Casino)"), "2022-09-18T16:23:16Z")

    def test_takes_the_earliest_of_duplicates_in_the_old_playlist(self):
        # in the old playlist twice (Oct 1 and Sep 20): Sep 20 wins, for both current copies
        dates = [d for (_, t), d in self.changed.items() if t == "Everything Is Alright"]
        self.assertEqual(dates, ["2022-09-20T10:00:00Z", "2022-09-20T10:00:00Z"])

    def test_matches_by_title_and_main_artist_when_ids_differ(self):
        self.assertEqual(self.date_for("Ohio Is for Lovers"), "2022-10-15T10:00:00Z")
        self.assertEqual(self.date_for("Ohio Is For Lovers"), "2022-10-15T10:00:00Z")

    def test_matches_a_local_file_by_its_title(self):
        self.assertEqual(self.date_for("Y2Mate.is - guardin - fake (prod. by canis major)-hgLryZHnh-w-160k-1654285075557"), "2022-11-01T10:00:00Z")

    def test_never_moves_a_date_later(self):
        # the old playlist has a later date for "Need": it keeps its own
        self.assertIsNone(self.date_for("Need"))
        self.assertEqual(self.kept, 1)

    def test_songs_missing_from_the_old_playlist_keep_their_dates(self):
        self.assertIn("Preaching to the choir", self.unmatched)
        self.assertIn("High", self.unmatched)
        self.assertNotIn("Need", self.unmatched)

    def test_modifies_nothing(self):
        self.assertEqual(self.songs, load("playlist.json"))


if __name__ == "__main__":
    unittest.main()
