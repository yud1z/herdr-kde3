from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]


class ShareableLayoutTests(unittest.TestCase):
    def test_recipe_order_and_single_folder_contents(self):
        recipe = (ROOT / 'RECIPE.md').read_text()
        self.assertTrue(recipe.startswith('# KDE3 Konsole Desktop\n'))
        self.assertIn('![KDE3 Konsole Desktop](preview.png)', recipe)
        self.assertEqual(re.findall(r'^## (.+)$', recipe, re.MULTILINE), [
            'What you see', 'How it behaves', 'Built from', 'Watch out', 'Done when'])
        for name in ['preview.png', 'layouts/kde3.json', 'layouts/kde3.svg',
                     'mods/kde3/main.js', 'mods/kde3/mod.json', 'keys.json',
                     'themes/kde3.json', 'themes/kde3-linux.json']:
            self.assertTrue((ROOT / name).is_file(), name)
        self.assertTrue((ROOT / 'preview.png').read_bytes().startswith(b'\x89PNG\r\n\x1a\n'))
