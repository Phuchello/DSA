import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import React from 'react';
import { ArrayVariablesCanvas, isDeclarationStatement } from './ArrayVariablesCanvas';

describe('ArrayVariablesCanvas Component Tests', () => {
  // AT-01: Array cell rendering with values, indices, and index badges
  it('AT-01: renders array cells, indices, and pointer badges accurately', () => {
    const stackToRender = [
      {
        funcName: 'main',
        frameId: 'f0',
        isHighlighted: true,
        line: 12,
        encodedLocals: {
          a: [
            'C_ARRAY',
            '0x7ffcc0',
            ['C_DATA', '0x7ffcc0', 'int', 5],
            ['C_DATA', '0x7ffcc4', 'int', 2],
            ['C_DATA', '0x7ffcc8', 'int', 8],
            ['C_DATA', '0x7ffccc', 'int', 1],
            ['C_DATA', '0x7ffcd0', 'int', 9],
          ],
          i: ['C_DATA', '0x7ffcd4', 'int', 2],
        },
      },
    ];

    render(<ArrayVariablesCanvas stackToRender={stackToRender} currentLine={12} />);

    expect(screen.getByTestId('array-variables-canvas')).toBeDefined();
    expect(screen.getByTestId('array-container-a')).toBeDefined();

    // Verify cell values and indices
    for (let idx = 0; idx < 5; idx++) {
      const cell = screen.getByTestId(`array-cell-${idx}`);
      expect(cell.textContent).toContain(`[${idx}]`);
    }
    expect(screen.getByTestId('array-cell-0').textContent).toContain('5');
    expect(screen.getByTestId('array-cell-1').textContent).toContain('2');
    expect(screen.getByTestId('array-cell-2').textContent).toContain('8');
    expect(screen.getByTestId('array-cell-3').textContent).toContain('1');
    expect(screen.getByTestId('array-cell-4').textContent).toContain('9');

    // Verify index badge i=2 placed above cell 2
    const badgeI = screen.getByTestId('index-badge-i');
    expect(badgeI).toBeDefined();
    expect(badgeI.textContent).toBe('i=2');
  });

  // AT-02: Array mutation highlights
  it('AT-02: highlights mutated array elements compared to previous snapshot', () => {
    const previousStack = [
      {
        funcName: 'main',
        frameId: 'f0',
        encodedLocals: {
          a: [
            'C_ARRAY',
            '0x7ffcc0',
            ['C_DATA', '0x7ffcc0', 'int', 5],
            ['C_DATA', '0x7ffcc4', 'int', 2],
          ],
        },
      },
    ];

    const currentStack = [
      {
        funcName: 'main',
        frameId: 'f0',
        isHighlighted: true,
        encodedLocals: {
          a: [
            'C_ARRAY',
            '0x7ffcc0',
            ['C_DATA', '0x7ffcc0', 'int', 2], // Mutated 5 -> 2
            ['C_DATA', '0x7ffcc4', 'int', 2], // Unchanged
          ],
        },
      },
    ];

    render(
      <ArrayVariablesCanvas
        stackToRender={currentStack}
        previousStackToRender={previousStack}
        currentLine={9}
      />
    );

    const cell0 = screen.getByTestId('array-cell-0');
    const cell1 = screen.getByTestId('array-cell-1');

    // Cell 0 should contain amber highlight class
    expect(cell0.querySelector('.border-amber-400')).toBeDefined();
    expect(cell0.querySelector('.bg-amber-500\\/20')).toBeDefined();

    // Cell 1 should NOT contain amber highlight class
    expect(cell1.querySelector('.border-amber-400')).toBeNull();
  });

  // AT-03: Before-statement snapshot consistency
  it('AT-03: displays before-statement educational notice with active source line', () => {
    const stackToRender = [
      {
        funcName: 'main',
        frameId: 'f0',
        isHighlighted: true,
        line: 15,
        encodedLocals: {
          temp: ['C_DATA', '0x10', 'int', 5],
        },
      },
    ];

    render(<ArrayVariablesCanvas stackToRender={stackToRender} currentLine={15} />);

    expect(screen.getByText(/Quy ước trước câu lệnh \(Before-Statement\):/)).toBeDefined();
    expect(screen.getByText(/Dòng 15 chuẩn bị được thực thi/)).toBeDefined();
  });

  // AT-04: Frame isolation for recursive/multiple frames
  it('AT-04: displays variables with frame ownership and isolates frames', () => {
    const stackToRender = [
      {
        funcName: 'main',
        frameId: 'f0',
        isHighlighted: false,
        encodedLocals: {
          n: ['C_DATA', '0x100', 'int', 10],
        },
      },
      {
        funcName: 'quickSort',
        frameId: 'f1',
        isHighlighted: true,
        encodedLocals: {
          pivot: ['C_DATA', '0x200', 'int', 5],
        },
      },
    ];

    render(<ArrayVariablesCanvas stackToRender={stackToRender} currentLine={24} />);

    // Check scalar variables in both frames
    const varN = screen.getByTestId('scalar-var-n');
    const varPivot = screen.getByTestId('scalar-var-pivot');

    expect(varN.textContent).toContain('main()');
    expect(varN.textContent).toContain('10');

    expect(varPivot.textContent).toContain('quickSort()');
    expect(varPivot.textContent).toContain('5');

    // Active frame highlight styling
    expect(varPivot.className).toContain('border-blue-900/80');
  });

  // AT-05: 50-element capture limit neutral note
  it('AT-05: displays capture limit note when array size is 50, and omits it when small', () => {
    const elements50 = Array.from({ length: 50 }, (_, i) => [
      'C_DATA',
      `0x${(1000 + i * 4).toString(16)}`,
      'int',
      i * 2,
    ]);

    const stack50 = [
      {
        funcName: 'main',
        frameId: 'f0',
        encodedLocals: {
          bigArr: ['C_ARRAY', '0x1000', ...elements50],
        },
      },
    ];

    const { rerender } = render(<ArrayVariablesCanvas stackToRender={stack50} />);
    expect(screen.getByTestId('capture-limit-note')).toBeDefined();
    expect(screen.getByTestId('capture-limit-note').textContent).toContain('50 phần tử đã ghi nhận');

    // Small array (< 50)
    const stackSmall = [
      {
        funcName: 'main',
        frameId: 'f0',
        encodedLocals: {
          smallArr: [
            'C_ARRAY',
            '0x2000',
            ['C_DATA', '0x2000', 'int', 1],
            ['C_DATA', '0x2004', 'int', 2],
          ],
        },
      },
    ];

    rerender(<ArrayVariablesCanvas stackToRender={stackSmall} />);
    expect(screen.queryByTestId('capture-limit-note')).toBeNull();
  });

  // AT-06: Pointer decay resolution across frames
  it('AT-06: resolves decayed array pointer in callee frame to caller array and attaches index badge', () => {
    const stackToRender = [
      {
        funcName: 'main',
        frameId: 'f0',
        isHighlighted: false,
        encodedLocals: {
          arr: [
            'C_ARRAY',
            '0x7ffe00',
            ['C_DATA', '0x7ffe00', 'int', 10],
            ['C_DATA', '0x7ffe04', 'int', 20],
            ['C_DATA', '0x7ffe08', 'int', 30],
          ],
        },
      },
      {
        funcName: 'BubbleSort',
        frameId: 'f1',
        isHighlighted: true,
        encodedLocals: {
          a: ['C_DATA', '0x7ffd50', 'pointer', '0x7ffe00'], // decayed pointer to arr
          j: ['C_DATA', '0x7ffd54', 'int', 1],
        },
      },
    ];

    render(<ArrayVariablesCanvas stackToRender={stackToRender} currentLine={35} />);

    // Container should show caller array 'arr'
    expect(screen.getByTestId('array-container-arr')).toBeDefined();

    // Should indicate referenced by pointer 'a (BubbleSort)'
    expect(screen.getByText(/Tham chiếu từ con trỏ: a \(BubbleSort\)/)).toBeDefined();

    // Index badge j=1 from callee should be placed at cell [1] of array 'arr'
    const badgeJ = screen.getByTestId('index-badge-j');
    expect(badgeJ).toBeDefined();
    expect(badgeJ.textContent).toBe('j=1');
  });

  // AT-11: Empty, absent, or malformed data handling without crashing
  it('AT-11: degrades gracefully with empty, null, or malformed stack frames', () => {
    // Empty stack
    const { rerender } = render(<ArrayVariablesCanvas stackToRender={[]} />);
    expect(screen.getByText('Chưa có dữ liệu biến hoặc mảng')).toBeDefined();

    // Malformed frames: null, empty objects, corrupted types
    const malformedStack = [
      null,
      {},
      { funcName: 'test', frameId: 'f0', encodedLocals: null },
      {
        funcName: 'test2',
        frameId: 'f1',
        encodedLocals: {
          corruptedArr: ['C_ARRAY', '0xbad', null, 'not_an_array'],
          corruptedScalar: ['C_DATA', '0x123'],
        },
      },
    ] as any;

    expect(() => rerender(<ArrayVariablesCanvas stackToRender={malformedStack} />)).not.toThrow();
  });

  // AT-12: Uninitialized array at declaration step (Issue 1 remediation)
  it('AT-12: shows all array elements as uninitialized when array first appears (declaration step)', () => {
    // previousStack has NO array 'a' in frame f0 → current step is declaration step
    const previousStack = [
      {
        funcName: 'main',
        frameId: 'f0',
        encodedLocals: {
          // temp exists but 'a' does not → a is being declared this step
          temp: ['C_DATA', '0x10', 'int', 0],
        },
      },
    ];

    const currentStack = [
      {
        funcName: 'main',
        frameId: 'f0',
        isHighlighted: true,
        encodedLocals: {
          a: [
            'C_ARRAY',
            '0x7ffcc0',
            ['C_DATA', '0x7ffcc0', 'int', 6764080],  // garbage stack value
            ['C_DATA', '0x7ffcc4', 'int', 0],
            ['C_DATA', '0x7ffcc8', 'int', 6753952],  // garbage
          ],
        },
      },
    ];

    render(
      <ArrayVariablesCanvas
        stackToRender={currentStack}
        previousStackToRender={previousStack}
        currentLine={3}
        codeText="int a[3];"
      />
    );

    // All 3 cells should show '?' not garbage
    expect(screen.getByTestId('array-cell-0').textContent).toContain('?');
    expect(screen.getByTestId('array-cell-1').textContent).toContain('?');
    expect(screen.getByTestId('array-cell-2').textContent).toContain('?');

    // Should show uninitialized indicator
    const uninitIndicators = screen.getAllByTestId('uninitialized-indicator');
    expect(uninitIndicators.length).toBeGreaterThan(0);

    // Should NOT show garbage numbers
    expect(screen.getByTestId('array-cell-0').textContent).not.toContain('6764080');
    expect(screen.getByTestId('array-cell-2').textContent).not.toContain('6753952');
  });

  // AT-15: Step 0 declaration with undefined previousStackToRender (Issue 1 remediation)
  it('AT-15: marks array uninitialized at step 0 when codeText contains declaration', () => {
    const currentStack = [
      {
        funcName: 'main',
        frameId: 'f0',
        isHighlighted: true,
        encodedLocals: {
          a: [
            'C_ARRAY',
            '0x7ffcc0',
            ['C_DATA', '0x7ffcc0', 'int', 6764080], // stack garbage
            ['C_DATA', '0x7ffcc4', 'int', 0],
            ['C_DATA', '0x7ffcc8', 'int', 6753952], // stack garbage
          ],
        },
      },
    ];

    render(
      <ArrayVariablesCanvas
        stackToRender={currentStack}
        currentLine={5}
        codeText="int a[5] = {5, 2, 8, 1, 9};"
        // previousStackToRender is explicitly undefined (step 0)
      />
    );

    // Should show '?' and uninitialized indicator, not garbage
    expect(screen.getByTestId('array-cell-0').textContent).toContain('?');
    expect(screen.getByTestId('array-cell-0').textContent).not.toContain('6764080');
    expect(screen.getAllByTestId('uninitialized-indicator').length).toBe(3);
  });

  // AT-13: pivot, min, max NOT treated as index names (Issue 2 remediation)
  it('AT-13: pivot, min, max do not receive index badges', () => {
    const stackToRender = [
      {
        funcName: 'quickSort',
        frameId: 'f0',
        isHighlighted: true,
        encodedLocals: {
          a: [
            'C_ARRAY',
            '0x7ffe00',
            ['C_DATA', '0x7ffe00', 'int', 3],
            ['C_DATA', '0x7ffe04', 'int', 1],
            ['C_DATA', '0x7ffe08', 'int', 4],
          ],
          pivot: ['C_DATA', '0x200', 'int', 1],  // in bounds, but NOT an index
          min: ['C_DATA', '0x204', 'int', 0],    // in bounds, but NOT an index
          max: ['C_DATA', '0x208', 'int', 2],    // in bounds, but NOT an index
        },
      },
    ];

    render(<ArrayVariablesCanvas stackToRender={stackToRender} currentLine={5} />);

    // pivot, min, max should appear as scalar variables, NOT as index badges
    expect(screen.queryByTestId('index-badge-pivot')).toBeNull();
    expect(screen.queryByTestId('index-badge-min')).toBeNull();
    expect(screen.queryByTestId('index-badge-max')).toBeNull();

    // They should appear as scalar cards
    expect(screen.getByTestId('scalar-var-pivot')).toBeDefined();
    expect(screen.getByTestId('scalar-var-min')).toBeDefined();
    expect(screen.getByTestId('scalar-var-max')).toBeDefined();
  });

  // AT-14: Multiple arrays in same frame → index badge ambiguous → not shown (Issue 2)
  it('AT-14: index variable badge not shown when multiple arrays share the same frame', () => {
    const stackToRender = [
      {
        funcName: 'merge',
        frameId: 'f0',
        isHighlighted: true,
        encodedLocals: {
          left: [
            'C_ARRAY',
            '0x7ffe00',
            ['C_DATA', '0x7ffe00', 'int', 1],
            ['C_DATA', '0x7ffe04', 'int', 2],
          ],
          right: [
            'C_ARRAY',
            '0x7fff00',
            ['C_DATA', '0x7fff00', 'int', 3],
            ['C_DATA', '0x7fff04', 'int', 4],
          ],
          i: ['C_DATA', '0x300', 'int', 1],  // ambiguous — could index either array
        },
      },
    ];

    render(<ArrayVariablesCanvas stackToRender={stackToRender} currentLine={8} />);

    // 'i' badge must NOT appear on either array when two arrays share the frame
    expect(screen.queryByTestId('index-badge-i')).toBeNull();

    // 'i' still appears as a scalar
    expect(screen.getByTestId('scalar-var-i')).toBeDefined();
  });


  // AT-16: F1 - Truthful array size badge at capture boundary (50 elements captured of larger array)
  it('AT-16 (F1): displays [≥50 phần tử (thu thập 50)] and note when at capture limit, avoiding false exact length claim', () => {
    // 50 captured elements from an underlying 60-element array
    const elements50 = Array.from({ length: 50 }, (_, i) => [
      'C_DATA',
      `0x${(2000 + i * 4).toString(16)}`,
      'int',
      i,
    ]);

    const stack = [
      {
        funcName: 'main',
        frameId: 'f0',
        isHighlighted: true,
        encodedLocals: {
          largeArr: ['C_ARRAY', '0x2000', ...elements50],
        },
      },
    ];

    render(<ArrayVariablesCanvas stackToRender={stack} currentLine={10} />);

    // Header badge must display [≥50 phần tử (thu thập 50)] - NOT [50 phần tử]
    const badge = screen.getByTestId('array-size-badge-largeArr');
    expect(badge.textContent).toBe('[≥50 phần tử (thu thập 50)]');
    expect(badge.textContent).not.toBe('[50 phần tử]');

    // Capture limit note must be present
    expect(screen.getByTestId('capture-limit-note').textContent).toContain('50 phần tử đã ghi nhận — giới hạn thu thập');
  });

  // AT-17: F2 - Access statements like a[0] = a[1] do NOT trigger uninitialized state
  it('AT-17 (F2): access statements (a[0] = a[1];) do not mark array uninitialized', () => {
    const stack = [
      {
        funcName: 'main',
        frameId: 'f0',
        isHighlighted: true,
        encodedLocals: {
          a: [
            'C_ARRAY',
            '0x7ffcc0',
            ['C_DATA', '0x7ffcc0', 'int', 5],
            ['C_DATA', '0x7ffcc4', 'int', 2],
          ],
        },
      },
    ];

    // codeText is an assignment access, NOT a declaration
    render(
      <ArrayVariablesCanvas
        stackToRender={stack}
        currentLine={7}
        codeText="a[0] = a[1];"
      />
    );

    // Cells must display real values, NOT uninitialized '?'
    expect(screen.getByTestId('array-cell-0').textContent).toContain('5');
    expect(screen.getByTestId('array-cell-1').textContent).toContain('2');
    expect(screen.queryByTestId('uninitialized-indicator')).toBeNull();
  });

  // AT-18: F2 - isDeclarationStatement accurately distinguishes declarations from accesses
  it('AT-18 (F2): isDeclarationStatement identifies C++ declarations and rejects accesses', () => {
    // True declarations
    expect(isDeclarationStatement('int a[5] = {5, 2, 8, 1, 9};', 'a')).toBe(true);
    expect(isDeclarationStatement('const int a[3] = {1, 2, 3};', 'a')).toBe(true);
    expect(isDeclarationStatement('double arr[20];', 'arr')).toBe(true);
    expect(isDeclarationStatement('auto a[5] = {1};', 'a')).toBe(true);

    // Accesses and other statements (must be FALSE)
    expect(isDeclarationStatement('a[0] = a[1];', 'a')).toBe(false);
    expect(isDeclarationStatement('a[1] = temp;', 'a')).toBe(false);
    expect(isDeclarationStatement('cout << a[i] << " ";', 'a')).toBe(false);
    expect(isDeclarationStatement('cin >> a[i];', 'a')).toBe(false);
    expect(isDeclarationStatement('int temp = a[0];', 'a')).toBe(false); // declaring temp, not a
    expect(isDeclarationStatement('swapFirstTwo(a);', 'a')).toBe(false);
    expect(isDeclarationStatement('for (int i = 0; i < 5; i++)', 'a')).toBe(false);
    expect(isDeclarationStatement('', 'a')).toBe(false);
    expect(isDeclarationStatement(null, 'a')).toBe(false);
  });

  // AT-19: F3 - Helper function receiving two different array pointers does NOT attach index to both
  it('AT-19 (F3): helper function receiving two different array pointers does not attach index badge to either without evidence', () => {
    const stackToRender = [
      {
        funcName: 'main',
        frameId: 'f0',
        isHighlighted: false,
        encodedLocals: {
          arr1: [
            'C_ARRAY',
            '0x7ffe00',
            ['C_DATA', '0x7ffe00', 'int', 10],
            ['C_DATA', '0x7ffe04', 'int', 20],
          ],
          arr2: [
            'C_ARRAY',
            '0x7fff00',
            ['C_DATA', '0x7fff00', 'int', 30],
            ['C_DATA', '0x7fff04', 'int', 40],
          ],
        },
      },
      {
        funcName: 'merge',
        frameId: 'f1',
        isHighlighted: true,
        encodedLocals: {
          a: ['C_DATA', '0x7ffd50', 'pointer', '0x7ffe00'], // points to arr1
          b: ['C_DATA', '0x7ffd58', 'pointer', '0x7fff00'], // points to arr2
          i: ['C_DATA', '0x7ffd60', 'int', 1],              // ambiguous index
        },
      },
    ];

    render(<ArrayVariablesCanvas stackToRender={stackToRender} currentLine={42} />);

    // Since merge receives TWO array pointers, 'i=1' is ambiguous and must NOT attach to either array
    expect(screen.queryByTestId('index-badge-i')).toBeNull();

    // But 'i' must remain visible in scalar variables grid
    expect(screen.getByTestId('scalar-var-i')).toBeDefined();
    expect(screen.getByTestId('scalar-var-i').textContent).toContain('merge()');
    expect(screen.getByTestId('scalar-var-i').textContent).toContain('1');
  });
  // AT-20 (Fix-regex): isDeclarationStatement handles varName containing special regex metacharacters.
  // Verifies the \\$& escape fix: without it, the replace() call would corrupt the regex pattern.
  it('AT-20 (Fix-regex): isDeclarationStatement correctly escapes special regex chars in varName', () => {
    // Plain name — baseline
    expect(isDeclarationStatement('int a[5] = {1,2,3,4,5};', 'a')).toBe(true);
    // Name with '$' — before the fix, varName.replace(..., '\\$&') would have used the corrupted
    // replacement string and left a literal React component text in the pattern, causing a SyntaxError.
    // After the fix, special chars are safely escaped and no exception is thrown.
    expect(() => isDeclarationStatement('int arr$1[3];', 'arr$1')).not.toThrow();
    expect(isDeclarationStatement('int arr$1[3];', 'arr$1')).toBe(true);
    expect(isDeclarationStatement('arr$1[0] = 5;', 'arr$1')).toBe(false);
    // Name with '.' — dot must not match any character in the declaration regex
    expect(() => isDeclarationStatement('int a.b[2];', 'a.b')).not.toThrow();
    expect(isDeclarationStatement('xyz[0] = 1;', 'a.b')).toBe(false);
  });
});
