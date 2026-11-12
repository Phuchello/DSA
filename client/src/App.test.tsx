import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { App } from './App';

vi.mock('./components/Header', async () => {
  const ReactModule = await import('react');
  return {
    Header: (props: any) =>
      ReactModule.createElement(
        'header',
        {},
        ReactModule.createElement(
          'button',
          {
            type: 'button',
            'data-testid': 'test-run',
            onClick: props.onRunCode,
          },
          'Run'
        ),
        ReactModule.createElement('span', { 'data-testid': 'test-mode' }, props.mode)
      ),
  };
});

vi.mock('./components/CodeEditor', async () => {
  const ReactModule = await import('react');
  return {
    CodeEditor: (props: any) =>
      ReactModule.createElement(
        'section',
        {},
        ReactModule.createElement('textarea', {
          'data-testid': 'test-code',
          value: props.code,
          onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) =>
            props.onChangeCode(event.target.value),
        }),
        ReactModule.createElement('textarea', {
          'data-testid': 'test-stdin',
          value: props.stdin,
          onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) =>
            props.onChangeStdin(event.target.value),
        }),
        props.finalStdout &&
          ReactModule.createElement('pre', { 'data-testid': 'test-final-output' }, props.finalStdout),
        ReactModule.createElement('span', { 'data-testid': 'test-current-line' }, String(props.currentLine ?? '')),
        props.terminationStatus &&
          ReactModule.createElement(
            'div',
            { 'data-testid': 'test-termination' },
            `${props.terminationStatus}: ${props.terminationReason}`
          )
      ),
  };
});

vi.mock('./components/LinkedListCanvas', () => ({
  LinkedListCanvas: () => <div data-testid="mock-linked-list" />,
}));
vi.mock('./components/ArrayVariablesCanvas', () => ({
  ArrayVariablesCanvas: (props: any) => (
    <div data-testid="mock-array-variables" data-stale={String(props.isTraceStale)} />
  ),
}));
vi.mock('./components/TimelineControls', () => ({
  TimelineControls: (props: any) => (
    <div data-testid="mock-timeline">
      <span data-testid="test-current-step">{props.currentStep}</span>
      <button
        type="button"
        data-testid="test-step-forward"
        onClick={() => props.onStepChange(props.currentStep + 1)}
      >
        Forward
      </button>
    </div>
  ),
}));
vi.mock('./components/EducationalBanner', () => ({ EducationalBanner: () => null }));
vi.mock('./components/MemoryInspector', () => ({ MemoryInspector: () => null }));

