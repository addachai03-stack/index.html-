import unittest
from render_summary import md, summary


class RenderSummaryTests(unittest.TestCase):
    def test_platform_block_does_not_claim_mp4(self):
        result=summary({"status":"failed","failure_code":"SOURCE_PLATFORM_BLOCKED",
                        "recovery":"Platform requires sign-in or bot verification."})
        self.assertIn("SOURCE_PLATFORM_BLOCKED",result)
        self.assertIn("no new MP4 claimed",result)
        self.assertNotIn("MP4 Shorts reported",result)

    def test_completed_needs_reported_output(self):
        bad=summary({"status":"completed","count":0,"videos":[]})
        self.assertIn("no verified MP4 outputs",bad)
        good=summary({"status":"completed","count":1,"videos":["short_01.mp4"]})
        self.assertIn("short_01.mp4",good)
        self.assertIn("MP4 Shorts reported",good)

    def test_output_never_executes_markdown_html(self):
        self.assertNotIn("<script>",md("<script>bad</script>"))
        self.assertIn("&lt;script&gt;",md("<script>"))

    def test_absent_report_no_success(self):
        self.assertIn("not yet available",summary({}))


if __name__ == "__main__":
    unittest.main()
