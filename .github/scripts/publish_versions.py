"""Create only new version branches from checked release ZIPs; never force-push."""
from pathlib import Path, PurePosixPath
import hashlib, json, os, re, subprocess, tempfile, zipfile


def git(*args, cwd=None, check=True):
    return subprocess.run(['git', *args], cwd=cwd, check=check, text=True, capture_output=True)


def release_files(root, release):
    version = release['version']
    if not re.fullmatch(r'\d+\.\d+\.\d+', version) or release['branch'] != 'v' + version:
        raise ValueError('Invalid version branch')
    helper_name = f'releases/yantai-bookshelf-v{version}-helper.json'
    if release['helper'] != helper_name:
        raise ValueError('Invalid helper path')
    helper_bytes = (root / helper_name).read_bytes()
    if hashlib.sha256(helper_bytes).hexdigest() != release['sha256']:
        raise ValueError(f'Helper hash mismatch: {version}')
    helper = json.loads(helper_bytes)
    if helper.get('id') != 'dfe86938-8c9f-461a-b382-75b047b26ff2' or f'V{version}' not in helper.get('name', ''):
        raise ValueError('Wrong helper identity or version')
    files = {}
    with zipfile.ZipFile(root / f'releases/yantai-bookshelf-v{version}.zip') as archive:
        for entry in archive.infolist():
            name = PurePosixPath(entry.filename)
            if entry.is_dir():
                continue
            if len(name.parts) != 2 or name.parts[0] != 'jingdu-bookshelf' or name.name.startswith('.') or name.suffix not in ['.js', '.css', '.json', '.md']:
                raise ValueError('Unsafe or unexpected ZIP member: ' + entry.filename)
            if name.name in files or entry.file_size > 4_000_000:
                raise ValueError('Duplicate or excessive ZIP member')
            files[name.name] = archive.read(entry)
    manifest = json.loads(files['manifest.json'])
    if manifest['version'] != version or not all(name in files for name in ['index.js', 'core.js', 'organizer.js', 'style.css']):
        raise ValueError('Incomplete extension release')
    return files


def main():
    root = Path.cwd()
    catalog = json.loads((root / 'versions.json').read_text())
    if catalog['schema'] != 1 or catalog['extension'] != 'jingdu-bookshelf':
        raise ValueError('Not a bookshelf catalog')
    versions = [release['version'] for release in catalog['releases']]
    if len(set(versions)) != len(versions) or catalog['latest'] not in versions:
        raise ValueError('Duplicate or missing latest release')
    packages = [(release, release_files(root, release)) for release in catalog['releases']]
    if os.environ.get('BOOKSHELF_VALIDATE_ONLY') == '1':
        print(f'Validated {len(packages)} complete releases')
        return
    # Identity is scoped to this publishing repository.
    git('config', 'user.name', 'github-actions[bot]')
    git('config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com')
    for release, files in packages:
        branch = release['branch']
        exists = git('ls-remote', '--exit-code', '--heads', 'origin', 'refs/heads/' + branch, check=False)
        if exists.returncode == 0:
            # Reject reusing a published version number for different code.
            git('fetch', 'origin', 'refs/heads/' + branch)
            tracked = set(git('ls-tree', '-r', '--name-only', 'FETCH_HEAD').stdout.splitlines())
            if tracked != set(files):
                raise ValueError(f'{branch} already exists with different files; publish a new version number')
            for name, content in files.items():
                actual = subprocess.run(['git', 'show', f'FETCH_HEAD:{name}'], check=True, capture_output=True).stdout
                if actual != content:
                    raise ValueError(f'{branch} is immutable; publish a new version number')
            print(f'Kept {branch}')
            continue
        if exists.returncode != 2:
            raise RuntimeError('Could not verify existing release branches')
        with tempfile.TemporaryDirectory(prefix='bookshelf-publish-') as temporary:
            staging = Path(temporary) / 'version'
            git('worktree', 'add', '--detach', str(staging), 'HEAD')
            try:
                git('rm', '-r', '--ignore-unmatch', '.', cwd=staging)
                for name, content in files.items():
                    (staging / name).write_bytes(content)
                git('add', '--all', cwd=staging)
                git('commit', '--allow-empty', '-m', 'Publish bookshelf ' + branch, cwd=staging)
                git('push', 'origin', 'HEAD:refs/heads/' + branch, cwd=staging)
                print(f'Published {branch}')
            finally:
                git('worktree', 'remove', '--force', str(staging))


if __name__ == '__main__':
    main()