const lesson = {
  id: 'test-lesson',
  title: 'Test lesson',
  description: '',
  difficulty: 'Beginner' as const,
  code: '#include <iostream>\nint main() { return 0; }',
  defaultStdin: '1 2',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function makeRunResponse(finalStdout: string, overrides: Record<string, unknown> = {}) {
  return {
    json: async () => ({
      success: true,
      terminationStatus: 'normal',
      terminationReason: 'normal completion',
      ...overrides,
      finalStdout,
      trace: [
        {
          step: 0,
          line: 11,
          funcName: 'main',
          codeText: 'int main() { return 0; }',
          stdout: '',
          event: 'stepLine',
          stackToRender: [],
          heap: {},
          dsa: {
            nodes: [],
            pointers: [],
            diff: { changedVariables: [], allocatedNodes: [], freedNodes: [], pointerReroutes: [] },
            vietnameseExplanation: '',
            advancedNotes: '',
          },
        },
      ],
    }),
  } as Response;
}

function makeMultiStepResponse() {
  return {
    json: async () => ({
      success: true,
      terminationStatus: 'normal',
      terminationReason: 'normal completion',
      finalStdout: 'ok',
      trace: [
        {
          step: 0,
          line: 11,
          funcName: 'main',
          codeText: 'int a[2] = {1, 2};',
          stdout: '',
          event: 'stepLine',
          stackToRender: [],
          heap: {},
          dsa: { nodes: [], pointers: [], diff: {}, vietnameseExplanation: '', advancedNotes: '' },
        },
        {
          step: 1,
          line: 12,
          funcName: 'main',
          codeText: 'int b = 5;',
          stdout: '',
          event: 'stepLine',
          stackToRender: [],
          heap: {},
          dsa: { nodes: [], pointers: [], diff: {}, vietnameseExplanation: '', advancedNotes: '' },
        },
        {
          step: 2,
          line: 13,
          funcName: 'main',
          codeText: 'return 0;',
          stdout: '',
          event: 'stepLine',
          stackToRender: [],
          heap: {},
          dsa: { nodes: [], pointers: [], diff: {}, vietnameseExplanation: '', advancedNotes: '' },
        },
      ],
    }),
  } as Response;
}

describe('App execution request ownership', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  function installFetchMock() {
    const runs: Array<{
      snapshot: { code: string; stdin: string };
      response: ReturnType<typeof deferred<Response>>;
    }> = [];
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/lessons') {
        return Promise.resolve({ json: async () => ({ lessons: [lesson] }) } as Response);
      }

      const response = deferred<Response>();
      runs.push({ snapshot: JSON.parse(String(init?.body)), response });
      return response.promise;
    }) as typeof fetch;
    return runs;
  }

  it('does not make a pending trace current after stdin changes', async () => {
    const runs = installFetchMock();
    render(<App />);
    const runButton = await screen.findByTestId('test-run');

    await act(async () => {
      fireEvent.click(runButton);
    });
    expect(runs[0].snapshot).toEqual({ code: lesson.code, stdin: lesson.defaultStdin });

    fireEvent.change(screen.getByTestId('test-stdin'), { target: { value: '9 8' } });
    await act(async () => {
      runs[0].response.resolve(makeRunResponse('old input output'));
    });

    expect(screen.queryByTestId('test-final-output')).toBeNull();
  });

  it('does not make a pending trace current after code changes', async () => {
    const runs = installFetchMock();
    render(<App />);
    const runButton = await screen.findByTestId('test-run');

    await act(async () => {
      fireEvent.click(runButton);
    });
    fireEvent.change(screen.getByTestId('test-code'), {
      target: { value: 'int main() { return 9; }' },
    });
    await act(async () => {
      runs[0].response.resolve(makeRunResponse('output for old code'));
    });

    expect(runs[0].snapshot.code).toBe(lesson.code);
    expect(screen.queryByTestId('test-final-output')).toBeNull();
  });

  it('ignores an older response that arrives after a newer request', async () => {
    const runs = installFetchMock();
    render(<App />);
    const runButton = await screen.findByTestId('test-run');

    await act(async () => {
      fireEvent.click(runButton);
    });
    fireEvent.change(screen.getByTestId('test-code'), {
      target: { value: 'int main() { return 2; }' },
    });
    fireEvent.change(screen.getByTestId('test-stdin'), { target: { value: 'new stdin' } });
    await act(async () => {
      fireEvent.click(runButton);
    });

    expect(runs).toHaveLength(2);
    expect(runs[0].snapshot.stdin).toBe(lesson.defaultStdin);
    expect(runs[1].snapshot.stdin).toBe('new stdin');
    expect(runs[1].snapshot.code).toBe('int main() { return 2; }');

    await act(async () => {
      runs[1].response.resolve(makeRunResponse('output for newest request'));
    });
    expect(screen.getByTestId('test-final-output').textContent).toBe('output for newest request');

    await act(async () => {
      runs[0].response.resolve(makeRunResponse('stale output'));
    });
    expect(screen.getByTestId('test-final-output').textContent).toBe('output for newest request');
  });

  it('keeps a partial crash trace and displays the crash reason', async () => {
    const runs = installFetchMock();
    render(<App />);
    await act(async () => {
      fireEvent.click(await screen.findByTestId('test-run'));
    });
    await act(async () => {
      runs[0].response.resolve(
        makeRunResponse('output before crash', {
          terminationStatus: 'crashed',
          terminationReason: 'Lỗi truy cập bộ nhớ (SIGSEGV)',
        })
      );
    });

    expect(screen.getByTestId('test-termination').textContent).toContain('crashed');
    expect(screen.getByTestId('test-termination').textContent).toContain('SIGSEGV');
    expect(screen.getByTestId('test-current-line').textContent).toBe('11');
    expect(screen.getByTestId('test-final-output').textContent).toBe('output before crash');
  });

  it('keeps a partial trace and labels step-limit truncation as incomplete', async () => {
    const runs = installFetchMock();
    render(<App />);
    await act(async () => {
      fireEvent.click(await screen.findByTestId('test-run'));
    });
    await act(async () => {
      runs[0].response.resolve(
        makeRunResponse('', {
          terminationStatus: 'truncated',
          terminationReason: 'Đã vượt giới hạn bước',
        })
      );
    });

    expect(screen.getByTestId('test-termination').textContent).toContain('truncated');
    expect(screen.getByTestId('test-termination').textContent).toContain('Đã vượt giới hạn bước');
    expect(screen.getByTestId('test-current-line').textContent).toBe('11');
  });

  // AT-07: Tab stability during timeline stepping
  it('AT-07: maintains active canvas tab stability across timeline steps', async () => {
    const runs = installFetchMock();
    render(<App />);
    const runBtn = await screen.findByTestId('test-run');

    await act(async () => {
      fireEvent.click(runBtn);
    });
    await act(async () => {
      runs[0].response.resolve(makeMultiStepResponse());
    });

    // Trace had 0 linked-list nodes, so it defaulted to arrays tab or student clicks arrays tab
    const arraysTab = screen.getByTestId('canvas-tab-arrays');
    await act(async () => {
      fireEvent.click(arraysTab);
    });

    expect(screen.getByTestId('mock-array-variables')).toBeDefined();
    expect(screen.getByTestId('test-current-step').textContent).toBe('0');

    // Step forward to step 1
    const stepForwardBtn = screen.getByTestId('test-step-forward');
    await act(async () => {
      fireEvent.click(stepForwardBtn);
    });

    expect(screen.getByTestId('test-current-step').textContent).toBe('1');
    // Tab must remain arrays-variables
    expect(screen.getByTestId('mock-array-variables')).toBeDefined();
    expect(screen.queryByTestId('mock-linked-list')).toBeNull();

    // Switch to linked-list tab
    const linkedListTab = screen.getByTestId('canvas-tab-linked-list');
    await act(async () => {
      fireEvent.click(linkedListTab);
    });

    expect(screen.getByTestId('mock-linked-list')).toBeDefined();
    expect(screen.queryByTestId('mock-array-variables')).toBeNull();

    // Step again
    await act(async () => {
      fireEvent.click(stepForwardBtn);
    });

    // Tab must remain linked-list
    expect(screen.getByTestId('mock-linked-list')).toBeDefined();
    expect(screen.queryByTestId('mock-array-variables')).toBeNull();
  });

  // AT-08: Stale trace warning on code/stdin edit while on Array tab
  it('AT-08: displays stale trace banner when code or stdin changes on arrays tab', async () => {
    const runs = installFetchMock();
    render(<App />);
    const runBtn = await screen.findByTestId('test-run');

    await act(async () => {
      fireEvent.click(runBtn);
    });
    await act(async () => {
      runs[0].response.resolve(makeRunResponse('output'));
    });

    // Switch to arrays tab
    await act(async () => {
      fireEvent.click(screen.getByTestId('canvas-tab-arrays'));
    });

    // Initially fresh
    expect(screen.queryByTestId('stale-canvas-banner')).toBeNull();

    // Edit code
    await act(async () => {
      fireEvent.change(screen.getByTestId('test-code'), {
        target: { value: 'int main() { int x = 100; return 0; }' },
      });
    });

    // Stale banner should appear
    const banner = screen.getByTestId('stale-canvas-banner');
    expect(banner).toBeDefined();
    expect(banner.textContent).toContain('Vết thực thi cũ (Mã nguồn đã đổi)');

    // Mock array variables canvas also receives isTraceStale=true
    expect(screen.getByTestId('mock-array-variables').getAttribute('data-stale')).toBe('true');
  });

  // AT-09: WAI-ARIA and APG keyboard tabs compliance (R04)
  it('AT-09: provides APG keyboard arrow navigation, roving tabIndex, and stable tabpanel references', async () => {
    installFetchMock();
    render(<App />);

    const tabList = screen.getByRole('tablist', { name: 'Lựa chọn khung trực quan hóa' });
    expect(tabList).toBeDefined();

    const linkedListTab = screen.getByRole('tab', { name: /Danh sách liên kết/i });
    const arraysTab = screen.getByRole('tab', { name: /Mảng & Biến/i });

    // Both tabpanels must exist simultaneously in DOM
    const linkedListPanel = document.getElementById('canvas-tabpanel-linked-list');
    const arraysPanel = document.getElementById('canvas-tabpanel-arrays');
    expect(linkedListPanel).not.toBeNull();
    expect(arraysPanel).not.toBeNull();

    // Verify aria-controls targets point to existing DOM elements
    expect(linkedListTab.getAttribute('aria-controls')).toBe('canvas-tabpanel-linked-list');
    expect(arraysTab.getAttribute('aria-controls')).toBe('canvas-tabpanel-arrays');

    // Initially linked-list is selected: roving tabIndex 0 for active, -1 for inactive
    expect(linkedListTab.getAttribute('aria-selected')).toBe('true');
    expect(linkedListTab.getAttribute('tabindex')).toBe('0');
    expect(arraysTab.getAttribute('aria-selected')).toBe('false');
    expect(arraysTab.getAttribute('tabindex')).toBe('-1');

    // Inactive panel must have hidden attribute
    expect(linkedListPanel?.hasAttribute('hidden')).toBe(false);
    expect(arraysPanel?.hasAttribute('hidden')).toBe(true);

    // Press ArrowRight to move selection and focus to arrays tab
    linkedListTab.focus();
    await act(async () => {
      fireEvent.keyDown(tabList, { key: 'ArrowRight' });
    });

    // State changes: arrays tab becomes selected with roving tabIndex 0
    expect(arraysTab.getAttribute('aria-selected')).toBe('true');
    expect(arraysTab.getAttribute('tabindex')).toBe('0');
    expect(linkedListTab.getAttribute('aria-selected')).toBe('false');
    expect(linkedListTab.getAttribute('tabindex')).toBe('-1');

    expect(arraysPanel?.hasAttribute('hidden')).toBe(false);
    expect(linkedListPanel?.hasAttribute('hidden')).toBe(true);

    // Press ArrowLeft to return to linked-list tab
    await act(async () => {
      fireEvent.keyDown(tabList, { key: 'ArrowLeft' });
    });
    expect(linkedListTab.getAttribute('aria-selected')).toBe('true');
    expect(linkedListTab.getAttribute('tabindex')).toBe('0');
    expect(arraysTab.getAttribute('aria-selected')).toBe('false');
    expect(arraysTab.getAttribute('tabindex')).toBe('-1');
  });

  // AT-10: Tab navigation arrow keys must not modify timeline index (Fix 2 PR review)
  it('AT-10: tab arrow navigation changes tab selection without modifying timeline index in nonempty trace', async () => {
    const runs = installFetchMock();
    render(<App />);

    const runBtn = await screen.findByTestId('test-run');
    await act(async () => {
      fireEvent.click(runBtn);
    });
    await act(async () => {
      runs[0].response.resolve(makeMultiStepResponse());
    });

    // Advance timeline to step 1 (nonzero step so we can verify both directions)
    const stepForwardBtn = screen.getByTestId('test-step-forward');
    await act(async () => {
      fireEvent.click(stepForwardBtn);
    });

    const stepDisplay = screen.getByTestId('test-current-step');
    expect(stepDisplay.textContent).toBe('1');

    const tabList = screen.getByRole('tablist', { name: 'Lựa chọn khung trực quan hóa' });
    const linkedListTab = screen.getByRole('tab', { name: /Danh sách liên kết/i });
    const arraysTab = screen.getByRole('tab', { name: /Mảng & Biến/i });

    // Trace has array structures, so arrays-variables is auto-selected
    expect(arraysTab.getAttribute('aria-selected')).toBe('true');
    arraysTab.focus();

    // 1. Press ArrowLeft while focused on tablist:
    // Tab changes to linked-list, but timeline step remains 1 (does NOT rewind to 0)
    await act(async () => {
      fireEvent.keyDown(tabList, { key: 'ArrowLeft', code: 'ArrowLeft' });
    });

    expect(linkedListTab.getAttribute('aria-selected')).toBe('true');
    expect(stepDisplay.textContent).toBe('1');

    // 2. Press ArrowRight while focused on tablist:
    // Tab changes back to arrays, but timeline step remains 1 (does NOT advance to 2)
    await act(async () => {
      fireEvent.keyDown(tabList, { key: 'ArrowRight', code: 'ArrowRight' });
    });

    expect(arraysTab.getAttribute('aria-selected')).toBe('true');
    expect(stepDisplay.textContent).toBe('1');

    // 3. Move focus outside interactive controls (blur active element):
    // Global ArrowRight and ArrowLeft shortcuts must work normally
    (document.activeElement as HTMLElement)?.blur();
    await act(async () => {
      fireEvent.keyDown(window, { key: 'ArrowRight', code: 'ArrowRight' });
    });
    expect(stepDisplay.textContent).toBe('2');

    await act(async () => {
      fireEvent.keyDown(window, { key: 'ArrowLeft', code: 'ArrowLeft' });
    });
    expect(stepDisplay.textContent).toBe('1');
  });
});
