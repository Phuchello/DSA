import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import React from 'react';
import { EducationalBanner } from './EducationalBanner';
import { DsaDiff, EducationalExplanationDetail } from '../types';

describe('EducationalBanner M2.1 Evidence-Based Explanations', () => {
  const sampleDetail: EducationalExplanationDetail = {
    upcoming: 'Chuẩn bị tính toán và cập nhật giá trị: currentPath = node->weight + leftGain + rightGain;',
    observed: 'Biến leftGain thay đổi từ 0 thành 19. Đã thu hồi khung hàm con maxGain() (Pop).',
    semantics: 'Lưu trữ giá trị tính toán trung gian phục vụ cho việc cập nhật đường đi cực đại.',
  };

  const sampleDiff: DsaDiff = {
    changedVariables: ['leftGain'],
    allocatedNodes: ['0x1000'],
    freedNodes: ['0x2000'],
    pointerReroutes: [{ pointer: 'node', from: '0x3000', to: '0x4000' }],
    scalarUpdates: [
      {
        name: 'leftGain',
        from: 0,
        to: 19,
        frameName: 'maxGain',
        frameId: 'f1',
        frameDepth: 1,
        displayName: 'leftGain',
      },
    ],
    arrayUpdates: [
      {
        arrayName: 'a',
        index: 0,
        from: 5,
        to: 2,
        frameName: 'main',
        frameId: 'f0',
        frameDepth: 0,
        displayName: 'a[0]',
      },
    ],
    frameTransition: {
      type: 'push',
      funcName: 'maxGain',
      depth: 2,
      callerFunc: 'main',
      calleeFunc: 'maxGain',
    },
  };

  it('renders all three educational facets distinctly when explanationDetail is provided', () => {
    render(
      <EducationalBanner
        explanation="Fallback text"
        explanationDetail={sampleDetail}
        advancedNotes=""
        mode="beginner"
        line={15}
        codeText="currentPath = node->weight + leftGain + rightGain;"
      />
    );

    expect(screen.getByTestId('explanation-upcoming').textContent).toContain('Sắp thực hiện:');
    expect(screen.getByTestId('explanation-upcoming').textContent).toContain('Chuẩn bị tính toán và cập nhật giá trị');

    expect(screen.getByTestId('explanation-observed').textContent).toContain('Quan sát:');
    expect(screen.getByTestId('explanation-observed').textContent).toContain('Biến leftGain thay đổi từ 0 thành 19');

    expect(screen.getByTestId('explanation-semantics').textContent).toContain('Ý nghĩa:');
    expect(screen.getByTestId('explanation-semantics').textContent).toContain('Lưu trữ giá trị tính toán trung gian');
  });

  it('falls back to single paragraph when explanationDetail is omitted', () => {
    render(
      <EducationalBanner
        explanation="Fallback giải thích khi dữ liệu chưa có chi tiết"
        advancedNotes=""
        mode="beginner"
      />
    );

    expect(screen.queryByTestId('explanation-upcoming')).toBeNull();
    expect(screen.getByText('Fallback giải thích khi dữ liệu chưa có chi tiết')).toBeTruthy();
  });

  it('hides raw memory addresses from diff badges in Beginner mode', () => {
    render(
      <EducationalBanner
        explanation="Test explanation"
        explanationDetail={sampleDetail}
        advancedNotes="Advanced tech note"
        mode="beginner"
        diff={sampleDiff}
      />
    );

    const diffContainer = screen.getByTestId('diff-badge-container');
    // Beginner mode should NOT display raw hex addresses in node badges
    expect(diffContainer.textContent).toContain('+ new NODE');
    expect(diffContainer.textContent).not.toContain('+ new NODE (0x1000)');
    expect(diffContainer.textContent).toContain('- delete');
    expect(diffContainer.textContent).not.toContain('- delete (0x2000)');

    // Should display friendly frame push indicator
    expect(diffContainer.textContent).toContain('▲ Gọi maxGain()');

    // Advanced notes should be hidden in Beginner mode
    expect(screen.queryByText('Advanced tech note')).toBeNull();
  });

  it('displays raw memory addresses and advanced technical notes in Advanced mode', () => {
    render(
      <EducationalBanner
        explanation="Test explanation"
        explanationDetail={sampleDetail}
        advancedNotes="Bộ nhớ tại địa chỉ 0x2000 đã giải phóng hoàn toàn."
        mode="advanced"
        diff={sampleDiff}
      />
    );

    const diffContainer = screen.getByTestId('diff-badge-container');
    expect(diffContainer.textContent).toContain('+ new NODE (0x1000)');
    expect(diffContainer.textContent).toContain('- delete (0x2000)');
    expect(screen.getByText('Bộ nhớ tại địa chỉ 0x2000 đã giải phóng hoàn toàn.')).toBeTruthy();
  });
});
