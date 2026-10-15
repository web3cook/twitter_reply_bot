#!/usr/bin/env python3
"""Scan git changes for secrets, credentials, and env files.

Used by pre-commit (staged files) and pre-push (commits being pushed).
Exit 1 if anything confidential is found.

  python3 githooks/scan_secrets.py --staged
  python3 githooks/scan_secrets.py --rev NEW [OLD]
  python3 githooks/scan_secrets.py --files path [path ...]
"""
import argparse
import os
import re
import subprocess
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SKIP_DIR_PREFIXES = ("githooks/",)
SKIP_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp",
    ".woff", ".woff2", ".ttf", ".eot", ".otf",
    ".mp4", ".mp3", ".wav", ".pdf", ".zip", ".gz", ".tgz",
}

# Placeholders used in this repo's docs/UI (sk-..., xai-..., code=...).
PLACEHOLDER_RE = re.compile(r"\.{3}|…|your[_-]?api[_-]?key|changeme|xxx+|redacted|<[^>]+>|\$\{", re.I)

# Public Grok CLI OAuth client (PKCE, no client secret). Not a credential.
ALLOWED_SUBSTRINGS = (
    "b1a00492-073a-47ea-816f-4c329264a828",
)

BLOCKED_BASENAMES = {
    ".env",
    "credentials.json",
    "secrets.json",
    ".secrets",
    "id_rsa",
    "id_dsa",
    "id_ecdsa",
    "id_ed25519",
}

BLOCKED_BASENAME_REGEXES = [
    re.compile(r"^\.env\.(local|production|prod|development|dev|staging|test|secret)$", re.I),
    re.compile(r"^service-account.*\.json$", re.I),
    re.compile(r".*-credentials\.json$", re.I),
]

BLOCKED_EXTENSIONS = {
    ".pem", ".p12", ".pfx", ".key", ".keystore", ".jks", ".secret",
}

ALLOWED_ENV_BASENAMES = {".env.example", ".env.sample"}

# name, regex, description
CONTENT_RULES = [
    (
        "private-key",
        re.compile(r"-----BEGIN (?:RSA |OPENSSH |EC |DSA |PGP )?PRIVATE KEY-----"),
        "PEM / OpenSSH private key",
    ),
    (
        "openai-key",
        re.compile(r"\bsk-(?:proj-|svcacct-)?[A-Za-z0-9]{20,}"),
        "OpenAI / DeepSeek-style API key",
    ),
    (
        "anthropic-key",
        re.compile(r"\bsk-ant-[A-Za-z0-9_-]{20,}"),
        "Anthropic API key",
    ),
    (
        "xai-key",
        re.compile(r"\bxai-[A-Za-z0-9]{20,}"),
        "xAI API key",
    ),
    (
        "github-token",
        re.compile(r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}"),
        "GitHub token",
    ),
    (
        "github-pat",
        re.compile(r"\bgithub_pat_[A-Za-z0-9_]{20,}"),
        "GitHub fine-grained PAT",
    ),
    (
        "aws-access-key",
        re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
        "AWS access key id",
    ),
    (
        "google-api-key",
        re.compile(r"\bAIza[0-9A-Za-z_-]{35}"),
        "Google API key",
    ),
    (
        "slack-token",
        re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}"),
        "Slack token",
    ),
    (
        "stripe-live-key",
        re.compile(r"\b(?:sk|rk)_live_[0-9a-zA-Z]{16,}"),
        "Stripe live secret key",
    ),
    (
        "jwt",
        re.compile(r"\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}"),
        "JWT (access/id token)",
    ),
    (
        "bearer-token",
        re.compile(r"\bBearer\s+[A-Za-z0-9._\-+/=]{24,}"),
        "Bearer token literal",
    ),
    (
        "connection-string",
        re.compile(
            r"\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis)://[^\s:]+:[^\s@]+@"
        ),
        "Database URL with password",
    ),
    (
        "assigned-secret",
        re.compile(
            r"""(?i)\b(?:api[_-]?key|apikey|secret|password|passwd|auth[_-]?token|access[_-]?token|refresh[_-]?token|private[_-]?key|client[_-]?secret)\b\s*[:=]\s*['"][^'"]{16,}['"]"""
        ),
        "Hardcoded secret assignment",
    ),
]


def git(*args):
    result = subprocess.run(
        ["git", "-C", REPO_ROOT] + list(args),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        universal_newlines=True,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "git {0} failed".format(" ".join(args)))
    return result.stdout


def empty_tree_sha():
    return git("hash-object", "-t", "tree", "/dev/null").strip()


def normalize_path(path):
    rel = path.replace("\\", "/")
    while rel.startswith("./"):
        rel = rel[2:]
    return rel


def should_skip_path(path):
    rel = normalize_path(path)
    if any(rel == p.rstrip("/") or rel.startswith(p) for p in SKIP_DIR_PREFIXES):
        return True
    ext = os.path.splitext(rel)[1].lower()
    return ext in SKIP_EXTENSIONS


def is_blocked_filename(path):
    rel = normalize_path(path)
    base = os.path.basename(rel)
    if base in ALLOWED_ENV_BASENAMES:
        return None
    if base in BLOCKED_BASENAMES:
        return "blocked filename ({0})".format(base)
    if base.startswith(".env"):
        return "env file ({0})".format(base)
    ext = os.path.splitext(base)[1].lower()
    if ext in BLOCKED_EXTENSIONS:
        return "secret-like extension ({0})".format(ext)
    for rx in BLOCKED_BASENAME_REGEXES:
        if rx.match(base):
            return "blocked filename ({0})".format(base)
    return None


