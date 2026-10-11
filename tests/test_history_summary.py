"""history_summary.summarize: per-artist and per-song listening totals from raw history rows."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from history_summary import match_song, normalize, playlist_index, summarize  # noqa: E402


def play(artist, track, ms, ts, track_id=None):
    return {"master_metadata_album_artist_name": artist, "master_metadata_track_name": track,
            "ms_played": ms, "ts": ts, "ip_addr": "203.0.113.7", "episode_name": None,
            "spotify_track_uri": "spotify:track:" + track_id if track_id else None}


def song(title, artist, track_id=None, is_local=False):
    return {"title": title, "artists": [{"name": artist}], "id": track_id, "is_local": is_local}


PLAYLIST = [
    song("Lucid Dreams", "Juice WRLD", "lucid1"),
    song("Don't Kill My Vibe", "Sigrid", "vibe1"),
    song("Y2Mate.is - lil peep the way i see things", None, is_local=True),
]
PLAYLIST[2]["artists"] = []
CORRECTIONS = {"local:Y2Mate.is - lil peep the way i see things":
               {"title": "The Way I See Things", "artists": [{"name": "Lil Peep"}]}}

ROWS = [
    play("Juice WRLD", "Lucid Dreams", 240_000, "2020-03-01T10:00:00Z", "lucid1"),
    play("Juice WRLD", "Lucid Dreams", 200_000, "2021-06-01T10:00:00Z", "lucid1"),
    play("Juice WRLD", "Lucid Dreams", 29_999, "2021-06-02T10:00:00Z", "lucid1"),  # skip
    play("Juice WRLD", "Robbery", 10_000, "2019-12-31T23:00:00Z", "rob1"),         # skip
    play("Powfu", "death bed", 180_000, "2022-01-05T08:00:00Z", "bed1"),           # not on the playlist
    {"master_metadata_album_artist_name": None, "master_metadata_track_name": None, "episode_name": "A podcast",
     "ms_played": 3_600_000, "ts": "2023-01-01T00:00:00Z"},                         # a podcast: not an artist
]


class SkipRule(unittest.TestCase):
    def setUp(self):
        self.s = summarize(ROWS, PLAYLIST, CORRECTIONS)
        self.juice = self.s["artists"]["Juice WRLD"]

    def test_plays_under_30_seconds_are_skips(self):
        self.assertEqual((self.juice["plays"], self.juice["skips"]), (2, 2))

    def test_exactly_30_seconds_is_a_play(self):
        s = summarize([play("A", "B", 30_000, "2020-01-01T00:00:00Z")])
        self.assertEqual((s["artists"]["A"]["plays"], s["artists"]["A"]["skips"]), (1, 0))

    def test_skips_add_no_hours(self):
        self.assertEqual(self.juice["hours"], round(440_000 / 3_600_000, 2))
        self.assertEqual(self.s["songs"]["lucid1"], {"hours": round(440_000 / 3_600_000, 2), "plays": 2, "skips": 1})

    def test_artist_with_only_skips_is_kept_with_zero_plays(self):
        s = summarize([play("A", "B", 5_000, "2020-01-01T00:00:00Z")])
        self.assertEqual((s["artists"]["A"]["plays"], s["artists"]["A"]["hours"]), (0, 0))


class Matching(unittest.TestCase):
    def setUp(self):
        self.index = playlist_index(PLAYLIST, CORRECTIONS)

    def test_matches_by_spotify_id_first(self):
        # different title, same ID: still the playlist song
        row = play("Juice WRLD", "Lucid Dreams (Remastered)", 200_000, "2020-01-01T00:00:00Z", "lucid1")
        self.assertEqual(match_song(row, *self.index), "lucid1")

    def test_falls_back_to_title_and_main_artist(self):
        # another release of the same song has another ID; punctuation and case don't matter
        row = play("Sigrid", "Don’t kill my vibe", 200_000, "2020-01-01T00:00:00Z", "single99")
        self.assertEqual(match_song(row, *self.index), "vibe1")

    def test_same_title_by_another_artist_does_not_match(self):
        row = play("Someone Else", "Lucid Dreams", 200_000, "2020-01-01T00:00:00Z", "other1")
        self.assertIsNone(match_song(row, *self.index))

    def test_local_file_matches_under_its_corrected_details(self):
        row = play("Lil Peep", "The Way I See Things", 200_000, "2020-01-01T00:00:00Z", "peep1")
        self.assertEqual(match_song(row, *self.index), "local:Y2Mate.is - lil peep the way i see things")

    def test_unmatched_plays_still_count_for_their_artist(self):
        s = summarize(ROWS, PLAYLIST, CORRECTIONS)
        self.assertEqual(s["artists"]["Powfu"]["plays"], 1)
        self.assertEqual(sorted(s["songs"]), ["lucid1"])

    def test_normalize_matches_the_app(self):
        self.assertEqual(normalize("Don’t Kill My Vibe"), "dont kill my vibe")
        self.assertEqual(normalize("Beyoncé"), "beyonce")


class Summary(unittest.TestCase):
    def setUp(self):
        self.s = summarize(ROWS, PLAYLIST, CORRECTIONS)

    def test_first_and_last_play(self):
        juice = self.s["artists"]["Juice WRLD"]
        self.assertEqual((juice["first"], juice["last"]), ("2019-12-31", "2021-06-02"))

    def test_last_12_months_ends_at_the_last_play(self):
        # the history ends 2022-01-05: only Powfu's play is within a year of that
        self.assertEqual(self.s["recent_from"], "2021-01-05T08:00:00Z")
        self.assertEqual(self.s["artists"]["Juice WRLD"]["recent_plays"], 1)  # 2021-06-01
        self.assertEqual(self.s["artists"]["Powfu"]["recent_hours"], 0.05)

    def test_leaves_out_podcasts(self):
        self.assertEqual(sorted(self.s["artists"]), ["Juice WRLD", "Powfu"])

    def test_keeps_nothing_personal(self):
        self.assertNotIn("203.0.113.7", repr(self.s))

    def test_overall_span_covers_music_only(self):
        self.assertEqual((self.s["from"], self.s["to"]), ("2019-12-31T23:00:00Z", "2022-01-05T08:00:00Z"))

    def test_empty_history(self):
        self.assertEqual(summarize([])["artists"], {})


if __name__ == "__main__":
    unittest.main()
