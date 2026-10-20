# DSA FLOWLAB — Phase 0: Web-first feasibility & architecture audit

**Ngày rà soát:** 20/10/2026  
**Trạng thái:** Source audit / research, **chưa** build, chạy end-to-end hoặc kiểm thử runtime.  
**Quyết định tạm thời:** **Web-first UI + See++ as proof-of-concept baseline**, **chưa phê duyệt fork lâu dài**.  
**Phạm vi:** Bài học IT003 bằng C++, ưu tiên Singly Linked List và bài `TimKiemVaXoa`.

## Quy tắc bằng chứng

- **VERIFIED-SOURCE:** đọc trực tiếp cây thư mục hoặc nội dung file trên GitHub tại commit cụ thể; không hàm ý đã chạy thành công.
- **DOCUMENTED:** upstream tuyên bố trong README/docs; chưa đối chiếu bằng thực nghiệm.
- **INFERRED:** suy luận kỹ thuật có căn cứ nhưng chưa kiểm thử.
- **UNKNOWN:** cần POC hoặc xác nhận pháp lý, không được mô tả như đã đạt.

Tại thời điểm audit: `knazir/SeePlusPlus` nhánh `master`, commit `a89e494eeef739715416ff457fad6b48a783960d` (04/07/2026); submodule `code-runner/SPP-Valgrind` pin ở `008134bf12f1084e431fef8cd6e7114388a21a8f`. Công cụ hiện tại không có Docker CLI nên không build/run See++ ở đây; **không có test runtime nào được tuyên bố PASS**.

## A. Open-source landscape

