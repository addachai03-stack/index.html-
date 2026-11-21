import unittest
from hook_rank import tokens, cue_count, hook_strength, strongest_phrase, best_nonoverlap, speech_coverage
from studio import Candidate, Segment, score_window, pick_clips
from premium import choose_title

class HookTests(unittest.TestCase):
    def test_hindi_tokens_and_cues(self):
        self.assertEqual(tokens("क्या आप जानते हैं?"),["क्या","आप","जानते","हैं"])
        self.assertGreater(hook_strength("क्या आप जानते हैं?"),0.5)
        self.assertEqual(cue_count("somewhat somehow"),0)

    def test_early_hook_preferred(self):
        early=score_window([Segment(0,3,"Did you know this secret?"),Segment(10,13,"Here is the explanation")],[],0,15)
        late=score_window([Segment(0,3,"Here is the explanation"),Segment(10,13,"Did you know this secret?")],[],0,15)
        self.assertGreater(early.score,late.score)
        self.assertLessEqual(early.score,1)

    def test_source_grounded_title(self):
        speech="Today we are talking. क्या आप जानते हैं?"
        title=choose_title(speech,"engagement")
        self.assertIn(title,speech)
        self.assertIn("क्या",title)
        self.assertEqual(strongest_phrase(""),"")

    def test_weighted_selection_keeps_late_highlights(self):
        def c(a,b,s): return Candidate(a,b,s,"","","")
        cuts=best_nonoverlap([c(0,15,.1),c(15,30,.1),c(45,60,.9),c(60,75,.8),c(45,75,.99)],2)
        self.assertEqual([(x.start,x.end) for x in cuts],[(45,60),(60,75)])
        self.assertEqual(speech_coverage([(0,5),(2,7)],0,10),.7)

    def test_word_boundaries_and_duration(self):
        seg=Segment(0,3,"old new",((0.,1.,"old"),(2.,3.,"new")))
        self.assertEqual(score_window([seg],[],1.5,16.5).transcript,"new")
        cuts=pick_clips([],[],30.067,requested=3,min_seconds=15,max_seconds=15)
        self.assertEqual([(c.start,c.end) for c in cuts],[(0.,15.),(15.,30.)])
