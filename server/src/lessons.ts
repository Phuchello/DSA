export interface Lesson {
  id: string;
  title: string;
  description: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  code: string;
  defaultStdin: string;
}

const BASE_GOLDEN_CODE = `#include <iostream>
using namespace std;

struct NODE {
    int info;
    NODE* pNext;
};

struct LIST {
    NODE* pHead;
    NODE* pTail;
};

void CreateEmptyList(LIST &L) {
    L.pHead = nullptr;
    L.pTail = nullptr;
}

NODE* CreateNode(int x) {
    NODE* p = new NODE;
    p->info = x;
    p->pNext = nullptr;
    return p;
}

void InsertTail(LIST &L, int x) {
    NODE* p = CreateNode(x);
    if (L.pHead == nullptr) {
        L.pHead = L.pTail = p;
    } else {
        L.pTail->pNext = p;
        L.pTail = p;
    }
}

void PrintList(const LIST &L) {
    if (L.pHead == nullptr) {
        cout << "-1" << endl;
        return;
    }
    NODE* p = L.pHead;
    while (p != nullptr) {
        cout << p->info << (p->pNext ? " " : "");
        p = p->pNext;
    }
    cout << endl;
}

void TimKiemVaXoa(LIST &L, int k) {
    NODE* p = L.pHead;
    NODE* prev = nullptr;
    while (p != nullptr) {
        if (p->info == k) {
            NODE* temp = p;
            if (p == L.pHead) {
                L.pHead = p->pNext;
                p = L.pHead;
                if (L.pHead == nullptr) {
                    L.pTail = nullptr;
                }
            } else {
                prev->pNext = p->pNext;
                if (p == L.pTail) {
                    L.pTail = prev;
                }
                p = p->pNext;
            }
            delete temp;
        } else {
            prev = p;
            p = p->pNext;
        }
    }
}

int main() {
    LIST L;
    CreateEmptyList(L);
    int n;
    if (!(cin >> n)) return 0;
    for (int i = 0; i < n; i++) {
        int x;
        cin >> x;
        InsertTail(L, x);
    }
    int k;
    cin >> k;
    TimKiemVaXoa(L, k);
    PrintList(L);
    return 0;
}`;

export const LESSONS: Lesson[] = [
  {
    id: 'it003-golden',
    title: 'Bài mẫu IT003: TimKiemVaXoa chuẩn (Golden Case)',
    description: 'Danh sách [3, 0, 8, 2, 3, 4, 7] xóa phần tử k = 3. Minh họa cả hai trường hợp: xóa ở đầu (Head) và xóa ở giữa.',
    difficulty: 'Beginner',
    code: BASE_GOLDEN_CODE,
    defaultStdin: '7\n3 0 8 2 3 4 7\n3'
  },
  {
    id: 'it003-delete-head',
    title: 'Ca biên 1: Xóa nút ở đầu danh sách (Delete Head)',
    description: 'Danh sách [3, 0, 8] xóa k = 3. Con trỏ pHead dịch chuyển sang nút kế tiếp (0), nút cũ được thu hồi bộ nhớ.',
    difficulty: 'Beginner',
    code: BASE_GOLDEN_CODE,
    defaultStdin: '3\n3 0 8\n3'
  },
  {
    id: 'it003-delete-tail',
    title: 'Ca biên 2: Xóa nút ở cuối danh sách (Delete Tail)',
    description: 'Danh sách [0, 8, 3] xóa k = 3. Con trỏ pTail phải được cập nhật lùi về nút prev (8).',
    difficulty: 'Beginner',
    code: BASE_GOLDEN_CODE,
    defaultStdin: '3\n0 8 3\n3'
  },
  {
    id: 'it003-consecutive',
    title: 'Ca biên 3: Xóa các nút trùng lặp liên tiếp',
    description: 'Danh sách [3, 3, 4, 3, 3] xóa k = 3. Xóa các nút đứng sát nhau mà không nhảy cóc qua phần tử tiếp theo.',
    difficulty: 'Intermediate',
    code: BASE_GOLDEN_CODE,
    defaultStdin: '5\n3 3 4 3 3\n3'
  },
  {
    id: 'it003-delete-all',
    title: 'Ca biên 4: Xóa toàn bộ danh sách (All Elements Match)',
    description: 'Danh sách [3, 3, 3] xóa k = 3. Sau khi xóa toàn bộ, pHead và pTail phải cùng trỏ về nullptr.',
    difficulty: 'Intermediate',
    code: BASE_GOLDEN_CODE,
    defaultStdin: '3\n3 3 3\n3'
  },
  {
    id: 'it003-not-found',
    title: 'Ca biên 5: Không tìm thấy phần tử cần xóa',
    description: 'Danh sách [2, 4, 7] tìm k = 3. Duyệt hết danh sách, cấu trúc không thay đổi, in ra cấu trúc ban đầu.',
    difficulty: 'Beginner',
    code: BASE_GOLDEN_CODE,
    defaultStdin: '3\n2 4 7\n3'
  },
  {
    id: 'it003-empty-list',
    title: 'Ca biên 6: Danh sách rỗng (Empty List)',
    description: 'Số lượng n = 0. Kiểm tra tính an toàn: chương trình không dereference con trỏ null (pHead == nullptr).',
    difficulty: 'Beginner',
    code: BASE_GOLDEN_CODE,
    defaultStdin: '0\n3'
  },
  {
    id: 'it003-single-match',
    title: 'Ca biên 7: Danh sách có đúng 1 phần tử (Trùng khớp)',
    description: 'Danh sách [3] xóa k = 3. Phần tử duy nhất vừa là pHead vừa là pTail; sau xóa danh sách trở thành rỗng.',
    difficulty: 'Beginner',
    code: BASE_GOLDEN_CODE,
    defaultStdin: '1\n3\n3'
  },
  {
    id: 'it003-single-miss',
    title: 'Ca biên 8: Danh sách có đúng 1 phần tử (Không trùng khớp)',
    description: 'Danh sách [7] tìm k = 3. Không có thao tác xóa; pHead và pTail giữ nguyên.',
    difficulty: 'Beginner',
    code: BASE_GOLDEN_CODE,
    defaultStdin: '1\n7\n3'
  }
];
