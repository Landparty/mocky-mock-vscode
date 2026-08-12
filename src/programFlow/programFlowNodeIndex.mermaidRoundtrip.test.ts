// Pins the contract between cobol-parser-derived paragraph names,
// sanitizeNodeId()'s mangling of them, and the DOM id shape Mermaid
// actually renders for the resulting flowchart node -- the round trip
// media/programFlow/main.ts's click handler depends on to map a clicked
// SVG element back to a source line via buildLineIndex().
//
// This is a real render through the installed `mermaid` package against a
// jsdom document, not a hand-rolled string match against our own
// assumptions about Mermaid's id format -- that is the whole point: a
// future Mermaid upgrade that changes the id shape should fail this test,
// not just silently re-break click-to-reveal the way the bug this test
// was written for did (see git history: the click handler assumed node
// ids started with "flowchart-", but Mermaid actually prepends the
// diagram id passed to mermaid.render() in front of that marker).
import * as assert from 'assert';
import { JSDOM } from 'jsdom';
import { sanitizeNodeId, parseMermaidNodeId } from './programFlowNodeIndex';

// mermaid's package.json only exports an ESM entry point
// ("dist/mermaid.core.mjs"). This repo's mocha run loads tests through
// ts-node/register under tsconfig's "module": "commonjs", so a normal
// `import mermaid from 'mermaid'` at the top of this file would get
// downleveled to `require('mermaid')` and fail to resolve. Force a real
// dynamic `import()` regardless of how TypeScript would otherwise
// downlevel it.
type MermaidModuleNamespace = typeof import('mermaid');
const importESM = new Function('specifier', 'return import(specifier)') as (
  specifier: string
) => Promise<MermaidModuleNamespace>;

