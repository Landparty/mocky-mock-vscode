// src/environment/statusPresentation.ts
//
// How each setup state looks in the status bar. Pure (no `vscode` import)
// so it's unit-testable; environmentManager.ts applies it.
//
// The design goal: when everything works, the item is a quiet single
// "mockymock" with a check -- it shouldn't compete with the user's own
// status items. When something is wrong it says what in a few words, turns
// the warning/error colour VS Code users already read as "act on me", and
// its click (Check Setup) is the fix.

export type SetupState =
  | 'checking'
  | 'ready'
  | 'cli-missing'
  | 'cli-blocked'
  | 'installing'
  | 'docker-stopped'
  | 'docker-failed'
  | 'docker-missing';

export interface StatusPresentation {
  text: string;
  // Theme colour id for the item background, or undefined for none.
  background?: 'statusBarItem.warningBackground' | 'statusBarItem.errorBackground';
  // One-line explanation shown at the top of the hover.
  summary: string;
  // What clicking the item will do -- shown in the hover too.
  clickHint: string;
}

export function presentStatus(state: SetupState, detail?: string): StatusPresentation {
  switch (state) {
    case 'checking':
      return {
        text: '$(sync~spin) mockymock',
        summary: 'Checking for the mockymock CLI and Docker…',
        clickHint: 'Click to run the full setup check.',
      };
    case 'ready':
      return {
        text: '$(check) mockymock',
        summary: 'Ready: the mockymock CLI and Docker are both available.',
        clickHint: 'Click to re-check your setup.',
      };
    case 'cli-missing':
      return {
        text: '$(warning) mockymock: CLI not found',
        background: 'statusBarItem.warningBackground',
        summary: 'The mockymock CLI could not be found.',
        clickHint: 'Click to install it.',
      };
    case 'cli-blocked':
      return {
        text: '$(error) mockymock: CLI blocked',
        background: 'statusBarItem.errorBackground',
        summary: detail ?? 'The operating system refused to run the mockymock CLI.',
        clickHint: 'Click for how to fix it.',
      };
    case 'installing':
      return {
        text: '$(sync~spin) mockymock: installing CLI…',
        summary: 'Installing the mockymock CLI…',
        clickHint: 'This only takes a moment.',
      };
    case 'docker-stopped':
      return {
        text: '$(warning) mockymock: start Docker',
        background: 'statusBarItem.warningBackground',
        summary: 'Docker Desktop is installed but not running. Tests need it to compile COBOL.',
        clickHint: 'Click to start Docker Desktop.',
      };
    case 'docker-failed':
      return {
        text: '$(error) mockymock: Docker didn\'t start',
        background: 'statusBarItem.errorBackground',
        summary: detail ?? 'Docker Desktop did not start in time.',
        clickHint: 'Click to try again.',
      };
    case 'docker-missing':
      return {
        text: '$(warning) mockymock: Docker needed',
        background: 'statusBarItem.warningBackground',
        summary: 'Docker Desktop is required to run tests and was not found.',
        clickHint: 'Click to open the Docker Desktop download page.',
      };
  }
}

// The hover body, as Markdown with command links. Kept here, not in the
// vscode-importing file, so the links are testable against package.json.
export function statusTooltipMarkdown(p: StatusPresentation): string {
  return [
    `**mockymock** — ${p.summary}`,
    '',
    p.clickHint,
    '',
    '---',
    '',
    '[$(pulse) Check Setup](command:mockymock.checkEnvironment) · ' +
      '[$(book) Getting Started](command:mockymock.openWalkthrough) · ' +
      '[$(gear) Settings](command:workbench.action.openSettings?%22mockymock%22)',
  ].join('\n');
}
