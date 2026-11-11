import base64
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('publication', ROOT / 'scripts/check-publication.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=')


class PublicationTests(unittest.TestCase):
    def fixture(self, root):
        (root / 'mods/kde3/icons/period').mkdir(parents=True)
        (root / 'mods/kde3/icons/period/manifest.json').write_text('[]')
        (root / 'keys.json').write_text(json.dumps({'layout:kde3': {}}))
        (root / 'docs').mkdir()
        (root / 'preview.png').write_bytes(PNG)

    def test_minimal_clean_bundle(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.fixture(root)
            self.assertEqual(module.audit(root)[1], [])

    def test_credential_private_identity_and_runtime_artifacts_are_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.fixture(root)
            (root / 'example.js').write_text('ghp_' + 'A' * 36)
            (root / 'identity.md').write_text('private-demo-marker')
            (root / '.env.local').write_text('not-a-real-credential')
            problems = module.audit(root, ['private-demo-marker'])[1]
            self.assertTrue(any('credential' in value for value in problems))
            self.assertTrue(any('identity' in value for value in problems))
            self.assertTrue(any('artifact' in value for value in problems))

    def test_unreviewed_images_and_symlink_directories_are_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.fixture(root)
            (root / 'capture.png').write_bytes(PNG)
            (root / 'linked').symlink_to(root / 'docs', target_is_directory=True)
            problems = module.audit(root)[1]
            self.assertTrue(any('unreviewed image' in value for value in problems))
            self.assertTrue(any('symlink' in value for value in problems))

    def test_screenshot_trailing_data_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.fixture(root)
            (root / 'preview.png').write_bytes(PNG + b'not-image-data')
            self.assertTrue(any('Unexpected data' in value for value in module.audit(root)[1]))


if __name__ == '__main__':
    unittest.main()
