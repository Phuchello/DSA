import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { ArrayVariablesCanvas } from '../components/ArrayVariablesCanvas';
import { EducationalBanner } from '../components/EducationalBanner';
import { TimelineControls } from '../components/TimelineControls';
import { Header } from '../components/Header';
import { DsaDiff, EducationalExplanationDetail } from '../types';

describe('M2.2 Beginner Learning Experience Tests', () => {
  // 1. Conditional empty section handling
  describe('Conditional Empty Section Handling', () => {
    it('hides 1D static arrays section in pure recursion when array count is zero', () => {
      const recursiveStack = [
        {
          funcName: 'factorial',
          frameId: 'f1',
          frameDepth: 1,
          isHighlighted: true,
          encodedLocals: {
            n: ['C_DATA', '0x7ff0', 'int', 4],
          },
        },
      ];

      render(<ArrayVariablesCanvas stackToRender={recursiveStack} currentLine={5} />);

      // Must render call stack section
      expect(screen.getByTestId('call-stack-section')).toBeDefined();
      expect(screen.getByTestId('scalar-var-n')).toBeDefined();

      // Must NOT render empty 1D static arrays block
      expect(screen.queryByText(/Mảng tĩnh 1 chiều/)).toBeNull();
      expect(screen.queryByText(/Không có mảng tĩnh nào/)).toBeNull();
    });

    it('renders 1D static arrays section prominently when arrays are present', () => {
      const arrayStack = [
        {
          funcName: 'main',
          frameId: 'f0',
          frameDepth: 0,
          isHighlighted: true,
          encodedLocals: {
            a: [
              'C_ARRAY',
              '0x7ff0',
              ['C_DATA', '0x7ff0', 'int', 10],
              ['C_DATA', '0x7ff4', 'int', 20],
            ],
          },
        },
      ];

      render(<ArrayVariablesCanvas stackToRender={arrayStack} currentLine={3} />);

      expect(screen.getByText(/Mảng tĩnh 1 chiều/)).toBeDefined();
      expect(screen.getByTestId('array-container-a')).toBeDefined();
      expect(screen.getByTestId('array-cell-0').textContent).toContain('10');
      expect(screen.getByTestId('array-cell-1').textContent).toContain('20');
    });

    it('renders honest notice for user-defined structs without fabricating graphs', () => {
      const structStack = [
        {
          funcName: 'main',
          frameId: 'f0',
          frameDepth: 0,
          isHighlighted: true,
          encodedLocals: {
            root: [
              'C_STRUCT',
              '0x1000',
              'Branch',
              ['weight', ['C_DATA', '0x1000', 'int', 1]],
              ['small', ['C_DATA', '0x1004', 'Branch*', '0x2000']],
              ['large', ['C_DATA', '0x1008', 'Branch*', '0x0']],
            ],
          },
        },
      ];

      render(<ArrayVariablesCanvas stackToRender={structStack} currentLine={10} />);

      // Must render honest notice
      const notice = screen.getByTestId('unknown-struct-notice');
      expect(notice).toBeDefined();
      expect(notice.textContent).toContain('Cấu trúc dữ liệu tự định nghĩa');
      expect(notice.textContent).toContain('chưa hỗ trợ sơ đồ cây/đồ thị chuyên biệt');

      // Struct fields must be observable
      const structVar = screen.getByTestId('scalar-var-root');
      expect(structVar.textContent).toContain('struct Branch');
      expect(structVar.textContent).toContain('weight: 1');
      expect(structVar.textContent).toContain('large: nullptr');
    });
  });

  // 2. Active-frame emphasis
  describe('Active-Frame Emphasis', () => {
    it('visually emphasizes active innermost frame while keeping caller frames accessible', () => {
      const callStack = [
        {
          funcName: 'main',
          frameId: 'f0',
          frameDepth: 0,
          isHighlighted: false,
          line: 12,
          encodedLocals: {
            ans: ['C_DATA', '0x100', 'int', 0],
          },
        },
        {
          funcName: 'factorial',
          frameId: 'f1',
          frameDepth: 1,
          isHighlighted: true,
          line: 5,
          encodedLocals: {
            n: ['C_DATA', '0x200', 'int', 4],
          },
        },
      ];

      render(<ArrayVariablesCanvas stackToRender={callStack} currentLine={5} />);

      const activeFrame = screen.getByTestId('call-stack-frame-1');
      const callerFrame = screen.getByTestId('call-stack-frame-0');

      // Active frame has distinct indicator and highlight styling
      expect(activeFrame.textContent).toContain('Hàm đang thực hiện');
      expect(activeFrame.textContent).toContain('factorial()');
      expect(activeFrame.className).toContain('border-blue-500/70');

      // Caller frame is present but not active
      expect(callerFrame.textContent).toContain('main()');
      expect(callerFrame.textContent).not.toContain('Hàm đang thực hiện');
    });
  });

  // 3. Accessible labels
  describe('Accessible Labels & ARIA', () => {
    it('provides accessible ARIA attributes for timeline navigation', () => {
      const onStepChange = vi.fn();
      const onTogglePlay = vi.fn();
      const onReset = vi.fn();
      const onChangeSpeed = vi.fn();

      render(
        <TimelineControls
          currentStep={2}
          totalSteps={10}
          isPlaying={false}
          onTogglePlay={onTogglePlay}
          onStepChange={onStepChange}
          onReset={onReset}
          speed={1}
          onChangeSpeed={onChangeSpeed}
          currentLine={8}
          funcName="factorial"
        />
      );

      // Region label
      expect(screen.getByRole('region', { name: /dòng thời gian/i })).toBeDefined();

      // Navigation buttons have aria-label
      expect(screen.getByLabelText(/Lùi 1 bước/i)).toBeDefined();
      expect(screen.getByLabelText(/Tiến 1 bước/i)).toBeDefined();
      expect(screen.getByLabelText(/Tự động chạy/i)).toBeDefined();
      expect(screen.getByLabelText(/Chọn bước thực thi/i)).toBeDefined();
    });

    it('provides accessible mode toggle with clear Vietnamese description', () => {
      render(
        <Header
          lessons={[]}
          selectedLessonId=""
          onSelectLesson={vi.fn()}
          mode="beginner"
          onToggleMode={vi.fn()}
          isRunning={false}
          onRunCode={vi.fn()}
          onReset={vi.fn()}
        />
      );

      const modeBtn = screen.getByTitle(/Chuyển đổi giữa chế độ/i);
      expect(modeBtn).toBeDefined();
      expect(modeBtn.textContent).toContain('Chế độ dễ hiểu');
      expect(modeBtn.getAttribute('aria-label')).toBe('Chuyển sang Chế độ nâng cao');
    });
  });

  // 4. Correct educational facet visibility
  describe('Educational Facets Visibility & Address Sanitization', () => {
    const detail: EducationalExplanationDetail = {
      upcoming: 'Chuẩn bị thực thi lệnh gán: x = 30; tại ô nhớ 0x7fff5678.',
      observed: 'Biến x thay đổi từ 10 thành 30 tại 0x7fff5678.',
      semantics: 'Cập nhật giá trị biến đếm phục vụ điều kiện dừng thuật toán.',
    };

    const diff: DsaDiff = {
      changedVariables: ['x'],
      allocatedNodes: [],
      freedNodes: [],
      pointerReroutes: [],
      scalarUpdates: [
        {
          name: 'x',
          from: 10,
          to: 30,
          frameName: 'main',
          frameId: 'f0',
          frameDepth: 0,
          displayName: 'x',
        },
      ],
    };

    it('renders all four educational questions and sanitizes hex addresses in Beginner mode', () => {
      render(
        <EducationalBanner
          explanation=""
          explanationDetail={detail}
          advancedNotes="Ghi chú kỹ thuật nâng cao"
          mode="beginner"
          diff={diff}
          line={7}
          codeText="x = 30;"
        />
      );

      // 1. Upcoming facet
      const upcoming = screen.getByTestId('explanation-upcoming');
      expect(upcoming.textContent).toContain('Sắp thực hiện:');
      expect(upcoming.textContent).toContain('Chuẩn bị thực thi lệnh gán');
      // Hex address sanitized in Beginner mode
      expect(upcoming.textContent).toContain('[ô nhớ]');
      expect(upcoming.textContent).not.toContain('0x7fff5678');

      // 2. Observed facet
      const observed = screen.getByTestId('explanation-observed');
      expect(observed.textContent).toContain('Quan sát:');
      expect(observed.textContent).toContain('Biến x thay đổi từ 10 thành 30');
      expect(observed.textContent).not.toContain('0x7fff5678');

      // 3. Diff badges
      const diffContainer = screen.getByTestId('diff-badge-container');
      expect(diffContainer.textContent).toContain('x');
      expect(diffContainer.textContent).toContain('30');

      // 4. Semantics facet
      const semantics = screen.getByTestId('explanation-semantics');
      expect(semantics.textContent).toContain('Ý nghĩa:');
      expect(semantics.textContent).toContain('Cập nhật giá trị biến đếm');

      // Advanced notes hidden in beginner mode
      expect(screen.queryByText('Ghi chú kỹ thuật nâng cao')).toBeNull();
    });

    it('retains exact hex addresses and shows advanced notes in Advanced mode', () => {
      render(
        <EducationalBanner
          explanation=""
          explanationDetail={detail}
          advancedNotes="Ghi chú kỹ thuật nâng cao: con trỏ hợp lệ."
          mode="advanced"
          diff={diff}
          line={7}
          codeText="x = 30;"
        />
      );

      const upcoming = screen.getByTestId('explanation-upcoming');
      expect(upcoming.textContent).toContain('0x7fff5678');
      expect(screen.getByText('Ghi chú kỹ thuật nâng cao: con trỏ hợp lệ.')).toBeDefined();
    });
  });
});