def is_placeholder(text):
    if PLACEHOLDER_RE.search(text):
        return True
    # Template / interpolation, not a literal secret.
    if "${" in text or text.strip().startswith("`"):
        return True
    return False


def redact(text, limit=8):
    compact = re.sub(r"\s+", " ", text).strip()
    if len(compact) <= limit:
        return compact[0:2] + "***"
    return compact[:limit] + "***"


def scan_text(path, text):
    findings = []
    if text is None:
        return findings
    lines = text.splitlines()
    for i, line in enumerate(lines, 1):
        if "secret-scan:allow" in line:
            continue
        if any(s in line for s in ALLOWED_SUBSTRINGS):
            # Still scan the rest of the line for other rules, but skip
            # matches that are only the allowlisted public client id.
            pass
        for name, rx, desc in CONTENT_RULES:
            for match in rx.finditer(line):
                snippet = match.group(0)
                if any(s in snippet for s in ALLOWED_SUBSTRINGS):
                    continue
                if is_placeholder(snippet) or is_placeholder(line):
                    continue
                findings.append(
                    {
                        "path": path,
                        "line": i,
                        "rule": name,
                        "desc": desc,
                        "preview": redact(snippet),
                    }
                )
    return findings


def list_changed_files(new_rev, old_rev):
    if not old_rev:
        old_rev = empty_tree_sha()
    out = git("diff", "--name-only", "--diff-filter=ACM", old_rev, new_rev)
    return [normalize_path(p) for p in out.splitlines() if p.strip()]


def list_staged_files():
    out = git("diff", "--cached", "--name-only", "--diff-filter=ACM")
    return [normalize_path(p) for p in out.splitlines() if p.strip()]


def show_file_at_rev(rev, path):
    result = subprocess.run(
        ["git", "-C", REPO_ROOT, "show", "{0}:{1}".format(rev, path)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if result.returncode != 0:
        return None
    if b"\0" in result.stdout[:8000]:
        return None
    try:
        return result.stdout.decode("utf-8")
    except UnicodeDecodeError:
        return None


def show_staged_file(path):
    result = subprocess.run(
        ["git", "-C", REPO_ROOT, "show", ":{0}".format(path)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if result.returncode != 0:
        return None
    if b"\0" in result.stdout[:8000]:
        return None
    try:
        return result.stdout.decode("utf-8")
    except UnicodeDecodeError:
        return None


def read_working_tree_file(path):
    full = os.path.join(REPO_ROOT, path)
    if not os.path.isfile(full):
        return None
    with open(full, "rb") as fh:
        data = fh.read()
    if b"\0" in data[:8000]:
        return None
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return None


def scan_paths(paths, reader):
    findings = []
    for path in paths:
        blocked = is_blocked_filename(path)
        if blocked:
            findings.append(
                {
                    "path": path,
                    "line": None,
                    "rule": "filename",
                    "desc": blocked,
                    "preview": os.path.basename(path),
                }
            )
            continue
        if should_skip_path(path):
            continue
        text = reader(path)
        findings.extend(scan_text(path, text))
    return findings


def print_findings(findings, action):
    print("")
    print("CONFIDENTIAL CONTENT DETECTED")
    print("The following looks like a secret, credential, or env file.")
    print("It will not be {0} until it is removed.".format(action))
    print("")
    for f in findings:
        loc = f["path"] if f["line"] is None else "{0}:{1}".format(f["path"], f["line"])
        print("  {0}".format(loc))
        print("    [{0}] {1}: {2}".format(f["rule"], f["desc"], f["preview"]))
    print("")
    print("Fix: remove the value (use chrome.storage / a local .env that is gitignored).")
    print("If this is a false positive, you can bypass with --no-verify.")
    print("")


def parse_args(argv):
    parser = argparse.ArgumentParser(description="Scan git changes for secrets.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--staged", action="store_true", help="Scan staged files (pre-commit)")
    group.add_argument("--rev", nargs="+", metavar="SHA", help="Scan NEW [OLD] (pre-push)")
    group.add_argument("--files", nargs="+", help="Scan working-tree files")
    return parser.parse_args(argv)


def main(argv):
    args = parse_args(argv)
    if args.staged:
        paths = list_staged_files()
        findings = scan_paths(paths, show_staged_file)
        action = "committed"
    elif args.rev:
        new_rev = args.rev[0]
        old_rev = args.rev[1] if len(args.rev) > 1 else empty_tree_sha()
        zero = "0" * 40
        if new_rev == zero:
            return 0
        if old_rev == zero:
            old_rev = empty_tree_sha()
        paths = list_changed_files(new_rev, old_rev)
        findings = scan_paths(paths, lambda p: show_file_at_rev(new_rev, p))
        action = "pushed"
    else:
        paths = [normalize_path(p) for p in args.files]
        findings = scan_paths(paths, read_working_tree_file)
        action = "included"

    if findings:
        print_findings(findings, action)
        return 1
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except RuntimeError as exc:
        print("secret-scan: {0}".format(exc), file=sys.stderr)
        sys.exit(1)
