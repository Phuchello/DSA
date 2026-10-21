import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { CodeEditor } from './CodeEditor';

describe('CodeEditor Component', () => {
  it('renders editor tabs and console correctly', () => {
    const onChangeCode = vi.fn();
    const onChangeStdin = vi.fn();

    render(
      <CodeEditor
        code="int main() { return 0; }"
        onChangeCode={onChangeCode}
        stdin="1 2 3"
        onChangeStdin={onChangeStdin}
        currentLine={null}
        stdout=""
        isExecuting={false}
      />
    );

    expect(screen.getByTestId('tab-code')).toBeTruthy();
    expect(screen.getByTestId('tab-stdin')).toBeTruthy();
    expect(screen.getByTestId('codemirror-wrapper')).toBeTruthy();
  });

  it('allows tab switching between code and stdin and edits stdin', () => {
    const onChangeCode = vi.fn();
    const onChangeStdin = vi.fn();

    render(
      <CodeEditor
        code="int main() { return 0; }"
        onChangeCode={onChangeCode}
        stdin="10 20"
        onChangeStdin={onChangeStdin}
        currentLine={null}
        stdout=""
        isExecuting={false}
      />
    );

    // Switch to stdin tab
    fireEvent.click(screen.getByTestId('tab-stdin'));
    const textarea = screen.getByTestId('stdin-textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('10 20');

    // Edit stdin
    fireEvent.change(textarea, { target: { value: '30 40' } });
    expect(onChangeStdin).toHaveBeenCalledWith('30 40');

    // Switch back to code tab
    fireEvent.click(screen.getByTestId('tab-code'));
    expect(screen.getByTestId('codemirror-wrapper')).toBeTruthy();
  });

  it('displays executing line indicator', () => {
    render(
      <CodeEditor
        code="int main() {\n  int x = 5;\n  return 0;\n}"
        onChangeCode={vi.fn()}
        stdin=""
        onChangeStdin={vi.fn()}
        currentLine={2}
        stdout=""
        isExecuting={false}
      />
    );

    expect(screen.getByText('Đang thực thi dòng: 2')).toBeTruthy();
  });

  it('displays stale trace warning banner when isTraceStale is true', () => {
    render(
      <CodeEditor
        code="int main() { return 0; }"
        onChangeCode={vi.fn()}
        stdin=""
        onChangeStdin={vi.fn()}
        currentLine={1}
        stdout=""
        isExecuting={false}
        isTraceStale={true}
      />
    );

    expect(screen.getByTestId('stale-trace-banner')).toBeTruthy();
    expect(screen.getByText('Vết cũ (Dòng: 1)')).toBeTruthy();
    expect(screen.getByText(/Vết thực thi hiện tại không còn khớp/)).toBeTruthy();
  });

  it('displays build error and stdout appropriately in console drawer', () => {
    const { rerender } = render(
      <CodeEditor
        code="int main() { return 0; }"
        onChangeCode={vi.fn()}
        stdin=""
        onChangeStdin={vi.fn()}
        currentLine={null}
        stdout="Hello World Output"
        isExecuting={false}
      />
    );

    expect(screen.getByTestId('console-stdout').textContent).toBe('Hello World Output');

    rerender(
      <CodeEditor
        code="int main() { return 0; }"
        onChangeCode={vi.fn()}
        stdin=""
        onChangeStdin={vi.fn()}
        currentLine={null}
        stdout=""
        buildOutput="error: expected ';' before '}' token"
        isExecuting={false}
      />
    );

    expect(screen.getByTestId('console-build-error').textContent).toContain("error: expected ';'");
  });

  it('labels buffered final output separately from the current timeline snapshot', () => {
    render(
      <CodeEditor
        code="int main() { return 0; }"
        onChangeCode={vi.fn()}
        stdin=""
        onChangeStdin={vi.fn()}
        currentLine={1}
        stdout={'early output\n'}
        finalStdout={'early output\nlate output\n'}
        isExecuting={false}
      />
    );

    expect(screen.getByTestId('console-stdout').textContent).toBe('early output\n');
    expect(screen.getByTestId('console-final-stdout').textContent).toBe('early output\nlate output\n');
    expect(screen.getByText('Đầu ra cuối cùng sau khi chương trình kết thúc')).toBeTruthy();
  });
});
