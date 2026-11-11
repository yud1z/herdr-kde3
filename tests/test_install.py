import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('theme_install', ROOT / 'install.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class InstallerTests(unittest.TestCase):
    def run_install(self, path, dry_run=False):
        with contextlib.redirect_stdout(io.StringIO()):
            return module.install(path, dry_run)

    def test_preserves_other_keys_runtime_state_and_backs_up_changes(self):
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp)
            original = {'global': {'cmd-t': 'original'}, 'layout:other': {'x': 'keep'}}
            (dest / 'keys.json').write_text(json.dumps(original))
            (dest / 'shared.json').write_text('untouched runtime state')
            self.run_install(dest)
            merged = json.loads((dest / 'keys.json').read_text())
            self.assertEqual(merged['global'], original['global'])
            self.assertEqual(merged['layout:other'], original['layout:other'])
            self.assertIn('layout:kde3', merged)
            self.assertEqual((dest / 'shared.json').read_text(), 'untouched runtime state')
            self.assertEqual(len(list((dest / 'backups').glob('*/keys.json'))), 1)
            self.assertTrue((dest / 'mods/kde3/main.js').exists())
            self.assertFalse((dest / 'RECIPE.md').exists())
            self.assertFalse((dest / 'preview.png').exists())
            self.assertEqual(self.run_install(dest), 0)

    def test_dry_run_creates_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / 'herdr'
            self.assertGreater(self.run_install(dest, True), 0)
            self.assertFalse(dest.exists())

    def test_invalid_keys_are_rejected_before_install(self):
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp)
            (dest / 'keys.json').write_text('[]')
            with self.assertRaises(ValueError):
                self.run_install(dest)
            self.assertFalse((dest / 'mods').exists())

    def test_symlink_destinations_are_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / 'herdr'
            dest.mkdir()
            outside = Path(tmp) / 'outside'
            outside.mkdir()
            (dest / 'mods').symlink_to(outside, target_is_directory=True)
            with self.assertRaises(ValueError):
                self.run_install(dest)
            self.assertEqual(list(outside.iterdir()), [])


if __name__ == '__main__':
    unittest.main()
