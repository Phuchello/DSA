import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { Header } from '../components/Header';
import { EducationalBanner } from '../components/EducationalBanner';
import { Lesson } from '../types';

describe('Vietnamese Localization Verification', () => {
  const sampleLessons: Lesson[] = [
    {
      id: 'l1',
      title: 'Bài 1: Khởi tạo danh sách',
      description: 'Mô tả bài học',
      difficulty: 'Beginner',
      code: 'int main() {}',
      defaultStdin: '',
    },
    {
      id: 'l2',
      title: 'Bài 2: Xóa phần tử',
      description: 'Mô tả bài học',
      difficulty: 'Advanced',
      code: 'int main() {}',
      defaultStdin: '',
    },
  ];

  it('translates lesson difficulty to Vietnamese in Header select options', () => {
    render(
      <Header
        lessons={sampleLessons}
        selectedLessonId="l1"
        onSelectLesson={vi.fn()}
        mode="beginner"
        onToggleMode={vi.fn()}
        isRunning={false}
        onRunCode={vi.fn()}
        onReset={vi.fn()}
      />
    );

    // Must show Vietnamese translated difficulty, not English
    expect(screen.getByText('Bài 1: Khởi tạo danh sách [Cơ bản]')).toBeTruthy();
    expect(screen.getByText('Bài 2: Xóa phần tử [Nâng cao]')).toBeTruthy();
    expect(screen.queryByText('Bài 1: Khởi tạo danh sách (Beginner)')).toBeNull();
    expect(screen.queryByText('Bài 2: Xóa phần tử (Advanced)')).toBeNull();
  });

  it('displays Vietnamese mode labels in EducationalBanner for both modes', () => {
    const { rerender } = render(
      <EducationalBanner
        explanation="Giải thích thử nghiệm"
        advancedNotes=""
        mode="beginner"
      />
    );

    expect(screen.getByText('Sư phạm IT003 (Tập sự)')).toBeTruthy();

    rerender(
      <EducationalBanner
        explanation="Giải thích thử nghiệm"
        advancedNotes="Ghi chú kỹ thuật"
        mode="advanced"
      />
    );

    expect(screen.getByText('Góc nhìn Chuyên sâu')).toBeTruthy();
  });
});
