#  Python code to check that a version number is greater or equal to
#  another. It would be nicer to use packaging.version, but that's not
#  part of the standard library.
def version_ge(version1: str, version2: str):
    # First drop everything after '+'
    version1 = version1.split("+")[0]
    version2 = version2.split("+")[0]

    def split_version(v: str) -> list[str]:
        # First split on '.dev'
        v = v.replace(".dev", ".").replace("dev", ".")
        parts = v.split(".")
        return parts

    parts1 = [int(x) for x in split_version(version1)]
    parts2 = [int(x) for x in split_version(version2)]

    max_length = max(len(parts1), len(parts2))
    parts1 += [0] * (max_length - len(parts1))
    parts2 += [0] * (max_length - len(parts2))

    for part1, part2 in zip(parts1, parts2):
        if part1 > part2:
            return True
        elif part1 < part2:
            return False

    return True


#  Test cases for version_ge():
#    assert not version_ge("0.dev16+g83", "0.0.1")
#    assert not version_ge("0.3.dev16+g83", "0.3.1")
#    assert version_ge("0.3.1.dev16+g83", "0.3.1")
#    assert not version_ge("0.3.1", "0.3.1.dev16+g83")
#    assert not version_ge("0.3.1.dev16+g83", "0.3.2")
#    assert version_ge("0.3.1.dev16+g83", "0.3.1.dev15")
#    assert version_ge("0.3.1.dev15+g83", "0.3.1.dev15")
#    assert not version_ge("0.3.1.dev15+g83", "0.3.1.dev16")
#    assert version_ge("0.3.1dev16", "0.3.1")
#    assert version_ge("0.3.1.dev16", "0.3.1")
#    assert not version_ge("0.3.dev16+g83", "0.3.1")
#    assert not version_ge("0.3.0dev16", "0.3.1")


def check_package_version(package: str, min_version: str | None) -> dict[str, object]:
    try:
        import importlib
        from importlib.metadata import version

        importlib.import_module(package)

        ver = version(package)
        if min_version is None:
            at_least_min_version = None
        else:
            at_least_min_version = version_ge(ver, min_version)

    except ImportError:
        ver = None
        at_least_min_version = None

    return {
        "language": "python",
        "package": package,
        "version": ver,
        "min_version": min_version,
        "at_least_min_version": at_least_min_version,
    }
