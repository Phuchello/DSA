import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import React from 'react';
import { LinkedListCanvas } from '../components/LinkedListCanvas';
import { DsaNode, DsaPointer } from '../types';

describe('LinkedListCanvas Component', () => {
  it('renders empty list message when no nodes exist', () => {
    render(<LinkedListCanvas nodes={[]} pointers={[]} />);
    expect(screen.getByText(/Danh sách liên kết đang rỗng/)).toBeTruthy();
  });

  it('renders main chain nodes and only draws real edges between connected nodes', () => {
    const nodes: DsaNode[] = [
      { id: 'node_0x1', address: '0x1', info: 10, nextAddress: '0x2', status: 'allocated' },
      { id: 'node_0x2', address: '0x2', info: 20, nextAddress: null, status: 'allocated' },
    ];
    const pointers: DsaPointer[] = [
      { name: 'L.pHead', targetAddress: '0x1', state: 'valid', color: '#3B82F6' },
      { name: 'L.pTail', targetAddress: '0x2', state: 'valid', color: '#8B5CF6' },
    ];

    render(<LinkedListCanvas nodes={nodes} pointers={pointers} />);

    expect(screen.getByText('10')).toBeTruthy();
    expect(screen.getByText('20')).toBeTruthy();
    expect(screen.getByText('L.pHead')).toBeTruthy();
    expect(screen.getByText('L.pTail')).toBeTruthy();
    expect(screen.getByText('nullptr (0x0)')).toBeTruthy();
  });

  it('separates detached and freed nodes into distinct sections without artificial links', () => {
    const nodes: DsaNode[] = [
      { id: 'node_0x1', address: '0x1', info: 10, nextAddress: '0x3', status: 'allocated' },
      { id: 'node_0x3', address: '0x3', info: 30, nextAddress: null, status: 'allocated' },
      { id: 'node_0x2', address: '0x2', info: 20, nextAddress: null, status: 'detached' },
      { id: 'node_0x9', address: '0x9', info: 99, nextAddress: null, status: 'freed' },
    ];
    const pointers: DsaPointer[] = [
      { name: 'L.pHead', targetAddress: '0x1', state: 'valid', color: '#3B82F6' },
      { name: 'L.pTail', targetAddress: '0x3', state: 'valid', color: '#8B5CF6' },
      { name: 'temp', targetAddress: '0x2', state: 'valid', color: '#EF4444' },
      { name: 'oldPtr', targetAddress: '0x9', state: 'freed', color: '#EF4444' },
    ];

    render(<LinkedListCanvas nodes={nodes} pointers={pointers} />);

    // Section for main chain
    expect(screen.getByText(/Chuỗi Danh Sách Chính/)).toBeTruthy();
    // Section for detached nodes
    expect(screen.getByText(/Nút Đã Tách Rời Chuỗi Chính/)).toBeTruthy();
    // Section for freed memory
    expect(screen.getByText(/Vùng Nhớ Đã Thu Hồi/)).toBeTruthy();

    expect(screen.getByText('Tách chuỗi')).toBeTruthy();
    expect(screen.getByText('Đã delete')).toBeTruthy();
  });

  it('renders special dock for nullptr, uninitialized, and dangling pointers', () => {
    const pointers: DsaPointer[] = [
      { name: 'pHead', targetAddress: null, state: 'null', color: '#3B82F6' },
      { name: 'uninitPtr', targetAddress: null, state: 'uninitialized', color: '#94A3B8' },
      { name: 'danglingPtr', targetAddress: '0xdeadbeef', state: 'dangling', color: '#F59E0B' },
    ];

    render(<LinkedListCanvas nodes={[]} pointers={pointers} />);

    expect(screen.getByText('pHead:')).toBeTruthy();
    expect(screen.getByText('nullptr (0x0)')).toBeTruthy();
    expect(screen.getByText('uninitPtr:')).toBeTruthy();
    expect(screen.getByText('chưa gán (?)')).toBeTruthy();
    expect(screen.getByText('danglingPtr:')).toBeTruthy();
    expect(screen.getByText('lơ lửng (dangling)')).toBeTruthy();
  });

  it('renders independent LIST roots in separate labeled topology sections', () => {
    const nodes: DsaNode[] = [
      { id: 'node_0x1', address: '0x1', info: 11, nextAddress: null, status: 'allocated', location: 'heap' },
      { id: 'node_0x2', address: '0x2', info: 22, nextAddress: '0x3', status: 'allocated', location: 'heap' },
      { id: 'node_0x3', address: '0x3', info: 33, nextAddress: null, status: 'allocated', location: 'heap' },
    ];
    const pointers: DsaPointer[] = [
      { name: 'first.pHead', targetAddress: '0x1', state: 'valid' },
      { name: 'first.pTail', targetAddress: '0x1', state: 'valid' },
      { name: 'second.pHead', targetAddress: '0x2', state: 'valid' },
      { name: 'second.pTail', targetAddress: '0x3', state: 'valid' },
    ];
    render(<LinkedListCanvas
      nodes={nodes}
      pointers={pointers}
      listRoots={[
        { name: 'first', displayName: 'first', headPointer: 'first.pHead', tailPointer: 'first.pTail', headAddress: '0x1', tailAddress: '0x1', nodes: [nodes[0]] },
        { name: 'second', displayName: 'second', headPointer: 'second.pHead', tailPointer: 'second.pTail', headAddress: '0x2', tailAddress: '0x3', nodes: [nodes[1], nodes[2]] },
      ]}
    />);
    const first = screen.getByTestId('list-root-0');
    const second = screen.getByTestId('list-root-1');
    expect(first.textContent).toContain('first');
    expect(first.textContent).toContain('0x1');
    expect(second.textContent).toContain('second');
    expect(second.textContent).toContain('0x2');
    expect(second.textContent).toContain('0x3');
  });

  it('explains NODE locations accurately in Vietnamese', () => {
    render(<LinkedListCanvas nodes={[]} pointers={[]} />);
    expect(screen.getByText('Mỗi khối biểu diễn một đối tượng NODE. Tùy cách tạo, NODE có thể nằm trên Stack, Heap hoặc chưa xác định được vùng nhớ.')).toBeTruthy();
    expect(screen.queryByText(/được cấp phát động trên vùng nhớ Heap/)).toBeNull();
  });
});
