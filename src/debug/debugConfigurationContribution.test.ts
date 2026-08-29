import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

// package.json's `debuggers` entry is what gives a hand-authored launch.json
// its schema: without configurationAttributes VS Code offers no completion,
// no validation, and no "Add Configuration..." entry for this debug type --
// the user gets a silent, unhelpful editor and finds out what's missing only
// when MockymockDebugConfigurationProvider rejects the session at launch.
//
// The required list here must stay in lockstep with the keys that provider
// refuses on, and the properties with buildDebugArgs' MockymockDebugConfiguration.
//
// Read rather than imported: tsconfig.json doesn't enable resolveJsonModule,
// and mocha runs from the repo root so cwd is stable here.
interface DebuggerContribution {
  type: string;
  label?: string;
  languages?: string[];
  configurationAttributes?: Record<
    string,
    { required?: string[]; properties?: Record<string, { type?: string; description?: string }> }
  >;
  initialConfigurations?: Array<Record<string, unknown>>;
  configurationSnippets?: Array<{ label?: string; body?: Record<string, unknown> }>;
}

interface Manifest {
  contributes: { debuggers?: DebuggerContribution[] };
}

const manifest: Manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));

// The fields MockymockDebugConfigurationProvider refuses a launch without.
const REQUIRED_FIELDS = ['program', 'cut', 'case'];
// Optional fields buildDebugArgs / debugAdapterFactory read off the config.
const OPTIONAL_FIELDS = ['executablePath', 'copybookPaths'];

describe('package.json debugger configuration contribution', () => {
  const contribution = (manifest.contributes.debuggers ?? []).find((d) => d.type === 'mockymock-cobol');

  it('contributes the mockymock-cobol debug type', () => {
    assert.ok(contribution, 'expected a contributes.debuggers entry of type "mockymock-cobol"');
  });

  it('declares a launch schema', () => {
    assert.ok(
      contribution?.configurationAttributes?.launch,
      'without configurationAttributes.launch, a hand-authored launch.json gets no validation or IntelliSense'
    );
  });

  it('requires exactly the fields the configuration provider refuses without', () => {
    const required = contribution?.configurationAttributes?.launch?.required ?? [];
    assert.deepStrictEqual(
      [...required].sort(),
      [...REQUIRED_FIELDS].sort(),
      'the schema\'s required list has drifted from MockymockDebugConfigurationProvider\'s own check'
    );
  });

  it('documents every field the debug session reads', () => {
    const properties = contribution?.configurationAttributes?.launch?.properties ?? {};
    for (const field of [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS]) {
      assert.ok(properties[field], `launch schema is missing a "${field}" property`);
      assert.ok(
        (properties[field].description ?? '').length > 0,
        `"${field}" needs a description -- it is the only hover help a launch.json author gets`
      );
    }
  });

  it('offers a starter configuration carrying every required field', () => {
    const initial = contribution?.initialConfigurations ?? [];
    assert.ok(initial.length > 0, 'expected an initialConfigurations entry for "Add Configuration..."');
    for (const config of initial) {
      assert.strictEqual(config.type, 'mockymock-cobol');
      assert.strictEqual(config.request, 'launch');
      for (const field of REQUIRED_FIELDS) {
        assert.ok(config[field], `the starter configuration omits the required field "${field}"`);
      }
    }
  });

  it('offers a snippet carrying every required field', () => {
    const snippets = contribution?.configurationSnippets ?? [];
    assert.ok(snippets.length > 0, 'expected a configurationSnippets entry');
    for (const snippet of snippets) {
      assert.ok((snippet.label ?? '').length > 0, 'a snippet needs a label to be pickable');
      for (const field of REQUIRED_FIELDS) {
        assert.ok(snippet.body?.[field], `the snippet omits the required field "${field}"`);
      }
    }
  });
});