| Ứng viên | Cách xử lý C++ | Web | Source, license | Hạn chế quyết định | Trạng thái |
|---|---|---|---|---|---|
| [See++](https://github.com/knazir/SeePlusPlus) | `g++` + Valgrind sửa đổi + execution trace | React frontend, Node/Express backend, code runner Docker local hoặc AWS Lambda prod | Ứng dụng MIT; submodule SPP-Valgrind GPL (COPYING ở bản pin là GPLv3); trademark riêng | Chưa có `stdin` trong request, security sandbox cần hardening, freed-state chưa chứng minh | VERIFIED-SOURCE + UNKNOWN POC |
| [C++ Memory Visualizer](https://github.com/tkflare1/memory-visualizer) | Bộ tokenizer/parser/interpreter viết bằng TypeScript, hỗ trợ **tập con** C++ | Next.js, chạy client-side | Chưa tìm thấy LICENSE tại root theo danh sách repo; không mặc định có quyền sao chép code | Không phải compiler/runtime C++ thực; sai khác semantics phải được dự liệu | VERIFIED-SOURCE |
| [Python Tutor C++](https://pythontutor.com/cpp.html) | C++ backend dùng Valgrind (theo mô tả của chủ dự án) | Có | Codebase lịch sử tại [Bit-Zard/python-tutor](https://github.com/Bit-Zard/python-tutor) và [JuezUN/opt-cpp-backend](https://github.com/JuezUN/opt-cpp-backend); kiểm tra license theo từng thành phần nếu tái sử dụng | README lịch sử cho biết tự host các backend không phải Python khó vì dependency chưa đóng gói đầy đủ; không giả định website live trùng source lịch sử | DOCUMENTED |

**Kết quả:** See++ dẫn đầu **với điều kiện** POC về input, heap lifecycle, pointer/reference và security đạt. C++ Memory Visualizer chỉ dùng ý tưởng UI cho đến khi xác minh giấy phép; Python Tutor dùng benchmark hành vi/UI, không tự ý fork bản backend live.

## B. See++ technical audit — file-level

### B1. Thực thể source & pipeline

Sơ đồ từ [docs/architecture.md](https://github.com/knazir/SeePlusPlus/blob/a89e494eeef739715416ff457fad6b48a783960d/docs/architecture.md):

```text
Browser (React 18 + Vite + CodeMirror 6 + Zustand)
           |
     POST /api/run
           |
Node/Express backend (TypeScript)
           |
 Runner.run(code, uniqueId)
           |
  local Docker    OR    AWS Lambda
           |
 g++ -std=c++11 -ggdb -O0 -fno-omit-frame-pointer
           |
 SPP-Valgrind modified instrumentation
           |
 Raw records delimited by === pg_trace_inst ===
           |
 parse_vg_trace.ts -> ProgramTrace JSON
           |
 frontend/src/trace/schema.ts (Zod)
           |
 StackFrames + HeapGraph + EdgeLayer + timeline
```

Source files kiểm chứng:

- [backend/src/index.ts](https://github.com/knazir/SeePlusPlus/blob/a89e494eeef739715416ff457fad6b48a783960d/backend/src/index.ts#L97-L143): `/api/run`, body lấy `req.body.code`, chưa có input riêng; SHA-256 ID chỉ dựa trên preprocessed code ở production; endpoint giới hạn 10 req/phút trong 1 cửa sổ 60 giây (cấu hình hiện tại).
- [backend/src/runners/runner.interface.ts](https://github.com/knazir/SeePlusPlus/blob/a89e494eeef739715416ff457fad6b48a783960d/backend/src/runners/runner.interface.ts): interface `run(code, uniqueId)` và kết quả compiler/program stdout, stderr, traceContent.
- [backend/src/runners/local.ts](https://github.com/knazir/SeePlusPlus/blob/a89e494eeef739715416ff457fad6b48a783960d/backend/src/runners/local.ts#L40-L59): backend chạy `docker run --rm --network spp_no-internet` và mount input code RO / output RW. Không thấy áp giới hạn `--memory`, `--cpus`, `--pids-limit` hoặc `timeout` trong command này. **Đây là phát hiện từ source, không phải kết luận kiểm thử sandbox breakout.**
- [docker-compose.yml](https://github.com/knazir/SeePlusPlus/blob/a89e494eeef739715416ff457fad6b48a783960d/docker-compose.yml): backend local mount `/var/run/docker.sock` từ host; nguy cơ bảo mật lớn nếu dùng cùng kiến trúc khi public.
- [code-runner/lambda/handler.py](https://github.com/knazir/SeePlusPlus/blob/a89e494eeef739715416ff457fad6b48a783960d/code-runner/lambda/handler.py#L128-L145): `g++` C++11 debug no optimization; compile timeout 30s, execution timeout 120s tại process handler.
- [code-runner/local/entrypoint.sh](https://github.com/knazir/SeePlusPlus/blob/a89e494eeef739715416ff457fad6b48a783960d/code-runner/local/entrypoint.sh#L23-L53): compile bằng g++, chạy dưới modified Valgrind. Không có stdin redirection ở entrypoint này.
- [backend/src/parse_vg_trace.ts](https://github.com/knazir/SeePlusPlus/blob/a89e494eeef739715416ff457fad6b48a783960d/backend/src/parse_vg_trace.ts#L1-L32): parser giới hạn trace 1000 execution points trong logic; `ONLY_ONE_REC_PER_LINE` loại record lặp có cùng line/frame. Việc loại record có làm mất thay đổi quan trọng trên cùng dòng hay không là POC cần kiểm tra.
- [frontend/src/trace/schema.ts](https://github.com/knazir/SeePlusPlus/blob/a89e494eeef739715416ff457fad6b48a783960d/frontend/src/trace/schema.ts): validate Zod cho ProgramTrace và type guards C_DATA/C_STRUCT/C_ARRAY; giảm line-offset do backend prepend một dòng define.
- [frontend/src/components/HeapGraph.tsx](https://github.com/knazir/SeePlusPlus/blob/a89e494eeef739715416ff457fad6b48a783960d/frontend/src/components/HeapGraph.tsx), [HeapNode.tsx](https://github.com/knazir/SeePlusPlus/blob/a89e494eeef739715416ff457fad6b48a783960d/frontend/src/components/HeapNode.tsx), [EdgeLayer.tsx](https://github.com/knazir/SeePlusPlus/blob/a89e494eeef739715416ff457fad6b48a783960d/frontend/src/components/EdgeLayer.tsx), [StackFrames.tsx](https://github.com/knazir/SeePlusPlus/blob/a89e494eeef739715416ff457fad6b48a783960d/frontend/src/components/StackFrames.tsx): renderer hiện hữu có thể mở rộng cho node DSLK.
- [frontend/src/viz/reachability.ts](https://github.com/knazir/SeePlusPlus/blob/a89e494eeef739715416ff457fad6b48a783960d/frontend/src/viz/reachability.ts): gắn nhãn orphan bằng đồ thị reachable từ stack và globals trong từng snapshot. **Orphan ≠ bằng chứng memory leak**, vì model có thể thiếu roots hoặc không có thông tin lifetime.

### B2. Trace schema và giới hạn fidelity

`ExecutionPoint` chứa `event`, `line`, `funcName`, `stackToRender`, `globals`, `heap`, `orderedGlobals`, `stdout`, `exceptionMsg?`. Bộ chuyển đổi raw Valgrind thành tuple:

- scalar: `['C_DATA', address, type, value]`;
- pointer hoặc reference: `['C_DATA', address, 'pointer' | 'ref', targetAddress]`;
- struct: `['C_STRUCT', address, type, [fieldName, encodedField], ...]`;
- array: `['C_ARRAY', address, ...encodedElements]`;
- heap blocks được thêm vào `executionPoint.heap` trong `encodeValue`.

Các tuple cho phép làm **memory normalizer độc lập**: từ `L.pHead`, `L.pTail`, `p`, `prev`, `temp` và `NODE.pNext`, dựng graph có mũi tên và địa chỉ. Tuy nhiên **không chứng minh trace hiện tại phát sự kiện cấp phát/giải phóng đủ để hiển thị mọi trạng thái freed/dangling**. Cần trace thật đối chiếu `gdb` và Valgrind memcheck khi POC.

### B3. `stdin` — functional gap quan trọng

**VERIFIED-SOURCE:** `POST /api/run` chỉ nhận `{ code }`, runner interface chỉ có `code + uniqueId`, local entrypoint và Lambda handler chưa cấp `stdin` cho user program. Vì vậy **chưa được tuyên bố có hỗ trợ `cin` theo input Wecode**.

P0 cần mở rộng theo đường end-to-end:

1. `POST /api/run` nhận `{ code: string, stdin: string }`, validate kích cỡ/encoding.
2. Cache key phải gồm `code + stdin + compiler/runtime version + relevant flags`, không được chỉ hash code.
3. `TraceRunner.run` truyền `stdin` tới local/Lambda.
4. Runner viết `stdin.txt` an toàn hoặc truyền `stdin` vào tiến trình, **không** nhúng nội dung người dùng vào shell command.
5. Chạy Valgrind với stdin được nối từ nguồn chuẩn bị sẵn; không chờ nhập tương tác vô hạn.
6. Kết quả parse và UI giữ nguyên semantics `stdout`, `stderr`, trace.
7. Regression test cùng code nhưng đổi `stdin` phải cho 2 kết quả độc lập.

### B4. Giấy phép và trademark

- [Root LICENSE](https://github.com/knazir/SeePlusPlus/blob/a89e494eeef739715416ff457fad6b48a783960d/LICENSE): MIT cho ứng dụng See++ theo tuyên bố upstream. Giữ copyright notice khi sao chép/phân phối phần mềm.
- [Submodule](https://github.com/knazir/SPP-Valgrind/blob/008134bf12f1084e431fef8cd6e7114388a21a8f/COPYING): GNU GPL **version 3** theo file COPYING của chính commit được pin. Các file upstream Valgrind có thể có nhiều copyright / điều khoản: trước khi phát hành image/binary cần rà riêng source file và nghĩa vụ cung cấp mã nguồn.
- [TRADEMARK](https://github.com/knazir/SeePlusPlus/blob/a89e494eeef739715416ff457fad6b48a783960d/TRADEMARK): không dùng See++ brand/logo làm branding mới; DSA FlowLab có nhận diện riêng.
- Repo `tkflare1/memory-visualizer` **không thấy LICENSE tại root**, không có `license` khai báo trong package.json ở snapshot; không tái sử dụng code khi chưa có quyền cấp phép rõ ràng.
- Đây là **đánh giá kỹ thuật về compliance, không phải tư vấn pháp lý chính thức**.

### B5. Bảo mật và tính sẵn sàng web

**Blocker public deployment:** compose mount Docker daemon socket vào backend; local runner không đặt limits trong lệnh `docker run`. Network isolation thôi không đủ. Khuyến nghị:

- Giai đoạn cá nhân: browser gọi `localhost:4000` + runner Docker trên máy kiểm soát, không expose API ra Internet.
- Giai đoạn public: API orchestrator chạy tách biệt execution worker; không mount host Docker socket vào web/API containers; sandbox ephemeral chuyên dụng; CPU/RAM/PIDs/time/size/quota/rate-limit được cưỡng chế; không network, read-only rootFS trừ tmp, non-root, capability/seccomp/AppArmor tùy môi trường; quan sát/giới hạn trace kích thước lớn, xuất log có retention ngắn.
- Cần đánh giá rủi ro container escape, denial-of-service, compile bombs, fork bombs, output bombs, environment leakage và chi phí.
- Docker chính thức cảnh báo đặc quyền Docker daemon cho phép kiểm soát host: https://docs.docker.com/engine/security/ ; https://docs.docker.com/engine/security/protect-access/ .

AWS Lambda production có cơ chế cách ly/timeout khác local, nhưng không tự động được coi là `production-safe` nếu chưa chạy adversarial tests và rà các giới hạn.

## C. Feasibility matrix — gate-based, weights only for prioritization

Không cộng điểm tổng khi những gate chưa được thử. Trọng số dưới đây phản ánh ưu tiên P0 của DSA FlowLab, không phải đo lường khách quan về toàn bộ dự án mã nguồn mở:

| Tiêu chí | Trọng số | See++ | Memory Visualizer | Python Tutor lịch sử |
|---|---:|---|---|---|
| Đúng semantics C++ thật | 30% | **Nguồn hỗ trợ:** g++/Valgrind; cần POC | **Fail gate:** interpreter subset | Có backend C++; cần POC self-host |
| Memory/pointer graph đủ cho linked list | 25% | **Partial:** có trace graph; freed/dangling unknown | Có UI; semantic limitation | Có visualization; self-host API unknown |
| Web-first, responsive, thao tác từng bước | 15% | Có | Có | Có |
| Nâng cấp stdin + renderer Việt hóa | 15% | Source seams rõ, chưa triển khai | Reuse code bị chặn giấy phép; cần mở interpreter | Non-Python self-host phức tạp theo README |
| Giấy phép, bảo trì, self-host | 10% | MIT + GPLv3 với nghĩa vụ riêng; có Docker local | Chưa tìm thấy LICENSE; thấp | Thành phần lịch sử/phụ thuộc cần xác minh |
| Beginner UX cho IT003 | 5% | Cần điều chỉnh | UI tham khảo tốt | Có kinh nghiệm UX để học hỏi |

**Hard gates:** (1) code kiểm thử C++ thật tạo trace đúng; (2) `stdin` chuẩn; (3) pointer/memory state thể hiện đúng; (4) self-host ổn; (5) sandbox hoàn thiện **trước public**; (6) licensing rõ. Nếu fail gate 1/3, không dùng See++ làm execution engine chỉ vì tổng điểm cao.

## D. Architecture Decision Record — ADR-001 Web-first

**Status:** Proposed / awaiting POC.

**Decision:** ưu tiên baseline See++ để tận dụng C++ tracing engine và React frontend; triển khai một **DSA normalization/learning layer tách biệt** để hạn chế sửa upstream. Không xây một TypeScript C++ interpreter mới, không tích hợp AI làm nguồn trạng thái execution.

```text
USER BROWSER — DSA FlowLab
  [CodeMirror C++ editor]  [stdin]  [lesson chooser]
                 |
                 v
      POST /api/run {code, stdin}
                 |
         API + input limits
                 |
       isolated C++ trace worker
       g++ / SPP-Valgrind
                 |
          Raw execution trace
                 |
     Trace parser + schema validator
                 |
       DSA state normalizer
     stable node ids / pointer graph
     state diff / lifecycle flags
                 |
   +-------------+----------------+
   |                              |
 Linked List visualizer     Vietnamese explanations
   |                              |
   +-------------+----------------+
                 |
      timeline / quiz / console
```

### DSA normalizer interface đề xuất

```ts
interface LearningSnapshot {
  step: number;
  sourceLine: number;
  frames: FrameView[];
  nodes: Array<{
    id: string;            // stable alloc identity if provable; otherwise address-scoped
    address: string;
    info: unknown;
    nextAddress: string | null;
    lifetime: 'allocated' | 'freed' | 'unknown';
  }>;
  pointers: Array<{ name: string; target: string | null; state: 'valid'|'dangling'|'null'|'unknown' }>;
  changes: Array<{ object: string; field: string; before: unknown; after: unknown }>;
  stdout: string;
  confidence: 'trace-observed' | 'derived' | 'unknown';
}
```

**Quan trọng:** Kiểu trên là thiết kế đích, không khẳng định See++ hiện đã cung cấp các trường `lifetime` hay `dangling`. Khi không có bằng chứng từ trace, gán `unknown`; không kết luận "deleted" chỉ từ việc node biến mất khỏi graph. Nên dùng `(address, allocation-generation)` nếu có event cấp phát, vì cùng address có thể được cấp lại. AI/giải thích chỉ đọc snapshot.

### Alternate/rollback

Nếu See++ không thể trace ổn `NODE*`, `LIST&`, `delete`, chuyển sang khảo sát `GDB/MI + memory snapshots + ASan/Valgrind diagnostics` cho backend thay vì fork một interpreter C++ giới hạn. Có thể **giữ lại React UI, schema normalization và lesson mode**. Không chạy song song hai engine trong P0 trừ khi baseline thất bại rõ ràng.

## E. P0 Implementation Plan — sau POC đạt

| Mốc | Phụ thuộc | Công việc | Acceptance criteria | Ước lượng* |
|---|---|---|---|---|
| M0 | None | Reproduce upstream local có snapshot commit + logs | `localhost:4000` và `/api/run` hoạt động | 1–3 ngày |
| M1 | M0 | Golden trace bài DSLK mẫu, 8 edge cases | Từng dòng liên kết đối chiếu output và memory model, không crash | 2–5 ngày |
| M2 | M1 | `stdin` end-to-end | Cùng code/2 input tạo trace khác nhau, EOF không treo | 2–4 ngày |
| M3 | M1–M2 | DSLK normalizer + lifecycle distinction | Hiển thị đúng `L.pHead`, `L.pTail`, `p`, `prev`, `temp`, `pNext` trên test set | 4–8 ngày |
| M4 | M3 | Beginner UI tiếng Việt + step diff + timeline | Quan sát được 2 lần xóa node `3`, không giải thích sai | 4–7 ngày |
| M5 | M4 | Golden/regression/security/resource tests | Không memory facts bịa, local runner bị giới hạn tài nguyên | 4–8 ngày |

*Ước lượng dự báo cho 1 người làm tập trung, **không phải thời gian đã đo**; rủi ro Valgrind debugging hoặc source compatibility có thể nhân đôi tiến độ. Không bắt đầu M3 nếu M1 không chứng minh được memory fidelity.

**Rollback:** giữ commit upstream reference và bộ trace fixture độc lập; mọi sửa runner qua branch riêng; nếu fail POC lưu báo cáo sự cố + trace trước khi đổi engine. Không chỉnh sửa repository của người dùng tại Phase 0.

## F. Proof-of-Concept test plan — IT003

### Baseline

Dùng đúng bài `TimKiemVaXoa(LIST &L, int k)` trong handoff với `NODE{int info, NODE* pNext}` và `LIST{NODE* pHead, NODE* pTail}`. Phải hoàn thiện các helper CreateEmptyList, CreateNode, InsertTail, PrintList, main và input `cin` cho khả năng compile; lưu nguyên bản test fixture, ghi lại compiler version và stdout.

Input:

```text
7
3 0 8 2 3 4 7
3
```

Output mong đợi: `0 8 2 4 7`.

Golden invariants:

1. Ban đầu `pHead` trỏ node đầu `3`, `pTail` trỏ node cuối `7`.
2. Ở lần xóa đầu: `temp` trỏ node `3`, `p` chuyển đến node `0`, `pHead` được gán trỏ node `0`, sau `delete temp` không còn xem node đầu như active heap allocation.
3. Khi lặp đến node `3` thứ hai: `prev` trỏ node `2`; `p` chuyển sang node `4`; `prev->pNext` chuyển từ node `3` sang node `4`.
4. `pTail` sau cùng vẫn chỉ node cuối `7`; duyệt từ `pHead` lần lượt 0, 8, 2, 4, 7 rồi null.
5. UI phân biệt: pointer `temp` sau `delete` có thể vẫn giữ giá trị địa chỉ nhưng **không còn quyền dereference**; không gọi biến con trỏ "đã bị giải phóng" nếu chính biến vẫn sống trên stack.
6. `std::cout` là stdout của chương trình; không giả lập output của visualizer.

### Edge cases (bảng bắt buộc)

| # | Input list | k | Output/Invariant |
|---|---|---:|---|
| 1 | `[3,0,8,2,3,4,7]` | 3 | `[0,8,2,4,7]` |
| 2 | `[2,4,7]` | 3 | -1; cấu trúc không đổi |
| 3 | `[3,0,8]` | 3 | `[0,8]`, head đổi |
| 4 | `[0,8,3]` | 3 | `[0,8]`, tail đổi |
| 5 | `[3,3,4,3,3]` | 3 | `[4]`, node 3 liên tiếp được xóa |
| 6 | `[3,3,3]` | 3 | Rỗng; head=tail=null |
| 7 | `[]` | 3 | -1, không dereference null |
| 8 | `[3]` và `[7]` | 3 | Tương ứng rỗng và -1 |

### Negative and counterexample tests

- Xóa `temp` **trước** `p = p->pNext` -> potential use-after-free; runtime phải ghi nhận lỗi/không xác định thay vì bịa diễn biến sau UB.
- Quên cập nhật `prev->pNext` -> orphan/unreachable block; chỉ khẳng định leak khi runtime đủ evidence.
- Quên cập nhật `pTail` khi xóa cuối -> dangling tail.
- Dùng `prev->pNext` lúc `prev == nullptr` -> invalid access / crash.
- Đảo nhầm thứ tự cập nhật head/tail; thêm dòng nhiều thao tác trên cùng một source line để kiểm tra mất sự kiện do trace de-dup.
- Gửi chương trình chờ input, vòng lặp vô hạn, cấp phát cực lớn, tạo cực nhiều output: chương trình phải bị giới hạn thời gian/tài nguyên có thể quan sát được.

**Trace verification:** snapshot/bộ nhớ đối chiếu với GDB trên bản debug, kiểm tra ASan hoặc Valgrind memcheck độc lập ở negative tests, so sánh nguồn `stdout`. Không yêu cầu debug địa chỉ tuyệt đối trùng nhau giữa hai phiên chạy (ASLR); so sánh quan hệ con trỏ / vòng đời / invariant.

## Những kết luận chưa được kiểm chứng

- **UNKNOWN**: local Docker build có thành công trên Windows/WSL2/Linux của người dùng không; môi trường audit hiện tại không có Docker.
- **UNKNOWN**: `cin` sẽ hoạt động chuẩn sau khi bổ sung input redirection và stdout capture cơ chế riêng của SPP-Valgrind.
- **UNKNOWN**: lifecycle của deleted node/dangling pointer có được Valgrind trace thể hiện đầy đủ để vẽ freed node hay không.
- **UNKNOWN**: P0 Linked List delete đoạn mã đầy đủ thực thi thành công và render chính xác đến từng state.
- **UNKNOWN**: mức tiêu thụ CPU/RAM, độ trễ, kích thước trace và chi phí server thực tế.

## Executive recommendation

**Chọn web-first, ưu tiên POC bằng See++, không chọn browser-only TS interpreter làm nguồn sự thật.** Bản cá nhân dùng browser + Docker runner localhost có thể làm trước. Website public cần một pha security riêng. **Go/No-go tiếp theo: thực thi `TimKiemVaXoa` với dữ liệu stdin và chứng minh `pHead/pTail/pNext/delete` trong trace.** Nếu fail, dừng fork và đánh giá engine khác trước khi đầu tư UI.

## Source URLs (verified or upstream documentation)

1. See++ repo: https://github.com/knazir/SeePlusPlus
2. See++ pinned commit: https://github.com/knazir/SeePlusPlus/tree/a89e494eeef739715416ff457fad6b48a783960d
3. Docs architecture: https://github.com/knazir/SeePlusPlus/blob/a89e494eeef739715416ff457fad6b48a783960d/docs/architecture.md
4. Docs development: https://github.com/knazir/SeePlusPlus/blob/a89e494eeef739715416ff457fad6b48a783960d/docs/development.md
5. See++ MIT: https://github.com/knazir/SeePlusPlus/blob/a89e494eeef739715416ff457fad6b48a783960d/LICENSE
6. Valgrind GPLv3 at pinned commit: https://github.com/knazir/SPP-Valgrind/blob/008134bf12f1084e431fef8cd6e7114388a21a8f/COPYING
7. Memory Visualizer: https://github.com/tkflare1/memory-visualizer
8. Its interpreter: https://github.com/tkflare1/memory-visualizer/blob/main/src/lib/interpreter.ts
9. Python Tutor source historic: https://github.com/Bit-Zard/python-tutor
10. Python Tutor C++ overview: https://pythontutor.com/articles/c-cpp-visualizer.html
11. Python Tutor C++ self-host backend alternative: https://github.com/JuezUN/opt-cpp-backend
12. Docker security: https://docs.docker.com/engine/security/
13. Docker run resource controls: https://docs.docker.com/reference/cli/docker/container/create/
