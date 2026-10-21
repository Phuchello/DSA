import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { App } from './App';

vi.mock('./components/Header', async () => {
  const ReactModule = await import('react');
  return {
    Header: (props: any) => ReactModule.createElement('header', {},
      ReactModule.createElement('button', {
        type: 'button',
        'data-testid': 'test-run',
        onClick: props.onRunCode,
      }, 'Run'),
      ReactModule.createElement('span', { 'data-testid': 'test-mode' }, props.mode),
    ),
  };
});

vi.mock('./components/CodeEditor', async () => {
  const ReactModule = await import('react');
  return {
    CodeEditor: (props: any) => ReactModule.createElement('section', {},
      ReactModule.createElement('textarea', {
        'data-testid': 'test-code',
        value: props.code,
        onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => props.onChangeCode(event.target.value),
      }),
      ReactModule.createElement('textarea', {
        'data-testid': 'test-stdin',
        value: props.stdin,
        onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => props.onChangeStdin(event.target.value),
      }),
      props.finalStdout && ReactModule.createElement('pre', { 'data-testid': 'test-final-output' }, props.finalStdout),
      ReactModule.createElement('span', { 'data-testid': 'test-current-line' }, String(props.currentLine ?? '')),
      props.terminationStatus && ReactModule.createElement('div', { 'data-testid': 'test-termination' },
        `${props.terminationStatus}: ${props.terminationReason}`),
    ),
  };
});

vi.mock('./components/LinkedListCanvas', () => ({ LinkedListCanvas: () => null }));
vi.mock('./components/TimelineControls', () => ({ TimelineControls: () => null }));
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
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
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
      trace: [{
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
      }],
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
    const runs: Array<{ snapshot: { code: string; stdin: string }; response: ReturnType<typeof deferred<Response>> }> = [];
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

    await act(async () => { fireEvent.click(runButton); });
    expect(runs[0].snapshot).toEqual({ code: lesson.code, stdin: lesson.defaultStdin });

    fireEvent.change(screen.getByTestId('test-stdin'), { target: { value: '9 8' } });
    await act(async () => { runs[0].response.resolve(makeRunResponse('old input output')); });

    expect(screen.queryByTestId('test-final-output')).toBeNull();
  });


  it('does not make a pending trace current after code changes', async () => {
    const runs = installFetchMock();
    render(<App />);
    const runButton = await screen.findByTestId('test-run');

    await act(async () => { fireEvent.click(runButton); });
    fireEvent.change(screen.getByTestId('test-code'), { target: { value: 'int main() { return 9; }' } });
    await act(async () => { runs[0].response.resolve(makeRunResponse('output for old code')); });

    expect(runs[0].snapshot.code).toBe(lesson.code);
    expect(screen.queryByTestId('test-final-output')).toBeNull();
  });

  it('ignores an older response that arrives after a newer request', async () => {
    const runs = installFetchMock();
    render(<App />);
    const runButton = await screen.findByTestId('test-run');

    await act(async () => { fireEvent.click(runButton); });
    fireEvent.change(screen.getByTestId('test-code'), { target: { value: 'int main() { return 2; }' } });
    fireEvent.change(screen.getByTestId('test-stdin'), { target: { value: 'new stdin' } });
    await act(async () => { fireEvent.click(runButton); });

    expect(runs).toHaveLength(2);
    expect(runs[0].snapshot.stdin).toBe(lesson.defaultStdin);
    expect(runs[1].snapshot.stdin).toBe('new stdin');
    expect(runs[1].snapshot.code).toBe('int main() { return 2; }');

    await act(async () => { runs[1].response.resolve(makeRunResponse('output for newest request')); });
    expect(screen.getByTestId('test-final-output').textContent).toBe('output for newest request');

    await act(async () => { runs[0].response.resolve(makeRunResponse('stale output')); });
    expect(screen.getByTestId('test-final-output').textContent).toBe('output for newest request');
  });

  it('keeps a partial crash trace and displays the crash reason', async () => {
    const runs = installFetchMock();
    render(<App />);
    await act(async () => { fireEvent.click(await screen.findByTestId('test-run')); });
    await act(async () => {
      runs[0].response.resolve(makeRunResponse('output before crash', {
        terminationStatus: 'crashed',
        terminationReason: 'Lỗi truy cập bộ nhớ (SIGSEGV)',
      }));
    });

    expect(screen.getByTestId('test-termination').textContent).toContain('crashed');
    expect(screen.getByTestId('test-termination').textContent).toContain('SIGSEGV');
    expect(screen.getByTestId('test-current-line').textContent).toBe('11');
    expect(screen.getByTestId('test-final-output').textContent).toBe('output before crash');
  });

  it('keeps a partial trace and labels step-limit truncation as incomplete', async () => {
    const runs = installFetchMock();
    render(<App />);
    await act(async () => { fireEvent.click(await screen.findByTestId('test-run')); });
    await act(async () => {
      runs[0].response.resolve(makeRunResponse('', {
        terminationStatus: 'truncated',
        terminationReason: 'Đã vượt giới hạn bước',
      }));
    });

    expect(screen.getByTestId('test-termination').textContent).toContain('truncated');
    expect(screen.getByTestId('test-termination').textContent).toContain('Đã vượt giới hạn bước');
    expect(screen.getByTestId('test-current-line').textContent).toBe('11');
  });
});