describe('sanitizeNodeId <-> Mermaid DOM id round trip', function () {
  // Loading mermaid's full ESM module graph plus a first render is
  // meaningfully slower than the 5000ms default set in .mocharc.json.
  this.timeout(30000);

  let dom: JSDOM;
  let installedGlobals: Partial<Record<string, unknown>>;
  let installedNavigatorDescriptor: PropertyDescriptor | undefined;

  before(async function () {
    dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
      pretendToBeVisual: true,
    });

    // Mermaid's renderer expects a handful of browser APIs jsdom doesn't
    // implement (real layout, CSSOM style sheets). These are the minimal
    // shims needed to get past mermaid's internal layout math -- none of
    // them need to produce visually accurate output, only valid numbers,
    // since this test only inspects the rendered SVG's node *ids*, not
    // its geometry.
    class FakeCSSStyleSheet {
      cssRules: string[] = [];
      replaceSync(): void {
        /* no-op */
      }
      insertRule(rule: string, index?: number): number {
        const at = index ?? this.cssRules.length;
        this.cssRules.splice(at, 0, rule);
        return at;
      }
    }

    installedNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    installedGlobals = {
      window: (globalThis as Record<string, unknown>).window,
      document: (globalThis as Record<string, unknown>).document,
      SVGElement: (globalThis as Record<string, unknown>).SVGElement,
      Element: (globalThis as Record<string, unknown>).Element,
      HTMLElement: (globalThis as Record<string, unknown>).HTMLElement,
      DOMParser: (globalThis as Record<string, unknown>).DOMParser,
      MutationObserver: (globalThis as Record<string, unknown>).MutationObserver,
      CSSStyleSheet: (globalThis as Record<string, unknown>).CSSStyleSheet,
      getComputedStyle: (globalThis as Record<string, unknown>).getComputedStyle,
    };

    const g = globalThis as Record<string, unknown>;
    g.window = dom.window;
    g.document = dom.window.document;
    Object.defineProperty(globalThis, 'navigator', {
      value: dom.window.navigator,
      configurable: true,
    });
    g.SVGElement = dom.window.SVGElement;
    g.Element = dom.window.Element;
    g.HTMLElement = dom.window.HTMLElement;
    g.DOMParser = dom.window.DOMParser;
    g.MutationObserver = dom.window.MutationObserver ?? class { observe(): void {} disconnect(): void {} };
    g.CSSStyleSheet = FakeCSSStyleSheet;
    g.getComputedStyle = dom.window.getComputedStyle ?? (() => ({ getPropertyValue: () => '' }));

    (dom.window.SVGElement.prototype as unknown as { getBBox: () => DOMRect }).getBBox = () =>
      ({ x: 0, y: 0, width: 100, height: 30, top: 0, left: 0, right: 100, bottom: 30 }) as DOMRect;
    (dom.window.HTMLElement.prototype as unknown as { getBBox: () => DOMRect }).getBBox = () =>
      ({ x: 0, y: 0, width: 100, height: 30, top: 0, left: 0, right: 100, bottom: 30 }) as DOMRect;
    const svgProto = dom.window.SVGElement.prototype as unknown as {
      getComputedTextLength?: () => number;
    };
    if (!svgProto.getComputedTextLength) {
      svgProto.getComputedTextLength = function (this: Element): number {
        return (this.textContent ?? '').length * 7;
      };
    }
  });

  after(function () {
    // This module lives for the whole mocha process -- undo every global
    // patched in before() so this file can't cause "passes alone, fails
    // in the full suite" contamination for tests that run after it.
    const g = globalThis as Record<string, unknown>;
    for (const [key, value] of Object.entries(installedGlobals)) {
      if (value === undefined) {
        delete g[key];
      } else {
        g[key] = value;
      }
    }
    if (installedNavigatorDescriptor) {
      Object.defineProperty(globalThis, 'navigator', installedNavigatorDescriptor);
    } else {
      delete g.navigator;
    }
  });

  it('renders each sanitized node id as the <nodeId> segment of Mermaid\'s DOM id, matching parseMermaidNodeId()', async function () {
    const mermaidModule = await importESM('mermaid');
    const mermaid = mermaidModule.default;
    // securityLevel must match media/programFlow/main.ts's production config
    // ('strict') -- this is the one setting under test here, since a
    // security-level-driven change to how Mermaid renders/ids nodes would
    // otherwise slip past this contract test.
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });

    // Two paragraph names exercising both sanitizeNodeId() branches:
    // hyphens -> underscores, and a leading digit getting the "N_" guard.
    const paragraphNames = ['MAIN-LOGIC', '1000-INIT'];
    const [a, b] = paragraphNames.map(sanitizeNodeId);
    const mermaidText = `flowchart TD\n  ${a} --> ${b}\n`;

    const { svg } = await mermaid.render('program-flow-svg', mermaidText);

    const container = dom.window.document.createElement('div');
    container.innerHTML = svg;
    const nodeEls = Array.from(container.querySelectorAll('.node[id]'));

    assert.strictEqual(nodeEls.length, 2, `expected 2 rendered flowchart nodes, found ${nodeEls.length}`);

    const recoveredIds = nodeEls.map((el) => parseMermaidNodeId(el.id)).sort();
    const expectedIds = [a, b].sort();
    assert.deepStrictEqual(
      recoveredIds,
      expectedIds,
      `parseMermaidNodeId() did not recover the sanitized node ids from Mermaid's rendered DOM ids: ${JSON.stringify(
        nodeEls.map((el) => el.id)
      )}`
    );
  });

  it('keeps node/edge label text readable through the actual production render -> sanitize pipeline', async function () {
    // Regression test for a bug where DOMPurify's svg/svgFilters profiles
    // silently strip Mermaid's <foreignObject>-based flowchart labels along
    // with their text -- the diagram would render with correctly colored/
    // dashed edges but zero readable paragraph names or edge labels. This
    // exercises the exact mermaid.initialize()/DOMPurify.sanitize() call
    // shape media/programFlow/main.ts uses, including the htmlLabels: false
    // setting that keeps labels on plain SVG <text> (which the sanitizer
    // profile below does not strip).
    const mermaidModule = await importESM('mermaid');
    const mermaid = mermaidModule.default;
    const DOMPurifyModule = (await importESM('dompurify')) as unknown as {
      default: (window: unknown) => { sanitize: (svg: string, opts: unknown) => string };
    };
    const DOMPurify = DOMPurifyModule.default(dom.window);

    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'default', htmlLabels: false });

    const [a, b] = ['MAIN-LOGIC', 'SUB-ROUTINE'].map(sanitizeNodeId);
    const mermaidText = `flowchart TD\n  ${a}[MAIN-LOGIC] -->|PERFORM| ${b}[SUB-ROUTINE]\n`;
    const { svg } = await mermaid.render('program-flow-label-svg', mermaidText);

    const sanitized = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });

    assert.ok(
      sanitized.includes('MAIN-LOGIC') && sanitized.includes('SUB-ROUTINE') && sanitized.includes('PERFORM'),
      `expected both node labels and the edge label to survive sanitization, got: ${sanitized}`
    );
  });
});
