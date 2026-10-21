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

function makeRunResponse(finalStdout: string) {
  return {
    json: async () => ({
      success: true,
      finalStdout,
      trace: [{
        step: 0,
        line: 1,
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

  it('ignores an older response that arrives after a newer request', async () => {
    const runs = installFetchMock();
    render(<App />);
    const runButton = await screen.findByTestId('test-run');

    await act(async () => { fireEvent.click(runButton); });
    fireEvent.change(screen.getByTestId('test-stdin'), { target: { value: 'new stdin' } });
    await act(async () => { fireEvent.click(runButton); });

    expect(runs).toHaveLength(2);
    expect(runs[0].snapshot.stdin).toBe(lesson.defaultStdin);
    expect(runs[1].snapshot.stdin).toBe('new stdin');

    await act(async () => { runs[1].response.resolve(makeRunResponse('output for newest request')); });
    expect(screen.getByTestId('test-final-output').textContent).toBe('output for newest request');

    await act(async () => { runs[0].response.resolve(makeRunResponse('stale output')); });
    expect(screen.getByTestId('test-final-output').textContent).toBe('output for newest request');
  });
});
