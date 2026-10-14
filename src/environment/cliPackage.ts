// Where the mockymock CLI comes from when the extension (or its CI) has to
// install it: the "mockymock" distribution on PyPI, not a clone of the
// mocky-mock repo. The CLI repo publishes there from its release-please
// workflow (publish-pypi job), so a released version is all we ever need.

// [project].name in mocky-mock's pyproject.toml -- the PyPI project name.
// The console script it installs has the same name.
export const MOCKYMOCK_PYPI_PACKAGE = 'mockymock';

// The CLI release this extension is built and contract-tested against.
// 0.10.x is the first with the NO_ASSERTION lint warning the contract test
// checks and the `suites` command multi-suite pairing uses.
// .github/workflows/ci.yml and build-and-release.yml default to this same
// version (cliPackage.test.ts keeps them in step) -- bump all three together.
export const MOCKYMOCK_CLI_VERSION = '0.10.1';

// What the auto-install fallback asks uv for: a floor, not an exact pin, so
// a user who has to install the CLI gets the newest release (newer
// subcommands like `suites` light up through capability probes) but never
// one older than the extension was tested against.
export function mockymockInstallRequirement(): string {
  return `${MOCKYMOCK_PYPI_PACKAGE}>=${MOCKYMOCK_CLI_VERSION}`;
}
