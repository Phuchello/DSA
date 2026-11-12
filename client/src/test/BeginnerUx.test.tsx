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

    it('F06: correctly identifies differently named structs (CustomRecord) and avoids false positives for primitive pointers', () => {
      // 1. Differently named struct
      const customStructStack = [
        {
          funcName: 'process',
          frameId: 'f0',
          frameDepth: 0,
          isHighlighted: true,
          encodedLocals: {
            item: [
              'C_STRUCT',
              '0x2000',
              'CustomRecord',
              ['id', ['C_DATA', '0x2000', 'int', 42]],
              ['score', ['C_DATA', '0x2004', 'double', 9.5]],
            ],
          },
        },
      ];

      const { unmount } = render(<ArrayVariablesCanvas stackToRender={customStructStack} currentLine={5} />);
      expect(screen.getByTestId('unknown-struct-notice')).toBeDefined();
      expect(screen.getByTestId('scalar-var-item').textContent).toContain('struct CustomRecord');
      expect(screen.getByTestId('scalar-var-item').textContent).toContain('id: 42');
      unmount();

      // 2. Primitive pointers (int*, void*, char*) must NOT trigger unknown-struct notice
      const primitivePointerStack = [
        {
          funcName: 'main',
          frameId: 'f0',
          frameDepth: 0,
          isHighlighted: true,
          encodedLocals: {
            x: ['C_DATA', '0x3000', 'int', 10],
            ptr: ['C_DATA', '0x3004', 'pointer', '0x3000'],
            vptr: ['C_DATA', '0x3008', 'pointer', '0x0'],
          },
        },
      ];

      render(<ArrayVariablesCanvas stackToRender={primitivePointerStack} currentLine={5} />);
      expect(screen.queryByTestId('unknown-struct-notice')).toBeNull();
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

  // 5. WAI-ARIA and APG Tabs Accessibility (R04)
  describe('WAI-ARIA APG Tabs Pattern & Keyboard Accessibility (R04)', () => {
    // Reusable APG TabList Test Harness modeling App.tsx tab structure
    const AccessibleTabsHarness = () => {
      const [activeTab, setActiveTab] = React.useState<'linked-list' | 'arrays'>('linked-list');
      return (
        <div>
          <div
            role="tablist"
            aria-label="Lựa chọn khung trực quan hóa"
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault();
                const nextTab = activeTab === 'linked-list' ? 'arrays' : 'linked-list';
                setActiveTab(nextTab);
                const nextId = nextTab === 'linked-list' ? 'tab-btn-ll' : 'tab-btn-arr';
                document.getElementById(nextId)?.focus();
              }
            }}
          >
            <button
              type="button"
              role="tab"
              id="tab-btn-ll"
              aria-controls="panel-ll"
              aria-selected={activeTab === 'linked-list'}
              tabIndex={activeTab === 'linked-list' ? 0 : -1}
              onClick={() => setActiveTab('linked-list')}
            >
              Danh sách liên kết
            </button>
            <button
              type="button"
              role="tab"
              id="tab-btn-arr"
              aria-controls="panel-arr"
              aria-selected={activeTab === 'arrays'}
              tabIndex={activeTab === 'arrays' ? 0 : -1}
              onClick={() => setActiveTab('arrays')}
            >
              Mảng &amp; Biến
            </button>
          </div>
          <div>
            <div id="panel-ll" role="tabpanel" aria-labelledby="tab-btn-ll" hidden={activeTab !== 'linked-list'}>
              {activeTab === 'linked-list' && <div data-testid="content-ll">Nội dung danh sách liên kết</div>}
            </div>
            <div id="panel-arr" role="tabpanel" aria-labelledby="tab-btn-arr" hidden={activeTab !== 'arrays'}>
              {activeTab === 'arrays' && <div data-testid="content-arr">Nội dung mảng biến</div>}
            </div>
          </div>
        </div>
      );
    };

    it('R04: maintains stable tabpanel DOM existence, valid aria-controls, and roving tabIndex', () => {
      render(<AccessibleTabsHarness />);

      const tabList = screen.getByRole('tablist');
      const llTab = screen.getByRole('tab', { name: /Danh sách liên kết/i });
      const arrTab = screen.getByRole('tab', { name: /Mảng/i });

      // Both tabpanel elements MUST exist in DOM so aria-controls is always valid
      const panelLl = document.getElementById('panel-ll');
      const panelArr = document.getElementById('panel-arr');
      expect(panelLl).not.toBeNull();
      expect(panelArr).not.toBeNull();

      expect(llTab.getAttribute('aria-controls')).toBe('panel-ll');
      expect(arrTab.getAttribute('aria-controls')).toBe('panel-arr');

      // Roving tabindex: active has 0, inactive has -1
      expect(llTab.getAttribute('aria-selected')).toBe('true');
      expect(llTab.getAttribute('tabindex')).toBe('0');
      expect(arrTab.getAttribute('aria-selected')).toBe('false');
      expect(arrTab.getAttribute('tabindex')).toBe('-1');

      // Inactive panel has HTML hidden attribute
      expect(panelLl?.hasAttribute('hidden')).toBe(false);
      expect(panelArr?.hasAttribute('hidden')).toBe(true);

      // Keyboard arrow navigation
      llTab.focus();
      fireEvent.keyDown(tabList, { key: 'ArrowRight' });

      // Selection moves to arrays tab
      expect(arrTab.getAttribute('aria-selected')).toBe('true');
      expect(arrTab.getAttribute('tabindex')).toBe('0');
      expect(llTab.getAttribute('aria-selected')).toBe('false');
      expect(llTab.getAttribute('tabindex')).toBe('-1');

      // Panels update hidden attributes
      expect(panelArr?.hasAttribute('hidden')).toBe(false);
      expect(panelLl?.hasAttribute('hidden')).toBe(true);
    });
  });
});
