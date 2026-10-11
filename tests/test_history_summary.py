"""history_summary.summarize: per-artist listening totals from raw history rows."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from history_summary import summarize  # noqa: E402


def play(artist, track, ms, ts):
    return {"master_metadata_album_artist_name": artist, "master_metadata_track_name": track,
            "ms_played": ms, "ts": ts, "ip_addr": "203.0.113.7", "episode_name": None}


ROWS = [
    play("Juice WRLD", "Lucid Dreams", 240_000, "2020-03-01T10:00:00Z"),
    play("Juice WRLD", "Lucid Dreams", 200_000, "2021-06-01T10:00:00Z"),
    play("Juice WRLD", "Robbery", 10_000, "2019-12-31T23:00:00Z"),       # skipped after 10s
    play("Powfu", "death bed", 180_000, "2022-01-05T08:00:00Z"),
    {"master_metadata_album_artist_name": None, "master_metadata_track_name": None, "episode_name": "A podcast",
     "ms_played": 3_600_000, "ts": "2023-01-01T00:00:00Z"},              # a podcast: not an artist
]


class Summarize(unittest.TestCase):
    def setUp(self):
        self.s = summarize(ROWS)
        self.juice = self.s["artists"]["Juice WRLD"]

    def test_totals_listening_time_per_artist(self):
        self.assertAlmostEqual(self.juice["hours"], 450_000 / 3_600_000, places=3)

    def test_counts_plays_of_30_seconds_or_more(self):
        self.assertEqual(self.juice["plays"], 2)

    def test_first_and_last_play(self):
        self.assertEqual(self.juice["first"], "2019-12-31T23:00:00Z")
        self.assertEqual(self.juice["last"], "2021-06-01T10:00:00Z")

    def test_top_songs_by_time(self):
        self.assertEqual([t["name"] for t in self.juice["top_songs"]], ["Lucid Dreams", "Robbery"])

    def test_skips_podcasts(self):
        self.assertEqual(sorted(self.s["artists"]), ["Juice WRLD", "Powfu"])

    def test_keeps_nothing_personal(self):
        self.assertNotIn("203.0.113.7", repr(self.s))

    def test_overall_span_covers_music_only(self):
        # the podcast on 2023-01-01 isn't music, so the span ends with Powfu
        self.assertEqual((self.s["from"], self.s["to"]), ("2019-12-31T23:00:00Z", "2022-01-05T08:00:00Z"))


if __name__ == "__main__":
    unittest.main()
